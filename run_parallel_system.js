#!/usr/bin/env node

const QueueManager = require('./workers/queueManager');
const ResourceMonitor = require('./workers/resourceMonitor');
const LightProcessor = require('./workers/lightProcessor');
const HeavyProcessor = require('./workers/heavyProcessor');
const { RealDiscoveryWorker } = require('./test_real_integration');
const { info, error, warn } = require('./utils/logger');
const TableLogger = require('./utils/tableLogger');
const SupabaseClient = require('./services/supabaseClient');

/**
 * Sistema completo de paralelização para produção na VPS
 * 
 * Arquitetura:
 * DiscoveryWorker → Classification → DiscoveryQueue
 *                                        ↓
 *                                   LightQueue → LightProcessor → Supabase
 *                                        ↓              ↑
 *                                   HeavyQueue → HeavyProcessor ↗
 *                                                      ↓
 *                                              (Fallback System)
 */
class ParallelScrapingSystem {
  constructor() {
    this.components = {
      resourceMonitor: null,
      queueManager: null,
      discoveryWorker: null,
      lightProcessor: null,
      heavyProcessor: null
    };
    
    this.isRunning = false;
    this.startTime = null;
    this.metrics = {
      totalPacksDiscovered: 0,
      totalPacksProcessed: 0,
      lightPacksProcessed: 0,
      heavyPacksProcessed: 0,
      fallbackTasksProcessed: 0,
      errors: 0
    };
    
    // Cliente Supabase para estatísticas
    this.supabaseClient = new SupabaseClient();
  }

  /**
   * Inicializa todo o sistema (versão otimizada para hardware limitado)
   */
  async initialize(scraperOnly = false) {
    const mode = scraperOnly ? 'SCRAPER OTIMIZADO' : 'COMPLETO';
    
    // Banner de inicialização
    TableLogger.logStartupBanner(mode);
    
    // Estatísticas iniciais do banco
    info('\n📊 Consultando estatísticas iniciais do banco...');
    const initialStats = await this.supabaseClient.getStats();
    TableLogger.logBankStats(initialStats);

    try {
      // 1. ResourceMonitor - Apenas se modo completo
      if (!scraperOnly) {
        info('1. Inicializando ResourceMonitor...');
        this.components.resourceMonitor = new ResourceMonitor({
          maxMemoryMB: 700, // 70% de 1GB da VPS
          maxCPUPercent: 80,
          monitorInterval: 5000, // 5s
          enableAutoThrottling: true,
          gcInterval: 60000 // 1 min
        });

        // Event listeners para alerts críticos
        this.components.resourceMonitor.on('memoryAlert', (alert) => {
          warn(`🚨 ALERTA MEMÓRIA: ${alert.current.toFixed(1)}% (${alert.usedMB}MB)`);
          if (alert.current > 85) {
            warn('Sistema sob alta pressão de memória!');
          }
        });

        this.components.resourceMonitor.on('throttleActivated', (state) => {
          warn(`🐌 THROTTLING ATIVADO: ${state.reason}`);
        });

        this.components.resourceMonitor.start();
        info('   ✅ ResourceMonitor iniciado');
      } else {
        info('1. ResourceMonitor desabilitado (modo scraper)');
      }

      // 2. QueueManager - Gerenciamento de filas (sempre necessário)
      info('\n2. Inicializando QueueManager...');
      const queueSizes = scraperOnly ? 
        { discovery: 20, light: 10, heavy: 5 } : // Tamanhos reduzidos para scraper
        { discovery: 50, light: 20, heavy: 10 }; // Tamanhos normais
      
      this.components.queueManager = new QueueManager({
        saveInterval: scraperOnly ? 60000 : 30000, // Menos frequente em modo scraper
        persistencePath: './parallel_production_state',
        maxQueueSize: queueSizes
      });

      await this.components.queueManager.start();
      info('   ✅ QueueManager iniciado');

      // 3. Discovery Worker - Descoberta e classificação
      info('\n3. Inicializando Discovery Worker...');
      this.components.discoveryWorker = new RealDiscoveryWorker();
      this.components.discoveryWorker.setQueueManager(this.components.queueManager);
      this.components.discoveryWorker.setResourceMonitor(this.components.resourceMonitor);

      // Event listeners para discovery
      this.components.discoveryWorker.on('taskCompleted', (data) => {
        this.metrics.totalPacksDiscovered++;
        info(`📦 Discovery completo: ${data.taskName} em ${data.processingTime}ms`);
      });

      this.components.queueManager.registerWorker(
        this.components.discoveryWorker.id, 
        this.components.discoveryWorker.name, 
        this.components.discoveryWorker
      );

      await this.components.discoveryWorker.start();
      info('   ✅ Discovery Worker iniciado');

      // 4. Light Processor - Processamento rápido (sempre ativo)
      info('\n4. Inicializando Light Processor...');
      this.components.lightProcessor = new LightProcessor(
        this.components.queueManager,
        this.components.resourceMonitor
      );

      // Event listeners para light processor
      this.components.lightProcessor.on('taskCompleted', (data) => {
        this.metrics.totalPacksProcessed++;
        this.metrics.lightPacksProcessed++;
        info(`⚡ Light pack processado: ${data.taskName} em ${data.processingTime}ms`);
      });

      this.components.lightProcessor.on('taskFailed', (data) => {
        this.metrics.errors++;
        warn(`❌ Light pack falhou: ${data.taskName} - ${data.error?.message}`);
      });

      await this.components.lightProcessor.initialize();
      await this.components.lightProcessor.start();
      info('   ✅ Light Processor iniciado');

      // 5. Heavy Processor - Apenas se modo completo
      if (!scraperOnly) {
        info('\n5. Inicializando Heavy Processor...');
        this.components.heavyProcessor = new HeavyProcessor(
          this.components.queueManager,
          this.components.resourceMonitor
        );

        // Event listeners para heavy processor
        this.components.heavyProcessor.on('taskCompleted', (data) => {
          this.metrics.totalPacksProcessed++;
          
          if (data.taskName.includes('fallback')) {
            this.metrics.fallbackTasksProcessed++;
            info(`🔄 Heavy fallback processado: ${data.taskName} em ${data.processingTime}ms`);
          } else {
            this.metrics.heavyPacksProcessed++;
            info(`🔨 Heavy pack processado: ${data.taskName} em ${data.processingTime}ms`);
          }
        });

        this.components.heavyProcessor.on('taskFailed', (data) => {
          this.metrics.errors++;
          warn(`❌ Heavy pack falhou: ${data.taskName} - ${data.error?.message}`);
        });

        await this.components.heavyProcessor.initialize();
        await this.components.heavyProcessor.start();
        info('   ✅ Heavy Processor iniciado');
      } else {
        info('\n5. Heavy Processor desabilitado (modo scraper)');
      }

      this.isRunning = true;
      this.startTime = Date.now();
      
      const activeComponents = scraperOnly ? 
        'Discovery + Light (modo scraper)' : 
        'Discovery + Light + Heavy + Fallback System';
      
      info('\n🎉 Sistema de Paralelização Iniciado com Sucesso!');
      info(`📊 Componentes ativos: ${activeComponents}`);
      
    } catch (err) {
      error('❌ Erro na inicialização do sistema:', err);
      throw err;
    }
  }

  /**
   * Inicia monitoramento contínuo
   */
  startMonitoring() {
    info('\n📊 Iniciando monitoramento contínuo...');
    
    const statusInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(statusInterval);
        return;
      }
      
      this.printStatus();
    }, 60000); // Status a cada 1 minuto

    // Status detalhado a cada 10 minutos
    const detailedInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(detailedInterval);
        return;
      }
      
      this.printDetailedStatus();
    }, 600000); // 10 minutos

    // Processa fila discovery e distribui para light/heavy a cada 10 segundos
    const discoveryProcessorInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(discoveryProcessorInterval);
        return;
      }
      
      this.processDiscoveryQueue();
    }, 10000); // 10 segundos

    return { statusInterval, detailedInterval, discoveryProcessorInterval };
  }

  /**
   * Processa fila discovery e distribui packs para light/heavy
   */
  async processDiscoveryQueue() {
    if (!this.components.queueManager) {
      return;
    }

    try {
      // Processar alguns itens da fila discovery por vez
      const maxItemsPerCycle = 5;
      let itemsProcessed = 0;

      while (itemsProcessed < maxItemsPerCycle) {
        const discoveryItem = await this.components.queueManager.getFromQueue('discovery', 'discovery-processor');
        
        if (!discoveryItem) {
          // Fila discovery vazia
          break;
        }

        // Classificar o pack para determinar fila (light vs heavy)
        const targetQueue = this.classifyPackForQueue(discoveryItem);
        
        // Converter item discovery para formato da fila alvo
        const queueItem = {
          packId: discoveryItem.packId,
          name: discoveryItem.name,
          source: discoveryItem.source,
          locale: discoveryItem.locale,
          resourceFiles: discoveryItem.resourceFiles,
          resourceUrlPrefix: discoveryItem.resourceUrlPrefix,
          isAnimated: discoveryItem.isAnimated,
          classification: discoveryItem.classification,
          authorName: discoveryItem.authorName,
          viewCount: discoveryItem.viewCount || 0,
          stickerCount: discoveryItem.resourceFiles?.length || 0
        };

        // Adicionar à fila apropriada
        await this.components.queueManager.addToQueue(targetQueue, queueItem);
        
        itemsProcessed++;
        
        // Log do movimento
        info(`📦 Pack movido: ${discoveryItem.packId} → ${targetQueue} queue`, {
          stickerCount: queueItem.stickerCount,
          isAnimated: discoveryItem.isAnimated
        });
      }

      if (itemsProcessed > 0) {
        info(`🔄 Processados ${itemsProcessed} itens da discovery queue`);
      }

    } catch (err) {
      error('Erro ao processar discovery queue:', err);
    }
  }

  /**
   * Classifica pack para determinar fila (light vs heavy)
   */
  classifyPackForQueue(pack) {
    const stickerCount = pack.resourceFiles?.length || 0;
    const isAnimated = pack.isAnimated;
    
    // Se não há heavy processor ativo, tudo vai para light
    if (!this.components.heavyProcessor) {
      return 'light';
    }
    
    // Critérios para fila heavy:
    // - Packs animados com muitos stickers
    // - Packs com mais de 15 stickers
    if ((isAnimated && stickerCount > 8) || stickerCount > 15) {
      return 'heavy';
    }
    
    // Todos os outros vão para light
    return 'light';
  }

  /**
   * Imprime status básico
   */
  async printStatus() {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    const queueStats = this.components.queueManager?.getStats();
    const resourceStats = this.components.resourceMonitor?.getCurrentMetrics();
    
    // Status do sistema
    const memoryMB = resourceStats?.memory?.usedMB || 0;
    const cpuPercent = resourceStats?.cpu?.percent || 0;
    TableLogger.logSystemStatus(uptime, memoryMB, cpuPercent);
    
    // Progresso atual
    TableLogger.logProgress(
      this.metrics.totalPacksDiscovered,
      this.metrics.totalPacksProcessed,
      {
        discovery: queueStats?.sizes?.discovery || 0,
        light: queueStats?.sizes?.light || 0,
        heavy: queueStats?.sizes?.heavy || 0
      }
    );
    
    // Estatísticas atuais do banco (a cada status)
    try {
      const currentStats = await this.supabaseClient.getStats();
      TableLogger.logBankStats(currentStats);
    } catch (err) {
      error('Erro ao consultar estatísticas do banco para status', err);
    }
  }

  /**
   * Imprime status detalhado
   */
  printDetailedStatus() {
    info('\n📊 === STATUS DETALHADO ===');
    
    // Discovery Worker
    if (this.components.discoveryWorker) {
      const discoveryStats = this.components.discoveryWorker.getStats();
      info(`🔍 DISCOVERY: ${discoveryStats.packsFound} packs encontrados, ${discoveryStats.packsDuplicated} duplicados filtrados`);
    }
    
    // Light Processor
    if (this.components.lightProcessor) {
      const lightStats = this.components.lightProcessor.getLightStats();
      info(`⚡ LIGHT: ${lightStats.light.packsProcessed} packs (${lightStats.light.successRate}% sucesso), avg ${Math.round(lightStats.light.avgProcessingTime)}ms`);
    }
    
    // Heavy Processor  
    if (this.components.heavyProcessor) {
      const heavyStats = this.components.heavyProcessor.getHeavyStats();
      info(`🔨 HEAVY: ${heavyStats.heavy.packsProcessed} packs (${heavyStats.heavy.successRate}% sucesso), fallback=${heavyStats.heavy.fallbackRate}`);
    }
    
    // Resource Monitor
    if (this.components.resourceMonitor) {
      const resourceStats = this.components.resourceMonitor.getCurrentMetrics();
      info(`💾 RECURSOS: Mem ${resourceStats.memory.usedMB}/${resourceStats.memory.limit}MB, CPU avg=${resourceStats.averages?.cpu?.toFixed(1)}%`);
    }
  }

  /**
   * Para o sistema gracefully
   */
  async shutdown() {
    info('\n🛑 Iniciando shutdown graceful do sistema...');
    this.isRunning = false;
    
    try {
      // Parar workers na ordem inversa
      if (this.components.heavyProcessor) {
        info('   Parando Heavy Processor...');
        await this.components.heavyProcessor.stop();
      }
      
      if (this.components.lightProcessor) {
        info('   Parando Light Processor...');
        await this.components.lightProcessor.stop();
      }
      
      if (this.components.discoveryWorker) {
        info('   Parando Discovery Worker...');
        await this.components.discoveryWorker.stop();
      }
      
      if (this.components.queueManager) {
        info('   Parando Queue Manager...');
        await this.components.queueManager.stop();
      }
      
      if (this.components.resourceMonitor) {
        info('   Parando Resource Monitor...');
        this.components.resourceMonitor.stop();
      }
      
      info('✅ Sistema parado com sucesso!');
      
    } catch (err) {
      error('Erro durante shutdown:', err);
    }
  }
}

/**
 * Função principal para iniciar o sistema
 */
async function main() {
  const system = new ParallelScrapingSystem();
  
  // Handler para shutdown graceful
  process.on('SIGINT', async () => {
    info('\n🛑 Recebido SIGINT (Ctrl+C), parando sistema...');
    await system.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    info('\n🛑 Recebido SIGTERM, parando sistema...');
    await system.shutdown();
    process.exit(0);
  });

  try {
    // Verificar argumentos de linha de comando
    const scraperOnly = process.argv.includes('--scraper-only');
    
    if (scraperOnly) {
      info('🔧 Modo scraper ativado (hardware limitado)');
    }
    
    // Inicializar sistema
    await system.initialize(scraperOnly);
    
    // Iniciar monitoramento
    system.startMonitoring();
    
    info('\n🚀 Sistema rodando! Use Ctrl+C para parar.');
    info('📊 Acompanhe os logs para ver o progresso...\n');
    
    // Manter processo ativo
    process.stdin.resume();
    
  } catch (err) {
    error('💥 Falha crítica no sistema:', err);
    await system.shutdown();
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { ParallelScrapingSystem };
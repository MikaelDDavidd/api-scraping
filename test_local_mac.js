#!/usr/bin/env node

/**
 * Sistema de teste local para Mac
 * - Configura automaticamente paths locais
 * - Salva figurinhas em pasta local
 * - Dashboard CLI funcionando
 * - Resolve todos os problemas de multithread
 */

const QueueManager = require('./workers/queueManager');
const ResourceMonitor = require('./workers/resourceMonitor');
const LightProcessor = require('./workers/lightProcessor');
const HeavyProcessor = require('./workers/heavyProcessor');
const { RealDiscoveryWorker } = require('./test_real_integration');
const { info, error, warn } = require('./utils/logger');
const TableLogger = require('./utils/tableLogger');
const SupabaseClient = require('./services/supabaseClient');
const path = require('path');
const fs = require('fs-extra');

/**
 * Sistema completo otimizado para teste local no Mac
 */
class LocalMacTestSystem {
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
      errors: 0
    };
    
    // Configurar paths para Mac
    this.setupLocalPaths();
    
    // Cliente Supabase para estatísticas
    this.supabaseClient = new SupabaseClient();
  }

  /**
   * Configura paths locais para Mac
   */
  setupLocalPaths() {
    const currentDir = process.cwd();
    const localStoragePath = path.join(currentDir, 'stickers_local_mac');
    const tempPath = path.join(currentDir, 'temp_mac');
    
    // Configurar variáveis de ambiente para storage local
    process.env.USE_LOCAL_STORAGE = 'true';
    process.env.LOCAL_STORAGE_PATH = localStoragePath;
    process.env.STORAGE_BASE_URL = 'http://localhost:8080';
    
    info('🍎 Configuração Mac:', {
      storageLocal: localStoragePath,
      tempPath: tempPath,
      currentDir: currentDir
    });
    
    // Criar diretórios se não existirem
    this.ensureDirectories([localStoragePath, tempPath]);
  }

  /**
   * Garante que diretórios existem
   */
  async ensureDirectories(dirs) {
    for (const dir of dirs) {
      try {
        await fs.ensureDir(dir);
        info(`📁 Diretório criado/verificado: ${dir}`);
      } catch (err) {
        error(`Erro ao criar diretório ${dir}`, err);
      }
    }
  }

  /**
   * Inicializa sistema otimizado para Mac
   */
  async initialize(options = {}) {
    const { scraperOnly = false, testMode = true, maxPacks = 5 } = options;
    const mode = scraperOnly ? 'SCRAPER MAC' : 'COMPLETO MAC';
    
    // Banner de inicialização
    TableLogger.logStartupBanner(mode);
    
    try {
      // 1. ResourceMonitor - configuração leve para Mac
      info('1. Inicializando ResourceMonitor (Mac config)...');
      this.components.resourceMonitor = new ResourceMonitor({
        maxMemoryMB: 1000, // 1GB para Mac
        maxCPUPercent: 70,
        monitorInterval: 10000, // 10s - mais relaxado
        enableAutoThrottling: true,
        gcInterval: 30000 // 30s
      });

      this.components.resourceMonitor.on('memoryAlert', (alert) => {
        warn(`🚨 ALERTA MEMÓRIA MAC: ${alert.current.toFixed(1)}% (${alert.usedMB}MB)`);
      });

      this.components.resourceMonitor.start();
      info('   ✅ ResourceMonitor iniciado para Mac');

      // 2. QueueManager - filas menores para teste
      info('\n2. Inicializando QueueManager (teste local)...');
      this.components.queueManager = new QueueManager({
        saveInterval: 30000,
        persistencePath: './test_local_mac_state',
        maxQueueSize: { discovery: 10, light: 5, heavy: 3 } // Filas pequenas para teste
      });

      await this.components.queueManager.start();
      info('   ✅ QueueManager iniciado');

      // 3. Discovery Worker - com limite para teste
      info('\n3. Inicializando Discovery Worker (limite para teste)...');
      this.components.discoveryWorker = new RealDiscoveryWorker();
      this.components.discoveryWorker.setQueueManager(this.components.queueManager);
      this.components.discoveryWorker.setResourceMonitor(this.components.resourceMonitor);
      this.components.discoveryWorker.maxPacksForTest = maxPacks; // Limite para teste

      // Event listeners para discovery
      this.components.discoveryWorker.on('taskCompleted', (data) => {
        this.metrics.totalPacksDiscovered++;
        info(`📦 Discovery: ${data.taskName} em ${data.processingTime}ms`);
      });

      this.components.queueManager.registerWorker(
        this.components.discoveryWorker.id, 
        this.components.discoveryWorker.name, 
        this.components.discoveryWorker
      );

      await this.components.discoveryWorker.start();
      info('   ✅ Discovery Worker iniciado');

      // 4. Light Processor - sempre ativo
      info('\n4. Inicializando Light Processor...');
      this.components.lightProcessor = new LightProcessor(
        this.components.queueManager,
        this.components.resourceMonitor
      );

      // Event listeners para light processor
      this.components.lightProcessor.on('taskCompleted', (data) => {
        this.metrics.totalPacksProcessed++;
        this.metrics.lightPacksProcessed++;
        info(`⚡ Light processado: ${data.taskName} em ${data.processingTime}ms`);
        
        // Mostrar onde foi salvo
        if (data.localPath) {
          info(`📁 Salvo em: ${data.localPath}`);
        }
      });

      this.components.lightProcessor.on('taskFailed', (data) => {
        this.metrics.errors++;
        warn(`❌ Light falhou: ${data.taskName} - ${data.error?.message}`);
      });

      await this.components.lightProcessor.initialize();
      await this.components.lightProcessor.start();
      info('   ✅ Light Processor iniciado');

      // 5. Heavy Processor - se não for apenas scraper
      if (!scraperOnly) {
        info('\n5. Inicializando Heavy Processor...');
        this.components.heavyProcessor = new HeavyProcessor(
          this.components.queueManager,
          this.components.resourceMonitor
        );

        // Event listeners para heavy processor
        this.components.heavyProcessor.on('taskCompleted', (data) => {
          this.metrics.totalPacksProcessed++;
          this.metrics.heavyPacksProcessed++;
          info(`🔨 Heavy processado: ${data.taskName} em ${data.processingTime}ms`);
          
          // Mostrar onde foi salvo
          if (data.localPath) {
            info(`📁 Salvo em: ${data.localPath}`);
          }
        });

        this.components.heavyProcessor.on('taskFailed', (data) => {
          this.metrics.errors++;
          warn(`❌ Heavy falhou: ${data.taskName} - ${data.error?.message}`);
        });

        await this.components.heavyProcessor.initialize();
        await this.components.heavyProcessor.start();
        info('   ✅ Heavy Processor iniciado');
      } else {
        info('\n5. Heavy Processor desabilitado (modo scraper)');
      }

      this.isRunning = true;
      this.startTime = Date.now();
      
      info('\n🎉 Sistema Mac iniciado com sucesso!');
      info(`📊 Componentes: Discovery + Light ${!scraperOnly ? '+ Heavy' : ''}`);
      info(`📁 Figurinhas serão salvas em: ${process.env.LOCAL_STORAGE_PATH}`);
      
    } catch (err) {
      error('❌ Erro na inicialização do sistema Mac:', err);
      throw err;
    }
  }

  /**
   * Inicia monitoramento com dashboard CLI
   */
  startMonitoring(duration = 120000) { // 2 minutos por padrão
    info('\n📊 Iniciando monitoramento com dashboard CLI...');
    info(`⏱️ Duração do teste: ${duration/1000}s`);
    
    const startTest = Date.now();
    
    // Status a cada 30 segundos
    const statusInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(statusInterval);
        return;
      }
      
      const elapsed = Date.now() - startTest;
      const remaining = Math.max(0, duration - elapsed);
      
      if (remaining <= 0) {
        info('\n⏰ Tempo de teste encerrado!');
        this.shutdown();
        clearInterval(statusInterval);
        return;
      }
      
      this.printStatus(remaining);
    }, 30000);

    // Status detalhado a cada 60 segundos
    const detailedInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(detailedInterval);
        return;
      }
      
      this.printDetailedStatus();
    }, 60000);

    // Processar discovery queue
    const discoveryInterval = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(discoveryInterval);
        return;
      }
      
      this.processDiscoveryQueue();
    }, 15000); // A cada 15s

    return { statusInterval, detailedInterval, discoveryInterval };
  }

  /**
   * Processa fila discovery para light/heavy
   */
  async processDiscoveryQueue() {
    if (!this.components.queueManager) return;

    try {
      const maxItems = 3; // Processar 3 por vez
      let processed = 0;

      while (processed < maxItems) {
        const item = await this.components.queueManager.getFromQueue('discovery', 'mac-processor');
        
        if (!item) break;

        // Classificar: light vs heavy
        const targetQueue = this.classifyPackForQueue(item);
        
        // Mover para fila apropriada
        await this.components.queueManager.addToQueue(targetQueue, {
          ...item,
          movedAt: new Date().toISOString(),
          movedFrom: 'discovery'
        });
        
        processed++;
        
        info(`📦 Pack movido: ${item.packId} → ${targetQueue}`, {
          stickers: item.resourceFiles?.length || 0,
          animated: item.isAnimated
        });
      }

      if (processed > 0) {
        info(`🔄 Processados ${processed} itens da discovery queue`);
      }

    } catch (err) {
      error('Erro ao processar discovery queue:', err);
    }
  }

  /**
   * Classifica pack para fila apropriada
   */
  classifyPackForQueue(pack) {
    const stickerCount = pack.resourceFiles?.length || 0;
    const isAnimated = pack.isAnimated;
    
    // Se não há heavy processor, tudo vai para light
    if (!this.components.heavyProcessor) {
      return 'light';
    }
    
    // Heavy: animados com >6 stickers OU packs com >12 stickers
    if ((isAnimated && stickerCount > 6) || stickerCount > 12) {
      return 'heavy';
    }
    
    return 'light';
  }

  /**
   * Imprime status atual
   */
  async printStatus(remainingMs = 0) {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    const queueStats = this.components.queueManager?.getStats();
    const resourceStats = this.components.resourceMonitor?.getCurrentMetrics();
    
    // Status do sistema
    const memoryMB = resourceStats?.memory?.usedMB || 0;
    const cpuPercent = resourceStats?.cpu?.percent || 0;
    TableLogger.logSystemStatus(uptime, memoryMB, cpuPercent);
    
    // Progresso
    TableLogger.logProgress(
      this.metrics.totalPacksDiscovered,
      this.metrics.totalPacksProcessed,
      {
        discovery: queueStats?.sizes?.discovery || 0,
        light: queueStats?.sizes?.light || 0,
        heavy: queueStats?.sizes?.heavy || 0
      }
    );
    
    if (remainingMs > 0) {
      info(`⏰ Tempo restante: ${Math.round(remainingMs/1000)}s`);
    }
    
    // Mostrar onde estão salvos os arquivos
    const storageDir = process.env.LOCAL_STORAGE_PATH;
    if (storageDir && await fs.pathExists(storageDir)) {
      try {
        const items = await fs.readdir(storageDir);
        const packDirs = items.filter(item => item.length === 6); // IDs de pack têm 6 chars
        if (packDirs.length > 0) {
          info(`📁 Packs salvos localmente: ${packDirs.length} em ${storageDir}`);
        }
      } catch (err) {
        // Ignorar erro de leitura
      }
    }
  }

  /**
   * Status detalhado
   */
  printDetailedStatus() {
    info('\n📊 === STATUS DETALHADO MAC ===');
    
    // Workers
    if (this.components.discoveryWorker) {
      const stats = this.components.discoveryWorker.getStats();
      info(`🔍 DISCOVERY: ${stats.packsFound} encontrados, ${stats.packsDuplicated} duplicados`);
    }
    
    if (this.components.lightProcessor) {
      const stats = this.components.lightProcessor.getLightStats();
      info(`⚡ LIGHT: ${stats.light.packsProcessed} processados, ${stats.light.successRate}% sucesso`);
    }
    
    if (this.components.heavyProcessor) {
      const stats = this.components.heavyProcessor.getHeavyStats();
      info(`🔨 HEAVY: ${stats.heavy.packsProcessed} processados, ${stats.heavy.successRate}% sucesso`);
    }
    
    // Métricas gerais
    info(`📊 TOTAIS: ${this.metrics.totalPacksDiscovered} descobertos, ${this.metrics.totalPacksProcessed} processados, ${this.metrics.errors} erros`);
  }

  /**
   * Para o sistema
   */
  async shutdown() {
    info('\n🛑 Parando sistema Mac...');
    this.isRunning = false;
    
    try {
      // Parar na ordem reversa
      if (this.components.heavyProcessor) {
        await this.components.heavyProcessor.stop();
        info('   ✅ Heavy Processor parado');
      }
      
      if (this.components.lightProcessor) {
        await this.components.lightProcessor.stop();
        info('   ✅ Light Processor parado');
      }
      
      if (this.components.discoveryWorker) {
        await this.components.discoveryWorker.stop();
        info('   ✅ Discovery Worker parado');
      }
      
      if (this.components.queueManager) {
        await this.components.queueManager.stop();
        info('   ✅ Queue Manager parado');
      }
      
      if (this.components.resourceMonitor) {
        this.components.resourceMonitor.stop();
        info('   ✅ Resource Monitor parado');
      }
      
      // Mostrar resultados finais
      this.showFinalResults();
      
      info('✅ Sistema Mac parado com sucesso!');
      
    } catch (err) {
      error('Erro durante shutdown Mac:', err);
    }
  }

  /**
   * Mostra resultados finais
   */
  async showFinalResults() {
    info('\n🎯 === RESULTADOS FINAIS ===');
    
    const storageDir = process.env.LOCAL_STORAGE_PATH;
    
    try {
      if (await fs.pathExists(storageDir)) {
        const items = await fs.readdir(storageDir);
        const packDirs = items.filter(item => item.length === 6);
        
        info(`📁 Packs salvos localmente: ${packDirs.length}`);
        info(`📍 Localização: ${storageDir}`);
        
        if (packDirs.length > 0) {
          info('\n📦 Packs encontrados:');
          for (let i = 0; i < Math.min(5, packDirs.length); i++) {
            const packDir = path.join(storageDir, packDirs[i]);
            const files = await fs.readdir(packDir);
            const stickerCount = files.filter(f => f.endsWith('.webp')).length;
            const hasTray = files.includes('tray.png');
            info(`   ${packDirs[i]}: ${stickerCount} stickers ${hasTray ? '+ tray' : ''}`);
          }
          
          if (packDirs.length > 5) {
            info(`   ... e mais ${packDirs.length - 5} packs`);
          }
        }
      }
    } catch (err) {
      warn('Erro ao listar resultados finais:', err.message);
    }
    
    info(`\n📊 Métricas finais:`);
    info(`   🔍 Descobertos: ${this.metrics.totalPacksDiscovered}`);
    info(`   ✅ Processados: ${this.metrics.totalPacksProcessed}`);
    info(`   ⚡ Light: ${this.metrics.lightPacksProcessed}`);
    info(`   🔨 Heavy: ${this.metrics.heavyPacksProcessed}`);
    info(`   ❌ Erros: ${this.metrics.errors}`);
  }
}

/**
 * Função principal
 */
async function main() {
  const system = new LocalMacTestSystem();
  
  // Handler para Ctrl+C
  process.on('SIGINT', async () => {
    info('\n🛑 Ctrl+C detectado, parando sistema...');
    await system.shutdown();
    process.exit(0);
  });
  
  try {
    const args = process.argv.slice(2);
    const scraperOnly = args.includes('--scraper-only');
    const duration = args.includes('--duration') ? 
      parseInt(args[args.indexOf('--duration') + 1]) * 1000 : 120000; // Default 2 min
    const maxPacks = args.includes('--max-packs') ?
      parseInt(args[args.indexOf('--max-packs') + 1]) : 5; // Default 5 packs
    
    if (args.includes('--help')) {
      console.log(`
🍎 Sistema de Teste Local para Mac

Uso: node test_local_mac.js [opções]

Opções:
  --scraper-only      Executa apenas discovery + light (sem heavy)
  --duration <seg>    Duração do teste em segundos (padrão: 120)
  --max-packs <num>   Máximo de packs para descobrir (padrão: 5)
  --help             Mostra esta ajuda

Exemplos:
  node test_local_mac.js                           # Teste completo 2 minutos
  node test_local_mac.js --scraper-only            # Apenas light processing
  node test_local_mac.js --duration 60 --max-packs 3   # 1 minuto, 3 packs max
      `);
      process.exit(0);
    }
    
    info(`🍎 Iniciando sistema Mac${scraperOnly ? ' (scraper apenas)' : ''}`);
    info(`⏱️ Duração: ${duration/1000}s | 📦 Max packs: ${maxPacks}`);
    
    // Inicializar
    await system.initialize({ scraperOnly, maxPacks });
    
    // Monitorar
    system.startMonitoring(duration);
    
    info('\n🚀 Sistema rodando! Use Ctrl+C para parar antes do tempo.');
    
    // Manter processo ativo
    process.stdin.resume();
    
  } catch (err) {
    error('💥 Falha crítica no sistema Mac:', err);
    await system.shutdown();
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  main();
}

module.exports = { LocalMacTestSystem };
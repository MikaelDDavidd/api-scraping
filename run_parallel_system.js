#!/usr/bin/env node

const QueueManager = require('./workers/queueManager');
const ResourceMonitor = require('./workers/resourceMonitor');
const LightProcessor = require('./workers/lightProcessor');
const HeavyProcessor = require('./workers/heavyProcessor');
const { RealDiscoveryWorker } = require('./test_real_integration');
const { info, error, warn } = require('./utils/logger');

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
  }

  /**
   * Inicializa todo o sistema
   */
  async initialize() {
    info('🚀 Inicializando Sistema de Paralelização Completo...\n');

    try {
      // 1. ResourceMonitor - Monitoramento de recursos da VPS
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

      // 2. QueueManager - Gerenciamento de filas
      info('\n2. Inicializando QueueManager...');
      this.components.queueManager = new QueueManager({
        saveInterval: 30000, // 30s - salvar estado frequentemente
        persistencePath: './parallel_production_state',
        maxQueueSize: {
          discovery: 50, // Buffer grande para classificação
          light: 20,     // Fila média para processamento rápido
          heavy: 10      // Fila menor para processamento lento
        }
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

      // 4. Light Processor - Processamento rápido
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

      // 5. Heavy Processor - Processamento completo + fallback
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

      this.isRunning = true;
      this.startTime = Date.now();
      
      info('\n🎉 Sistema de Paralelização Completo Iniciado com Sucesso!');
      info('📊 Componentes ativos: Discovery + Light + Heavy + Fallback System');
      
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

    return { statusInterval, detailedInterval };
  }

  /**
   * Imprime status básico
   */
  printStatus() {
    const uptime = this.startTime ? Date.now() - this.startTime : 0;
    const uptimeMin = Math.round(uptime / 60000);
    
    const queueStats = this.components.queueManager?.getStats();
    const resourceStats = this.components.resourceMonitor?.getCurrentMetrics();
    
    info('\n📊 === STATUS DO SISTEMA ===');
    info(`⏱️ Uptime: ${uptimeMin} minutos`);
    info(`🔍 Packs descobertos: ${this.metrics.totalPacksDiscovered}`);
    info(`📦 Packs processados: ${this.metrics.totalPacksProcessed} (⚡${this.metrics.lightPacksProcessed} + 🔨${this.metrics.heavyPacksProcessed})`);
    info(`🔄 Fallback tasks: ${this.metrics.fallbackTasksProcessed}`);
    info(`❌ Errors: ${this.metrics.errors}`);
    
    if (queueStats) {
      info(`📋 Filas: Discovery=${queueStats.sizes.discovery}, Light=${queueStats.sizes.light}, Heavy=${queueStats.sizes.heavy}`);
    }
    
    if (resourceStats) {
      info(`💾 Recursos: ${resourceStats.memory.usedMB}MB (${resourceStats.memory.percent.toFixed(1)}%), CPU=${resourceStats.cpu.percent.toFixed(1)}%`);
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
    // Inicializar sistema
    await system.initialize();
    
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
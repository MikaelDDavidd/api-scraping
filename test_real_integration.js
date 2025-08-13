#!/usr/bin/env node

const QueueManager = require('./workers/queueManager');
const ResourceMonitor = require('./workers/resourceMonitor');
const BaseWorker = require('./workers/baseWorker');
const StickerlyClient = require('./services/stickerlyClient');
const SupabaseClient = require('./services/supabaseClient');
const PackCache = require('./services/packCache');
const { config } = require('./config/config');
const { info, error, warn } = require('./utils/logger');

/**
 * Worker de teste que simula discovery usando API real
 */
class RealDiscoveryWorker extends BaseWorker {
  constructor() {
    super('RealDiscoveryWorker', {
      healthCheckInterval: 15000 // 15s
    });
    
    this.stickerlyClient = new StickerlyClient();
    
    // Configurar Supabase para teste local
    process.env.USE_LOCAL_STORAGE = 'true';
    process.env.LOCAL_STORAGE_PATH = './test_storage';
    process.env.STORAGE_BASE_URL = 'http://localhost';
    
    this.supabaseClient = new SupabaseClient();
    this.packCache = new PackCache(this.supabaseClient);
    this.queueManager = null;
    this.resourceMonitor = null;
    this.packsFound = 0;
    this.packsClassified = { light: 0, heavy: 0 };
    this.packsDuplicated = 0;
  }

  async initialize() {
    info('Inicializando RealDiscoveryWorker com API real...');
    
    // Carregar cache de packs existentes
    try {
      const cacheSize = await this.packCache.loadExistingPacks();
      info(`Cache inicializado com ${cacheSize} packs existentes`);
    } catch (err) {
      warn('Erro ao carregar cache, continuando sem cache', { error: err.message });
    }
  }

  async cleanup() {
    info('Finalizando RealDiscoveryWorker...');
    if (this.queueManager) {
      await this.queueManager.stop();
    }
    if (this.resourceMonitor) {
      this.resourceMonitor.stop();
    }
    if (this.packCache) {
      this.packCache.destroy();
    }
  }

  setQueueManager(queueManager) {
    this.queueManager = queueManager;
  }

  setResourceMonitor(resourceMonitor) {
    this.resourceMonitor = resourceMonitor;
  }

  async processTaskImplementation(task) {
    if (task.type === 'discover-recommended') {
      return await this.discoverRecommendedPacks(task.locale);
    } else if (task.type === 'discover-search') {
      return await this.discoverSearchPacks(task.keyword, task.locale);
    }
    
    throw new Error(`Tipo de tarefa desconhecido: ${task.type}`);
  }

  /**
   * Busca packs recomendados via API real
   */
  async discoverRecommendedPacks(locale = 'pt-BR') {
    info(`Descobrindo packs recomendados para ${locale}...`);
    
    try {
      const packs = await this.stickerlyClient.getRecommendedPacksSingle(locale);
      const validPacks = this.stickerlyClient.filterValidPacks(packs);
      
      info(`API retornou ${packs.length} packs, ${validPacks.length} válidos`);
      
      // Filtrar packs que já existem
      const newPacks = this.packCache.filterNewPacks(validPacks);
      this.packsDuplicated += (validPacks.length - newPacks.length);
      
      info(`Após filtrar duplicados: ${newPacks.length} packs novos, ${validPacks.length - newPacks.length} duplicados`);
      
      let classified = 0;
      for (const pack of newPacks) {
        if (this.queueManager) {
          // Classificar pack
          const classification = this.classifyPack(pack);
          
          // Adicionar à fila discovery
          await this.queueManager.addToQueue('discovery', {
            packId: pack.packId,
            name: pack.name,
            source: 'recommend',
            locale: locale,
            resourceFiles: pack.resourceFiles,
            resourceUrlPrefix: pack.resourceUrlPrefix,
            isAnimated: pack.isAnimated,
            classification: classification,
            authorName: pack.authorName,
            viewCount: pack.viewCount || 0
          });
          
          this.packsClassified[classification]++;
          classified++;
          this.packsFound++;
        }
      }
      
      return {
        success: true,
        packsFound: validPacks.length,
        packsNew: newPacks.length,
        packsDuplicated: validPacks.length - newPacks.length,
        packsClassified: classified,
        source: 'recommend',
        locale
      };
      
    } catch (err) {
      error('Erro ao descobrir packs recomendados', err);
      throw err;
    }
  }

  /**
   * Busca packs por keyword via API real
   */
  async discoverSearchPacks(keyword, locale = 'pt-BR', maxPages = 2) {
    info(`Descobrindo packs para keyword "${keyword}" (${locale})...`);
    
    try {
      const allPacks = [];
      let page = 0;
      let emptyResponses = 0;
      
      while (page < maxPages && emptyResponses < 2) {
        const packs = await this.stickerlyClient.searchPacks(keyword, page, locale);
        
        if (packs.length === 0) {
          emptyResponses++;
        } else {
          emptyResponses = 0;
          allPacks.push(...packs);
        }
        
        page++;
        await this.delay(2000); // Rate limiting
      }
      
      const validPacks = this.stickerlyClient.filterValidPacks(allPacks);
      info(`Keyword "${keyword}": ${allPacks.length} packs, ${validPacks.length} válidos`);
      
      // Filtrar packs que já existem
      const newPacks = this.packCache.filterNewPacks(validPacks);
      this.packsDuplicated += (validPacks.length - newPacks.length);
      
      info(`Após filtrar duplicados: ${newPacks.length} packs novos, ${validPacks.length - newPacks.length} duplicados`);
      
      let classified = 0;
      for (const pack of newPacks) {
        if (this.queueManager) {
          // Classificar pack
          const classification = this.classifyPack(pack);
          
          // Adicionar à fila discovery
          await this.queueManager.addToQueue('discovery', {
            packId: pack.packId,
            name: pack.name,
            source: 'search',
            keyword: keyword,
            locale: locale,
            resourceFiles: pack.resourceFiles,
            resourceUrlPrefix: pack.resourceUrlPrefix,
            isAnimated: pack.isAnimated,
            classification: classification,
            authorName: pack.authorName,
            viewCount: pack.viewCount || 0
          });
          
          this.packsClassified[classification]++;
          classified++;
          this.packsFound++;
        }
      }
      
      return {
        success: true,
        packsFound: validPacks.length,
        packsNew: newPacks.length,
        packsDuplicated: validPacks.length - newPacks.length,
        packsClassified: classified,
        source: 'search',
        keyword,
        locale
      };
      
    } catch (err) {
      error(`Erro ao descobrir packs para keyword "${keyword}"`, err);
      throw err;
    }
  }

  /**
   * Classifica pack como light ou heavy baseado em heurísticas
   */
  classifyPack(pack) {
    let score = 0;
    
    // Quantidade de arquivos
    const fileCount = pack.resourceFiles?.length || 0;
    if (fileCount > 15) score += 3;
    else if (fileCount > 8) score += 2;
    else score += 1;
    
    // Se é animado
    if (pack.isAnimated) score += 4;
    
    // Tipo de arquivos (aproximação baseada no nome)
    const hasGif = pack.resourceFiles?.some(file => file.toLowerCase().includes('.gif'));
    if (hasGif) score += 3;
    
    // Popularidade (packs populares podem ser mais complexos)
    if (pack.viewCount > 10000) score += 1;
    
    return score >= 6 ? 'heavy' : 'light';
  }

  async startMainLoop() {
    info(`Loop principal iniciado para ${this.name}`);
    
    while (this.isRunning) {
      if (this.isPaused) {
        await this.delay(1000);
        continue;
      }
      
      try {
        // Verificar recursos antes de fazer requests
        if (this.resourceMonitor) {
          const pressure = this.resourceMonitor.isUnderPressure();
          if (pressure.overall) {
            warn('Sistema sob pressão, pausando discovery...');
            await this.delay(5000);
            continue;
          }
        }
        
        // Alternar entre recomendados e busca por keywords
        if (Math.random() < 0.4) {
          // 40% chance de buscar recomendados
          await this.processTask({
            type: 'discover-recommended',
            locale: 'pt-BR'
          }, 'discover-recommended');
        } else {
          // 60% chance de buscar por keyword
          const keywords = ['memes', 'amor', 'engraçado', 'trabalho', 'família'];
          const keyword = keywords[Math.floor(Math.random() * keywords.length)];
          
          await this.processTask({
            type: 'discover-search',
            keyword: keyword,
            locale: 'pt-BR'
          }, 'discover-search');
        }
        
        // Delay entre descobertas
        await this.delay(8000);
        
      } catch (err) {
        error('Erro no loop de discovery', err);
        await this.delay(10000); // Delay maior após erro
      }
    }
  }

  getStats() {
    const baseStats = super.getMetrics(); // Método correto do BaseWorker
    return {
      ...baseStats,
      packsFound: this.packsFound,
      packsDuplicated: this.packsDuplicated,
      classification: { ...this.packsClassified },
      cache: this.packCache.getStats()
    };
  }
}

/**
 * Teste de integração real
 */
async function testRealIntegration() {
  console.log('🧪 Iniciando teste de integração real com API...\n');

  let queueManager = null;
  let resourceMonitor = null;
  let discoveryWorker = null;

  try {
    // 1. Inicializar ResourceMonitor
    console.log('1. Inicializando ResourceMonitor...');
    resourceMonitor = new ResourceMonitor({
      maxMemoryMB: 500, // Mais conservador para teste
      monitorInterval: 3000, // 3s
      enableAutoThrottling: true
    });

    resourceMonitor.on('memoryAlert', (alert) => {
      console.log(`   🚨 Alerta de memória: ${alert.current.toFixed(1)}% (${alert.usedMB}MB)`);
    });

    resourceMonitor.on('throttleActivated', (state) => {
      console.log(`   🐌 Throttling ativado: ${state.reason}`);
    });

    resourceMonitor.start();
    console.log('   ✅ ResourceMonitor iniciado');

    // 2. Inicializar QueueManager
    console.log('\n2. Inicializando QueueManager...');
    queueManager = new QueueManager({
      saveInterval: 10000, // 10s
      persistencePath: './test_real_state',
      maxQueueSize: {
        discovery: 20,
        light: 10,
        heavy: 5
      }
    });

    await queueManager.start();
    console.log('   ✅ QueueManager iniciado');

    // 3. Inicializar Discovery Worker
    console.log('\n3. Inicializando RealDiscoveryWorker...');
    discoveryWorker = new RealDiscoveryWorker();
    discoveryWorker.setQueueManager(queueManager);
    discoveryWorker.setResourceMonitor(resourceMonitor);

    // Registrar worker no queue manager
    queueManager.registerWorker(discoveryWorker.id, discoveryWorker.name, discoveryWorker);

    // Event listeners
    discoveryWorker.on('taskCompleted', (data) => {
      console.log(`   ✅ Tarefa completa: ${data.taskName} em ${data.processingTime}ms`);
    });

    discoveryWorker.on('taskFailed', (data) => {
      console.log(`   ❌ Tarefa falhou: ${data.taskName} (${data.attempts} tentativas)`);
    });

    await discoveryWorker.start();
    console.log('   ✅ RealDiscoveryWorker iniciado');

    // 4. Monitorar por 60 segundos
    console.log('\n4. Monitorando integração por 60 segundos...');
    console.log('   (Ctrl+C para parar antes)\n');

    const startTime = Date.now();
    const duration = 60000; // 1 minuto

    const statusInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);

      console.log(`\n   ⏱️ Tempo restante: ${Math.round(remaining/1000)}s`);
      console.log('   📊 QueueManager:', queueManager.getStatusSummary());
      console.log('   💾 ResourceMonitor:', resourceMonitor.getStatusSummary());
      console.log('   🔍 DiscoveryWorker:', discoveryWorker.getStats());

      if (remaining <= 0) {
        clearInterval(statusInterval);
      }
    }, 15000); // Status a cada 15s

    // Aguardar duração do teste
    await new Promise(resolve => setTimeout(resolve, duration));
    clearInterval(statusInterval);

    // 5. Resultados finais
    console.log('\n5. Resultados finais...');
    
    const finalQueueStats = queueManager.getStats();
    const finalResourceStats = resourceMonitor.getCurrentMetrics();
    const finalWorkerStats = discoveryWorker.getStats();

    console.log('\n   📋 Resumo Final:');
    console.log('   ================');
    console.log(`   🔍 Discovery: ${finalWorkerStats.packsFound} packs encontrados`);
    console.log(`   ⚡ Light: ${finalWorkerStats.classification.light} classificados`);
    console.log(`   🔨 Heavy: ${finalWorkerStats.classification.heavy} classificados`);
    console.log(`   📦 Filas: Discovery=${finalQueueStats.sizes.discovery}, Light=${finalQueueStats.sizes.light}, Heavy=${finalQueueStats.sizes.heavy}`);
    console.log(`   💾 Memória: ${finalResourceStats.memory.usedMB}MB (${finalResourceStats.memory.percent.toFixed(1)}%)`);
    console.log(`   ⚡ CPU: ${finalResourceStats.cpu.percent.toFixed(1)}%`);
    console.log(`   ✅ Tarefas: ${finalWorkerStats.tasksSuccessful}/${finalWorkerStats.tasksProcessed} (${finalWorkerStats.successRate.toFixed(1)}%)`);

    // 6. Cleanup
    console.log('\n6. Finalizando...');
    await discoveryWorker.stop();
    await queueManager.stop();
    resourceMonitor.stop();

    console.log('\n✅ Teste de integração real concluído com sucesso!');

    // Verificar se encontrou packs
    if (finalWorkerStats.packsFound > 0) {
      console.log('🎉 API funcionando! Packs foram descobertos e classificados.');
    } else {
      console.log('⚠️ Nenhum pack foi descoberto. Verificar conectividade da API.');
    }

  } catch (err) {
    console.error('\n❌ Erro no teste de integração real:', err);
    throw err;
  } finally {
    // Cleanup garantido
    if (discoveryWorker) await discoveryWorker.stop().catch(() => {});
    if (queueManager) await queueManager.stop().catch(() => {});
    if (resourceMonitor) resourceMonitor.stop();
  }
}

// Handler para Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Parando teste...');
  process.exit(0);
});

// Executar teste se chamado diretamente
if (require.main === module) {
  testRealIntegration().then(() => {
    console.log('\n🎉 Teste de integração real passou!');
    process.exit(0);
  }).catch(err => {
    console.error('\n💥 Teste de integração real falhou:', err.message);
    process.exit(1);
  });
}

module.exports = { testRealIntegration, RealDiscoveryWorker };
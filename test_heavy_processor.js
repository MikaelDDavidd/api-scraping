#!/usr/bin/env node

const QueueManager = require('./workers/queueManager');
const ResourceMonitor = require('./workers/resourceMonitor');
const HeavyProcessor = require('./workers/heavyProcessor');
const LightProcessor = require('./workers/lightProcessor');
const { info, error, warn } = require('./utils/logger');

/**
 * Teste do HeavyProcessor com sistema de fallback
 */
async function testHeavyProcessor() {
  console.log('🧪 Iniciando teste do Heavy Processor com sistema de fallback...\n');

  let queueManager = null;
  let resourceMonitor = null;
  let heavyProcessor = null;
  let lightProcessor = null;

  try {
    // 1. Inicializar ResourceMonitor
    console.log('1. Inicializando ResourceMonitor...');
    resourceMonitor = new ResourceMonitor({
      maxMemoryMB: 400,
      monitorInterval: 3000,
      enableAutoThrottling: true
    });

    resourceMonitor.on('memoryAlert', (alert) => {
      console.log(`   🚨 Alerta de memória: ${alert.current.toFixed(1)}% (${alert.usedMB}MB)`);
    });

    resourceMonitor.start();
    console.log('   ✅ ResourceMonitor iniciado');

    // 2. Inicializar QueueManager
    console.log('\n2. Inicializando QueueManager...');
    queueManager = new QueueManager({
      saveInterval: 8000,
      persistencePath: './test_heavy_state',
      maxQueueSize: {
        discovery: 15,
        light: 10,
        heavy: 8
      }
    });

    await queueManager.start();
    console.log('   ✅ QueueManager iniciado');

    // 3. Criar packs de teste
    console.log('\n3. Criando packs de teste...');
    
    // Pack pesado (animado, muitos stickers)
    const heavyPack = {
      packId: 'HEAVY001',
      name: 'Pack Pesado Animado',
      authorName: 'Heavy Test',
      locale: 'pt-BR',
      resourceFiles: [
        'heavy1.webp', 'heavy2.webp', 'heavy3.webp', 'heavy4.webp', 'heavy5.webp',
        'heavy6.webp', 'heavy7.webp', 'heavy8.webp', 'heavy9.webp', 'heavy10.webp',
        'heavy11.webp', 'heavy12.webp', 'heavy13.webp', 'heavy14.webp', 'heavy15.webp'
      ],
      resourceUrlPrefix: 'https://example.com/heavy/',
      isAnimated: true,
      classification: 'heavy',
      estimatedSize: 1500000, // 1.5MB
      stickerCount: 15,
      downloadedFiles: [],
      trayImage: 'tray.png',
      viewCount: 25000
    };

    // Pack médio (para testar fallback)
    const mediumPack = {
      packId: 'MEDIUM001',
      name: 'Pack Médio para Fallback',
      authorName: 'Medium Test',
      locale: 'pt-BR',
      resourceFiles: [
        'medium1.webp', 'medium2.webp', 'medium3.webp', 'medium4.webp',
        'medium5.webp', 'medium6.webp', 'medium7.webp'
      ],
      resourceUrlPrefix: 'https://example.com/medium/',
      isAnimated: false,
      classification: 'light',
      estimatedSize: 400000, // 400KB
      stickerCount: 7,
      downloadedFiles: [],
      trayImage: 'tray.png',
      viewCount: 5000
    };

    // Adicionar às filas
    await queueManager.addToQueue('heavy', heavyPack);
    await queueManager.addToQueue('light', mediumPack);
    
    console.log(`   ✅ Pack pesado adicionado: ${heavyPack.packId} (${heavyPack.stickerCount} stickers)`);
    console.log(`   ✅ Pack médio adicionado: ${mediumPack.packId} (${mediumPack.stickerCount} stickers)`);

    // 4. Inicializar Heavy Processor
    console.log('\n4. Inicializando Heavy Processor...');
    heavyProcessor = new HeavyProcessor(queueManager, resourceMonitor);
    
    let heavyTasksCompleted = 0;
    let heavyTasksFailed = 0;
    
    heavyProcessor.on('taskCompleted', (data) => {
      heavyTasksCompleted++;
      console.log(`   ✅ Heavy pack processado: ${data.taskName} em ${data.processingTime}ms`);
    });

    heavyProcessor.on('taskFailed', (data) => {
      heavyTasksFailed++;
      console.log(`   ❌ Heavy pack falhou: ${data.taskName} - ${data.error?.message}`);
    });

    await heavyProcessor.initialize();
    await heavyProcessor.start();
    console.log('   ✅ Heavy Processor iniciado');

    // 5. Inicializar Light Processor (para comparação)
    console.log('\n5. Inicializando Light Processor...');
    lightProcessor = new LightProcessor(queueManager, resourceMonitor);
    
    let lightTasksCompleted = 0;
    let lightTasksFailed = 0;
    
    lightProcessor.on('taskCompleted', (data) => {
      lightTasksCompleted++;
      console.log(`   ⚡ Light pack processado: ${data.taskName} em ${data.processingTime}ms`);
    });

    lightProcessor.on('taskFailed', (data) => {
      lightTasksFailed++;
      console.log(`   ❌ Light pack falhou: ${data.taskName} - ${data.error?.message}`);
    });

    await lightProcessor.initialize();
    await lightProcessor.start();
    console.log('   ✅ Light Processor iniciado');

    // 6. Monitorar processamento por 30 segundos
    console.log('\n6. Monitorando processamento por 30 segundos...');
    console.log('   (Heavy processor deve processar pack pesado e auxiliar com pack light)\n');

    const startTime = Date.now();
    const duration = 30000;

    const statusInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);

      console.log(`\n   ⏱️ Tempo restante: ${Math.round(remaining/1000)}s`);
      
      const queueStats = queueManager.getStats();
      console.log('   📊 Filas:', {
        discovery: queueStats.sizes.discovery,
        light: queueStats.sizes.light,
        heavy: queueStats.sizes.heavy
      });
      
      console.log('   💾 Recursos:', resourceMonitor.getStatusSummary());
      
      const heavyStats = heavyProcessor.getHeavyStats();
      const lightStats = lightProcessor.getLightStats();
      
      console.log('   🔨 Heavy Processor:', {
        packsProcessed: heavyStats.heavy.packsProcessed,
        successful: heavyStats.heavy.packsSuccessful,
        fallbackTasks: heavyStats.heavy.fallbackTasksFromLight,
        avgComplexity: heavyStats.heavy.avgComplexityScore,
        avgTime: Math.round(heavyStats.heavy.avgProcessingTime) + 'ms'
      });
      
      console.log('   ⚡ Light Processor:', {
        packsProcessed: lightStats.light.packsProcessed,
        successful: lightStats.light.packsSuccessful,
        successRate: lightStats.light.successRate + '%'
      });

      if (remaining <= 0) {
        clearInterval(statusInterval);
      }
    }, 8000);

    await new Promise(resolve => setTimeout(resolve, duration));
    clearInterval(statusInterval);

    // 7. Resultados finais
    console.log('\n7. Resultados finais do teste...');
    
    const finalHeavyStats = heavyProcessor.getHeavyStats();
    const finalLightStats = lightProcessor.getLightStats();
    const finalQueueStats = queueManager.getStats();
    const finalResourceStats = resourceMonitor.getCurrentMetrics();

    console.log('\n   📋 Resumo Final dos Processors:');
    console.log('   ===============================');
    console.log('   🔨 HEAVY PROCESSOR:');
    console.log(`   - Packs processados: ${finalHeavyStats.heavy.packsProcessed}`);
    console.log(`   - Sucessos: ${finalHeavyStats.heavy.packsSuccessful} (${finalHeavyStats.heavy.successRate}%)`);
    console.log(`   - Tempo médio: ${Math.round(finalHeavyStats.heavy.avgProcessingTime)}ms/pack`);
    console.log(`   - Fallback tasks: ${finalHeavyStats.heavy.fallbackTasksFromLight} (${finalHeavyStats.heavy.fallbackRate})`);
    console.log(`   - Complexidade média: ${finalHeavyStats.heavy.avgComplexityScore}`);
    console.log(`   - Animações complexas: ${finalHeavyStats.heavy.complexAnimationsProcessed}`);

    console.log('   ⚡ LIGHT PROCESSOR:');
    console.log(`   - Packs processados: ${finalLightStats.light.packsProcessed}`);
    console.log(`   - Sucessos: ${finalLightStats.light.packsSuccessful} (${finalLightStats.light.successRate}%)`);
    console.log(`   - Tempo médio: ${Math.round(finalLightStats.light.avgProcessingTime)}ms/pack`);

    console.log('   📊 SISTEMA:');
    console.log(`   - Filas restantes: Heavy=${finalQueueStats.sizes.heavy}, Light=${finalQueueStats.sizes.light}`);
    console.log(`   - Memória final: ${finalResourceStats.memory.usedMB}MB (${finalResourceStats.memory.percent.toFixed(1)}%)`);

    // 8. Análise de performance
    console.log('\n   📈 Análise de Performance:');
    console.log('   ===========================');
    
    if (finalHeavyStats.heavy.packsProcessed > 0) {
      console.log('   🎉 Heavy Processor funcionando!');
      
      if (finalHeavyStats.heavy.fallbackTasksFromLight > 0) {
        console.log(`   🔄 Sistema de fallback ativo: ${finalHeavyStats.heavy.fallbackTasksFromLight} tasks auxiliadas`);
      }
      
      if (finalHeavyStats.heavy.avgComplexityScore > 5) {
        console.log('   💪 Processando packs de alta complexidade com sucesso');
      }
      
      // Comparar velocidades
      const heavySpeed = finalHeavyStats.heavy.avgProcessingTime;
      const lightSpeed = finalLightStats.light.avgProcessingTime;
      
      if (heavySpeed > 0 && lightSpeed > 0) {
        const speedRatio = heavySpeed / lightSpeed;
        console.log(`   ⏱️ Heavy processor é ${speedRatio.toFixed(1)}x mais lento que light (esperado para qualidade)`);
      }
      
    } else {
      console.log('   ⚠️ Heavy processor não processou nenhum pack');
    }

    if (finalLightStats.light.packsProcessed > 0) {
      console.log('   ⚡ Light processor mantendo eficiência');
    }

    console.log('\n✅ Teste do Heavy Processor concluído!');

  } catch (err) {
    console.error('\n❌ Erro no teste do Heavy Processor:', err);
    throw err;
  } finally {
    // Cleanup
    console.log('\n8. Finalizando componentes...');
    if (heavyProcessor) await heavyProcessor.stop().catch(() => {});
    if (lightProcessor) await lightProcessor.stop().catch(() => {});
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
  testHeavyProcessor().then(() => {
    console.log('\n🎉 Teste do Heavy Processor passou!');
    process.exit(0);
  }).catch(err => {
    console.error('\n💥 Teste do Heavy Processor falhou:', err.message);
    process.exit(1);
  });
}

module.exports = { testHeavyProcessor };
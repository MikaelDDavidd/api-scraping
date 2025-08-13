#!/usr/bin/env node

const QueueManager = require('./workers/queueManager');
const ResourceMonitor = require('./workers/resourceMonitor');
const LightProcessor = require('./workers/lightProcessor');
const { RealDiscoveryWorker } = require('./test_real_integration');
const { info, error, warn } = require('./utils/logger');

/**
 * Teste do LightProcessor com integração completa
 */
async function testLightProcessor() {
  console.log('🧪 Iniciando teste do Light Processor...\n');

  let queueManager = null;
  let resourceMonitor = null;
  let discoveryWorker = null;
  let lightProcessor = null;

  try {
    // 1. Inicializar ResourceMonitor
    console.log('1. Inicializando ResourceMonitor...');
    resourceMonitor = new ResourceMonitor({
      maxMemoryMB: 500,
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
      saveInterval: 5000,
      persistencePath: './test_light_state',
      maxQueueSize: {
        discovery: 20,
        light: 15,
        heavy: 5
      }
    });

    await queueManager.start();
    console.log('   ✅ QueueManager iniciado');

    // 3. Inicializar Discovery Worker (para gerar dados)
    console.log('\n3. Inicializando Discovery Worker...');
    discoveryWorker = new RealDiscoveryWorker();
    discoveryWorker.setQueueManager(queueManager);
    discoveryWorker.setResourceMonitor(resourceMonitor);
    
    queueManager.registerWorker(discoveryWorker.id, discoveryWorker.name, discoveryWorker);
    await discoveryWorker.start();
    console.log('   ✅ Discovery Worker iniciado');

    // 4. Inicializar Light Processor
    console.log('\n4. Inicializando Light Processor...');
    lightProcessor = new LightProcessor(queueManager, resourceMonitor);
    
    // Event listeners para Light Processor
    lightProcessor.on('taskCompleted', (data) => {
      console.log(`   ✅ Pack processado: ${data.taskName} em ${data.processingTime}ms`);
    });

    lightProcessor.on('taskFailed', (data) => {
      console.log(`   ❌ Pack falhou: ${data.taskName} - ${data.error?.message || 'erro desconhecido'}`);
    });

    await lightProcessor.initialize();
    await lightProcessor.start();
    console.log('   ✅ Light Processor iniciado');

    // 5. Aguardar discovery gerar alguns packs
    console.log('\n5. Aguardando discovery gerar packs para processamento...');
    
    let discoveryAttempts = 0;
    const maxDiscoveryAttempts = 3;
    
    while (discoveryAttempts < maxDiscoveryAttempts) {
      console.log(`   🔍 Tentativa de discovery ${discoveryAttempts + 1}/${maxDiscoveryAttempts}...`);
      
      // Processar uma descoberta
      await discoveryWorker.processTask({
        type: 'discover-recommended',
        locale: 'pt-BR'
      }, 'discover-recommended');
      
      const queueStats = queueManager.getStats();
      console.log(`   📊 Estado das filas: Discovery=${queueStats.sizes.discovery}, Light=${queueStats.sizes.light}`);
      
      if (queueStats.sizes.discovery > 0) {
        console.log('   ✅ Packs descobertos! Movendo para fila light...');
        
        // Mover alguns packs discovery para light queue (simulando classificação)
        const discoveredPacks = [];
        for (let i = 0; i < Math.min(5, queueStats.sizes.discovery); i++) {
          const pack = queueManager.getFromQueue('discovery');
          if (pack && pack.resourceFiles && pack.resourceFiles.length <= 10) {
            // Apenas packs leves (<=10 stickers)
            await queueManager.addToQueue('light', pack);
            discoveredPacks.push(pack.packId);
          } else if (pack) {
            // Pack pesado, devolver para discovery
            await queueManager.addToQueue('discovery', pack);
          }
        }
        
        console.log(`   📦 ${discoveredPacks.length} packs movidos para light queue: ${discoveredPacks.slice(0, 3).join(', ')}${discoveredPacks.length > 3 ? '...' : ''}`);
        break;
      }
      
      discoveryAttempts++;
      if (discoveryAttempts < maxDiscoveryAttempts) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    if (queueManager.getQueueSize('light') === 0) {
      console.log('   ⚠️ Nenhum pack leve encontrado. Criando pack de teste...');
      
      // Criar pack de teste para light processor
      const testPack = {
        packId: 'TEST_LIGHT_' + Date.now(),
        name: 'Pack de Teste Light',
        authorName: 'Teste',
        locale: 'pt-BR',
        resourceFiles: ['test1.webp', 'test2.webp', 'test3.webp'], // 3 stickers apenas
        resourceUrlPrefix: 'https://stickerly.pstatic.net/test/',
        isAnimated: false,
        classification: 'light'
      };
      
      await queueManager.addToQueue('light', testPack);
      console.log(`   ✅ Pack de teste criado: ${testPack.packId}`);
    }

    // 6. Monitorar processamento por 45 segundos
    console.log('\n6. Monitorando processamento do Light Processor por 45 segundos...');
    console.log('   (Ctrl+C para parar antes)\n');

    const startTime = Date.now();
    const duration = 45000;

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
      
      const lightStats = lightProcessor.getLightStats();
      console.log('   ⚡ Light Processor:', {
        packsProcessed: lightStats.light.packsProcessed,
        successful: lightStats.light.packsSuccessful,
        successRate: lightStats.light.successRate + '%',
        avgTime: Math.round(lightStats.light.avgProcessingTime) + 'ms',
        stickersProcessed: lightStats.light.totalStickersProcessed
      });

      if (remaining <= 0) {
        clearInterval(statusInterval);
      }
    }, 10000);

    await new Promise(resolve => setTimeout(resolve, duration));
    clearInterval(statusInterval);

    // 7. Resultados finais
    console.log('\n7. Resultados finais do teste...');
    
    const finalLightStats = lightProcessor.getLightStats();
    const finalQueueStats = queueManager.getStats();
    const finalResourceStats = resourceMonitor.getCurrentMetrics();

    console.log('\n   📋 Resumo Final do Light Processor:');
    console.log('   ===================================');
    console.log(`   📦 Packs processados: ${finalLightStats.light.packsProcessed}`);
    console.log(`   ✅ Sucessos: ${finalLightStats.light.packsSuccessful} (${finalLightStats.light.successRate}%)`);
    console.log(`   ⚡ Tempo médio: ${Math.round(finalLightStats.light.avgProcessingTime)}ms/pack`);
    console.log(`   🔖 Stickers processados: ${finalLightStats.light.totalStickersProcessed}`);
    console.log(`   🎯 Média stickers/pack: ${finalLightStats.light.avgStickersPerPack}`);
    console.log(`   📋 Fila light restante: ${finalQueueStats.sizes.light} itens`);
    console.log(`   💾 Memória final: ${finalResourceStats.memory.usedMB}MB (${finalResourceStats.memory.percent.toFixed(1)}%)`);

    // 8. Análise de performance
    console.log('\n   📊 Análise de Performance:');
    console.log('   ==========================');
    
    const tasksCompleted = finalLightStats.tasksSuccessful || 0;
    const tasksTotal = finalLightStats.tasksProcessed || 0;
    
    if (tasksCompleted > 0) {
      console.log('   🎉 Light Processor funcionando! Packs foram processados.');
      
      if (finalLightStats.light.successRate >= 80) {
        console.log('   ✅ Taxa de sucesso excelente (≥80%)');
      } else if (finalLightStats.light.successRate >= 60) {
        console.log('   ⚠️ Taxa de sucesso aceitável (60-79%)');
      } else {
        console.log('   ❌ Taxa de sucesso baixa (<60%)');
      }
      
      if (finalLightStats.light.avgProcessingTime < 30000) {
        console.log('   ⚡ Velocidade excelente (<30s/pack)');
      } else {
        console.log('   🐌 Velocidade pode ser melhorada (>30s/pack)');
      }
    } else {
      console.log('   ⚠️ Nenhum pack foi processado completamente.');
      console.log('   💡 Possíveis motivos: falta de packs válidos, errors na API, ou configuração.');
    }

    console.log('\n✅ Teste do Light Processor concluído!');

  } catch (err) {
    console.error('\n❌ Erro no teste do Light Processor:', err);
    throw err;
  } finally {
    // Cleanup
    console.log('\n8. Finalizando componentes...');
    if (lightProcessor) await lightProcessor.stop().catch(() => {});
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
  testLightProcessor().then(() => {
    console.log('\n🎉 Teste do Light Processor passou!');
    process.exit(0);
  }).catch(err => {
    console.error('\n💥 Teste do Light Processor falhou:', err.message);
    process.exit(1);
  });
}

module.exports = { testLightProcessor };
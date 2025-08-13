#!/usr/bin/env node

const QueueManager = require('./workers/queueManager');
const ResourceMonitor = require('./workers/resourceMonitor');
const LightProcessor = require('./workers/lightProcessor');
const { info, error } = require('./utils/logger');

/**
 * Teste simples do LightProcessor sem descobertas reais
 */
async function testLightProcessorSimple() {
  console.log('🧪 Iniciando teste simples do Light Processor...\n');

  let queueManager = null;
  let resourceMonitor = null;
  let lightProcessor = null;

  try {
    // 1. Inicializar componentes básicos
    console.log('1. Inicializando componentes...');
    
    resourceMonitor = new ResourceMonitor({
      maxMemoryMB: 300,
      monitorInterval: 5000
    });
    resourceMonitor.start();

    queueManager = new QueueManager({
      saveInterval: 10000,
      persistencePath: './test_simple_state',
      maxQueueSize: {
        discovery: 10,
        light: 10,
        heavy: 5
      }
    });
    await queueManager.start();
    
    console.log('   ✅ Componentes básicos iniciados');

    // 2. Criar pack de teste realístico
    console.log('\n2. Criando pack de teste...');
    
    const testPack = {
      packId: 'TEST001',
      name: 'Pack de Teste Light',
      authorName: 'Test Author',
      locale: 'pt-BR',
      resourceFiles: [
        'sticker1.webp',
        'sticker2.webp',
        'sticker3.webp',
        'sticker4.webp'
      ],
      resourceUrlPrefix: 'https://example.com/test/',
      isAnimated: false,
      classification: 'light',
      estimatedSize: 200000, // 200KB
      stickerCount: 4,
      downloadedFiles: [], // Para light queue
      trayImage: 'tray.png'
    };
    
    // Adicionar à fila light
    await queueManager.addToQueue('light', testPack);
    console.log(`   ✅ Pack de teste adicionado: ${testPack.packId}`);

    // 3. Inicializar Light Processor
    console.log('\n3. Inicializando Light Processor...');
    
    lightProcessor = new LightProcessor(queueManager, resourceMonitor);
    
    let tasksCompleted = 0;
    let tasksFailed = 0;
    
    lightProcessor.on('taskCompleted', (data) => {
      tasksCompleted++;
      console.log(`   ✅ Pack processado: ${data.taskName}`);
    });

    lightProcessor.on('taskFailed', (data) => {
      tasksFailed++;
      console.log(`   ❌ Pack falhou: ${data.taskName} - ${data.error?.message}`);
    });

    await lightProcessor.initialize();
    await lightProcessor.start();
    console.log('   ✅ Light Processor iniciado');

    // 4. Aguardar processamento
    console.log('\n4. Aguardando processamento por 15 segundos...');
    
    const startTime = Date.now();
    const duration = 15000;
    
    const monitor = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, duration - elapsed);
      
      if (remaining > 0) {
        const queueStats = queueManager.getStats();
        const lightStats = lightProcessor.getLightStats();
        
        console.log(`   ⏱️ ${Math.round(remaining/1000)}s - Light queue: ${queueStats.sizes.light}, Processados: ${lightStats.light.packsProcessed}`);
      } else {
        clearInterval(monitor);
      }
    }, 3000);

    await new Promise(resolve => setTimeout(resolve, duration));

    // 5. Resultados
    console.log('\n5. Resultados do teste simples:');
    
    const finalStats = lightProcessor.getLightStats();
    const finalQueueStats = queueManager.getStats();
    
    console.log('   📊 Estatísticas:');
    console.log(`   - Packs processados: ${finalStats.light.packsProcessed}`);
    console.log(`   - Taxa de sucesso: ${finalStats.light.successRate}%`);
    console.log(`   - Tempo médio: ${Math.round(finalStats.light.avgProcessingTime)}ms`);
    console.log(`   - Tasks completadas: ${tasksCompleted}`);
    console.log(`   - Tasks falharam: ${tasksFailed}`);
    console.log(`   - Fila light restante: ${finalQueueStats.sizes.light}`);

    // Análise
    if (finalStats.light.packsProcessed > 0) {
      console.log('\n   🎉 Light Processor funcionando!');
      if (tasksFailed === 0) {
        console.log('   ✅ Nenhuma falha detectada');
      } else {
        console.log(`   ⚠️ ${tasksFailed} tarefas falharam`);
      }
    } else {
      console.log('\n   ⚠️ Nenhum pack foi processado');
      console.log('   💡 Verifique se o processamento iniciou corretamente');
    }

  } catch (err) {
    console.error('\n❌ Erro no teste simples:', err);
    throw err;
  } finally {
    // Cleanup
    console.log('\n6. Finalizando...');
    if (lightProcessor) await lightProcessor.stop().catch(() => {});
    if (queueManager) await queueManager.stop().catch(() => {});
    if (resourceMonitor) resourceMonitor.stop();
  }
}

if (require.main === module) {
  testLightProcessorSimple().then(() => {
    console.log('\n✅ Teste simples concluído!');
    process.exit(0);
  }).catch(err => {
    console.error('\n💥 Teste simples falhou:', err.message);
    process.exit(1);
  });
}

module.exports = { testLightProcessorSimple };
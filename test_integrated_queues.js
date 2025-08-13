#!/usr/bin/env node

const QueueManager = require('./workers/queueManager');
const { info } = require('./utils/logger');

/**
 * Teste do QueueManager integrado com filas especializadas
 */
async function testIntegratedQueues() {
  console.log('🧪 Testando QueueManager com filas especializadas...\n');

  try {
    // 1. Inicializar QueueManager
    console.log('1. Inicializando QueueManager...');
    const queueManager = new QueueManager({
      saveInterval: 5000,
      persistencePath: './test_integrated_queues',
      maxQueueSize: {
        discovery: 5,
        light: 3,
        heavy: 2
      }
    });
    
    await queueManager.start();
    console.log('   ✅ QueueManager iniciado');
    
    // 2. Testar Discovery Queue
    console.log('\n2. Testando Discovery Queue via QueueManager...');
    
    await queueManager.addToQueue('discovery', {
      packId: 'disc1',
      name: 'Discovery Pack 1',
      source: 'recommend',
      resourceFiles: ['file1.webp'],
      resourceUrlPrefix: 'https://test.com',
      isAnimated: false
    });
    
    await queueManager.addToQueue('discovery', {
      packId: 'disc2',
      name: 'Discovery Pack 2 (High Priority)',
      source: 'search',
      keyword: 'memes',
      resourceFiles: ['file2.gif'],
      resourceUrlPrefix: 'https://test.com',
      isAnimated: true
    }, 'high');
    
    console.log('   ✅ Discovery items adicionados');
    console.log('   📊 Status:', queueManager.getStatusSummary());
    
    // 3. Testar Light Queue
    console.log('\n3. Testando Light Queue via QueueManager...');
    
    await queueManager.addToQueue('light', {
      packId: 'light1',
      name: 'Light Pack 1',
      downloadedFiles: [
        { name: 'sticker1.webp', size: 40000, type: 'webp' }
      ],
      isAnimated: false,
      estimatedSize: 40000,
      stickerCount: 1
    });
    
    await queueManager.addToQueue('light', {
      packId: 'light2',
      name: 'Light Pack 2 (Priority)',
      downloadedFiles: [
        { name: 'sticker2.webp', size: 30000, type: 'webp' }
      ],
      isAnimated: false,
      estimatedSize: 30000,
      stickerCount: 1
    }, 'high');
    
    console.log('   ✅ Light items adicionados');
    
    // 4. Testar Heavy Queue
    console.log('\n4. Testando Heavy Queue via QueueManager...');
    
    await queueManager.addToQueue('heavy', {
      packId: 'heavy1',
      name: 'Heavy Pack 1 (Animated)',
      downloadedFiles: [
        { name: 'anim1.gif', size: 500000, type: 'gif' },
        { name: 'anim2.gif', size: 600000, type: 'gif' }
      ],
      isAnimated: true,
      estimatedSize: 1100000,
      stickerCount: 2
    });
    
    console.log('   ✅ Heavy items adicionados');
    
    // 5. Testar recuperação de items
    console.log('\n5. Testando recuperação de items...');
    
    // Registrar um worker fictício
    queueManager.registerWorker('worker1', 'TestWorker1');
    
    // Buscar items de cada fila
    const discoveryItem = await queueManager.getFromQueue('discovery', 'worker1');
    const lightItem = await queueManager.getFromQueue('light', 'worker1');
    const heavyItem = await queueManager.getFromQueue('heavy', 'worker1');
    
    console.log('   ✅ Discovery item:', discoveryItem?.name);
    console.log('   ✅ Light item:', lightItem?.name);
    console.log('   ✅ Heavy item (complexidade ' + heavyItem?.complexityScore + '):', heavyItem?.name);
    
    // 6. Testar marcação como processado/falhado
    console.log('\n6. Testando processamento...');
    
    if (lightItem) {
      await queueManager.markAsProcessed('light', lightItem.id, { processingTime: 1500 });
      console.log('   ✅ Light item marcado como processado');
    }
    
    if (discoveryItem) {
      await queueManager.markAsFailed('discovery', discoveryItem.id, new Error('Teste de falha'));
      console.log('   ✅ Discovery item marcado como falhado');
    }
    
    // 7. Verificar estatísticas finais
    console.log('\n7. Estatísticas finais...');
    const finalStats = queueManager.getStats();
    
    console.log('   📊 Stats detalhadas:');
    console.log('     Discovery:', finalStats.stats.discovery);
    console.log('     Light:', finalStats.stats.light);
    console.log('     Heavy:', finalStats.stats.heavy);
    
    console.log('   📋 Resumo:', queueManager.getStatusSummary());
    
    // 8. Testar persistência
    console.log('\n8. Testando persistência...');
    await queueManager.saveState();
    console.log('   ✅ Estado salvo');
    
    // 9. Testar limites
    console.log('\n9. Testando limites de fila...');
    
    try {
      // Tentar encher a fila light (máximo 3)
      await queueManager.addToQueue('light', { packId: 'light3', name: 'Light 3', downloadedFiles: [] });
      await queueManager.addToQueue('light', { packId: 'light4', name: 'Light 4', downloadedFiles: [] });
      console.log('   ⚠️ Deveria ter falhado ao exceder limite light');
    } catch (err) {
      console.log('   ✅ Limite de light queue funcionando:', err.message);
    }
    
    // 10. Cleanup
    console.log('\n10. Finalizando...');
    await queueManager.stop();
    console.log('   ✅ QueueManager parado');
    
    console.log('\n✅ Teste integrado concluído com sucesso!');
    
  } catch (err) {
    console.error('❌ Erro no teste integrado:', err);
    throw err;
  }
}

// Executar teste se chamado diretamente
if (require.main === module) {
  testIntegratedQueues().then(() => {
    console.log('\n🎉 Teste integrado das filas passou!');
    process.exit(0);
  }).catch(err => {
    console.error('\n💥 Teste integrado falhou:', err.message);
    process.exit(1);
  });
}

module.exports = { testIntegratedQueues };
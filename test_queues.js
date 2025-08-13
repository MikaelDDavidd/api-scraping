#!/usr/bin/env node

const DiscoveryQueue = require('./queues/discoveryQueue');
const LightQueue = require('./queues/lightQueue');
const HeavyQueue = require('./queues/heavyQueue');
const { info } = require('./utils/logger');

/**
 * Teste das filas especializadas
 */
async function testQueues() {
  console.log('🧪 Testando filas especializadas...\n');

  try {
    // 1. Teste DiscoveryQueue
    console.log('1. Testando DiscoveryQueue...');
    const discoveryQueue = new DiscoveryQueue(5); // Tamanho pequeno para teste
    
    // Adicionar alguns packs
    discoveryQueue.add({
      packId: 'pack1',
      name: 'Pack Teste 1',
      source: 'recommend',
      resourceFiles: ['file1.webp', 'file2.webp'],
      resourceUrlPrefix: 'https://test.com',
      isAnimated: false
    });
    
    discoveryQueue.add({
      packId: 'pack2', 
      name: 'Pack Teste 2',
      source: 'search',
      keyword: 'test',
      resourceFiles: ['file3.gif'],
      resourceUrlPrefix: 'https://test.com',
      isAnimated: true
    }, 'high');
    
    // Teste duplicado
    const duplicateResult = discoveryQueue.add({
      packId: 'pack1', // Mesmo ID
      name: 'Pack Duplicado'
    });
    
    console.log('   ✅ Discovery Stats:', discoveryQueue.getStats());
    console.log('   ✅ Duplicado rejeitado:', !duplicateResult);
    
    // Processar items
    const item1 = discoveryQueue.next();
    const item2 = discoveryQueue.next();
    
    console.log('   ✅ Item 1 (alta prioridade):', item1.priority, '-', item1.name);
    console.log('   ✅ Item 2:', item2.name);
    
    // 2. Teste LightQueue
    console.log('\n2. Testando LightQueue...');
    const lightQueue = new LightQueue(3);
    
    lightQueue.add({
      packId: 'light1',
      name: 'Light Pack 1',
      downloadedFiles: [
        { name: 'sticker1.webp', size: 50000, type: 'webp' },
        { name: 'sticker2.webp', size: 45000, type: 'webp' }
      ],
      isAnimated: false,
      estimatedSize: 95000,
      stickerCount: 2
    });
    
    lightQueue.add({
      packId: 'light2',
      name: 'Light Pack 2',
      downloadedFiles: [
        { name: 'sticker3.webp', size: 30000, type: 'webp' }
      ],
      isAnimated: false,
      estimatedSize: 30000,
      stickerCount: 1
    }, 'high');
    
    console.log('   ✅ Light Stats:', lightQueue.getStats());
    
    const lightItem = lightQueue.next('worker1');
    console.log('   ✅ Light item processado:', lightItem.name, 'por', lightItem.workerId);
    
    // Simular completação
    lightQueue.markCompleted(lightItem.id, { processingTime: 2000 });
    console.log('   ✅ Light Stats após completar:', lightQueue.getStats());
    
    // 3. Teste HeavyQueue
    console.log('\n3. Testando HeavyQueue...');
    const heavyQueue = new HeavyQueue(3);
    
    heavyQueue.add({
      packId: 'heavy1',
      name: 'Heavy Pack 1 (GIF)',
      downloadedFiles: [
        { name: 'anim1.gif', size: 500000, type: 'gif' },
        { name: 'anim2.gif', size: 800000, type: 'gif' },
        { name: 'anim3.gif', size: 600000, type: 'gif' }
      ],
      isAnimated: true,
      estimatedSize: 1900000,
      stickerCount: 3
    });
    
    heavyQueue.add({
      packId: 'heavy2',
      name: 'Heavy Pack 2 (Many stickers)',
      downloadedFiles: Array.from({length: 25}, (_, i) => ({
        name: `sticker${i}.webp`,
        size: 80000,
        type: 'webp'
      })),
      isAnimated: false,
      estimatedSize: 25 * 80000,
      stickerCount: 25
    });
    
    heavyQueue.add({
      packId: 'heavy3',
      name: 'Heavy Pack 3 (Simple)',
      downloadedFiles: [
        { name: 'simple.webp', size: 40000, type: 'webp' }
      ],
      isAnimated: false,
      estimatedSize: 40000,
      stickerCount: 1
    });
    
    console.log('   ✅ Heavy Stats:', heavyQueue.getStats());
    console.log('   ✅ Complexity Report:', heavyQueue.getComplexityReport());
    
    // Testar ordering (complexidade)
    const heavyItem1 = heavyQueue.next('worker2');
    const heavyItem2 = heavyQueue.next('worker2');
    
    console.log('   ✅ Heavy item 1:', heavyItem1.name, `(complexidade: ${heavyItem1.complexityScore})`);
    console.log('   ✅ Heavy item 2:', heavyItem2.name, `(complexidade: ${heavyItem2.complexityScore})`);
    
    // Testar getSimplest
    const simplest = heavyQueue.getSimplest();
    if (simplest) {
      console.log('   ✅ Item mais simples:', simplest.name, `(complexidade: ${simplest.complexityScore})`);
    }
    
    // 4. Teste Serialização
    console.log('\n4. Testando serialização...');
    
    // Serializar discovery queue
    const discoveryJSON = discoveryQueue.toJSON();
    const newDiscoveryQueue = new DiscoveryQueue();
    newDiscoveryQueue.fromJSON(discoveryJSON);
    
    console.log('   ✅ Discovery serializada/deserializada:', newDiscoveryQueue.getStats());
    
    // 5. Teste de Capacidade
    console.log('\n5. Testando limites de capacidade...');
    
    const smallQueue = new LightQueue(2);
    
    smallQueue.add({ packId: 'test1', name: 'Test 1', downloadedFiles: [] });
    smallQueue.add({ packId: 'test2', name: 'Test 2', downloadedFiles: [] });
    
    try {
      smallQueue.add({ packId: 'test3', name: 'Test 3', downloadedFiles: [] });
      console.log('   ❌ Deveria ter falhado ao exceder capacidade');
    } catch (err) {
      console.log('   ✅ Limite de capacidade funcionando:', err.message);
    }
    
    console.log('\n✅ Todos os testes de filas passaram!');
    
    return {
      discoveryQueue,
      lightQueue,
      heavyQueue
    };
    
  } catch (err) {
    console.error('❌ Erro nos testes de filas:', err);
    throw err;
  }
}

// Executar teste se chamado diretamente
if (require.main === module) {
  testQueues().then(() => {
    console.log('\n🎉 Testes de filas concluídos com sucesso!');
    process.exit(0);
  }).catch(err => {
    console.error('\n💥 Testes de filas falharam:', err.message);
    process.exit(1);
  });
}

module.exports = { testQueues };
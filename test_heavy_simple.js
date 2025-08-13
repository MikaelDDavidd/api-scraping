#!/usr/bin/env node

const QueueManager = require('./workers/queueManager');
const ResourceMonitor = require('./workers/resourceMonitor');
const HeavyProcessor = require('./workers/heavyProcessor');

async function testHeavySimple() {
  console.log('🔨 Teste simples do Heavy Processor...\n');

  let queueManager = null;
  let heavyProcessor = null;

  try {
    // Inicializar componentes
    console.log('1. Inicializando componentes...');
    
    const resourceMonitor = new ResourceMonitor({ maxMemoryMB: 200 });
    resourceMonitor.start();

    queueManager = new QueueManager({
      persistencePath: './test_heavy_simple',
      maxQueueSize: { discovery: 5, light: 5, heavy: 5 }
    });
    await queueManager.start();

    // Pack pesado de teste
    const heavyPack = {
      packId: 'HEAVY_TEST',
      name: 'Pack Pesado Teste',
      authorName: 'Test',
      resourceFiles: Array.from({length: 12}, (_, i) => `heavy${i+1}.webp`),
      resourceUrlPrefix: 'https://example.com/heavy/',
      isAnimated: true,
      locale: 'pt-BR',
      stickerCount: 12,
      estimatedSize: 2000000,
      viewCount: 15000
    };

    await queueManager.addToQueue('heavy', heavyPack);
    console.log(`   ✅ Pack adicionado: ${heavyPack.packId}`);

    // Inicializar Heavy Processor
    heavyProcessor = new HeavyProcessor(queueManager, resourceMonitor);
    await heavyProcessor.initialize();
    
    console.log('   ✅ Heavy Processor inicializado');

    // Verificar se pode classificar pack
    const complexityScore = heavyProcessor.calculateComplexityScore(heavyPack);
    const validation = heavyProcessor.validateHeavyPack(heavyPack);
    
    console.log(`   📊 Complexity Score: ${complexityScore}/20`);
    console.log(`   ✓ Validation: ${validation.valid ? 'PASSED' : 'FAILED'}`);
    
    if (!validation.valid) {
      console.log(`   ⚠️ Issues: ${validation.issues.join(', ')}`);
    }

    console.log('\n2. Testando métodos do Heavy Processor...');
    
    // Testar estimativa de tamanho
    const estimatedSize = heavyProcessor.estimatePackSize(heavyPack);
    console.log(`   📏 Tamanho estimado: ${Math.round(estimatedSize/1024)}KB`);
    
    // Testar linguagem
    const lang = heavyProcessor.getLanguageFromLocale('pt-BR');
    console.log(`   🌍 Idioma: ${lang}`);

    // Ver estatísticas iniciais
    const initialStats = heavyProcessor.getHeavyStats();
    console.log(`   📊 Stats iniciais: ${initialStats.heavy.packsProcessed} packs processados`);

    console.log('\n✅ Teste simples concluído!');
    console.log('\n📋 Resumo:');
    console.log(`   - Heavy Processor: ✅ Criado e inicializado`);
    console.log(`   - Pack validation: ✅ ${validation.valid ? 'Válido' : 'Inválido'}`);
    console.log(`   - Complexity score: ${complexityScore}/20 (${complexityScore > 10 ? 'Alto' : 'Médio'})`);
    console.log(`   - Sistema: ✅ Funcionando`);

  } catch (err) {
    console.error('\n❌ Erro:', err.message);
  } finally {
    if (heavyProcessor) await heavyProcessor.stop().catch(() => {});
    if (queueManager) await queueManager.stop().catch(() => {});
  }
}

testHeavySimple();
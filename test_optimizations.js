#!/usr/bin/env node

const OptimizedStickerlyClient = require('./services/optimizedStickerlyClient');

async function testOptimizations() {
  console.log('🧪 TESTANDO OTIMIZAÇÕES DA API\n');
  
  const client = new OptimizedStickerlyClient();
  
  // Simular cache de packs existentes
  const mockExistingIds = ['pack1', 'pack2', 'pack3'];
  await client.loadExistingPacksCache(mockExistingIds);
  
  console.log('1️⃣ Testando endpoint leve (v1)...');
  try {
    const lightPacks = await client.getLightRecommendedPacks();
    console.log(`   ✅ Endpoint leve: ${lightPacks.length} packs recebidos`);
  } catch (err) {
    console.log(`   ❌ Erro no endpoint leve: ${err.message}`);
  }
  
  console.log('\n2️⃣ Testando endpoint com categoria...');
  try {
    const categoryPacks = await client.getRecommendedPacksWithCategory('pt-BR', 'memes');
    console.log(`   ✅ Endpoint com categoria 'memes': ${categoryPacks.length} packs`);
  } catch (err) {
    console.log(`   ❌ Erro no endpoint com categoria: ${err.message}`);
  }
  
  console.log('\n3️⃣ Testando estratégia inteligente...');
  try {
    const smartPacks = await client.getSmartMixedPacks('pt-BR', 0.4);
    console.log(`   ✅ Estratégia inteligente: ${smartPacks.length} packs novos descobertos`);
  } catch (err) {
    console.log(`   ❌ Erro na estratégia inteligente: ${err.message}`);
  }
  
  console.log('\n4️⃣ Testando busca otimizada...');
  try {
    const searchPacks = await client.getOptimizedSearchPacks('amor', 'pt-BR', 2);
    console.log(`   ✅ Busca otimizada 'amor': ${searchPacks.length} packs novos`);
  } catch (err) {
    console.log(`   ❌ Erro na busca otimizada: ${err.message}`);
  }
  
  console.log('\n5️⃣ Testando busca em lote...');
  try {
    const batchResults = await client.getBatchOptimizedSearch(['memes', 'cute'], 'pt-BR', 2);
    const totalBatch = batchResults.reduce((sum, r) => sum + r.count, 0);
    console.log(`   ✅ Busca em lote: ${totalBatch} packs de ${batchResults.length} keywords`);
  } catch (err) {
    console.log(`   ❌ Erro na busca em lote: ${err.message}`);
  }
  
  // Estatísticas finais
  console.log('\n📊 ESTATÍSTICAS DAS OTIMIZAÇÕES:');
  client.logOptimizationStats();
  
  console.log('\n✅ Teste de otimizações concluído!');
}

if (require.main === module) {
  testOptimizations().catch(err => {
    console.error('❌ Erro no teste:', err);
    process.exit(1);
  });
}

module.exports = testOptimizations;
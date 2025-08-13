#!/usr/bin/env node

const SupabaseClient = require('./services/supabaseClient');
const PackCache = require('./services/packCache');
const { info, error, warn } = require('./utils/logger');

/**
 * Teste local para verificar se a correção do PackCache funciona
 * Deve carregar TODOS os packs (3000+) usando paginação
 */
async function testPackCacheFix() {
  console.log('🧪 Testando correção do PackCache - Carregamento com Paginação...\n');

  let supabaseClient = null;
  let packCache = null;

  try {
    // Configurar ambiente local para teste
    process.env.USE_LOCAL_STORAGE = 'true';
    process.env.LOCAL_STORAGE_PATH = './test_storage';
    process.env.STORAGE_BASE_URL = 'http://localhost';
    
    // 1. Inicializar Supabase Client
    console.log('1. Inicializando Supabase Client...');
    supabaseClient = new SupabaseClient();
    console.log('   ✅ Supabase Client iniciado');

    // 2. Verificar quantos packs existem no total (método direto)
    console.log('\n2. Verificando total de packs na base...');
    const { count, error: countError } = await supabaseClient.supabase
      .from('packs')
      .select('*', { count: 'exact', head: true });
    
    if (countError) {
      throw countError;
    }
    
    console.log(`   📊 Total de packs na base: ${count}`);

    // 3. Testar cache ANTES da correção (simulando comportamento antigo)
    console.log('\n3. Testando comportamento ANTIGO (sem paginação)...');
    const { data: oldStylePacks, error: oldError } = await supabaseClient.supabase
      .from('packs')
      .select('identifier')
      .order('created_at', { ascending: false });
    
    if (oldError) {
      throw oldError;
    }
    
    console.log(`   📋 Comportamento antigo carregaria: ${oldStylePacks.length} packs`);
    console.log(`   ⚠️ Diferença: ${count - oldStylePacks.length} packs PERDIDOS`);

    // 4. Testar cache NOVO (com paginação)
    console.log('\n4. Testando correção NOVA (com paginação)...');
    packCache = new PackCache(supabaseClient);
    
    const startTime = Date.now();
    const packsLoaded = await packCache.loadExistingPacks();
    const duration = Date.now() - startTime;
    
    console.log(`   ✅ Correção nova carregou: ${packsLoaded} packs em ${duration}ms`);

    // 5. Verificar estatísticas do cache
    console.log('\n5. Estatísticas do Cache Corrigido...');
    const stats = packCache.getStats();
    console.log('   📊 Stats do Cache:', {
      isLoaded: stats.isLoaded,
      size: stats.size,
      maxSize: stats.maxSize,
      lastUpdateAge: Math.round(stats.lastUpdateAge / 1000) + 's'
    });

    // 6. Testar uma amostra do cache
    console.log('\n6. Testando amostra do cache...');
    const sample = packCache.getSample(5);
    console.log(`   🔍 Amostra (${sample.sample.length} de ${sample.total}):`, sample.sample);

    // 7. Testar funcionalidade de filtragem
    console.log('\n7. Testando filtragem de duplicatas...');
    
    // Criar packs de teste (alguns existentes, alguns novos)
    const testPacks = [
      { packId: sample.sample[0] }, // Existente
      { packId: sample.sample[1] }, // Existente  
      { packId: 'NOVO_PACK_TESTE_001' }, // Novo
      { packId: 'NOVO_PACK_TESTE_002' }, // Novo
      { packId: sample.sample[2] } // Existente
    ];
    
    const filteredPacks = packCache.filterNewPacks(testPacks);
    
    console.log(`   📋 Packs de teste: ${testPacks.length}`);
    console.log(`   ✅ Packs novos filtrados: ${filteredPacks.length}`);
    console.log(`   🚫 Duplicatas removidas: ${testPacks.length - filteredPacks.length}`);

    // 8. Análise final
    console.log('\n8. Análise Final da Correção...');
    console.log('   ===============================');
    
    const successRate = (packsLoaded / count * 100).toFixed(1);
    console.log(`   📈 Taxa de sucesso: ${successRate}% (${packsLoaded}/${count})`);
    
    if (packsLoaded >= count * 0.99) { // 99% ou mais
      console.log('   🎉 CORREÇÃO FUNCIONOU PERFEITAMENTE!');
      console.log('   ✅ Cache carregou praticamente todos os packs');
    } else if (packsLoaded > oldStylePacks.length) {
      console.log('   ✅ CORREÇÃO MELHOROU O SISTEMA!');
      console.log(`   📊 Melhoria: +${packsLoaded - oldStylePacks.length} packs a mais`);
    } else {
      console.log('   ❌ CORREÇÃO NÃO FUNCIONOU COMO ESPERADO');
    }
    
    // Performance
    const packsPerSecond = Math.round(packsLoaded / (duration / 1000));
    console.log(`   ⚡ Performance: ${packsPerSecond} packs/segundo`);
    
    if (duration < 5000) {
      console.log('   🚀 Performance excelente (< 5s)');
    } else if (duration < 10000) {
      console.log('   ✅ Performance aceitável (< 10s)');
    } else {
      console.log('   ⚠️ Performance lenta (> 10s)');
    }

    console.log('\n✅ Teste da correção do PackCache concluído!');
    
    return {
      success: true,
      totalInDB: count,
      oldBehavior: oldStylePacks.length,
      newBehavior: packsLoaded,
      improvement: packsLoaded - oldStylePacks.length,
      duration,
      successRate: parseFloat(successRate)
    };

  } catch (err) {
    console.error('\n❌ Erro no teste da correção do PackCache:', err);
    throw err;
  } finally {
    // Cleanup
    if (packCache) {
      packCache.destroy();
    }
  }
}

// Handler para Ctrl+C
process.on('SIGINT', () => {
  console.log('\n🛑 Parando teste...');
  process.exit(0);
});

// Executar teste se chamado diretamente
if (require.main === module) {
  testPackCacheFix().then((result) => {
    console.log('\n🎯 Resultados do Teste:');
    console.log('========================');
    console.log(`Total na DB: ${result.totalInDB}`);
    console.log(`Antigo: ${result.oldBehavior} packs`);
    console.log(`Novo: ${result.newBehavior} packs`);
    console.log(`Melhoria: +${result.improvement} packs`);
    console.log(`Taxa: ${result.successRate}%`);
    console.log(`Tempo: ${result.duration}ms`);
    
    if (result.successRate >= 99) {
      console.log('\n🎉 TESTE PASSOU - Correção funcionou!');
      process.exit(0);
    } else {
      console.log('\n⚠️ TESTE PARCIAL - Precisa investigar mais');
      process.exit(1);
    }
  }).catch(err => {
    console.error('\n💥 TESTE FALHOU:', err.message);
    process.exit(1);
  });
}

module.exports = { testPackCacheFix };
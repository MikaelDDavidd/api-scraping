#!/usr/bin/env node

const FastDuplicateChecker = require('./services/fastDuplicateChecker');

async function testCache() {
  console.log('🧪 Testando cache do FastDuplicateChecker...\n');
  
  const checker = new FastDuplicateChecker();
  
  // Testar diferentes limits
  console.log('1️⃣ Testando com limit 10000...');
  const size1 = await checker.loadExistingPacksCache();
  console.log(`   Resultado: ${size1} packs carregados\n`);
  
  // Testar sem limit
  console.log('2️⃣ Testando sem limit...');
  checker.clearCache();
  
  // Modificar temporariamente para teste
  const startTime = Date.now();
  console.log('   Carregando TODOS os packs sem limite...');
  
  try {
    const { data: packs, error: fetchError } = await checker.supabase
      .from('packs')
      .select('identifier')
      .order('created_at', { ascending: false });
      // SEM .limit()
    
    if (fetchError) {
      throw fetchError;
    }
    
    const totalPacks = packs.length;
    const duration = Date.now() - startTime;
    
    console.log(`   ✅ TODOS os packs carregados: ${totalPacks} em ${duration}ms`);
    
    // Comparar com o método atual
    console.log('\n📊 COMPARAÇÃO:');
    console.log(`   Método atual (com limit): ${size1} packs`);
    console.log(`   Método sem limit: ${totalPacks} packs`);
    console.log(`   Diferença: ${totalPacks - size1} packs estavam sendo perdidos!`);
    
    return totalPacks;
    
  } catch (err) {
    console.error('❌ Erro ao carregar sem limite:', err);
    return 0;
  }
}

if (require.main === module) {
  testCache().catch(err => {
    console.error('❌ Erro no teste:', err);
    process.exit(1);
  });
}

module.exports = testCache;
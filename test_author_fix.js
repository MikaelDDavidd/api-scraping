const OptimizedStickerlyClient = require('./services/optimizedStickerlyClient');
const { info, error } = require('./utils/logger');

async function testAuthorExtraction() {
  console.log('🔧 Testando correção da extração de autores...\n');
  
  const client = new OptimizedStickerlyClient();
  
  try {
    // Teste 1: Buscar packs recomendados
    console.log('📦 Buscando packs recomendados...');
    const recommendedPacks = await client.getRecommendedPacksSingle('pt-BR');
    
    if (recommendedPacks.length > 0) {
      console.log(`✅ Encontrados ${recommendedPacks.length} packs recomendados\n`);
      
      // Analisar primeiros 5 packs
      console.log('📊 Análise dos autores encontrados:');
      console.log('================================================');
      
      recommendedPacks.slice(0, 5).forEach((pack, index) => {
        console.log(`\n${index + 1}. Pack: ${pack.packId}`);
        console.log(`   Nome: ${pack.name}`);
        console.log(`   Autor: ${pack.authorName}`);
        console.log(`   Status: ${pack.authorName === 'Autor desconhecido' ? '❌ PROBLEMA' : '✅ OK'}`);
        
        if (pack.user) {
          console.log(`   User.userName: ${pack.user.userName}`);
          console.log(`   IsOfficial: ${pack.isOfficial}`);
        }
      });
      
      // Estatísticas
      const unknownAuthors = recommendedPacks.filter(p => p.authorName === 'Autor desconhecido').length;
      const validAuthors = recommendedPacks.length - unknownAuthors;
      
      console.log('\n📈 ESTATÍSTICAS:');
      console.log('================================================');
      console.log(`Total de packs: ${recommendedPacks.length}`);
      console.log(`Autores válidos: ${validAuthors} (${((validAuthors/recommendedPacks.length)*100).toFixed(1)}%)`);
      console.log(`Autores desconhecidos: ${unknownAuthors} (${((unknownAuthors/recommendedPacks.length)*100).toFixed(1)}%)`);
      
      if (unknownAuthors === 0) {
        console.log('\n🎉 SUCESSO: Todos os autores foram extraídos corretamente!');
      } else if (unknownAuthors < recommendedPacks.length * 0.1) {
        console.log('\n⚠️ PARCIAL: Ainda há alguns autores desconhecidos, mas a maioria foi corrigida.');
      } else {
        console.log('\n❌ PROBLEMA: Muitos autores ainda estão como "desconhecido".');
      }
      
    } else {
      console.log('❌ Nenhum pack encontrado');
    }
    
  } catch (err) {
    error('Erro no teste de autores', err);
  }
}

// Executar teste
testAuthorExtraction().then(() => {
  console.log('\n✅ Teste concluído');
  process.exit(0);
}).catch(err => {
  console.error('❌ Erro no teste:', err);
  process.exit(1);
});
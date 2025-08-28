#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs-extra');

class CategoryAnalysis {
  constructor() {
    this.baseURL = 'http://api.sticker.ly';
    this.deviceId = '20fa5a958492bbd3';
    this.userAgent = 'androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; br;)';
    this.discoveredCategories = new Set();
    this.categoryData = {};
  }

  async makeRequest(config, description) {
    try {
      const response = await axios({
        ...config,
        headers: {
          'x-duid': this.deviceId,
          'User-Agent': this.userAgent,
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip',
          ...config.headers
        },
        timeout: 30000
      });

      return {
        success: true,
        data: response.data,
        status: response.status
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        status: error.response?.status,
        data: error.response?.data
      };
    }
  }

  extractCategoriesFromPacks(packs) {
    const categories = new Set();
    
    if (!Array.isArray(packs)) return categories;

    packs.forEach(pack => {
      // Extrair de nomes de packs (podem conter indicações de categoria)
      if (pack.name) {
        const name = pack.name.toLowerCase();
        
        // Palavras que indicam categorias
        const categoryKeywords = [
          'meme', 'amor', 'love', 'funny', 'cute', 'fofo', 'animal', 'gato', 'cat',
          'emoji', 'anime', 'cartoon', 'desenho', 'movie', 'filme', 'tv', 'música', 'music',
          'sport', 'esporte', 'futebol', 'food', 'comida', 'birthday', 'aniversário',
          'natal', 'christmas', 'halloween', 'valentine', 'trabalho', 'work', 'escola', 'school',
          'família', 'family', 'amigos', 'friends', 'festa', 'party', 'triste', 'sad',
          'feliz', 'happy', 'raiva', 'angry', 'surpreso', 'surprised', 'pensando', 'thinking',
          'dormindo', 'sleeping', 'brasil', 'flamengo', 'corinthians', 'saudade', 'carnaval'
        ];

        categoryKeywords.forEach(keyword => {
          if (name.includes(keyword)) {
            categories.add(keyword);
          }
        });
      }

      // Extrair de nomes de usuários (criadores podem especializar-se)
      if (pack.authorName) {
        const author = pack.authorName.toLowerCase();
        if (author.includes('meme')) categories.add('memes');
        if (author.includes('love') || author.includes('amor')) categories.add('love');
        if (author.includes('anime')) categories.add('anime');
        if (author.includes('k-pop') || author.includes('kpop')) categories.add('kpop');
      }
    });

    return categories;
  }

  async testCategoryFilters() {
    console.log('🎯 TESTANDO FILTROS DE CATEGORIA...\n');

    // Lista expandida de categorias para testar
    const categoriesToTest = [
      // Categorias populares observadas
      'memes', 'love', 'amor', 'funny', 'cute', 'fofo', 'animals', 'emoji', 
      'anime', 'cartoon', 'movie', 'tv', 'music', 'kpop', 'sport', 'futebol',
      
      // Categorias brasileiras
      'brasil', 'flamengo', 'corinthians', 'carnaval', 'saudade', 'trabalho',
      'família', 'amigos', 'festa', 'natal',
      
      // Emoções
      'happy', 'sad', 'angry', 'surprised', 'thinking', 'sleeping',
      'feliz', 'triste', 'raiva',
      
      // Outras possíveis
      'birthday', 'christmas', 'halloween', 'valentine', 'food', 'school',
      'work', 'party', 'trending', 'popular', 'new', 'featured'
    ];

    const results = {};

    for (const category of categoriesToTest) {
      console.log(`🔍 Testando categoria: ${category}`);
      
      // Testar no endpoint recommend com filtro de categoria
      const recommendResult = await this.makeRequest({
        method: 'GET',
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&category=${category}&limit=5`
      }, `Recommend categoria ${category}`);

      if (recommendResult.success && recommendResult.data?.result?.packs) {
        const packs = recommendResult.data.result.packs;
        results[category] = {
          recommend: {
            success: true,
            packCount: packs.length,
            packs: packs.slice(0, 3).map(p => ({ name: p.name, packId: p.packId }))
          }
        };
        console.log(`  ✅ Recommend: ${packs.length} packs`);
      } else {
        results[category] = {
          recommend: { success: false, error: recommendResult.error }
        };
        console.log(`  ❌ Recommend: ${recommendResult.status || 'error'}`);
      }

      // Testar busca direta pela categoria
      const searchResult = await this.makeRequest({
        method: 'POST',
        url: `${this.baseURL}/v3.1/stickerPack/search?withAnimation=true`,
        headers: { 'Content-Type': 'application/json' },
        data: { keyword: category, cursor: 0, limit: 5 }
      }, `Search categoria ${category}`);

      if (searchResult.success && searchResult.data?.result?.stickerPacks) {
        const packs = searchResult.data.result.stickerPacks;
        results[category].search = {
          success: true,
          packCount: packs.length,
          packs: packs.slice(0, 3).map(p => ({ name: p.name, packId: p.packId }))
        };
        console.log(`  ✅ Search: ${packs.length} packs`);
      } else {
        results[category].search = { success: false, error: searchResult.error };
        console.log(`  ❌ Search: ${searchResult.status || 'error'}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  async analyzeTrendingCategories() {
    console.log('\n📈 ANALISANDO CATEGORIAS TRENDING...\n');

    // Obter dados de recommend geral para análise
    const result = await this.makeRequest({
      method: 'GET',
      url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&limit=100`
    }, 'Análise geral de categorias');

    if (result.success && result.data?.result?.packs) {
      const packs = result.data.result.packs;
      console.log(`📦 Analisando ${packs.length} packs para extrair categorias...`);

      // Extrair categorias dos nomes dos packs
      const extractedCategories = this.extractCategoriesFromPacks(packs);
      
      console.log(`🏷️ Categorias extraídas dos nomes: ${[...extractedCategories].join(', ')}`);

      // Analisar padrões nos nomes dos packs
      const namePatterns = {};
      packs.forEach(pack => {
        if (pack.name) {
          const words = pack.name.toLowerCase().split(/\s+/);
          words.forEach(word => {
            // Filtrar palavras muito curtas ou comuns
            if (word.length > 3 && !['para', 'com', 'dos', 'das', 'the', 'and', 'por'].includes(word)) {
              namePatterns[word] = (namePatterns[word] || 0) + 1;
            }
          });
        }
      });

      // Top palavras mais frequentes nos nomes (indicam categorias)
      const topWords = Object.entries(namePatterns)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 20);

      console.log('\n🔝 Top palavras nos nomes dos packs:');
      topWords.forEach(([word, count]) => {
        console.log(`  ${word}: ${count} ocorrências`);
      });

      // Analisar autores mais ativos (podem indicar especialização)
      const authorStats = {};
      packs.forEach(pack => {
        if (pack.authorName) {
          authorStats[pack.authorName] = (authorStats[pack.authorName] || 0) + 1;
        }
      });

      const topAuthors = Object.entries(authorStats)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10);

      console.log('\n👤 Autores mais ativos:');
      topAuthors.forEach(([author, count]) => {
        console.log(`  ${author}: ${count} packs`);
      });

      return {
        extractedCategories: [...extractedCategories],
        topWords,
        topAuthors,
        totalPacks: packs.length
      };
    }

    return null;
  }

  generateCategoryReport(categoryResults, trendingAnalysis) {
    console.log('\n📊 GERANDO RELATÓRIO DE CATEGORIAS...\n');

    // Categorias que funcionam em recommend
    const workingRecommendCategories = Object.entries(categoryResults)
      .filter(([cat, data]) => data.recommend?.success && data.recommend?.packCount > 0)
      .map(([cat]) => cat);

    // Categorias que funcionam em search
    const workingSearchCategories = Object.entries(categoryResults)
      .filter(([cat, data]) => data.search?.success && data.search?.packCount > 0)
      .map(([cat]) => cat);

    // Categorias que funcionam em ambos
    const workingBothCategories = workingRecommendCategories
      .filter(cat => workingSearchCategories.includes(cat));

    console.log('✅ CATEGORIAS QUE FUNCIONAM:');
    console.log(`  Recommend: ${workingRecommendCategories.length} categorias`);
    console.log(`    ${workingRecommendCategories.join(', ')}`);
    console.log(`  Search: ${workingSearchCategories.length} categorias`);
    console.log(`    ${workingSearchCategories.join(', ')}`);
    console.log(`  Ambos: ${workingBothCategories.length} categorias`);
    console.log(`    ${workingBothCategories.join(', ')}`);

    // Melhores categorias por número de packs
    const bestCategories = Object.entries(categoryResults)
      .filter(([cat, data]) => data.recommend?.packCount > 0 || data.search?.packCount > 0)
      .map(([cat, data]) => ({
        category: cat,
        recommendPacks: data.recommend?.packCount || 0,
        searchPacks: data.search?.packCount || 0,
        total: (data.recommend?.packCount || 0) + (data.search?.packCount || 0)
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);

    console.log('\n🏆 TOP 10 CATEGORIAS POR VOLUME:');
    bestCategories.forEach((cat, index) => {
      console.log(`  ${index + 1}. ${cat.category}: ${cat.total} packs total (R:${cat.recommendPacks}, S:${cat.searchPacks})`);
    });

    return {
      workingRecommendCategories,
      workingSearchCategories, 
      workingBothCategories,
      bestCategories,
      trendingAnalysis
    };
  }

  async saveResults(categoryResults, analysis, report) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `category_analysis_${timestamp}.json`;
    
    await fs.ensureDir('./exploration_results');
    await fs.writeJSON(`./exploration_results/${filename}`, {
      timestamp: new Date().toISOString(),
      categoryResults,
      trendingAnalysis: analysis,
      report,
      summary: {
        totalCategoriesTested: Object.keys(categoryResults).length,
        workingCategories: report.workingBothCategories.length,
        bestPerformingCategory: report.bestCategories[0]?.category || 'none'
      }
    }, { spaces: 2 });

    console.log(`\n💾 Análise salva em: ./exploration_results/${filename}`);
    return filename;
  }

  async run() {
    console.log('🚀 INICIANDO ANÁLISE COMPLETA DE CATEGORIAS\n');
    
    try {
      const categoryResults = await this.testCategoryFilters();
      const trendingAnalysis = await this.analyzeTrendingCategories();
      const report = this.generateCategoryReport(categoryResults, trendingAnalysis);
      const filename = await this.saveResults(categoryResults, trendingAnalysis, report);
      
      console.log('\n✅ Análise de categorias concluída!');
      return { filename, report };
      
    } catch (error) {
      console.error('\n❌ Erro durante análise:', error);
      throw error;
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const analyzer = new CategoryAnalysis();
  analyzer.run()
    .then(result => {
      console.log(`\n🎉 Análise finalizada! Arquivo: ${result.filename}`);
    })
    .catch(error => {
      console.error('\n💥 Falha na análise:', error.message);
      process.exit(1);
    });
}

module.exports = CategoryAnalysis;
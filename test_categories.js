#!/usr/bin/env node

const axios = require('axios');

class CategoryTester {
  constructor() {
    this.baseURL = 'http://api.sticker.ly';
    this.deviceId = '20fa5a958492bbd3';
    this.userAgent = 'androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; br;)';
  }

  async makeRequest(config, description) {
    try {
      console.log(`🔍 ${description}`);
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

      console.log(`✅ ${response.status} (${JSON.stringify(response.data).length} bytes)`);
      console.log('📋 Dados:', JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.log(`❌ ${error.response?.status || 'ERROR'} - ${error.message}`);
      if (error.response?.data) {
        console.log('📋 Error data:', JSON.stringify(error.response.data, null, 2));
      }
      return null;
    }
  }

  async testCategoryEndpoints() {
    console.log('🔍 TESTANDO ENDPOINTS DE CATEGORIAS\n');

    const categoryEndpoints = [
      // Endpoints de categorias descobertos
      { url: `${this.baseURL}/categories`, desc: 'Lista de categorias (root)' },
      { url: `${this.baseURL}/v1/categories`, desc: 'Lista de categorias v1' },
      { url: `${this.baseURL}/v2/categories`, desc: 'Lista de categorias v2' },
      { url: `${this.baseURL}/v3/categories`, desc: 'Lista de categorias v3' },
      { url: `${this.baseURL}/v3.1/categories`, desc: 'Lista de categorias v3.1' },
      
      // Endpoints de categoria singular
      { url: `${this.baseURL}/category`, desc: 'Categoria (root)' },
      { url: `${this.baseURL}/v1/category`, desc: 'Categoria v1' },
      { url: `${this.baseURL}/v3/category`, desc: 'Categoria v3' },
      
      // Possíveis endpoints específicos
      { url: `${this.baseURL}/v3.1/stickerPack/categories`, desc: 'Categorias de sticker packs' },
      { url: `${this.baseURL}/v3.1/category/list`, desc: 'Lista de categorias v3.1' },
      { url: `${this.baseURL}/v1/stickerPack/category/list`, desc: 'Lista categorias v1 sticker pack' },
      
      // Com parâmetros
      { url: `${this.baseURL}/v3.1/categories?withCounts=true`, desc: 'Categorias com contadores' },
      { url: `${this.baseURL}/v1/categories?detailed=true`, desc: 'Categorias detalhadas' },
    ];

    for (const test of categoryEndpoints) {
      await this.makeRequest({
        method: 'GET',
        url: test.url
      }, test.desc);
      
      console.log('\n' + '-'.repeat(60) + '\n');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async testCategorySearch() {
    console.log('🔍 TESTANDO BUSCA POR CATEGORIAS ESPECÍFICAS\n');

    // Categorias que observei nas respostas anteriores
    const knownCategories = [
      'memes', 'love', 'amor', 'funny', 'cute', 'animals', 'emoji', 'anime', 
      'cartoon', 'movie', 'tv', 'music', 'sport', 'food', 'birthday', 'christmas',
      'halloween', 'valentine', 'work', 'school', 'family', 'friends', 'party',
      'sad', 'happy', 'angry', 'surprised', 'thinking', 'sleeping'
    ];

    for (const category of knownCategories.slice(0, 10)) { // Testar apenas as primeiras 10
      console.log(`🎯 Testando categoria: ${category}`);
      
      // Testar no endpoint recommend
      await this.makeRequest({
        method: 'GET',
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&category=${category}`
      }, `Recommend para categoria: ${category}`);
      
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Testar no endpoint search
      await this.makeRequest({
        method: 'POST',
        url: `${this.baseURL}/v3.1/stickerPack/search?withAnimation=true`,
        headers: { 'Content-Type': 'application/json' },
        data: { keyword: category, cursor: 0 }
      }, `Search para categoria: ${category}`);
      
      console.log('\n' + '-'.repeat(40) + '\n');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async testCategoryMetadata() {
    console.log('🔍 BUSCANDO METADADOS DE CATEGORIAS\n');

    // Tentar endpoints que podem ter metadados
    const metadataEndpoints = [
      { url: `${this.baseURL}/v3.1/meta/categories`, desc: 'Metadata de categorias' },
      { url: `${this.baseURL}/v1/meta/categories`, desc: 'Metadata v1' },
      { url: `${this.baseURL}/tags`, desc: 'Sistema de tags' },
      { url: `${this.baseURL}/v3/tags`, desc: 'Tags v3' },
      { url: `${this.baseURL}/v3.1/tags`, desc: 'Tags v3.1' },
      { url: `${this.baseURL}/trending/categories`, desc: 'Categorias trending' },
      { url: `${this.baseURL}/popular/categories`, desc: 'Categorias populares' }
    ];

    for (const test of metadataEndpoints) {
      await this.makeRequest({
        method: 'GET',
        url: test.url
      }, test.desc);
      
      console.log('\n' + '-'.repeat(40) + '\n');
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }

  async run() {
    console.log('🚀 INICIANDO INVESTIGAÇÃO DE CATEGORIAS\n');
    
    try {
      await this.testCategoryEndpoints();
      await this.testCategorySearch();
      await this.testCategoryMetadata();
      
      console.log('\n✅ Investigação de categorias concluída!');
      
    } catch (error) {
      console.error('\n❌ Erro durante investigação:', error);
      throw error;
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const tester = new CategoryTester();
  tester.run()
    .then(() => {
      console.log('\n🎉 Teste de categorias finalizado!');
    })
    .catch(error => {
      console.error('\n💥 Falha:', error.message);
      process.exit(1);
    });
}

module.exports = CategoryTester;
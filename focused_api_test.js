#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs-extra');

class FocusedAPITest {
  constructor() {
    this.baseURL = 'http://api.sticker.ly';
    this.results = [];
    this.deviceId = '20fa5a958492bbd3';
    this.userAgent = 'androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; br;)';
  }

  async makeRequest(config, description) {
    try {
      console.log(`🔍 ${description}`);
      const response = await axios(config);
      
      const result = {
        description,
        success: true,
        status: response.status,
        url: config.url,
        method: config.method || 'GET',
        responseSize: JSON.stringify(response.data).length,
        data: response.data,
        timestamp: new Date().toISOString()
      };

      console.log(`✅ ${result.status} (${result.responseSize} bytes)`);
      this.results.push(result);
      return result;
    } catch (error) {
      const result = {
        description,
        success: false,
        status: error.response?.status || 'ERROR',
        url: config.url,
        method: config.method || 'GET',
        error: error.message,
        data: error.response?.data || null,
        timestamp: new Date().toISOString()
      };

      console.log(`❌ ${result.status} - ${result.error}`);
      this.results.push(result);
      return result;
    }
  }

  async testInterestingEndpoints() {
    console.log('🎯 Testando endpoints mais interessantes descobertos...\n');

    const tests = [
      // Endpoints que retornaram dados reais
      {
        url: `${this.baseURL}/v1/sticker/recommend`,
        desc: 'v1/sticker/recommend (retornou 52KB)',
        method: 'GET'
      },
      {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`,
        desc: 'v3.1 recommend principal',
        method: 'GET'
      },
      {
        url: `${this.baseURL}/v3.1/stickerPack/search?withAnimation=true`,
        desc: 'v3.1 search principal',
        method: 'POST',
        data: { keyword: 'amor', cursor: 0 }
      },
      
      // Endpoints que podem ter funcionalidades interessantes
      {
        url: `${this.baseURL}/v1/stickerPack/trending`,
        desc: 'v1 trending',
        method: 'GET'
      },
      {
        url: `${this.baseURL}/v1/stickerPack/popular`,
        desc: 'v1 popular',
        method: 'GET'
      },
      {
        url: `${this.baseURL}/v1/stickerPack/featured`,
        desc: 'v1 featured',
        method: 'GET'
      },
      {
        url: `${this.baseURL}/v1/stickerPack/category`,
        desc: 'v1 category',
        method: 'GET'
      },
      
      // Testando endpoints v2 que podem existir
      {
        url: `${this.baseURL}/v2/stickerPack/recommend`,
        desc: 'v2 recommend (teste)',
        method: 'GET'
      },
      {
        url: `${this.baseURL}/v2/stickerPack/search`,
        desc: 'v2 search (teste)',
        method: 'POST',
        data: { keyword: 'test', cursor: 0 }
      },
      
      // Endpoints de informação
      {
        url: `${this.baseURL}/version`,
        desc: 'Informação de versão',
        method: 'GET'
      },
      {
        url: `${this.baseURL}/status`,
        desc: 'Status da API',
        method: 'GET'
      },
      {
        url: `${this.baseURL}/health`,
        desc: 'Health check',
        method: 'GET'
      },
      {
        url: `${this.baseURL}/stats`,
        desc: 'Estatísticas',
        method: 'GET'
      }
    ];

    for (const test of tests) {
      const config = {
        method: test.method,
        url: test.url,
        headers: {
          'x-duid': this.deviceId,
          'User-Agent': this.userAgent,
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        },
        timeout: 30000
      };

      if (test.data) {
        config.headers['Content-Type'] = 'application/json';
        config.data = test.data;
      }

      await this.makeRequest(config, test.desc);
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  async testAdvancedParameters() {
    console.log('\n🔧 Testando parâmetros avançados...\n');

    // Testar parâmetros que podem existir mas não estão documentados
    const advancedTests = [
      {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&sort=popular`,
        desc: 'Recommend com sort=popular'
      },
      {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&sort=newest`,
        desc: 'Recommend com sort=newest'
      },
      {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&sort=trending`,
        desc: 'Recommend com sort=trending'
      },
      {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&category=memes`,
        desc: 'Recommend categoria memes'
      },
      {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&category=love`,
        desc: 'Recommend categoria love'
      },
      {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&featured=1`,
        desc: 'Recommend apenas featured'
      },
      {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&trending=1`,
        desc: 'Recommend apenas trending'
      },
      {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&minDownloads=1000`,
        desc: 'Recommend com minDownloads'
      },
      {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&maxResults=5`,
        desc: 'Recommend com maxResults'
      }
    ];

    for (const test of advancedTests) {
      const config = {
        method: 'GET',
        url: test.url,
        headers: {
          'x-duid': this.deviceId,
          'User-Agent': this.userAgent,
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        },
        timeout: 30000
      };

      await this.makeRequest(config, test.desc);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async testSearchVariations() {
    console.log('\n🔍 Testando variações de search...\n');

    const searchTests = [
      // Testar diferentes formatos no body
      {
        data: { keyword: 'amor', cursor: 0, limit: 5 },
        desc: 'Search com limit no body'
      },
      {
        data: { keyword: 'amor', cursor: 0, sort: 'popular' },
        desc: 'Search com sort no body'
      },
      {
        data: { keyword: 'amor', cursor: 0, category: 'love' },
        desc: 'Search com category no body'
      },
      {
        data: { keyword: 'amor', cursor: 0, withEmojis: true },
        desc: 'Search com withEmojis'
      },
      {
        data: { keyword: 'amor', cursor: 0, includeMeta: true },
        desc: 'Search com includeMeta'
      },
      {
        data: { keyword: 'amor', cursor: 0, includeStats: true },
        desc: 'Search com includeStats'
      },
      {
        data: { q: 'amor', cursor: 0 },
        desc: 'Search com q ao invés de keyword'
      },
      {
        data: { query: 'amor', cursor: 0 },
        desc: 'Search com query ao invés de keyword'
      },
      {
        data: { search: 'amor', cursor: 0 },
        desc: 'Search com search ao invés de keyword'
      }
    ];

    for (const test of searchTests) {
      const config = {
        method: 'POST',
        url: `${this.baseURL}/v3.1/stickerPack/search?withAnimation=true`,
        headers: {
          'x-duid': this.deviceId,
          'User-Agent': this.userAgent,
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip',
          'Content-Type': 'application/json'
        },
        data: test.data,
        timeout: 30000
      };

      await this.makeRequest(config, test.desc);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  async testAuthentication() {
    console.log('\n🔐 Testando comportamento de autenticação...\n');

    const url = `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`;

    const authTests = [
      {
        headers: {},
        desc: 'Sem headers de auth'
      },
      {
        headers: { 'x-duid': this.deviceId },
        desc: 'Apenas x-duid'
      },
      {
        headers: { 'User-Agent': this.userAgent },
        desc: 'Apenas User-Agent'
      },
      {
        headers: { 'x-duid': 'invalid-device-id', 'User-Agent': this.userAgent },
        desc: 'x-duid inválido'
      },
      {
        headers: { 'x-duid': this.deviceId, 'User-Agent': 'Mozilla/5.0' },
        desc: 'User-Agent genérico'
      },
      {
        headers: { 
          'x-duid': this.deviceId, 
          'User-Agent': this.userAgent,
          'Authorization': 'Bearer test-token'
        },
        desc: 'Com Authorization header'
      },
      {
        headers: { 
          'x-duid': this.deviceId, 
          'User-Agent': this.userAgent,
          'X-API-Key': 'test-api-key'
        },
        desc: 'Com X-API-Key header'
      }
    ];

    for (const test of authTests) {
      const config = {
        method: 'GET',
        url: url,
        headers: {
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip',
          ...test.headers
        },
        timeout: 30000
      };

      await this.makeRequest(config, test.desc);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  generateSummary() {
    const successful = this.results.filter(r => r.success).length;
    const total = this.results.length;
    const withData = this.results.filter(r => r.success && r.responseSize > 100).length;

    console.log('\n' + '='.repeat(60));
    console.log('📊 RESUMO DOS TESTES');
    console.log('='.repeat(60));
    console.log(`Total de testes: ${total}`);
    console.log(`Sucessos: ${successful} (${((successful/total)*100).toFixed(1)}%)`);
    console.log(`Com dados relevantes: ${withData}`);
    console.log('');

    // Endpoints que retornaram dados interessantes
    const interesting = this.results.filter(r => r.success && r.responseSize > 1000);
    if (interesting.length > 0) {
      console.log('🎯 ENDPOINTS COM DADOS RELEVANTES:');
      interesting.forEach(r => {
        console.log(`  ✅ ${r.description}: ${r.responseSize} bytes`);
      });
      console.log('');
    }

    // Erros interessantes
    const errors = this.results.filter(r => !r.success);
    if (errors.length > 0) {
      console.log('❌ ERROS ENCONTRADOS:');
      const errorCounts = {};
      errors.forEach(r => {
        const key = r.status;
        errorCounts[key] = (errorCounts[key] || 0) + 1;
      });
      
      Object.entries(errorCounts).forEach(([status, count]) => {
        console.log(`  ${status}: ${count} ocorrências`);
      });
      console.log('');
    }

    return {
      total,
      successful,
      withData,
      interesting: interesting.length,
      errors: errors.length
    };
  }

  async saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `focused_api_test_${timestamp}.json`;
    
    await fs.ensureDir('./exploration_results');
    await fs.writeJSON(`./exploration_results/${filename}`, {
      timestamp: new Date().toISOString(),
      summary: this.generateSummary(),
      results: this.results
    }, { spaces: 2 });

    console.log(`💾 Resultados salvos em: ./exploration_results/${filename}`);
    return filename;
  }

  async run() {
    console.log('🚀 INICIANDO TESTES FOCADOS DA API STICKER.LY\n');
    
    try {
      await this.testInterestingEndpoints();
      await this.testAdvancedParameters();
      await this.testSearchVariations();
      await this.testAuthentication();
      
      this.generateSummary();
      const filename = await this.saveResults();
      
      console.log('\n✅ Testes concluídos com sucesso!');
      return filename;
      
    } catch (error) {
      console.error('\n❌ Erro durante os testes:', error);
      await this.saveResults();
      throw error;
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const tester = new FocusedAPITest();
  tester.run()
    .then(filename => {
      console.log(`\n🎉 Arquivo gerado: ${filename}`);
    })
    .catch(error => {
      console.error('\n💥 Falha nos testes:', error.message);
      process.exit(1);
    });
}

module.exports = FocusedAPITest;
#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class StickerlyAPIExplorer {
  constructor() {
    this.baseURL = 'http://api.sticker.ly';
    this.results = {
      endpoints: {},
      versions: [],
      parameters: {},
      responses: {},
      errors: [],
      discoveries: []
    };
    
    this.deviceIds = [
      '20fa5a958492bbd3',
      '30fb6b068593cce4', 
      '40fc7c178694ddf5',
      '50fd8d289795eef6'
    ];
    
    this.userAgents = [
      'androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; br;)',
      'androidapp.stickerly/1.17.3 (Samsung Galaxy; U; Android 30; en-US; en;)',
      'androidapp.stickerly/1.17.3 (Pixel 5; U; Android 31; es-ES; es;)',
      'androidapp.stickerly/1.16.2 (iPhone; iOS 15.0; fr-FR; fr;)',
      'stickerly/1.15.0 (Web; Chrome 96.0)',
    ];

    this.deviceIndex = 0;
    this.userAgentIndex = 0;
  }

  getNextDeviceId() {
    const id = this.deviceIds[this.deviceIndex];
    this.deviceIndex = (this.deviceIndex + 1) % this.deviceIds.length;
    return id;
  }

  getNextUserAgent() {
    const ua = this.userAgents[this.userAgentIndex];
    this.userAgentIndex = (this.userAgentIndex + 1) % this.userAgents.length;
    return ua;
  }

  async delay(ms = 1000) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async makeRequest(config, description = '') {
    try {
      console.log(`🔍 Testando: ${description || config.url}`);
      const response = await axios(config);
      
      const result = {
        success: true,
        status: response.status,
        headers: response.headers,
        data: response.data,
        size: JSON.stringify(response.data).length,
        timestamp: new Date().toISOString()
      };

      console.log(`✅ Sucesso: ${result.status} (${result.size} bytes)`);
      return result;
    } catch (error) {
      const result = {
        success: false,
        status: error.response?.status || 'NETWORK_ERROR',
        error: error.message,
        data: error.response?.data || null,
        timestamp: new Date().toISOString()
      };

      console.log(`❌ Erro: ${result.status} - ${result.error}`);
      return result;
    }
  }

  // Testar endpoints conhecidos com diferentes parâmetros
  async testKnownEndpoints() {
    console.log('\\n🎯 === TESTANDO ENDPOINTS CONHECIDOS ===\\n');

    // 1. Endpoint Recommend - testando diferentes parâmetros
    console.log('📋 Testando endpoint RECOMMEND...');
    
    const recommendTests = [
      // Parâmetros básicos
      { url: `${this.baseURL}/v3.1/stickerPack/recommend`, desc: 'Recommend sem parâmetros' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`, desc: 'Recommend com animação' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=false`, desc: 'Recommend sem animação' },
      
      // Testando cursors
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&cursor=0`, desc: 'Recommend cursor 0' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&cursor=1`, desc: 'Recommend cursor 1' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&cursor=10`, desc: 'Recommend cursor 10' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&cursor=50`, desc: 'Recommend cursor 50' },
      
      // Testando limits
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&limit=5`, desc: 'Recommend limit 5' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&limit=50`, desc: 'Recommend limit 50' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&limit=100`, desc: 'Recommend limit 100' },
      
      // Combinações
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&cursor=1&limit=20`, desc: 'Recommend cursor+limit' },
      
      // Parâmetros extras (experimentais)
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&lang=pt`, desc: 'Recommend com lang=pt' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&lang=en`, desc: 'Recommend com lang=en' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&locale=pt-BR`, desc: 'Recommend com locale' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&category=meme`, desc: 'Recommend com categoria' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&trending=true`, desc: 'Recommend trending' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&featured=true`, desc: 'Recommend featured' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&new=true`, desc: 'Recommend new' },
      { url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true&popular=true`, desc: 'Recommend popular' },
    ];

    for (const test of recommendTests) {
      const config = {
        method: 'GET',
        url: test.url,
        headers: {
          'x-duid': this.getNextDeviceId(),
          'User-Agent': this.getNextUserAgent(),
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        },
        timeout: 30000
      };

      const result = await this.makeRequest(config, test.desc);
      this.results.endpoints[test.desc] = result;
      await this.delay(2000);
    }

    // 2. Endpoint Search - testando diferentes parâmetros
    console.log('\\n🔍 Testando endpoint SEARCH...');
    
    const searchTests = [
      // Diferentes keywords
      { keyword: 'amor', cursor: 0, desc: 'Search amor' },
      { keyword: 'meme', cursor: 0, desc: 'Search meme' },
      { keyword: 'brasil', cursor: 0, desc: 'Search brasil' },
      { keyword: 'flamengo', cursor: 0, desc: 'Search flamengo' },
      
      // Diferentes cursors
      { keyword: 'amor', cursor: 1, desc: 'Search amor cursor 1' },
      { keyword: 'amor', cursor: 5, desc: 'Search amor cursor 5' },
      
      // Keywords com espaços e caracteres especiais  
      { keyword: 'bom dia', cursor: 0, desc: 'Search com espaço' },
      { keyword: 'coração', cursor: 0, desc: 'Search com acento' },
      { keyword: 'mão', cursor: 0, desc: 'Search com til' },
      { keyword: 'ção', cursor: 0, desc: 'Search substring' },
      
      // Keywords vazias/especiais
      { keyword: '', cursor: 0, desc: 'Search vazio' },
      { keyword: ' ', cursor: 0, desc: 'Search espaço' },
      { keyword: 'a', cursor: 0, desc: 'Search 1 letra' },
      { keyword: 'ab', cursor: 0, desc: 'Search 2 letras' },
      
      // Keywords longas
      { keyword: 'supercalifragilisticexpialidocious', cursor: 0, desc: 'Search palavra muito longa' },
    ];

    for (const test of searchTests) {
      const config = {
        method: 'POST',
        url: `${this.baseURL}/v3.1/stickerPack/search?withAnimation=true`,
        headers: {
          'x-duid': this.getNextDeviceId(),
          'User-Agent': this.getNextUserAgent(),
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip',
          'Content-Type': 'application/json'
        },
        data: {
          keyword: test.keyword,
          cursor: test.cursor
        },
        timeout: 30000
      };

      const result = await this.makeRequest(config, test.desc);
      this.results.endpoints[test.desc] = result;
      await this.delay(2000);
    }
  }

  // Descobrir novos endpoints e versões
  async discoverEndpoints() {
    console.log('\\n🕵️ === DESCOBRINDO NOVOS ENDPOINTS ===\\n');

    // Testar diferentes versões da API
    const versions = ['v1', 'v2', 'v3', 'v3.0', 'v3.1', 'v3.2', 'v4', 'v4.0'];
    const endpoints = [
      'stickerPack/recommend',
      'stickerPack/search', 
      'stickerPack/trending',
      'stickerPack/popular',
      'stickerPack/new',
      'stickerPack/featured',
      'stickerPack/category',
      'stickerPack/list',
      'stickerPack/all',
      'stickerPack/random',
      'stickerPack/top',
      'stickerPack/latest',
      'stickerPack/hot',
      'stickerPack',
      'sticker/search',
      'sticker/recommend',
      'sticker/trending',
      'sticker',
      'packs',
      'pack',
      'stickers',
      'categories',
      'category',
      'trending',
      'popular',
      'new',
      'featured',
      'random',
      'top',
      'latest',
      'hot',
      'stats',
      'status',
      'health',
      'info',
      'version',
      'user',
      'users',
      'favorites',
      'downloaded',
      'uploads',
      'tags',
      'emoji',
      'emojis'
    ];

    for (const version of versions) {
      for (const endpoint of endpoints) {
        const url = `${this.baseURL}/${version}/${endpoint}`;
        
        const config = {
          method: 'GET',
          url: url,
          headers: {
            'x-duid': this.getNextDeviceId(),
            'User-Agent': this.getNextUserAgent(),
            'Connection': 'Keep-Alive',
            'Host': 'api.sticker.ly',
            'Accept-Encoding': 'gzip'
          },
          timeout: 10000
        };

        const result = await this.makeRequest(config, `${version}/${endpoint}`);
        
        if (result.success && result.status === 200) {
          this.results.discoveries.push({
            endpoint: `${version}/${endpoint}`,
            url: url,
            result: result
          });
          console.log(`🎉 NOVO ENDPOINT DESCOBERTO: ${version}/${endpoint}`);
        }

        this.results.endpoints[`${version}/${endpoint}`] = result;
        await this.delay(500); // Delay menor para discovery
      }
    }

    // Testar endpoints sem versionamento
    console.log('\\n🔍 Testando endpoints sem versionamento...');
    
    for (const endpoint of endpoints) {
      const url = `${this.baseURL}/${endpoint}`;
      
      const config = {
        method: 'GET',
        url: url,
        headers: {
          'x-duid': this.getNextDeviceId(),
          'User-Agent': this.getNextUserAgent(),
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        },
        timeout: 10000
      };

      const result = await this.makeRequest(config, endpoint);
      
      if (result.success && result.status === 200) {
        this.results.discoveries.push({
          endpoint: endpoint,
          url: url,
          result: result
        });
        console.log(`🎉 NOVO ENDPOINT DESCOBERTO: ${endpoint}`);
      }

      this.results.endpoints[endpoint] = result;
      await this.delay(500);
    }
  }

  // Testar diferentes métodos HTTP
  async testHttpMethods() {
    console.log('\\n🔧 === TESTANDO MÉTODOS HTTP ===\\n');

    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
    const testEndpoints = [
      'v3.1/stickerPack/recommend',
      'v3.1/stickerPack/search',
      'v3.1/stickerPack',
      'stickers',
      'packs'
    ];

    for (const endpoint of testEndpoints) {
      for (const method of methods) {
        const config = {
          method: method,
          url: `${this.baseURL}/${endpoint}`,
          headers: {
            'x-duid': this.getNextDeviceId(),
            'User-Agent': this.getNextUserAgent(),
            'Connection': 'Keep-Alive',
            'Host': 'api.sticker.ly',
            'Accept-Encoding': 'gzip'
          },
          timeout: 10000
        };

        // Para métodos que podem ter body
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          config.headers['Content-Type'] = 'application/json';
          config.data = { keyword: 'test', cursor: 0 };
        }

        const result = await this.makeRequest(config, `${method} ${endpoint}`);
        this.results.endpoints[`${method} ${endpoint}`] = result;
        await this.delay(500);
      }
    }
  }

  // Testar rate limits e headers de autenticação
  async testRateLimits() {
    console.log('\\n⏱️ === TESTANDO RATE LIMITS ===\\n');

    const testUrl = `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`;
    
    console.log('🔥 Fazendo 50 requests rápidos para testar rate limit...');
    
    for (let i = 0; i < 50; i++) {
      const config = {
        method: 'GET',
        url: testUrl,
        headers: {
          'x-duid': this.getNextDeviceId(),
          'User-Agent': this.getNextUserAgent(),
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        },
        timeout: 10000
      };

      const result = await this.makeRequest(config, `Rate limit test ${i + 1}/50`);
      this.results.endpoints[`rate_limit_${i + 1}`] = result;
      
      // Se começar a dar erro, parar
      if (!result.success && result.status === 429) {
        console.log(`🚨 Rate limit atingido na request ${i + 1}`);
        break;
      }
      
      await this.delay(100); // Delay muito pequeno para provocar rate limit
    }
  }

  // Testar diferentes headers e autenticação
  async testAuthentication() {
    console.log('\\n🔐 === TESTANDO AUTENTICAÇÃO E HEADERS ===\\n');

    const testUrl = `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`;
    
    const authTests = [
      {
        desc: 'Sem headers especiais',
        headers: {}
      },
      {
        desc: 'Sem x-duid',
        headers: {
          'User-Agent': this.getNextUserAgent(),
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        }
      },
      {
        desc: 'Sem User-Agent',
        headers: {
          'x-duid': this.getNextDeviceId(),
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        }
      },
      {
        desc: 'x-duid inválido',
        headers: {
          'x-duid': 'invalid-device-id',
          'User-Agent': this.getNextUserAgent(),
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        }
      },
      {
        desc: 'User-Agent inválido',
        headers: {
          'x-duid': this.getNextDeviceId(),
          'User-Agent': 'InvalidApp/1.0',
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        }
      },
      {
        desc: 'Headers de autorização (teste)',
        headers: {
          'x-duid': this.getNextDeviceId(),
          'User-Agent': this.getNextUserAgent(),
          'Authorization': 'Bearer test-token',
          'X-API-Key': 'test-api-key',
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        }
      }
    ];

    for (const test of authTests) {
      const config = {
        method: 'GET',
        url: testUrl,
        headers: test.headers,
        timeout: 10000
      };

      const result = await this.makeRequest(config, test.desc);
      this.results.endpoints[`auth_${test.desc}`] = result;
      await this.delay(1000);
    }
  }

  // Explorar estruturas de resposta
  async exploreResponseStructures() {
    console.log('\\n📊 === EXPLORANDO ESTRUTURAS DE RESPOSTA ===\\n');

    // Fazer algumas requests para analisar as respostas em detalhes
    const explorationTests = [
      {
        desc: 'Recommend padrão',
        config: {
          method: 'GET',
          url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`,
          headers: {
            'x-duid': this.getNextDeviceId(),
            'User-Agent': this.getNextUserAgent(),
            'Connection': 'Keep-Alive',
            'Host': 'api.sticker.ly',
            'Accept-Encoding': 'gzip'
          }
        }
      },
      {
        desc: 'Search padrão',
        config: {
          method: 'POST',
          url: `${this.baseURL}/v3.1/stickerPack/search?withAnimation=true`,
          headers: {
            'x-duid': this.getNextDeviceId(),
            'User-Agent': this.getNextUserAgent(),
            'Connection': 'Keep-Alive',
            'Host': 'api.sticker.ly',
            'Accept-Encoding': 'gzip',
            'Content-Type': 'application/json'
          },
          data: { keyword: 'amor', cursor: 0 }
        }
      }
    ];

    for (const test of explorationTests) {
      const result = await this.makeRequest(test.config, test.desc);
      
      if (result.success && result.data) {
        console.log(`\\n📋 Estrutura da resposta de ${test.desc}:`);
        this.analyzeResponseStructure(result.data, test.desc);
        this.results.responses[test.desc] = result;
      }
      
      await this.delay(2000);
    }
  }

  analyzeResponseStructure(data, prefix = '', depth = 0) {
    const indent = '  '.repeat(depth);
    
    if (depth > 3) return; // Limitar profundidade
    
    if (Array.isArray(data)) {
      console.log(`${indent}📁 Array com ${data.length} itens`);
      if (data.length > 0) {
        console.log(`${indent}  📄 Primeiro item:`);
        this.analyzeResponseStructure(data[0], `${prefix}[0]`, depth + 1);
      }
    } else if (typeof data === 'object' && data !== null) {
      console.log(`${indent}📁 Objeto com ${Object.keys(data).length} propriedades:`);
      for (const [key, value] of Object.entries(data)) {
        const type = Array.isArray(value) ? 'array' : typeof value;
        console.log(`${indent}  📄 ${key}: ${type}`);
        
        if (typeof value === 'object' && value !== null) {
          this.analyzeResponseStructure(value, `${prefix}.${key}`, depth + 1);
        }
      }
    }
  }

  async saveResults() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `stickerly_api_exploration_${timestamp}.json`;
    const reportFilename = `stickerly_api_report_${timestamp}.md`;
    
    // Salvar dados brutos
    await fs.ensureDir('./exploration_results');
    await fs.writeJSON(`./exploration_results/${filename}`, this.results, { spaces: 2 });
    
    // Gerar relatório em markdown
    const report = this.generateMarkdownReport();
    await fs.writeFile(`./exploration_results/${reportFilename}`, report);
    
    console.log(`\\n💾 Resultados salvos em:`);
    console.log(`   📊 Dados: ./exploration_results/${filename}`);
    console.log(`   📝 Relatório: ./exploration_results/${reportFilename}`);
    
    return { dataFile: filename, reportFile: reportFilename };
  }

  generateMarkdownReport() {
    const successful = Object.values(this.results.endpoints).filter(r => r.success).length;
    const total = Object.values(this.results.endpoints).length;
    const discoveries = this.results.discoveries.length;

    return `# Relatório de Exploração da API Sticker.ly

## Resumo da Exploração

- **Data/Hora**: ${new Date().toLocaleString('pt-BR')}
- **Total de Requests**: ${total}
- **Requests Bem-sucedidas**: ${successful}
- **Taxa de Sucesso**: ${((successful / total) * 100).toFixed(1)}%
- **Novos Endpoints Descobertos**: ${discoveries}

## Endpoints Conhecidos

### 1. Recommend (GET)
- **URL**: \`http://api.sticker.ly/v3.1/stickerPack/recommend\`
- **Parâmetros suportados**:
  - \`withAnimation\`: true/false
  - \`cursor\`: número (paginação)
  - \`limit\`: número (quantidade de resultados)

### 2. Search (POST)
- **URL**: \`http://api.sticker.ly/v3.1/stickerPack/search\`
- **Body**: \`{ "keyword": "string", "cursor": number }\`
- **Parâmetros suportados**:
  - \`withAnimation\`: true/false (query string)

## Novos Endpoints Descobertos

${this.results.discoveries.map(d => `- **${d.endpoint}**: ${d.url} (Status: ${d.result.status})`).join('\\n')}

## Headers Importantes

- \`x-duid\`: Device ID (obrigatório)
- \`User-Agent\`: Identificação do app (importante)
- \`Content-Type\`: application/json (para POST)

## Observações Técnicas

### Rate Limiting
${this.getRateLimitInfo()}

### Autenticação
${this.getAuthInfo()}

### Estruturas de Resposta
${this.getResponseStructureInfo()}

## Próximos Passos

1. Testar endpoints descobertos com diferentes parâmetros
2. Investigar possíveis endpoints de administração
3. Testar uploads e modificações (se aplicável)
4. Analisar padrões de rate limiting
5. Investigar possíveis vulnerabilidades

---
*Relatório gerado automaticamente em ${new Date().toLocaleString('pt-BR')}*
`;
  }

  getRateLimitInfo() {
    const rateLimitTests = Object.entries(this.results.endpoints)
      .filter(([key]) => key.startsWith('rate_limit_'))
      .map(([, result]) => result);
    
    const blocked = rateLimitTests.filter(r => r.status === 429).length;
    
    if (blocked > 0) {
      return `- Rate limit detectado após ${rateLimitTests.length - blocked} requests`;
    }
    return '- Nenhum rate limit detectado nos testes realizados';
  }

  getAuthInfo() {
    const authTests = Object.entries(this.results.endpoints)
      .filter(([key]) => key.startsWith('auth_'));
    
    let info = [];
    authTests.forEach(([key, result]) => {
      info.push(`- ${key.replace('auth_', '')}: Status ${result.status}`);
    });
    
    return info.join('\\n') || '- Testes de autenticação não realizados';
  }

  getResponseStructureInfo() {
    return Object.keys(this.results.responses)
      .map(key => `- **${key}**: Estrutura analisada`)
      .join('\\n') || '- Análise de estruturas não realizada';
  }

  async run() {
    console.log('🚀 === INICIANDO EXPLORAÇÃO DA API STICKER.LY ===\\n');
    
    try {
      await this.testKnownEndpoints();
      await this.discoverEndpoints();
      await this.testHttpMethods();
      await this.testAuthentication();
      await this.testRateLimits();
      await this.exploreResponseStructures();
      
      const files = await this.saveResults();
      
      console.log('\\n🎉 === EXPLORAÇÃO CONCLUÍDA ===');
      console.log(`📊 ${Object.keys(this.results.endpoints).length} endpoints testados`);
      console.log(`🎯 ${this.results.discoveries.length} novos endpoints descobertos`);
      
      return files;
      
    } catch (error) {
      console.error('❌ Erro durante exploração:', error);
      this.results.errors.push({
        error: error.message,
        timestamp: new Date().toISOString()
      });
      
      await this.saveResults();
      throw error;
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const explorer = new StickerlyAPIExplorer();
  explorer.run()
    .then(files => {
      console.log('\\n✅ Exploração concluída com sucesso!');
      console.log('📁 Arquivos gerados:', files);
    })
    .catch(error => {
      console.error('\\n❌ Erro na exploração:', error.message);
      process.exit(1);
    });
}

module.exports = StickerlyAPIExplorer;
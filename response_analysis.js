#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs-extra');

class ResponseAnalyzer {
  constructor() {
    this.baseURL = 'http://api.sticker.ly';
    this.deviceId = '20fa5a958492bbd3';
    this.userAgent = 'androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; br;)';
    this.analysis = {
      endpoints: {},
      structures: {},
      patterns: {},
      metadata: {}
    };
  }

  async makeRequest(config) {
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
        headers: response.headers,
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

  analyzeStructure(data, path = '') {
    const analysis = {
      type: Array.isArray(data) ? 'array' : typeof data,
      properties: {}
    };

    if (Array.isArray(data)) {
      analysis.length = data.length;
      if (data.length > 0) {
        analysis.itemTypes = [...new Set(data.map(item => 
          Array.isArray(item) ? 'array' : typeof item
        ))];
        analysis.sampleItem = this.analyzeStructure(data[0], `${path}[0]`);
      }
    } else if (typeof data === 'object' && data !== null) {
      Object.keys(data).forEach(key => {
        const value = data[key];
        analysis.properties[key] = {
          type: Array.isArray(value) ? 'array' : typeof value,
          sample: typeof value === 'string' ? value.slice(0, 100) : 
                  typeof value === 'number' ? value :
                  Array.isArray(value) ? `[${value.length} items]` :
                  typeof value === 'object' && value !== null ? '[object]' : value
        };

        // Para objetos e arrays, analisar recursivamente (limitando profundidade)
        if ((typeof value === 'object' || Array.isArray(value)) && 
            value !== null && path.split('.').length < 3) {
          analysis.properties[key].structure = this.analyzeStructure(value, `${path}.${key}`);
        }
      });
    }

    return analysis;
  }

  findPatterns(data) {
    const patterns = {
      urls: [],
      ids: [],
      timestamps: [],
      fileFormats: [],
      commonFields: []
    };

    const collectPatterns = (obj, prefix = '') => {
      if (typeof obj === 'string') {
        // URLs
        if (obj.match(/^https?:\/\//)) {
          patterns.urls.push(obj);
        }
        // IDs (números ou strings alfanuméricas)
        if (obj.match(/^[a-f0-9]{8,}$/i) || obj.match(/^\d{8,}$/)) {
          patterns.ids.push(obj);
        }
        // Timestamps
        if (obj.match(/^\d{4}-\d{2}-\d{2}/) || obj.match(/^\d{10,13}$/)) {
          patterns.timestamps.push(obj);
        }
        // Formatos de arquivo
        const fileMatch = obj.match(/\.(webp|png|gif|jpg|jpeg|mp4)$/i);
        if (fileMatch) {
          patterns.fileFormats.push(fileMatch[1].toLowerCase());
        }
      } else if (Array.isArray(obj)) {
        obj.forEach((item, index) => collectPatterns(item, `${prefix}[${index}]`));
      } else if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
          patterns.commonFields.push(key);
          collectPatterns(obj[key], `${prefix}.${key}`);
        });
      }
    };

    collectPatterns(data);

    // Contar frequências
    patterns.commonFields = [...new Set(patterns.commonFields)];
    patterns.urls = [...new Set(patterns.urls)];
    patterns.ids = [...new Set(patterns.ids)];
    patterns.timestamps = [...new Set(patterns.timestamps)];
    patterns.fileFormats = [...new Set(patterns.fileFormats)];

    return patterns;
  }

  async analyzeRecommendEndpoint() {
    console.log('📋 Analisando endpoint RECOMMEND...');
    
    const response = await this.makeRequest({
      method: 'GET',
      url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`
    });

    if (response.success) {
      console.log(`✅ Dados recebidos: ${JSON.stringify(response.data).length} bytes`);
      
      const structure = this.analyzeStructure(response.data);
      const patterns = this.findPatterns(response.data);
      
      this.analysis.endpoints['recommend'] = {
        url: `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`,
        structure,
        patterns,
        sampleData: response.data
      };

      // Análise específica do endpoint recommend
      if (response.data && response.data.result && response.data.result.packs) {
        const packs = response.data.result.packs;
        console.log(`  📦 ${packs.length} packs encontrados`);
        
        if (packs.length > 0) {
          const firstPack = packs[0];
          console.log('  🔍 Estrutura do primeiro pack:');
          Object.keys(firstPack).forEach(key => {
            const value = firstPack[key];
            const type = Array.isArray(value) ? `array[${value.length}]` : typeof value;
            console.log(`    ${key}: ${type}`);
          });

          // Analisar recursos do pack
          if (firstPack.resourceFiles && Array.isArray(firstPack.resourceFiles)) {
            console.log(`  📁 ${firstPack.resourceFiles.length} arquivos no primeiro pack`);
            if (firstPack.resourceFiles.length > 0) {
              const firstResource = firstPack.resourceFiles[0];
              console.log('    🔍 Estrutura do primeiro recurso:');
              Object.keys(firstResource).forEach(key => {
                console.log(`      ${key}: ${typeof firstResource[key]}`);
              });
            }
          }
        }
      }
    } else {
      console.log('❌ Falha na requisição:', response.error);
    }
  }

  async analyzeSearchEndpoint() {
    console.log('\\n🔍 Analisando endpoint SEARCH...');
    
    const response = await this.makeRequest({
      method: 'POST',
      url: `${this.baseURL}/v3.1/stickerPack/search?withAnimation=true`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: {
        keyword: 'amor',
        cursor: 0
      }
    });

    if (response.success) {
      console.log(`✅ Dados recebidos: ${JSON.stringify(response.data).length} bytes`);
      
      const structure = this.analyzeStructure(response.data);
      const patterns = this.findPatterns(response.data);
      
      this.analysis.endpoints['search'] = {
        url: `${this.baseURL}/v3.1/stickerPack/search?withAnimation=true`,
        structure,
        patterns,
        sampleData: response.data
      };

      // Análise específica do endpoint search
      if (response.data && response.data.result && response.data.result.stickerPacks) {
        const packs = response.data.result.stickerPacks;
        console.log(`  📦 ${packs.length} packs encontrados para 'amor'`);
        
        if (packs.length > 0) {
          const firstPack = packs[0];
          console.log('  🔍 Estrutura do primeiro pack de search:');
          Object.keys(firstPack).forEach(key => {
            const value = firstPack[key];
            const type = Array.isArray(value) ? `array[${value.length}]` : typeof value;
            console.log(`    ${key}: ${type}`);
          });
        }
      }
    } else {
      console.log('❌ Falha na requisição:', response.error);
    }
  }

  async analyzeV1StickerEndpoint() {
    console.log('\\n🎯 Analisando endpoint V1 STICKER...');
    
    const response = await this.makeRequest({
      method: 'GET',
      url: `${this.baseURL}/v1/sticker/recommend`
    });

    if (response.success) {
      console.log(`✅ Dados recebidos: ${JSON.stringify(response.data).length} bytes`);
      
      const structure = this.analyzeStructure(response.data);
      const patterns = this.findPatterns(response.data);
      
      this.analysis.endpoints['v1_sticker'] = {
        url: `${this.baseURL}/v1/sticker/recommend`,
        structure,
        patterns,
        sampleData: response.data
      };

      // Análise específica - este endpoint parece retornar dados diferentes
      console.log('  🔍 Estrutura da resposta V1:');
      if (response.data) {
        Object.keys(response.data).forEach(key => {
          const value = response.data[key];
          const type = Array.isArray(value) ? `array[${value.length}]` : typeof value;
          console.log(`    ${key}: ${type}`);
        });
      }
    } else {
      console.log('❌ Falha na requisição:', response.error);
    }
  }

  async analyzeHealthEndpoint() {
    console.log('\\n❤️ Analisando endpoint HEALTH...');
    
    const response = await this.makeRequest({
      method: 'GET',
      url: `${this.baseURL}/health`
    });

    if (response.success) {
      console.log(`✅ Health response:`, response.data);
      
      this.analysis.endpoints['health'] = {
        url: `${this.baseURL}/health`,
        structure: this.analyzeStructure(response.data),
        patterns: this.findPatterns(response.data),
        sampleData: response.data
      };
    } else {
      console.log('❌ Falha na requisição:', response.error);
    }
  }

  compareStructures() {
    console.log('\\n🔬 COMPARANDO ESTRUTURAS DOS ENDPOINTS...');
    
    const endpoints = Object.keys(this.analysis.endpoints);
    
    if (endpoints.length === 0) {
      console.log('❌ Nenhum endpoint analisado');
      return;
    }

    // Comparar campos comuns
    const allFields = new Set();
    endpoints.forEach(endpoint => {
      const patterns = this.analysis.endpoints[endpoint].patterns;
      if (patterns && patterns.commonFields) {
        patterns.commonFields.forEach(field => allFields.add(field));
      }
    });

    console.log('\\n📊 Campos encontrados nos endpoints:');
    [...allFields].sort().forEach(field => {
      const foundIn = endpoints.filter(endpoint => {
        const patterns = this.analysis.endpoints[endpoint].patterns;
        return patterns && patterns.commonFields && patterns.commonFields.includes(field);
      });
      console.log(`  ${field}: encontrado em ${foundIn.join(', ')}`);
    });

    // Comparar tipos de URL encontradas
    console.log('\\n🌐 URLs e padrões encontrados:');
    endpoints.forEach(endpoint => {
      const patterns = this.analysis.endpoints[endpoint].patterns;
      if (patterns && patterns.urls && patterns.urls.length > 0) {
        console.log(`  ${endpoint}:`);
        patterns.urls.slice(0, 3).forEach(url => {
          console.log(`    ${url}`);
        });
        if (patterns.urls.length > 3) {
          console.log(`    ... e mais ${patterns.urls.length - 3} URLs`);
        }
      }
    });
  }

  generateInsights() {
    console.log('\\n💡 INSIGHTS E DESCOBERTAS...');
    
    const insights = [];

    // Analisar todos os endpoints
    Object.keys(this.analysis.endpoints).forEach(endpoint => {
      const analysis = this.analysis.endpoints[endpoint];
      
      if (analysis.patterns.urls.length > 0) {
        const urlDomains = analysis.patterns.urls.map(url => {
          try {
            return new URL(url).hostname;
          } catch {
            return 'invalid-url';
          }
        });
        const uniqueDomains = [...new Set(urlDomains)];
        insights.push(`${endpoint}: URLs de ${uniqueDomains.length} domínios diferentes`);
      }

      if (analysis.patterns.fileFormats.length > 0) {
        insights.push(`${endpoint}: Formatos encontrados: ${analysis.patterns.fileFormats.join(', ')}`);
      }

      if (analysis.patterns.ids.length > 0) {
        insights.push(`${endpoint}: ${analysis.patterns.ids.length} IDs únicos encontrados`);
      }
    });

    insights.forEach(insight => console.log(`  💡 ${insight}`));

    return insights;
  }

  async saveAnalysis() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `response_analysis_${timestamp}.json`;
    
    await fs.ensureDir('./exploration_results');
    await fs.writeJSON(`./exploration_results/${filename}`, {
      timestamp: new Date().toISOString(),
      analysis: this.analysis,
      insights: this.generateInsights()
    }, { spaces: 2 });

    console.log(`\\n💾 Análise salva em: ./exploration_results/${filename}`);
    return filename;
  }

  async run() {
    console.log('🔬 INICIANDO ANÁLISE DETALHADA DAS RESPOSTAS\\n');
    
    try {
      await this.analyzeRecommendEndpoint();
      await this.analyzeSearchEndpoint();
      await this.analyzeV1StickerEndpoint();
      await this.analyzeHealthEndpoint();
      
      this.compareStructures();
      this.generateInsights();
      
      const filename = await this.saveAnalysis();
      
      console.log('\\n✅ Análise concluída!');
      return filename;
      
    } catch (error) {
      console.error('\\n❌ Erro durante análise:', error);
      throw error;
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const analyzer = new ResponseAnalyzer();
  analyzer.run()
    .then(filename => {
      console.log(`\\n🎉 Arquivo de análise: ${filename}`);
    })
    .catch(error => {
      console.error('\\n💥 Falha na análise:', error.message);
      process.exit(1);
    });
}

module.exports = ResponseAnalyzer;
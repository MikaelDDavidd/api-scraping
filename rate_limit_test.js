#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs-extra');

class RateLimitTest {
  constructor() {
    this.baseURL = 'http://api.sticker.ly';
    this.results = [];
    this.deviceId = '20fa5a958492bbd3';
    this.userAgent = 'androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; br;)';
  }

  async makeRequest(url, delay = 0) {
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    const start = Date.now();
    try {
      const response = await axios({
        method: 'GET',
        url: url,
        headers: {
          'x-duid': this.deviceId,
          'User-Agent': this.userAgent,
          'Connection': 'Keep-Alive',
          'Host': 'api.sticker.ly',
          'Accept-Encoding': 'gzip'
        },
        timeout: 30000
      });

      const duration = Date.now() - start;
      const result = {
        success: true,
        status: response.status,
        responseTime: duration,
        responseSize: JSON.stringify(response.data).length,
        headers: response.headers,
        timestamp: new Date().toISOString()
      };

      console.log(`✅ ${response.status} (${duration}ms, ${result.responseSize} bytes)`);
      return result;
    } catch (error) {
      const duration = Date.now() - start;
      const result = {
        success: false,
        status: error.response?.status || 'ERROR',
        responseTime: duration,
        error: error.message,
        headers: error.response?.headers || {},
        timestamp: new Date().toISOString()
      };

      console.log(`❌ ${result.status} (${duration}ms) - ${result.error}`);
      return result;
    }
  }

  async testRateLimit() {
    console.log('⏱️ TESTE DE RATE LIMIT\\n');
    
    const url = `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`;
    const results = [];

    console.log('🔥 Fazendo 20 requests rápidos...');
    
    for (let i = 0; i < 20; i++) {
      process.stdout.write(`Request ${i + 1}/20: `);
      const result = await this.makeRequest(url, 100); // 100ms entre requests
      results.push({
        requestNumber: i + 1,
        ...result
      });

      // Se começar a dar rate limit, quebrar o loop
      if (result.status === 429 || result.status === 403) {
        console.log(`\\n🚨 Rate limit detectado na request ${i + 1}`);
        break;
      }
    }

    console.log('\\n📊 Analisando headers de rate limit...');
    
    // Analisar headers interessantes
    results.forEach((result, index) => {
      const headers = result.headers || {};
      const rateLimitHeaders = {};
      
      Object.keys(headers).forEach(key => {
        if (key.toLowerCase().includes('rate') || 
            key.toLowerCase().includes('limit') ||
            key.toLowerCase().includes('quota') ||
            key.toLowerCase().includes('throttle') ||
            key.toLowerCase().includes('remaining') ||
            key.toLowerCase().includes('reset')) {
          rateLimitHeaders[key] = headers[key];
        }
      });

      if (Object.keys(rateLimitHeaders).length > 0) {
        console.log(`Request ${index + 1} - Rate limit headers:`, rateLimitHeaders);
      }
    });

    return results;
  }

  async testResponseTimes() {
    console.log('\\n⚡ TESTE DE TEMPOS DE RESPOSTA\\n');
    
    const urls = [
      `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`,
      `${this.baseURL}/v1/sticker/recommend`,
      `${this.baseURL}/health`,
      `${this.baseURL}/status`
    ];

    const results = [];

    for (const url of urls) {
      console.log(`\\n🎯 Testando: ${url}`);
      const urlResults = [];

      for (let i = 0; i < 5; i++) {
        process.stdout.write(`  Tentativa ${i + 1}/5: `);
        const result = await this.makeRequest(url, 1000);
        urlResults.push(result);
      }

      const responseTimes = urlResults.map(r => r.responseTime);
      const avgTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const minTime = Math.min(...responseTimes);
      const maxTime = Math.max(...responseTimes);

      console.log(`  📊 Média: ${avgTime.toFixed(0)}ms | Min: ${minTime}ms | Max: ${maxTime}ms`);

      results.push({
        url,
        attempts: urlResults,
        stats: { avgTime, minTime, maxTime }
      });
    }

    return results;
  }

  async testDifferentDeviceIds() {
    console.log('\\n📱 TESTE COM DIFERENTES DEVICE IDS\\n');
    
    const deviceIds = [
      '20fa5a958492bbd3', // Original
      '30fb6b068593cce4', // Alternativo 1
      '40fc7c178694ddf5', // Alternativo 2
      'invalid-device-id', // Inválido
      '',                 // Vazio
      '12345678901234567890' // Muito longo
    ];

    const url = `${this.baseURL}/v3.1/stickerPack/recommend?withAnimation=true`;
    const results = [];

    for (const deviceId of deviceIds) {
      console.log(`🔍 Testando device ID: "${deviceId}"`);
      
      try {
        const response = await axios({
          method: 'GET',
          url: url,
          headers: {
            'x-duid': deviceId,
            'User-Agent': this.userAgent,
            'Connection': 'Keep-Alive',
            'Host': 'api.sticker.ly',
            'Accept-Encoding': 'gzip'
          },
          timeout: 30000
        });

        console.log(`✅ ${response.status} (${JSON.stringify(response.data).length} bytes)`);
        results.push({
          deviceId,
          success: true,
          status: response.status,
          responseSize: JSON.stringify(response.data).length
        });
      } catch (error) {
        console.log(`❌ ${error.response?.status || 'ERROR'} - ${error.message}`);
        results.push({
          deviceId,
          success: false,
          status: error.response?.status || 'ERROR',
          error: error.message
        });
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  async run() {
    console.log('🚀 INICIANDO TESTES DE RATE LIMIT E AUTENTICAÇÃO\\n');
    
    try {
      const rateLimitResults = await this.testRateLimit();
      const responseTimeResults = await this.testResponseTimes();
      const deviceIdResults = await this.testDifferentDeviceIds();

      const summary = {
        timestamp: new Date().toISOString(),
        rateLimitTest: {
          totalRequests: rateLimitResults.length,
          successful: rateLimitResults.filter(r => r.success).length,
          rateLimited: rateLimitResults.filter(r => r.status === 429 || r.status === 403).length,
          results: rateLimitResults
        },
        responseTimeTest: {
          results: responseTimeResults
        },
        deviceIdTest: {
          results: deviceIdResults
        }
      };

      // Salvar resultados
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `rate_limit_test_${timestamp}.json`;
      
      await fs.ensureDir('./exploration_results');
      await fs.writeJSON(`./exploration_results/${filename}`, summary, { spaces: 2 });

      console.log(`\\n💾 Resultados salvos em: ./exploration_results/${filename}`);

      // Gerar relatório resumido
      console.log('\\n' + '='.repeat(60));
      console.log('📊 RESUMO DOS TESTES DE RATE LIMIT');
      console.log('='.repeat(60));
      console.log(`Rate Limit: ${summary.rateLimitTest.rateLimited > 0 ? 'DETECTADO' : 'NÃO DETECTADO'}`);
      console.log(`Requests bem-sucedidas: ${summary.rateLimitTest.successful}/${summary.rateLimitTest.totalRequests}`);
      console.log('');

      if (responseTimeResults.length > 0) {
        console.log('⚡ TEMPOS DE RESPOSTA:');
        responseTimeResults.forEach(result => {
          console.log(`  ${result.url.split('/').pop()}: ${result.stats.avgTime.toFixed(0)}ms (avg)`);
        });
        console.log('');
      }

      const validDeviceIds = deviceIdResults.filter(r => r.success).length;
      console.log(`📱 DEVICE IDS: ${validDeviceIds}/${deviceIdResults.length} funcionaram`);

      return filename;
      
    } catch (error) {
      console.error('\\n❌ Erro durante os testes:', error);
      throw error;
    }
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  const tester = new RateLimitTest();
  tester.run()
    .then(filename => {
      console.log(`\\n✅ Testes concluídos! Arquivo: ${filename}`);
    })
    .catch(error => {
      console.error('\\n💥 Falha nos testes:', error.message);
      process.exit(1);
    });
}

module.exports = RateLimitTest;
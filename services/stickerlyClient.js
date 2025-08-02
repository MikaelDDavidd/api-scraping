const axios = require('axios');
const { config } = require('../config/config');
const { info, error, warn } = require('../utils/logger');

class StickerlyClient {
  constructor() {
    this.baseURL = 'http://api.sticker.ly';
    this.deviceIdIndex = 0; // Para rotação de device IDs
    this.defaultHeaders = {
      'Connection': 'Keep-Alive',
      'Host': 'api.sticker.ly',
      'Accept-Encoding': 'gzip'
    };
  }

  /**
   * Obtém próximo device ID da rotação
   */
  getNextDeviceId() {
    const deviceId = config.scraping.deviceIds[this.deviceIdIndex];
    this.deviceIdIndex = (this.deviceIdIndex + 1) % config.scraping.deviceIds.length;
    return deviceId;
  }

  /**
   * Cria o User-Agent baseado no locale (como na API original)
   */
  getUserAgent(locale = 'pt-BR') {
    // Converter locale para formato da API original
    const localeMap = {
      'pt-BR': 'br',
      'en-US': 'en', 
      'es-ES': 'es',
      'fr-FR': 'fr'
    };
    
    const shortLocale = localeMap[locale] || 'br';
    return config.scraping.userAgent.replace('{locale}', shortLocale);
  }

  /**
   * Faz delay entre requests para não sobrecarregar a API
   */
  async delay(ms = config.scraping.delayBetweenRequests) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Executa request com retry automático
   */
  async makeRequest(requestConfig, retries = config.scraping.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios(requestConfig);
        return response.data;
      } catch (err) {
        error(`Erro na tentativa ${attempt}/${retries}`, err, { 
          url: requestConfig.url,
          method: requestConfig.method 
        });
        
        if (attempt === retries) {
          throw err;
        }
        
        // Delay exponencial entre tentativas
        await this.delay(1000 * attempt);
      }
    }
  }

  /**
   * Busca packs recomendados por locale (com paginação opcional)
   */
  async getRecommendedPacks(locale = 'pt-BR', cursor = 0) {
    info(`Buscando packs recomendados para locale: ${locale}, cursor: ${cursor}`);
    
    let url = config.scraping.apiUrls.recommend;
    
    // Adicionar cursor se maior que 0
    if (cursor > 0) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}cursor=${cursor}`;
    }
    
    const requestConfig = {
      method: 'GET',
      url: url,
      headers: {
        ...this.defaultHeaders,
        'x-duid': this.getNextDeviceId(), // Rotacionar device ID
        'User-Agent': this.getUserAgent(locale)
      },
      timeout: 30000
    };

    try {
      const data = await this.makeRequest(requestConfig);
      
      if (data && data.result && data.result.packs) {
        info(`Encontrados ${data.result.packs.length} packs recomendados`, { 
          locale, 
          cursor,
          count: data.result.packs.length 
        });
        return data.result.packs;
      }
      
      warn('Resposta sem packs na estrutura esperada', { locale, cursor, data });
      return [];
    } catch (err) {
      error('Erro ao buscar packs recomendados', err, { locale, cursor });
      return [];
    }
  }

  /**
   * Busca packs por palavra-chave
   */
  async searchPacks(keyword, cursor = 0, locale = 'pt-BR') {
    info(`Buscando packs para keyword: ${keyword}, cursor: ${cursor}`, { locale });
    
    const requestConfig = {
      method: 'POST',
      url: config.scraping.apiUrls.search,
      headers: {
        ...this.defaultHeaders,
        'x-duid': this.getNextDeviceId(), // Rotacionar device ID
        'User-Agent': this.getUserAgent(locale),
        'Content-Type': 'application/json'
      },
      data: {
        keyword: keyword,
        cursor: cursor
      },
      timeout: 30000
    };

    try {
      const data = await this.makeRequest(requestConfig);
      
      if (data && data.result && data.result.stickerPacks) {
        const packs = data.result.stickerPacks;
        info(`Encontrados ${packs.length} packs para keyword: ${keyword}`, { 
          keyword, 
          cursor, 
          locale 
        });
        return packs;
      }
      
      warn('Resposta sem packs na estrutura esperada', { keyword, cursor, locale });
      return [];
    } catch (err) {
      error('Erro ao buscar packs por keyword', err, { keyword, cursor, locale });
      return [];
    }
  }

  /**
   * Busca todos os packs de uma keyword com paginação (como na API original)
   */
  async searchAllPacks(keyword, locale = 'pt-BR') {
    const maxPages = config.scraping.maxPagesPerKeyword;
    const maxPacks = config.scraping.maxPacksPerKeyword;
    
    info(`Iniciando busca completa para keyword: ${keyword}`, { 
      locale, 
      maxPages, 
      maxPacks 
    });
    
    let allPacks = [];
    let cursor = 0;
    let emptyResponses = 0;
    const maxEmptyResponses = config.scraping.maxEmptyPagesConsecutive;

    while (cursor < maxPages && allPacks.length < maxPacks && emptyResponses < maxEmptyResponses) {
      try {
        const packs = await this.searchPacks(keyword, cursor, locale);
        
        if (packs.length === 0) {
          emptyResponses++;
          info(`Página vazia encontrada (${emptyResponses}/${maxEmptyResponses})`, { 
            keyword, 
            cursor, 
            locale 
          });
        } else {
          emptyResponses = 0; // Reset contador se encontrou packs
          allPacks = allPacks.concat(packs);
          
          // Filtrar apenas packs animados se configurado
          const animatedPacks = packs.filter(pack => pack.isAnimated);
          info(`Página ${cursor}: ${packs.length} packs (${animatedPacks.length} animados)`, {
            keyword,
            cursor,
            locale,
            totalSoFar: allPacks.length
          });
          
          // Limite por keyword como na API original
          if (allPacks.length >= maxPacks) {
            info(`Limite de ${maxPacks} packs atingido para keyword: ${keyword}`);
            break;
          }
        }
        
        cursor++;
        await this.delay();
        
      } catch (err) {
        error(`Erro na página ${cursor}`, err, { keyword, locale });
        emptyResponses++;
        cursor++;
      }
    }

    // Truncar para limite da API original
    if (allPacks.length > maxPacks) {
      allPacks = allPacks.slice(0, maxPacks);
    }

    info(`Busca completa finalizada para keyword: ${keyword}`, {
      keyword,
      locale,
      totalPacks: allPacks.length,
      pagesScraped: cursor,
      limitReached: allPacks.length >= maxPacks
    });

    return allPacks;
  }

  /**
   * Busca packs recomendados (SEM paginação como na API original)
   */
  async getRecommendedPacksSingle(locale = 'pt-BR') {
    info(`Buscando packs recomendados (chamada única como API original)`, { locale });
    
    try {
      // API original faz apenas UMA chamada ao endpoint recommend
      const packs = await this.getRecommendedPacks(locale, 0);
      
      info(`Packs recomendados obtidos`, {
        locale,
        totalPacks: packs.length
      });
      
      return packs;
    } catch (err) {
      error('Erro ao buscar packs recomendados', err, { locale });
      return [];
    }
  }

  /**
   * Baixa arquivo de uma URL
   */
  async downloadFile(url, retries = config.scraping.maxRetries) {
    info(`Baixando arquivo: ${url}`);
    
    const requestConfig = {
      method: 'GET',
      url: url,
      responseType: 'arraybuffer',
      timeout: 60000, // 60 segundos para downloads
      headers: {
        'User-Agent': this.getUserAgent(),
        'x-duid': this.getNextDeviceId() // Rotacionar device ID mesmo para downloads
      }
    };

    try {
      const response = await this.makeRequest(requestConfig, retries);
      info(`Arquivo baixado com sucesso`, { 
        url, 
        size: response.length 
      });
      return Buffer.from(response);
    } catch (err) {
      error('Erro ao baixar arquivo', err, { url });
      throw err;
    }
  }

  /**
   * Valida se um pack é válido para processamento
   */
  validatePack(pack) {
    const required = ['packId', 'name', 'resourceFiles', 'resourceUrlPrefix'];
    const missing = required.filter(field => !pack[field]);
    
    if (missing.length > 0) {
      warn('Pack inválido - campos obrigatórios ausentes', { 
        packId: pack.packId || 'unknown',
        missing 
      });
      return false;
    }

    if (!Array.isArray(pack.resourceFiles) || pack.resourceFiles.length === 0) {
      warn('Pack sem arquivos de recursos', { packId: pack.packId });
      return false;
    }

    return true;
  }

  /**
   * Processa lista de packs e filtra os válidos
   */
  filterValidPacks(packs) {
    if (!Array.isArray(packs)) {
      warn('Lista de packs inválida');
      return [];
    }

    const validPacks = packs.filter(pack => this.validatePack(pack));
    
    info(`Filtração de packs concluída`, {
      total: packs.length,
      valid: validPacks.length,
      invalid: packs.length - validPacks.length
    });

    return validPacks;
  }
}

module.exports = StickerlyClient;
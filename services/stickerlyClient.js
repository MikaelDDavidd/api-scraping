const axios = require('axios');
const { config } = require('../config/config');
const { info, error, warn } = require('../utils/logger');

class StickerlyClient {
  constructor() {
    this.baseURL = 'http://api.sticker.ly';
    this.defaultHeaders = {
      'Connection': 'Keep-Alive',
      'Host': 'api.sticker.ly',
      'x-duid': '20fa5a958492bbd3',
      'Accept-Encoding': 'gzip'
    };
  }

  /**
   * Cria o User-Agent baseado no locale
   */
  getUserAgent(locale = 'pt-BR') {
    return config.scraping.userAgent.replace('{locale}', locale);
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
   * Busca todos os packs de uma keyword com paginação
   */
  async searchAllPacks(keyword, locale = 'pt-BR', maxPages = 50) {
    info(`Iniciando busca completa para keyword: ${keyword}`, { locale, maxPages });
    
    let allPacks = [];
    let cursor = 0;
    let emptyResponses = 0;
    const maxEmptyResponses = 3;

    while (cursor < maxPages && emptyResponses < maxEmptyResponses) {
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
            locale
          });
        }
        
        cursor++;
        await this.delay();
        
      } catch (err) {
        error(`Erro na página ${cursor}`, err, { keyword, locale });
        emptyResponses++;
      }
    }

    info(`Busca completa finalizada para keyword: ${keyword}`, {
      keyword,
      locale,
      totalPacks: allPacks.length,
      pagesScraped: cursor
    });

    return allPacks;
  }

  /**
   * Busca todos os packs recomendados com paginação
   */
  async getRecommendedPacksWithPagination(locale = 'pt-BR', maxPages = null) {
    if (!config.scraping.recommendedPacksPaginationEnabled) {
      info('Paginação de packs recomendados desabilitada, usando método simples');
      return await this.getRecommendedPacks(locale, 0);
    }

    const actualMaxPages = maxPages || config.scraping.maxPagesPerRun;
    info(`Iniciando busca paginada de packs recomendados`, { 
      locale, 
      maxPages: actualMaxPages 
    });
    
    let allPacks = [];
    let cursor = 0;
    let emptyResponses = 0;
    const maxEmptyResponses = config.scraping.maxEmptyPagesConsecutive;

    while (cursor < actualMaxPages && emptyResponses < maxEmptyResponses) {
      try {
        const packs = await this.getRecommendedPacks(locale, cursor);
        
        if (packs.length === 0) {
          emptyResponses++;
          info(`Página vazia encontrada (${emptyResponses}/${maxEmptyResponses})`, { 
            locale, 
            cursor 
          });
          
          // Se é a primeira página e está vazia, algo está errado
          if (cursor === 0) {
            warn('Primeira página de recomendados está vazia', { locale });
            break;
          }
        } else {
          emptyResponses = 0; // Reset contador se encontrou packs
          allPacks = allPacks.concat(packs);
          
          info(`Página ${cursor}: ${packs.length} packs recomendados`, {
            locale,
            cursor,
            totalSoFar: allPacks.length
          });
        }
        
        cursor++;
        await this.delay();
        
      } catch (err) {
        error(`Erro na página ${cursor} de recomendados`, err, { locale });
        emptyResponses++;
        cursor++;
      }
    }

    info(`Busca paginada de recomendados finalizada`, {
      locale,
      totalPacks: allPacks.length,
      pagesScraped: cursor,
      stoppedReason: cursor >= actualMaxPages ? 'max_pages_reached' : 'empty_pages_limit'
    });

    return allPacks;
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
        'User-Agent': this.getUserAgent()
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
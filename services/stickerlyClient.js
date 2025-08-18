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
   * Executa request com retry automático e tratamento melhorado de erros
   */
  async makeRequest(requestConfig, retries = config.scraping.maxRetries) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios(requestConfig);
        return response.data;
      } catch (err) {
        const isLastAttempt = attempt >= retries;
        const isTimeoutError = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
        const isNetworkError = err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT';
        const isServerError = err.response?.status >= 500;
        const isCloudflareError = err.response?.status === 521 || err.response?.status === 522;
        
        error(`Erro na tentativa ${attempt}/${retries}`, {
          error: err.message,
          code: err.code,
          status: err.response?.status,
          url: requestConfig.url,
          method: requestConfig.method,
          isTimeout: isTimeoutError,
          isNetwork: isNetworkError,
          isServer: isServerError,
          isCloudflare: isCloudflareError
        });
        
        if (isLastAttempt) {
          throw err;
        }
        
        // Delay mais longo para erros de servidor/rede
        let delayMs = 1000 * attempt; // Base delay
        
        if (isTimeoutError || isNetworkError || isServerError || isCloudflareError) {
          delayMs = Math.min(30000, 5000 * attempt); // Até 30s para erros graves
          warn(`Erro de conectividade detectado, aguardando ${delayMs/1000}s antes de tentar novamente...`);
        }
        
        await this.delay(delayMs);
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
      timeout: 60000 // Aumentado para 60s
    };

    try {
      const data = await this.makeRequest(requestConfig);
      
      // ⭐ SALVAR RESPONSE como API original
      await this.saveResponseToFile(data, 'recommend', locale, cursor);
      
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
      timeout: 60000 // Aumentado para 60s
    };

    try {
      const data = await this.makeRequest(requestConfig);
      
      // ⭐ SALVAR RESPONSE como API original
      await this.saveResponseToFile(data, 'search', locale, cursor, keyword);
      
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
          
          // ⭐ FILTRO PROGRESSIVO como API original: primeira página aceita todos, outras só animados
          let packsAdded = 0;
          let animatedCount = 0;
          
          for (let i = 0; i < packs.length; i++) {
            const pack = packs[i];
            
            // Primeira página (cursor 0): aceita todos | Outras páginas: só animados
            if (cursor === 0 || pack.isAnimated) {
              allPacks.push(pack);
              packsAdded++;
              
              if (pack.isAnimated) {
                animatedCount++;
              }
            }
          }
          
          // ⭐ LOG DETALHADO como API original
          info("-------------- STATUS -------------");
          info(`keyword: ${keyword}`);
          info(`total stickers: ${allPacks.length}`);
          info(`cursor: ${cursor}`);
          info(`animated stickers: ${animatedCount}`);
          info(`page added: ${packsAdded}/${packs.length}`);
          info("--------------------------------------");
          
          info(`Página ${cursor}: ${packsAdded}/${packs.length} packs adicionados (${animatedCount} animados)`, {
            keyword,
            cursor,
            locale,
            totalSoFar: allPacks.length,
            filtered: cursor > 0 ? packs.length - packsAdded : 0
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
   * Extrai informações melhoradas do pack incluindo author name
   */
  enhancePackData(pack) {
    // Tentar extrair authorName de várias fontes possíveis
    let authorName = null;
    
    // 1. Campo direto authorName
    if (pack.authorName && pack.authorName.trim()) {
      authorName = pack.authorName.trim();
    }
    // 2. Campo author
    else if (pack.author && pack.author.trim()) {
      authorName = pack.author.trim();
    }
    // 3. Campo publisher
    else if (pack.publisher && pack.publisher.trim()) {
      authorName = pack.publisher.trim();
    }
    // 4. Campo creator
    else if (pack.creator && pack.creator.trim()) {
      authorName = pack.creator.trim();
    }
    // 5. Extrair do título se formato "Nome - Título"
    else if (pack.name && pack.name.includes(' - ')) {
      const parts = pack.name.split(' - ');
      if (parts.length >= 2 && parts[0].trim().length > 0) {
        authorName = parts[0].trim();
      }
    }
    // 6. Verificar se há user object
    else if (pack.user && pack.user.name) {
      authorName = pack.user.name.trim();
    }
    // 7. Verificar se há owner object
    else if (pack.owner && pack.owner.name) {
      authorName = pack.owner.name.trim();
    }
    
    // Se ainda não encontrou, tentar pattern comum
    if (!authorName && pack.name) {
      // Padrões como "by Author", "de Author", etc.
      const byMatch = pack.name.match(/(?:by|de|por)\s+([^-()]+)/i);
      if (byMatch) {
        authorName = byMatch[1].trim();
      }
    }
    
    // Fallback final
    if (!authorName || authorName === '') {
      authorName = 'Autor Desconhecido';
    }
    
    // Limpar e validar authorName
    authorName = authorName
      .replace(/[^\w\s\-_.]/g, '') // Remove caracteres especiais
      .trim()
      .slice(0, 50); // Limita a 50 chars
    
    if (authorName === '') {
      authorName = 'Autor Desconhecido';
    }
    
    // Retornar pack com dados melhorados
    return {
      ...pack,
      authorName: authorName,
      // Melhorar outros campos também
      viewCount: pack.viewCount || pack.views || pack.downloadCount || 0,
      isAnimated: pack.isAnimated || pack.animated || this.detectAnimatedFromFiles(pack.resourceFiles),
      // Limpar nome do pack
      name: pack.name ? pack.name.trim().slice(0, 100) : 'Pack sem nome'
    };
  }

  /**
   * Detecta se pack é animado baseado nos arquivos
   */
  detectAnimatedFromFiles(resourceFiles) {
    if (!Array.isArray(resourceFiles)) return false;
    
    // Verificar extensões que indicam animação
    const animatedExtensions = ['.gif', '.webp'];
    return resourceFiles.some(file => 
      animatedExtensions.some(ext => file.toLowerCase().includes(ext))
    );
  }

  /**
   * Processa lista de packs e filtra os válidos
   */
  filterValidPacks(packs) {
    if (!Array.isArray(packs)) {
      warn('Lista de packs inválida');
      return [];
    }

    // Primeiro melhorar dados de cada pack
    const enhancedPacks = packs.map(pack => this.enhancePackData(pack));
    
    // Depois validar
    const validPacks = enhancedPacks.filter(pack => this.validatePack(pack));
    
    info(`Filtração de packs concluída`, {
      total: packs.length,
      enhanced: enhancedPacks.length,
      valid: validPacks.length,
      invalid: packs.length - validPacks.length,
      authorsFound: validPacks.filter(p => p.authorName !== 'Autor Desconhecido').length
    });

    return validPacks;
  }

  /**
   * Salva response em arquivo como na API original
   */
  async saveResponseToFile(data, type, locale, cursor, keyword = '') {
    try {
      const fs = require('fs-extra');
      const path = require('path');
      
      // Garantir que diretório existe
      const dataDir = config.storage?.dataDir || './data_captured';
      await fs.ensureDir(dataDir);
      
      // Criar nome do arquivo como na API original
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = keyword ? 
        `sticker.ly_${type}_${keyword}_${locale}_${cursor}_${timestamp}.json` :
        `sticker.ly_${type}_${locale}_${cursor}_${timestamp}.json`;
      
      const filepath = path.join(dataDir, filename);
      
      // Salvar dados
      await fs.writeJSON(filepath, data, { spaces: 2 });
      
      info(`Response salvo`, {
        type,
        locale,
        cursor,
        keyword: keyword || 'none',
        filename,
        dataSize: JSON.stringify(data).length
      });
      
    } catch (err) {
      error('Erro ao salvar response', err, { type, locale, cursor, keyword });
    }
  }
}

module.exports = StickerlyClient;
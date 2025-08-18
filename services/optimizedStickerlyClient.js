const StickerlyClient = require('./stickerlyClient');
const { config } = require('../config/config');
const { info, error, warn } = require('../utils/logger');

class OptimizedStickerlyClient extends StickerlyClient {
  constructor() {
    super();
    
    // Cache para IDs de packs já processados (mais eficiente)
    this.processedPackIds = new Set();
    this.sessionNewPacks = new Set();
    
    // Estratégia de rotação de endpoints
    this.endpointStrategy = {
      currentStrategy: 'mixed', // 'light', 'full', 'mixed'
      lightEndpointRatio: 0.3, // 30% das calls usam endpoint leve
      callCount: 0
    };
    
    // Categorias descobertas na investigação
    this.effectiveCategories = [
      // High-Volume (>1000 packs)
      'amor', 'memes', 'emoji', 'love', 'cute', 'anime',
      
      // Medium-Volume (500-1000 packs)  
      'funny', 'cat', 'kpop', 'brasil', 'happy',
      
      // Niche but Active (100-500 packs)
      'flamengo', 'pokemon', 'disney', 'food', 'christmas',
      
      // Emotional states
      'sad', 'thinking', 'sleeping', 'party'
    ];
    
    // Estatísticas de performance
    this.stats = {
      lightEndpointCalls: 0,
      fullEndpointCalls: 0,
      categorizedCalls: 0,
      duplicatesSkipped: 0,
      newPacksFound: 0,
      totalApiCalls: 0,
      bytesReceived: 0
    };
  }

  /**
   * Carrega cache de packs existentes para otimização
   */
  async loadExistingPacksCache(existingPackIds) {
    this.processedPackIds = new Set(existingPackIds);
    info(`Cache carregado: ${this.processedPackIds.size} packs existentes`);
  }

  /**
   * Filtra packs já existentes ANTES do processamento pesado
   */
  filterNewPacks(packs) {
    if (!Array.isArray(packs)) return [];
    
    const newPacks = packs.filter(pack => {
      if (!pack.packId) return false;
      
      if (this.processedPackIds.has(pack.packId)) {
        this.stats.duplicatesSkipped++;
        return false;
      }
      
      // Adicionar ao cache de sessão
      this.sessionNewPacks.add(pack.packId);
      this.stats.newPacksFound++;
      return true;
    });

    info(`Filtro de duplicados: ${newPacks.length}/${packs.length} packs novos`);
    return newPacks;
  }

  /**
   * Endpoint leve otimizado - usa v1/sticker/recommend (53KB vs 780KB)
   */
  async getLightRecommendedPacks(category = null) {
    const url = category ? 
      `${this.baseURL}/v1/sticker/recommend?category=${category}` :
      `${this.baseURL}/v1/sticker/recommend`;

    const requestConfig = {
      method: 'GET',
      url,
      headers: {
        ...this.defaultHeaders,
        'x-duid': this.getNextDeviceId(),
        'User-Agent': this.getUserAgent()
      },
      timeout: 30000
    };

    try {
      const data = await this.makeRequest(requestConfig);
      this.stats.lightEndpointCalls++;
      this.stats.totalApiCalls++;
      this.stats.bytesReceived += JSON.stringify(data).length;

      if (data?.result?.items) {
        // Converter formato v1 para formato padrão
        const convertedPacks = data.result.items.map(item => ({
          packId: item.packId,
          name: item.packName,
          isAnimated: item.isAnimated,
          resourceFiles: [item.resourceUrl.split('/').pop()], // Extrair filename da URL
          resourceUrlPrefix: item.resourceUrl.substring(0, item.resourceUrl.lastIndexOf('/')),
          viewCount: item.viewCount,
          // Campos mínimos para compatibilidade
          authorName: 'unknown',
          exportCount: 0,
          isPaid: false,
          thumb: true,
          trayIndex: 0
        }));

        info(`Endpoint leve: ${convertedPacks.length} packs (${JSON.stringify(data).length} bytes)`, {
          category: category || 'none'
        });

        return this.filterNewPacks(convertedPacks);
      }
      
      return [];
    } catch (err) {
      error('Erro no endpoint leve', err, { category });
      return [];
    }
  }

  /**
   * Estratégia otimizada de recomendados com categorias
   */
  async getOptimizedRecommendedPacks(locale = 'pt-BR') {
    const shouldUseLightEndpoint = this.shouldUseLightEndpoint();
    const category = this.getRandomCategory();

    if (shouldUseLightEndpoint) {
      info('Usando endpoint leve otimizado', { category });
      return await this.getLightRecommendedPacks(category);
    } else {
      info('Usando endpoint completo', { category });
      // Usar endpoint original com categoria para diversificar
      const packs = await this.getRecommendedPacksWithCategory(locale, category);
      this.stats.fullEndpointCalls++;
      return this.filterNewPacks(packs);
    }
  }

  /**
   * Endpoint original com filtro de categoria
   */
  async getRecommendedPacksWithCategory(locale = 'pt-BR', category = null) {
    let url = config.scraping.apiUrls.recommend;
    
    if (category) {
      const separator = url.includes('?') ? '&' : '?';
      url += `${separator}category=${category}`;
      this.stats.categorizedCalls++;
    }

    const requestConfig = {
      method: 'GET',
      url,
      headers: {
        ...this.defaultHeaders,
        'x-duid': this.getNextDeviceId(),
        'User-Agent': this.getUserAgent(locale)
      },
      timeout: 30000
    };

    try {
      const data = await this.makeRequest(requestConfig);
      this.stats.totalApiCalls++;
      this.stats.bytesReceived += JSON.stringify(data).length;

      if (data?.result?.packs) {
        info(`Endpoint completo com categoria: ${data.result.packs.length} packs`, { category });
        return data.result.packs;
      }
      
      return [];
    } catch (err) {
      error('Erro no endpoint com categoria', err, { category, locale });
      return [];
    }
  }

  /**
   * Search otimizado com múltiplas estratégias
   */
  async getOptimizedSearchPacks(keyword, locale = 'pt-BR', maxPages = 3) {
    info(`Search otimizado para: ${keyword}`, { locale, maxPages });
    
    let allPacks = [];
    let cursor = 0;
    let emptyResponses = 0;
    const maxEmptyResponses = 2; // Reduzido para ser mais eficiente

    while (cursor < maxPages && emptyResponses < maxEmptyResponses) {
      try {
        // Usar método original mas com limite menor de páginas
        const packs = await this.searchPacks(keyword, cursor, locale);
        
        if (packs.length === 0) {
          emptyResponses++;
          info(`Página vazia para keyword: ${keyword} (${emptyResponses}/${maxEmptyResponses})`);
        } else {
          emptyResponses = 0;
          
          // Filtrar novos ANTES de processar
          const newPacks = this.filterNewPacks(packs);
          allPacks.push(...newPacks);
          
          info(`Search ${keyword} página ${cursor}: ${newPacks.length}/${packs.length} novos`);
          
          // Se não encontrou novos, pular próximas páginas desta keyword
          if (newPacks.length === 0) {
            info(`Sem novos packs para ${keyword}, pulando páginas restantes`);
            break;
          }
        }
        
        cursor++;
        await this.delay(1000); // Delay menor devido ao rate limiting suave descoberto
        
      } catch (err) {
        error(`Erro na página ${cursor} para keyword: ${keyword}`, err);
        emptyResponses++;
        cursor++;
      }
    }

    info(`Search completo para ${keyword}: ${allPacks.length} packs novos encontrados`);
    return allPacks;
  }

  /**
   * Estratégia de balanceamento entre endpoints
   */
  shouldUseLightEndpoint() {
    this.endpointStrategy.callCount++;
    
    switch (this.endpointStrategy.currentStrategy) {
      case 'light':
        return true;
      case 'full':
        return false;
      case 'mixed':
      default:
        // Alternar baseado na proporção configurada
        return (this.endpointStrategy.callCount % 10) < (this.endpointStrategy.lightEndpointRatio * 10);
    }
  }

  /**
   * Seleciona categoria aleatória das mais efetivas
   */
  getRandomCategory() {
    if (Math.random() < 0.3) return null; // 30% sem categoria
    
    const randomIndex = Math.floor(Math.random() * this.effectiveCategories.length);
    return this.effectiveCategories[randomIndex];
  }

  /**
   * Busca otimizada com múltiplas keywords em paralelo
   */
  async getBatchOptimizedSearch(keywords, locale = 'pt-BR', concurrency = 3) {
    info(`Busca em lote para ${keywords.length} keywords`, { locale, concurrency });
    
    const results = [];
    
    // Processar keywords em batches para não sobrecarregar
    for (let i = 0; i < keywords.length; i += concurrency) {
      const batch = keywords.slice(i, i + concurrency);
      
      const batchPromises = batch.map(keyword => 
        this.getOptimizedSearchPacks(keyword, locale, 2) // Máximo 2 páginas por keyword
      );
      
      try {
        const batchResults = await Promise.all(batchPromises);
        
        batchResults.forEach((packs, index) => {
          const keyword = batch[index];
          results.push({
            keyword,
            packs,
            count: packs.length
          });
        });
        
        info(`Batch ${Math.floor(i/concurrency) + 1} processado: ${batchResults.flat().length} packs novos`);
        
        // Delay entre batches
        if (i + concurrency < keywords.length) {
          await this.delay(2000);
        }
        
      } catch (err) {
        error(`Erro no batch ${Math.floor(i/concurrency) + 1}`, err);
      }
    }

    const totalPacks = results.reduce((sum, result) => sum + result.count, 0);
    info(`Busca em lote finalizada: ${totalPacks} packs novos de ${keywords.length} keywords`);
    
    return results;
  }

  /**
   * Estratégia inteligente de descoberta vs. eficiência
   */
  async getSmartMixedPacks(locale = 'pt-BR', discoveryRatio = 0.4) {
    info('Estratégia mista inteligente iniciada', { locale, discoveryRatio });
    
    const allPacks = [];
    
    // 1. Sempre começar com recomendados otimizados (high-yield, low-cost)
    const recommendedPacks = await this.getOptimizedRecommendedPacks(locale);
    allPacks.push(...recommendedPacks);
    
    // 2. Se descobriu muitos novos nos recomendados, focar mais em eficiência
    const adjustedDiscoveryRatio = recommendedPacks.length > 20 ? 
      discoveryRatio * 0.7 : // Reduzir exploração se já achou muitos
      discoveryRatio * 1.3;   // Aumentar exploração se achou poucos
    
    // 3. Busca por keywords baseada na taxa ajustada
    if (Math.random() < adjustedDiscoveryRatio) {
      info('Modo descoberta: usando keywords diversificadas');
      
      // Selecionar keywords estrategicamente
      const strategicKeywords = this.selectStrategicKeywords(4);
      const searchResults = await this.getBatchOptimizedSearch(strategicKeywords, locale, 2);
      
      searchResults.forEach(result => {
        allPacks.push(...result.packs);
      });
    } else {
      info('Modo eficiência: focando em categorias high-yield');
      
      // Usar apenas categorias mais produtivas com endpoint leve
      const highYieldCategories = ['amor', 'memes', 'emoji', 'cute'];
      for (const category of highYieldCategories) {
        const categoryPacks = await this.getLightRecommendedPacks(category);
        allPacks.push(...categoryPacks);
        
        if (allPacks.length > 50) break; // Limite para não exagerar
      }
    }

    info(`Estratégia mista finalizada: ${allPacks.length} packs novos descobertos`);
    return allPacks;
  }

  /**
   * Seleciona keywords estratégicas baseadas em trends e sazonalidade
   */
  selectStrategicKeywords(count = 4) {
    const currentMonth = new Date().getMonth() + 1;
    
    // Keywords sazonais
    const seasonalKeywords = {
      12: ['natal', 'christmas', 'ano-novo'], // Dezembro
      1: ['ano-novo', 'verão', 'férias'],    // Janeiro
      2: ['carnaval', 'amor', 'valentine'],   // Fevereiro
      6: ['festa-junina', 'brasil', 'inverno'], // Junho
      10: ['halloween', 'terror', 'primavera']  // Outubro
    };
    
    const seasonal = seasonalKeywords[currentMonth] || [];
    
    // Misturar seasonal com high-performing
    const highPerforming = ['memes', 'funny', 'anime', 'kpop', 'cute', 'love'];
    
    // Combinar e selecionar aleatoriamente
    const combined = [...seasonal, ...highPerforming];
    const shuffled = combined.sort(() => 0.5 - Math.random());
    
    return shuffled.slice(0, count);
  }

  /**
   * Estatísticas de performance da otimização
   */
  getOptimizationStats() {
    const totalCalls = this.stats.lightEndpointCalls + this.stats.fullEndpointCalls;
    const avgBytesPerCall = totalCalls > 0 ? this.stats.bytesReceived / totalCalls : 0;
    
    return {
      ...this.stats,
      totalCalls,
      avgBytesPerCall: Math.round(avgBytesPerCall),
      duplicateSkipRate: totalCalls > 0 ? (this.stats.duplicatesSkipped / (this.stats.duplicatesSkipped + this.stats.newPacksFound)) * 100 : 0,
      lightEndpointUsage: totalCalls > 0 ? (this.stats.lightEndpointCalls / totalCalls) * 100 : 0
    };
  }

  /**
   * Log de estatísticas de otimização
   */
  logOptimizationStats() {
    const stats = this.getOptimizationStats();
    
    info('📊 Estatísticas de Otimização:');
    info(`   API Calls: ${stats.totalCalls} (${stats.lightEndpointCalls} leves, ${stats.fullEndpointCalls} completas)`);
    info(`   Dados recebidos: ${(stats.bytesReceived / 1024 / 1024).toFixed(1)} MB`);
    info(`   Média por call: ${(stats.avgBytesPerCall / 1024).toFixed(1)} KB`);
    info(`   Endpoint leve: ${stats.lightEndpointUsage.toFixed(1)}% das calls`);
    info(`   Calls categorizadas: ${stats.categorizedCalls}`);
    info(`   Duplicados pulados: ${stats.duplicatesSkipped}`);
    info(`   Novos descobertos: ${stats.newPacksFound}`);
    info(`   Taxa de skip: ${stats.duplicateSkipRate.toFixed(1)}%`);
  }
}

module.exports = OptimizedStickerlyClient;
/**
 * DISCOVERY WORKER
 * Responsável por descobrir novos packs na API do Sticker.ly
 * Baseado na lógica original da API
 */

const StickerlyClient = require('../services/stickerlyClient');
const SupabaseClient = require('../services/supabaseClient');
const PackCache = require('../services/packCache');
const KeywordStrategist = require('../services/keywordStrategist');
const { 
  info, error, warn, 
  discoveryStart, discoveryPhaseComplete, keywordStarted, keywordCompleted, 
  discoveryStats, apiResponse, keywordExtracted, cachePerformance 
} = require('../utils/logger');

class DiscoveryWorker {
  constructor(parentPort, config) {
    this.parentPort = parentPort;
    this.config = config;
    this.stickerlyClient = new StickerlyClient();
    this.supabaseClient = new SupabaseClient();
    this.packCache = new PackCache(this.supabaseClient);
    this.isRunning = false;
    
    // Estados da descoberta
    this.currentLocale = 0;
    this.currentPage = 0;
    this.locales = ['pt-BR']; // Locale brasileiro
    this.lastDiscoveryTime = 0;
    this.discoveryInterval = 30000; // 30 segundos entre rounds
    
    // Novo sistema de descoberta baseado na análise da API
    this.keywordStrategist = new KeywordStrategist();
    this.discoveryPhase = 'recommend'; // 'recommend' | 'search'
    this.currentKeyword = null;
    this.currentCursor = 0;
    this.maxCursorsPerKeyword = 50; // Baseado na análise - cada keyword tem ~50 páginas úteis
    this.packStats = {
      recommend: { total: 0, new: 0 },
      search: { total: 0, new: 0, keywords: 0 }
    };
  }

  async initialize() {
    await this.packCache.initialize();
    info('🔍 Discovery Worker inicializado');
  }

  async start() {
    this.isRunning = true;
    await this.initialize();
    this.discoveryLoop();
  }

  async discoveryLoop() {
    while (this.isRunning) {
      try {
        const now = Date.now();
        
        // Verificar se é hora de uma nova descoberta
        if (now - this.lastDiscoveryTime >= this.discoveryInterval) {
          await this.discoverPacks();
          this.lastDiscoveryTime = now;
        }
        
        // Pequena pausa para não sobrecarregar
        await this.sleep(5000);
        
      } catch (err) {
        error('❌ Erro no discovery loop:', err);
        this.parentPort.postMessage({
          type: 'error',
          error: err.message
        });
        
        // Pausa maior em caso de erro
        await this.sleep(10000);
      }
    }
  }

  async discoverPacks() {
    const locale = this.locales[this.currentLocale];
    
    discoveryStart(this.discoveryPhase, locale);
    
    try {
      if (this.discoveryPhase === 'recommend') {
        await this.discoverWithRecommend(locale);
      } else {
        await this.discoverWithSearch(locale);
      }
      
    } catch (err) {
      error(`❌ Erro na descoberta:`, err);
      this.parentPort.postMessage({
        type: 'error',
        error: err.message
      });
      
      this.nextPhase();
    }
  }

  /**
   * Descoberta usando API Recommend (Phase 1)
   * Baseado na análise: sempre retorna os mesmos 577 packs fixos
   */
  async discoverWithRecommend(locale) {
    info(`📋 Descoberta Recommend - Página: ${this.currentPage}`);
    
    const startTime = Date.now();
    
    // Buscar packs recomendados (sem paginação - sempre os mesmos 577)
    const packs = await this.stickerlyClient.getRecommendedPacks(locale, 0);
    
    if (!packs || packs.length === 0) {
      warn('📄 Nenhum pack recomendado encontrado - migrando para Search API');
      this.discoveryPhase = 'search';
      return;
    }
    
    // Filtrar novos packs com métricas de performance
    const filterStartTime = Date.now();
    const newPacks = this.packCache.filterNewPacks(packs);
    const filterTime = Date.now() - filterStartTime;
    
    this.packStats.recommend.total = packs.length;
    this.packStats.recommend.new = newPacks.length;
    
    // Log da resposta da API
    apiResponse('recommend', null, 0, packs.length, newPacks.length > 0);
    
    // Log de performance do cache
    cachePerformance('filter', packs.length, filterTime, (packs.length - newPacks.length) / packs.length);
    
    info(`📦 Recommend: ${packs.length} total, ${newPacks.length} novos`);
    
    // Processar novos packs
    await this.processFoundPacks(newPacks, 'recommend', locale);
    
    // Completar fase recommend
    discoveryPhaseComplete('recommend', this.packStats.recommend);
    
    // Recommend API sempre retorna mesmo resultado - migrar para Search
    info('✅ Recommend completo - migrando para Search API');
    this.discoveryPhase = 'search';
    this.currentKeyword = null;
    this.currentCursor = 0;
  }

  /**
   * Descoberta usando Search API (Phase 2)
   * Baseado na análise: cada keyword+cursor = 100 packs únicos
   */
  async discoverWithSearch(locale) {
    // Obter próxima keyword se necessário
    if (!this.currentKeyword) {
      this.currentKeyword = this.keywordStrategist.getNextKeyword();
      this.currentCursor = 0;
      this.packStats.search.keywords++;
      
      // Log início da keyword
      keywordStarted(this.currentKeyword, this.keywordStrategist.currentTier, this.currentCursor);
    }
    
    info(`🔍 Search: keyword="${this.currentKeyword}", cursor=${this.currentCursor}`);
    
    const startTime = Date.now();
    
    // Buscar packs por keyword
    const packs = await this.stickerlyClient.searchPacks(this.currentKeyword, this.currentCursor, locale);
    
    if (!packs || packs.length === 0) {
      info(`📄 Nenhum pack encontrado para keyword: ${this.currentKeyword}`);
      
      // Log keyword completa se não há mais resultados
      keywordCompleted(this.currentKeyword, 0, 0, this.currentCursor);
      
      this.nextKeyword();
      return;
    }
    
    // Filtrar novos packs com métricas
    const filterStartTime = Date.now();
    const newPacks = this.packCache.filterNewPacks(packs);
    const filterTime = Date.now() - filterStartTime;
    
    this.packStats.search.total += packs.length;
    this.packStats.search.new += newPacks.length;
    
    // Log da resposta da API
    apiResponse('search', this.currentKeyword, this.currentCursor, packs.length, newPacks.length > 0);
    
    // Log de performance do cache
    cachePerformance('filter', packs.length, filterTime, (packs.length - newPacks.length) / packs.length);
    
    info(`📦 Search "${this.currentKeyword}": ${packs.length} total, ${newPacks.length} novos`);
    
    // Reportar sucesso ao strategist
    if (newPacks.length > 0) {
      this.keywordStrategist.reportSuccess(this.currentKeyword, newPacks.length);
      
      // Extrair novas keywords dos packs encontrados
      const extractedKeywords = this.keywordStrategist.extractKeywordsFromPacks(packs);
      if (extractedKeywords.length > 0) {
        keywordExtracted(packs.length, extractedKeywords.length, extractedKeywords);
      }
    }
    
    // Processar novos packs
    await this.processFoundPacks(newPacks, 'search', locale, this.currentKeyword);
    
    // Avançar cursor ou próxima keyword
    this.currentCursor++;
    
    // Limite de cursors por keyword baseado na análise
    if (this.currentCursor >= this.maxCursorsPerKeyword || packs.length < 100) {
      // Log keyword completa
      const keywordStats = this.keywordStrategist.keywordStats.get(this.currentKeyword) || { found: 0 };
      keywordCompleted(this.currentKeyword, 
        keywordStats.totalProcessed || this.currentCursor * 100, 
        keywordStats.found, 
        this.currentCursor
      );
      
      info(`✅ Keyword "${this.currentKeyword}" completa (cursor: ${this.currentCursor})`);
      this.nextKeyword();
    }
  }

  /**
   * Processa packs encontrados
   */
  async processFoundPacks(newPacks, source, locale, keyword = null) {
    for (const pack of newPacks) {
      if (this.isValidPack(pack)) {
        // Normalizar dados do pack baseado na estrutura da API
        const normalizedPack = this.normalizePack(pack, source, locale, keyword);
        
        info(`✅ Pack válido enviado: ${normalizedPack.identifier}`);
        this.parentPort.postMessage({
          type: 'pack_found',
          pack: normalizedPack
        });
      } else {
        warn(`❌ Pack inválido rejeitado: ${pack.packId || pack.identifier} (${pack.name || pack.title})`);
      }
    }
  }

  /**
   * Normaliza dados do pack para formato consistente
   */
  normalizePack(pack, source, locale, keyword) {
    return {
      identifier: pack.packId || pack.identifier,
      name: pack.name || pack.title,
      author: pack.authorName || pack.publisher || pack.author || 'Autor Desconhecido',
      isAnimated: pack.isAnimated || pack.animated || false,
      language: locale,
      stickerCount: pack.stickerCount || (pack.resourceFiles ? pack.resourceFiles.length : 0),
      resourceUrlPrefix: pack.resourceUrlPrefix,
      resourceFiles: pack.resourceFiles || [],
      trayImageFile: pack.trayImageFile,
      // Metadados da descoberta
      discoverySource: source,
      discoveryKeyword: keyword,
      discoveryTimestamp: new Date().toISOString(),
      viewCount: pack.viewCount || 0
    };
  }

  /**
   * Avança para próxima keyword
   */
  nextKeyword() {
    this.currentKeyword = null;
    this.currentCursor = 0;
  }

  isValidPack(pack) {
    // Validações baseadas na API original + melhorias
    const packId = pack.packId || pack.identifier;
    const packName = pack.name || pack.title;
    const author = pack.authorName || pack.publisher || pack.author;
    const stickerCount = pack.stickerCount || (pack.resourceFiles ? pack.resourceFiles.length : 0);
    
    if (!packId || !packName) {
      return false;
    }
    
    if (!stickerCount || stickerCount < 3 || stickerCount > 30) {
      return false;
    }
    
    if (!pack.resourceFiles || pack.resourceFiles.length === 0) {
      return false;
    }
    
    // Nome deve ter pelo menos 2 caracteres úteis
    if (packName.trim().length < 2) {
      return false;
    }
    
    return true;
  }

  nextPhase() {
    if (this.discoveryPhase === 'recommend') {
      this.discoveryPhase = 'search';
      this.currentKeyword = null;
      this.currentCursor = 0;
      info('🔄 Fase Recommend completa - iniciando Search');
    } else {
      // Completou um ciclo completo, reportar estatísticas
      this.reportDiscoveryStats();
      
      // Pequena pausa e reiniciar no recommend
      this.discoveryPhase = 'recommend';
      this.currentPage = 0;
      
      this.parentPort.postMessage({
        type: 'discovery_cycle_complete',
        stats: this.packStats
      });
      
      // Reset estatísticas para próximo ciclo
      this.packStats = {
        recommend: { total: 0, new: 0 },
        search: { total: 0, new: 0, keywords: 0 }
      };
      
      // Pausa maior entre ciclos completos
      this.lastDiscoveryTime = Date.now() + 300000; // 5 minutos
    }
  }

  /**
   * Reporta estatísticas da descoberta
   */
  reportDiscoveryStats() {
    const totalFound = this.packStats.recommend.total + this.packStats.search.total;
    const totalNew = this.packStats.recommend.new + this.packStats.search.new;
    const keywordStats = this.keywordStrategist.getStats();
    
    const cycleStats = {
      recommend: this.packStats.recommend,
      search: {
        ...this.packStats.search,
        avgPerKeyword: (this.packStats.search.total / Math.max(this.packStats.search.keywords, 1)).toFixed(1)
      },
      totals: { found: totalFound, new: totalNew },
      efficiency: totalFound > 0 ? ((totalNew / totalFound) * 100).toFixed(1) + '%' : '0%'
    };
    
    // Usar método específico de logging para estatísticas
    discoveryStats(cycleStats, keywordStats);
    
    info('📊 ESTATÍSTICAS DO CICLO DE DESCOBERTA', cycleStats);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
  }
}

module.exports = {
  run: (parentPort, config) => {
    const worker = new DiscoveryWorker(parentPort, config);
    worker.start();
    
    // Escutar comandos do processo principal
    parentPort.on('message', (message) => {
      switch (message.type) {
        case 'stop':
          worker.stop();
          break;
      }
    });
  }
};
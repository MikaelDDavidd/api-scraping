const PackProcessor = require('./packProcessor');
const SearchCache = require('./searchCache');
const log = require('../utils/betterLogger');
const chalk = require('chalk');
const { config } = require('../config/config');

class EnhancedPackProcessor extends PackProcessor {
  constructor() {
    super();
    this.searchCache = new SearchCache();
    this.stats = {
      packsProcessed: 0,
      newPacks: 0,
      duplicatesSkipped: 0,
      pagesSkipped: 0,
      startTime: Date.now()
    };
  }

  /**
   * Carrega cache de packs existentes
   */
  async loadCache() {
    log.info('🔄 Carregando cache de packs existentes...');
    
    // Carregar cache de duplicados usando o método correto
    await this.fastDuplicateChecker.loadExistingPacksCache();
    log.success(`Cache carregado: ${this.fastDuplicateChecker.existingPackIds.size} packs existentes`);
  }

  /**
   * Processa busca por keyword com cache inteligente
   */
  async processKeywordSearch(keyword, locale, maxPacks = 50) {
    // Verificar informações do cache
    const cacheInfo = this.searchCache.getSearchInfo(keyword, locale);
    
    if (cacheInfo.pagesSearched.length > 0) {
      log.info(`📂 Cache encontrado para "${keyword}"`, {
        pagesProcessed: cacheInfo.pagesSearched.length,
        lastSearch: new Date(cacheInfo.lastSearch).toLocaleDateString()
      });
    }

    let allPacks = [];
    let cursor = 0;
    let emptyPagesCount = 0;
    let totalProcessed = 0;

    // Determinar onde começar baseado no cache
    if (cacheInfo.pagesSearched.length > 0) {
      // Encontrar a próxima página não processada
      const maxPage = Math.max(...cacheInfo.pagesSearched);
      cursor = maxPage + 1;
      log.info(`⏩ Pulando para página ${cursor} (páginas 0-${maxPage} já processadas)`);
      this.stats.pagesSkipped = maxPage + 1;
    }

    while (allPacks.length < maxPacks && cursor < config.scraping.maxPagesPerKeyword) {
      // Verificar se já processamos esta página
      if (this.searchCache.hasSearched(keyword, locale, cursor)) {
        log.debug(`Página ${cursor} já processada, pulando...`);
        cursor++;
        this.stats.pagesSkipped++;
        continue;
      }

      try {
        // Mostrar progresso
        log.progress(cursor, config.scraping.maxPagesPerKeyword, 
          `Buscando "${keyword}" página ${cursor}`);

        const packs = await this.stickerlyClient.searchPacks(keyword, locale, cursor);
        
        if (!packs || packs.length === 0) {
          emptyPagesCount++;
          if (emptyPagesCount >= config.scraping.maxEmptyPagesConsecutive) {
            log.info(`🏁 Fim da busca: ${emptyPagesCount} páginas vazias consecutivas`);
            break;
          }
        } else {
          emptyPagesCount = 0;
          
          // Filtrar duplicados
          const newPacks = await this.filterNewPacks(packs);
          allPacks.push(...newPacks);
          
          // Marcar página como processada no cache
          this.searchCache.markSearched(keyword, locale, cursor, {
            packsFound: packs.length,
            newPacks: newPacks.length
          });
          
          totalProcessed += packs.length;
          
          if (newPacks.length > 0) {
            log.success(`Página ${cursor}: ${newPacks.length} novos packs encontrados`);
          }
        }
        
        cursor++;
        
        // Delay entre requisições
        await this.delay(config.scraping.delayBetweenRequests);
        
      } catch (err) {
        log.error(`Erro na página ${cursor}`, err);
        cursor++;
      }
    }

    // Estatísticas finais
    log.info(`\n📊 Resumo da busca "${keyword}":`, {
      totalPagesProcessed: cursor - this.stats.pagesSkipped,
      pagesFromCache: this.stats.pagesSkipped,
      newPacks: allPacks.length,
      totalAnalyzed: totalProcessed
    });

    return allPacks.slice(0, maxPacks);
  }

  /**
   * Filtra packs novos usando cache ultra-rápido
   */
  async filterNewPacks(packs) {
    const startTime = Date.now();
    const newPacks = [];
    
    for (const pack of packs) {
      const exists = this.fastDuplicateChecker.existingPackIds.has(pack.identifier);
      
      if (!exists) {
        newPacks.push(pack);
        this.stats.newPacks++;
      } else {
        this.stats.duplicatesSkipped++;
      }
    }
    
    const duration = Date.now() - startTime;
    
    if (newPacks.length > 0) {
      log.debug(`Filtro: ${newPacks.length}/${packs.length} novos (${duration}ms)`);
    }
    
    return newPacks;
  }

  /**
   * Processa packs com logs limpos
   */
  async processPack(packData) {
    try {
      const packId = packData.identifier;
      
      // Log simples de início
      console.log(chalk.cyan(`\n📦 Processando: ${packData.name} (${packId})`));
      
      // Processar normalmente
      const result = await super.processPack(packData);
      
      if (result) {
        this.stats.packsProcessed++;
        console.log(chalk.green(`✅ ${packData.name} salvo com sucesso!`));
      }
      
      return result;
      
    } catch (err) {
      log.error(`Falha ao processar ${packData.name}`, err);
      return null;
    }
  }

  /**
   * Finaliza sessão com estatísticas
   */
  async finishSession() {
    // Limpar cache antigo
    const removed = this.searchCache.clearOldEntries();
    if (removed > 0) {
      log.info(`🧹 ${removed} entradas antigas removidas do cache`);
    }

    // Calcular estatísticas finais
    const duration = Date.now() - this.stats.startTime;
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    
    this.stats.duration = `${minutes}m ${seconds}s`;
    this.stats.successRate = this.stats.packsProcessed > 0 
      ? Math.round((this.stats.packsProcessed / (this.stats.packsProcessed + this.stats.duplicatesSkipped)) * 100)
      : 0;

    // Mostrar estatísticas
    log.stats(this.stats);
    
    // Salvar estatísticas da sessão (se disponível)
    if (this.sessionStats && typeof this.sessionStats.endSession === 'function') {
      await this.sessionStats.endSession('completed', {
        ...this.stats,
        cacheStats: this.searchCache.getStats()
      });
    }
  }

  /**
   * Processa packs recomendados
   */
  async processRecommendedPacks(locale) {
    try {
      log.info('🌟 Buscando packs recomendados...');
      
      // Chamar método da classe pai
      if (super.processRecommendedPacks) {
        return await super.processRecommendedPacks(locale);
      }
      
      // Implementação alternativa se não existir na classe pai
      const packs = await this.stickerlyClient.getRecommendedPacks(locale);
      const newPacks = await this.filterNewPacks(packs);
      
      log.success(`${newPacks.length} novos packs recomendados encontrados`);
      return newPacks;
      
    } catch (err) {
      log.error('Erro ao processar packs recomendados', err);
      return [];
    }
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = EnhancedPackProcessor;
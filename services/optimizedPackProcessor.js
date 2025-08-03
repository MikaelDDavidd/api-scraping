const PackProcessor = require('./packProcessor');
const OptimizedStickerlyClient = require('./optimizedStickerlyClient');
const { config } = require('../config/config');
const { info, error, warn } = require('../utils/logger');

class OptimizedPackProcessor extends PackProcessor {
  constructor() {
    super();
    
    // Usar client otimizado
    this.stickerlyClient = new OptimizedStickerlyClient();
    
    // Estratégias de otimização
    this.optimizationSettings = {
      maxNewPacksPerSession: 100,        // Limite de novos packs por sessão
      duplicateThreshold: 0.8,           // Se 80% são duplicados, mudar estratégia
      efficientModeThreshold: 50,        // Ativar modo eficiente após 50 duplicados consecutivos
      discoveryBoostThreshold: 10        // Boost descoberta se poucos novos encontrados
    };
    
    // Controle de estado da otimização
    this.optimizationState = {
      isEfficientMode: false,
      consecutiveDuplicates: 0,
      newPacksThisSession: 0,
      totalPacksProcessed: 0,
      lastStrategySwitch: Date.now()
    };
  }

  /**
   * Override do método original com otimizações
   */
  async loadExistingPacksCache() {
    await super.loadExistingPacksCache();
    
    // Carregar cache no client otimizado
    const existingIds = Array.from(this.existingPackIds);
    await this.stickerlyClient.loadExistingPacksCache(existingIds);
    
    info(`Cache otimizado carregado: ${existingIds.length} packs existentes`);
  }

  /**
   * Processamento otimizado de packs recomendados
   */
  async processOptimizedRecommendedPacks(locale = 'pt-BR') {
    if (!config.scraping.useRecommendedPacks) {
      info('Processamento de packs recomendados desabilitado');
      return this.createEmptyResult();
    }

    info(`Processando packs recomendados otimizados`, { locale });
    
    const startTime = Date.now();

    try {
      // Usar estratégia inteligente do client otimizado
      const discoveryRatio = this.calculateDiscoveryRatio();
      const packs = await this.stickerlyClient.getSmartMixedPacks(locale, discoveryRatio);

      if (!packs || packs.length === 0) {
        info('Nenhum pack recomendado encontrado (otimizado)', { locale });
        return this.createEmptyResult();
      }

      // Packs já foram filtrados no client otimizado
      info(`Processando ${packs.length} packs recomendados otimizados`, {
        locale,
        duplicatesFiltered: 'yes'
      });

      const result = await this.processBatchPacks(packs, 'recommended', locale);
      
      // Atualizar estado de otimização
      this.updateOptimizationState(result);
      
      const duration = Date.now() - startTime;
      info(`Resultado packs recomendados otimizados para ${locale}:`, {
        ...result,
        durationMs: duration,
        efficiencyMode: this.optimizationState.isEfficientMode
      });

      return result;
      
    } catch (err) {
      error('Erro no processamento otimizado de recomendados', err, { locale });
      return this.createEmptyResult();
    }
  }

  /**
   * Processamento em lote otimizado
   */
  async processBatchPacks(packs, source, locale) {
    const result = this.createEmptyResult();
    const batchSize = this.optimizationState.isEfficientMode ? 5 : 3; // Lotes maiores em modo eficiente
    
    info(`Processando ${packs.length} packs em lotes de ${batchSize}`, { source, locale });

    for (let i = 0; i < packs.length; i += batchSize) {
      const batch = packs.slice(i, i + batchSize);
      
      // Verificar timeout mais frequentemente
      if (this.isTimeoutReached()) {
        info('🛑 Timeout atingido durante processamento em lote', {
          processed: i,
          total: packs.length,
          source
        });
        break;
      }

      // Verificar limite de novos packs
      if (this.optimizationState.newPacksThisSession >= this.optimizationSettings.maxNewPacksPerSession) {
        info('🎯 Limite de novos packs atingido, finalizando sessão', {
          newPacks: this.optimizationState.newPacksThisSession,
          limit: this.optimizationSettings.maxNewPacksPerSession
        });
        break;
      }

      // Processar lote
      const batchResults = await Promise.allSettled(
        batch.map(pack => this.processIndividualPack(pack, source, locale))
      );

      // Consolidar resultados
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          if (result.value.isNew) {
            result.successful++;
            this.optimizationState.newPacksThisSession++;
            this.optimizationState.consecutiveDuplicates = 0;
          } else {
            result.existing++;
            this.optimizationState.consecutiveDuplicates++;
          }
        } else {
          result.failed++;
          error(`Erro no pack do lote`, result.reason, { 
            pack: batch[index]?.packId,
            source 
          });
        }
      });

      // Ajustar delay baseado no modo
      const delay = this.optimizationState.isEfficientMode ? 
        config.scraping.delayBetweenRequests * 0.7 : // Delay menor em modo eficiente
        config.scraping.delayBetweenRequests;
      
      await this.delay(delay);

      // Log de progresso otimizado
      if ((i + batchSize) % 15 === 0 || i + batchSize >= packs.length) {
        info(`Progresso: ${Math.min(i + batchSize, packs.length)}/${packs.length} packs processados`, {
          source,
          newThisSession: this.optimizationState.newPacksThisSession,
          consecutiveDuplicates: this.optimizationState.consecutiveDuplicates,
          efficiencyMode: this.optimizationState.isEfficientMode
        });
      }
    }

    return result;
  }

  /**
   * Processamento otimizado por keywords
   */
  async processOptimizedKeywordPacks(keywords, locale = 'pt-BR') {
    info(`Processando keywords otimizadas`, { 
      keywords: keywords.length, 
      locale,
      efficiencyMode: this.optimizationState.isEfficientMode
    });

    const result = this.createEmptyResult();

    // Selecionar keywords estrategicamente baseado no estado
    const selectedKeywords = this.selectOptimalKeywords(keywords);
    
    for (const keyword of selectedKeywords) {
      if (this.isTimeoutReached()) {
        info('🛑 Timeout atingido durante processamento de keywords');
        break;
      }

      if (this.optimizationState.newPacksThisSession >= this.optimizationSettings.maxNewPacksPerSession) {
        info('🎯 Limite de novos packs atingido nas keywords');
        break;
      }

      try {
        info(`Processando keyword otimizada: "${keyword}"`, { locale });

        // Usar busca otimizada
        const maxPages = this.optimizationState.isEfficientMode ? 2 : 3;
        const packs = await this.stickerlyClient.getOptimizedSearchPacks(keyword, locale, maxPages);

        if (packs.length === 0) {
          info(`Nenhum pack novo encontrado para keyword: ${keyword}`);
          continue;
        }

        const keywordResult = await this.processBatchPacks(packs, 'keyword', locale);
        
        // Consolidar resultado
        result.successful += keywordResult.successful;
        result.failed += keywordResult.failed;
        result.existing += keywordResult.existing;

        info(`Keyword "${keyword}" finalizada`, {
          ...keywordResult,
          newThisSession: this.optimizationState.newPacksThisSession
        });

        // Delay adaptativo entre keywords
        const keywordDelay = this.optimizationState.isEfficientMode ? 1000 : 2000;
        await this.delay(keywordDelay);

      } catch (err) {
        error(`Erro no processamento da keyword: ${keyword}`, err);
        result.failed++;
      }
    }

    return result;
  }

  /**
   * Calcula taxa de descoberta baseada no estado atual
   */
  calculateDiscoveryRatio() {
    const baseRatio = 0.4; // 40% padrão
    
    // Aumentar descoberta se poucos novos encontrados
    if (this.optimizationState.newPacksThisSession < this.optimizationSettings.discoveryBoostThreshold) {
      return Math.min(baseRatio * 1.5, 0.8); // Max 80%
    }
    
    // Diminuir descoberta se muitos duplicados
    if (this.optimizationState.consecutiveDuplicates > this.optimizationSettings.efficientModeThreshold) {
      return baseRatio * 0.5; // 20%
    }
    
    return baseRatio;
  }

  /**
   * Seleciona keywords otimais baseado no estado
   */
  selectOptimalKeywords(keywords) {
    if (this.optimizationState.isEfficientMode) {
      // Modo eficiente: usar apenas keywords high-yield
      const highYieldKeywords = ['amor', 'memes', 'emoji', 'funny', 'cute'];
      return keywords.filter(k => highYieldKeywords.includes(k)).slice(0, 3);
    } else {
      // Modo descoberta: usar mix estratégico
      const shuffled = [...keywords].sort(() => 0.5 - Math.random());
      return shuffled.slice(0, Math.min(keywords.length, 5));
    }
  }

  /**
   * Atualiza estado de otimização baseado nos resultados
   */
  updateOptimizationState(result) {
    this.optimizationState.totalPacksProcessed += result.successful + result.failed + result.existing;
    
    // Calcular taxa de duplicados
    const totalFound = result.successful + result.existing;
    const duplicateRate = totalFound > 0 ? result.existing / totalFound : 0;
    
    // Ativar modo eficiente se muitos duplicados
    const shouldEnterEfficientMode = 
      duplicateRate > this.optimizationSettings.duplicateThreshold ||
      this.optimizationState.consecutiveDuplicates > this.optimizationSettings.efficientModeThreshold;
    
    // Desativar modo eficiente se encontrou muitos novos recentemente
    const shouldExitEfficientMode = 
      this.optimizationState.isEfficientMode && 
      this.optimizationState.newPacksThisSession > this.optimizationSettings.discoveryBoostThreshold &&
      this.optimizationState.consecutiveDuplicates < 10;

    if (shouldEnterEfficientMode && !this.optimizationState.isEfficientMode) {
      info('🔄 Ativando modo eficiente', { 
        duplicateRate: (duplicateRate * 100).toFixed(1) + '%',
        consecutiveDuplicates: this.optimizationState.consecutiveDuplicates
      });
      this.optimizationState.isEfficientMode = true;
      this.optimizationState.lastStrategySwitch = Date.now();
    }
    
    if (shouldExitEfficientMode) {
      info('🔄 Desativando modo eficiente', {
        newPacksFound: this.optimizationState.newPacksThisSession,
        consecutiveDuplicates: this.optimizationState.consecutiveDuplicates
      });
      this.optimizationState.isEfficientMode = false;
      this.optimizationState.lastStrategySwitch = Date.now();
    }
  }

  /**
   * Scraping completo otimizado
   */
  async runOptimizedScraping(keywords = []) {
    info('🚀 Iniciando scraping otimizado');
    
    await this.loadExistingPacksCache();
    
    const finalResult = this.createEmptyResult();
    
    // 1. Processar recomendados otimizados
    for (const locale of config.scraping.locales) {
      const recommendedResult = await this.processOptimizedRecommendedPacks(locale.locale);
      this.mergeResults(finalResult, recommendedResult);
      
      // Parar se já encontrou muitos
      if (this.optimizationState.newPacksThisSession >= this.optimizationSettings.maxNewPacksPerSession) {
        info('Limite de novos packs atingido nos recomendados');
        break;
      }
    }

    // 2. Processar keywords apenas se necessário
    if (this.optimizationState.newPacksThisSession < this.optimizationSettings.maxNewPacksPerSession && 
        keywords.length > 0) {
      
      for (const locale of config.scraping.locales) {
        const keywordResult = await this.processOptimizedKeywordPacks(keywords, locale.locale);
        this.mergeResults(finalResult, keywordResult);
        
        if (this.optimizationState.newPacksThisSession >= this.optimizationSettings.maxNewPacksPerSession) {
          break;
        }
      }
    }

    // 3. Log de estatísticas
    this.stickerlyClient.logOptimizationStats();
    this.logOptimizationSummary();

    return finalResult;
  }

  /**
   * Merge de resultados
   */
  mergeResults(target, source) {
    target.successful += source.successful;
    target.failed += source.failed;
    target.existing += source.existing;
  }

  /**
   * Log do resumo de otimização
   */
  logOptimizationSummary() {
    const clientStats = this.stickerlyClient.getOptimizationStats();
    
    info('🎯 Resumo da Otimização:');
    info(`   Novos packs encontrados: ${this.optimizationState.newPacksThisSession}`);
    info(`   Total processado: ${this.optimizationState.totalPacksProcessed}`);
    info(`   Modo eficiente: ${this.optimizationState.isEfficientMode ? 'ATIVO' : 'INATIVO'}`);
    info(`   Duplicados consecutivos: ${this.optimizationState.consecutiveDuplicates}`);
    info(`   Taxa de economia: ${((clientStats.duplicatesSkipped / (clientStats.duplicatesSkipped + clientStats.newPacksFound)) * 100).toFixed(1)}%`);
    info(`   Endpoint leve usado: ${clientStats.lightEndpointUsage.toFixed(1)}% das vezes`);
  }

  /**
   * Método público para usar otimização
   */
  async runFullOptimizedScraping(keywords) {
    return await this.runOptimizedScraping(keywords);
  }
}

module.exports = OptimizedPackProcessor;
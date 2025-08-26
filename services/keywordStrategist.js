/**
 * KEYWORD STRATEGIST
 * Baseado na análise completa da API do Sticker.ly
 * Gerencia keywords estratégicas para descoberta otimizada
 */

const { info, warn } = require('../utils/logger');

class KeywordStrategist {
  constructor() {
    this.currentTier = 1;
    this.currentKeywordIndex = 0;
    this.usedKeywords = new Set();
    this.keywordStats = new Map(); // keyword -> { found: number, lastUsed: timestamp }
    
    this.initializeKeywords();
  }

  initializeKeywords() {
    // Baseado na análise da API STICKER_LY_API_ANALYSIS.md
    this.keywordTiers = {
      // TIER 1 - SUPER HIGH VOLUME (Essenciais) - Testados e funcionais
      1: [
        'meme', 'brasil', 'brasileiro', 'amor', 'futebol', 'flamengo', 
        'corinthians', 'palmeiras', 'anime', 'cute', 'fofo', 'gato',
        'cachorro', 'engraçado', 'feliz', 'triste', 'música', 'funk'
      ],
      
      // TIER 2 - HIGH VOLUME (Estratégicas)
      2: [
        'anitta', 'xuxa', 'novela', 'globo', 'familia', 'trabalho',
        'segunda', 'sexta', 'fim de semana', 'carnaval', 'festa',
        'natal', 'whatsapp', 'pokemon', 'naruto', 'kawaii'
      ],
      
      // TIER 3 - MEDIUM VOLUME (Complementares) 
      3: [
        'escola', 'casa', 'amigo', 'relacionamento', 'café',
        'churrasco', 'cerveja', 'comida', 'instagram', 'tiktok',
        'game', 'viral', 'trending', 'nordeste', 'carioca', 'paulista'
      ],
      
      // TIER 4 - COMBINAÇÕES ESTRATÉGICAS (Massive Volume)
      4: [
        'meme gato', 'meme cachorro', 'meme futebol', 'meme brasileiro',
        'emoji triste', 'emoji feliz', 'brasil futebol', 'amor coração',
        'anime kawaii', 'música brasileira', 'cultura brasileira'
      ]
    };

    // Keywords testadas e confirmadas funcionais
    this.testedWorkingKeywords = [
      'meme', 'brasil', 'anime', 'amor', 'funny', 'cats',
      'dogs', 'emoji', 'reaction', 'cute', 'sad', 'happy'
    ];

    info('🎯 Keyword Strategist inicializado', {
      tier1: this.keywordTiers[1].length,
      tier2: this.keywordTiers[2].length, 
      tier3: this.keywordTiers[3].length,
      tier4: this.keywordTiers[4].length,
      totalKeywords: this.getTotalKeywordCount(),
      testedWorking: this.testedWorkingKeywords.length
    });
  }

  /**
   * Obtém próxima keyword estratégica
   */
  getNextKeyword() {
    const currentTierKeywords = this.keywordTiers[this.currentTier];
    
    if (!currentTierKeywords || this.currentKeywordIndex >= currentTierKeywords.length) {
      // Avançar para próximo tier ou resetar
      this.currentTier++;
      this.currentKeywordIndex = 0;
      
      if (!this.keywordTiers[this.currentTier]) {
        // Voltar para tier 1 e reiniciar ciclo
        this.currentTier = 1;
        info('🔄 Reiniciando ciclo de keywords - Tier 1');
      }
      
      return this.getNextKeyword();
    }

    const keyword = currentTierKeywords[this.currentKeywordIndex];
    this.currentKeywordIndex++;

    // Atualizar estatísticas
    const stats = this.keywordStats.get(keyword) || { found: 0, lastUsed: 0 };
    stats.lastUsed = Date.now();
    this.keywordStats.set(keyword, stats);
    this.usedKeywords.add(keyword);

    info(`📝 Próxima keyword: ${keyword}`, {
      tier: this.currentTier,
      index: this.currentKeywordIndex - 1,
      totalInTier: currentTierKeywords.length,
      timesUsed: this.usedKeywords.size
    });

    return keyword;
  }

  /**
   * Reporta sucesso na keyword (encontrou packs)
   */
  reportSuccess(keyword, packCount) {
    const stats = this.keywordStats.get(keyword) || { found: 0, lastUsed: Date.now() };
    stats.found += packCount;
    this.keywordStats.set(keyword, stats);

    info(`✅ Keyword sucesso: ${keyword}`, {
      packsFound: packCount,
      totalFound: stats.found
    });
  }

  /**
   * Obtém keywords de alta performance
   */
  getHighPerformanceKeywords(minPacks = 10) {
    const highPerformance = [];
    
    for (const [keyword, stats] of this.keywordStats.entries()) {
      if (stats.found >= minPacks) {
        highPerformance.push({
          keyword,
          found: stats.found,
          lastUsed: stats.lastUsed
        });
      }
    }

    return highPerformance.sort((a, b) => b.found - a.found);
  }

  /**
   * Obtém estatísticas do strategist
   */
  getStats() {
    const totalKeywords = this.getTotalKeywordCount();
    const usedKeywords = this.usedKeywords.size;
    const highPerformanceCount = this.getHighPerformanceKeywords().length;
    
    let totalPacksFound = 0;
    for (const stats of this.keywordStats.values()) {
      totalPacksFound += stats.found;
    }

    return {
      totalKeywords,
      usedKeywords,
      highPerformanceCount,
      totalPacksFound,
      currentTier: this.currentTier,
      currentIndex: this.currentKeywordIndex,
      coverage: ((usedKeywords / totalKeywords) * 100).toFixed(1) + '%'
    };
  }

  /**
   * Força uso de keywords testadas primeiro
   */
  getTestedKeyword() {
    if (this.testedWorkingKeywords.length === 0) {
      return this.getNextKeyword();
    }

    const keyword = this.testedWorkingKeywords.shift();
    this.reportSuccess(keyword, 1); // Marcar como usada
    
    info(`🧪 Usando keyword testada: ${keyword}`, {
      remaining: this.testedWorkingKeywords.length
    });

    return keyword;
  }

  /**
   * Obtém keywords por tier específico
   */
  getKeywordsByTier(tier) {
    return this.keywordTiers[tier] || [];
  }

  /**
   * Conta total de keywords disponíveis
   */
  getTotalKeywordCount() {
    return Object.values(this.keywordTiers).reduce((total, keywords) => total + keywords.length, 0);
  }

  /**
   * Reset completo do strategist
   */
  reset() {
    this.currentTier = 1;
    this.currentKeywordIndex = 0;
    this.usedKeywords.clear();
    this.keywordStats.clear();
    
    info('🔄 Keyword Strategist resetado completamente');
  }

  /**
   * Obtém keywords dinâmicas baseadas em packs encontrados
   */
  extractKeywordsFromPacks(packs) {
    const extractedKeywords = new Set();
    
    for (const pack of packs) {
      if (pack.name) {
        // Extrair palavras dos nomes dos packs
        const words = pack.name
          .toLowerCase()
          .replace(/[^\w\s]/g, ' ')
          .split(/\s+/)
          .filter(word => word.length >= 3 && word.length <= 15);
        
        for (const word of words) {
          extractedKeywords.add(word);
        }
      }
    }

    const newKeywords = Array.from(extractedKeywords)
      .filter(keyword => !this.isKeywordUsed(keyword))
      .slice(0, 20); // Limitar a 20 novas keywords

    if (newKeywords.length > 0) {
      // Adicionar ao tier 4 como combinações estratégicas
      this.keywordTiers[4].push(...newKeywords);
      
      info(`🆕 Keywords extraídas dos packs`, {
        extracted: extractedKeywords.size,
        new: newKeywords.length,
        samples: newKeywords.slice(0, 5)
      });
    }

    return newKeywords;
  }

  /**
   * Verifica se keyword já foi usada
   */
  isKeywordUsed(keyword) {
    return this.usedKeywords.has(keyword);
  }

  /**
   * Força uso de keyword específica
   */
  forceKeyword(keyword) {
    const stats = this.keywordStats.get(keyword) || { found: 0, lastUsed: 0 };
    stats.lastUsed = Date.now();
    this.keywordStats.set(keyword, stats);
    this.usedKeywords.add(keyword);

    info(`🎯 Keyword forçada: ${keyword}`);
    return keyword;
  }
}

module.exports = KeywordStrategist;
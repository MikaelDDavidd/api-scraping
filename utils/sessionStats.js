const fs = require('fs-extra');
const path = require('path');
const { info, warn, error } = require('./logger');

class SessionStats {
  constructor() {
    this.startTime = new Date();
    this.sessionId = this.generateSessionId();
    this.stats = {
      // Contadores de packs
      totalPacksFound: 0,
      newPacksFound: 0,
      existingPacksSkipped: 0,
      packsProcessedSuccessfully: 0,
      packsProcessedWithError: 0,
      
      // Breakdown por categoria
      recommendedPacks: {
        found: 0,
        new: 0,
        existing: 0,
        successful: 0,
        failed: 0
      },
      keywordPacks: {
        found: 0,
        new: 0,
        existing: 0,
        successful: 0,
        failed: 0
      },
      
      // Contadores de stickers
      totalStickersProcessed: 0,
      validStickersProcessed: 0,
      invalidStickersSkipped: 0,
      
      // Timing e performance
      processingTimeMs: 0,
      averagePackProcessingTime: 0,
      
      // Breakdown por locale
      localeStats: {},
      
      // Keywords processadas
      keywordsProcessed: []
    };
    
    this.packProcessingTimes = [];
    this.logsDir = path.join(__dirname, '..', 'logs');
    this.sessionLogFile = path.join(this.logsDir, `session-${this.sessionId}.log`);
    
    // Garantir que o diretório de logs existe
    this.ensureLogsDirectory();
    
    // Log de início da sessão
    this.logSessionStart();
  }
  
  generateSessionId() {
    const now = new Date();
    const timestamp = now.getFullYear().toString() +
      (now.getMonth() + 1).toString().padStart(2, '0') +
      now.getDate().toString().padStart(2, '0') + '_' +
      now.getHours().toString().padStart(2, '0') +
      now.getMinutes().toString().padStart(2, '0') +
      now.getSeconds().toString().padStart(2, '0');
    return timestamp;
  }
  
  ensureLogsDirectory() {
    try {
      if (!fs.existsSync(this.logsDir)) {
        fs.mkdirSync(this.logsDir, { recursive: true });
      }
    } catch (err) {
      warn('Erro ao criar diretório de logs', err);
    }
  }
  
  logSessionStart() {
    const startLog = {
      timestamp: this.startTime.toISOString(),
      event: 'SESSION_START',
      sessionId: this.sessionId,
      startTime: this.startTime.toISOString()
    };
    
    this.writeToSessionLog(startLog);
    info('📊 Sessão de estatísticas iniciada', { sessionId: this.sessionId });
  }
  
  writeToSessionLog(data) {
    try {
      const logEntry = JSON.stringify(data) + '\n';
      fs.appendFileSync(this.sessionLogFile, logEntry);
    } catch (err) {
      warn('Erro ao escrever log de sessão', err);
    }
  }
  
  // ==================== MÉTODOS DE TRACKING ====================
  
  trackPackFound(packId, packName, source = 'unknown', locale = 'pt-BR', isNew = false) {
    this.stats.totalPacksFound++;
    
    if (isNew) {
      this.stats.newPacksFound++;
    } else {
      this.stats.existingPacksSkipped++;
    }
    
    // Tracking por locale
    if (!this.stats.localeStats[locale]) {
      this.stats.localeStats[locale] = {
        found: 0,
        new: 0,
        existing: 0,
        successful: 0,
        failed: 0
      };
    }
    
    this.stats.localeStats[locale].found++;
    if (isNew) {
      this.stats.localeStats[locale].new++;
    } else {
      this.stats.localeStats[locale].existing++;
    }
    
    // Tracking por categoria
    if (source === 'recommended') {
      this.stats.recommendedPacks.found++;
      if (isNew) {
        this.stats.recommendedPacks.new++;
      } else {
        this.stats.recommendedPacks.existing++;
      }
    } else if (source === 'keyword') {
      this.stats.keywordPacks.found++;
      if (isNew) {
        this.stats.keywordPacks.new++;
      } else {
        this.stats.keywordPacks.existing++;
      }
    }
    
    // Log individual
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'PACK_FOUND',
      packId,
      packName,
      source,
      locale,
      isNew,
      stats: { ...this.stats }
    };
    
    this.writeToSessionLog(logEntry);
  }
  
  trackPackProcessed(packId, success = true, stickerCount = 0, processingTimeMs = 0, source = 'unknown', locale = 'pt-BR') {
    if (success) {
      this.stats.packsProcessedSuccessfully++;
      this.stats.localeStats[locale].successful++;
      
      if (source === 'recommended') {
        this.stats.recommendedPacks.successful++;
      } else if (source === 'keyword') {
        this.stats.keywordPacks.successful++;
      }
    } else {
      this.stats.packsProcessedWithError++;
      this.stats.localeStats[locale].failed++;
      
      if (source === 'recommended') {
        this.stats.recommendedPacks.failed++;
      } else if (source === 'keyword') {
        this.stats.keywordPacks.failed++;
      }
    }
    
    this.stats.totalStickersProcessed += stickerCount;
    
    // Tracking de tempo
    if (processingTimeMs > 0) {
      this.packProcessingTimes.push(processingTimeMs);
      this.stats.averagePackProcessingTime = 
        this.packProcessingTimes.reduce((sum, time) => sum + time, 0) / this.packProcessingTimes.length;
    }
    
    // Log individual
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'PACK_PROCESSED',
      packId,
      success,
      stickerCount,
      processingTimeMs,
      source,
      locale,
      stats: { ...this.stats }
    };
    
    this.writeToSessionLog(logEntry);
  }
  
  trackKeywordProcessed(keyword, locale = 'pt-BR', packsFound = 0) {
    if (!this.stats.keywordsProcessed.find(k => k.keyword === keyword && k.locale === locale)) {
      this.stats.keywordsProcessed.push({
        keyword,
        locale,
        packsFound,
        timestamp: new Date().toISOString()
      });
    }
    
    const logEntry = {
      timestamp: new Date().toISOString(),
      event: 'KEYWORD_PROCESSED',
      keyword,
      locale,
      packsFound,
      stats: { ...this.stats }
    };
    
    this.writeToSessionLog(logEntry);
  }
  
  trackStickerProcessed(valid = true) {
    if (valid) {
      this.stats.validStickersProcessed++;
    } else {
      this.stats.invalidStickersSkipped++;
    }
  }
  
  // ==================== MÉTODOS DE RELATÓRIO ====================
  
  getSessionSummary() {
    const endTime = new Date();
    this.stats.processingTimeMs = endTime - this.startTime;
    
    const summary = {
      sessionInfo: {
        sessionId: this.sessionId,
        startTime: this.startTime.toISOString(),
        endTime: endTime.toISOString(),
        durationMs: this.stats.processingTimeMs,
        durationMinutes: Math.round(this.stats.processingTimeMs / 1000 / 60 * 100) / 100
      },
      
      packsSummary: {
        totalFound: this.stats.totalPacksFound,
        newPacks: this.stats.newPacksFound,
        existingPacks: this.stats.existingPacksSkipped,
        processedSuccessfully: this.stats.packsProcessedSuccessfully,
        processedWithError: this.stats.packsProcessedWithError,
        successRate: this.stats.totalPacksFound > 0 
          ? Math.round((this.stats.packsProcessedSuccessfully / this.stats.totalPacksFound) * 10000) / 100
          : 0
      },
      
      categorySummary: {
        recommended: this.stats.recommendedPacks,
        keywords: this.stats.keywordPacks
      },
      
      stickersSummary: {
        totalProcessed: this.stats.totalStickersProcessed,
        validStickers: this.stats.validStickersProcessed,
        invalidStickers: this.stats.invalidStickersSkipped
      },
      
      localeSummary: this.stats.localeStats,
      
      keywordsSummary: {
        totalKeywords: this.stats.keywordsProcessed.length,
        keywords: this.stats.keywordsProcessed
      },
      
      performance: {
        averagePackProcessingTime: Math.round(this.stats.averagePackProcessingTime),
        totalPacksProcessingTimes: this.packProcessingTimes.length
      }
    };
    
    return summary;
  }
  
  logSessionEnd() {
    const summary = this.getSessionSummary();
    
    const endLog = {
      timestamp: new Date().toISOString(),
      event: 'SESSION_END',
      sessionId: this.sessionId,
      summary
    };
    
    this.writeToSessionLog(endLog);
    
    return summary;
  }
  
  // Log de apuração simples - apenas contagens principais
  printApuracao() {
    const summary = this.getSessionSummary();
    
    console.log('\n' + '='.repeat(40));
    console.log('📊 APURAÇÃO GERAL');
    console.log('='.repeat(40));
    console.log(`Packs encontrados: ${summary.packsSummary.totalFound}`);
    console.log(`Packs novos: ${summary.packsSummary.newPacks}`);
    console.log(`Packs repetidos: ${summary.packsSummary.existingPacks}`);
    console.log(`Packs processados: ${summary.packsSummary.processedSuccessfully}`);
    console.log(`Packs com erro: ${summary.packsSummary.processedWithError}`);
    console.log(`Taxa de sucesso: ${summary.packsSummary.successRate}%`);
    console.log(`Duração: ${summary.sessionInfo.durationMinutes} min`);
    console.log('='.repeat(40));
  }

  printSummary() {
    const summary = this.getSessionSummary();
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 RELATÓRIO FINAL DA SESSÃO DE SCRAPING');
    console.log('='.repeat(60));
    
    console.log(`\n🔍 INFORMAÇÕES DA SESSÃO:`);
    console.log(`   Sessão ID: ${summary.sessionInfo.sessionId}`);
    console.log(`   Duração: ${summary.sessionInfo.durationMinutes} minutos`);
    console.log(`   Início: ${new Date(summary.sessionInfo.startTime).toLocaleString('pt-BR')}`);
    console.log(`   Fim: ${new Date(summary.sessionInfo.endTime).toLocaleString('pt-BR')}`);
    
    console.log(`\n📦 RESUMO DE PACKS:`);
    console.log(`   Packs encontrados: ${summary.packsSummary.totalFound}`);
    console.log(`   └─ Novos: ${summary.packsSummary.newPacks}`);
    console.log(`   └─ Já existentes: ${summary.packsSummary.existingPacks}`);
    console.log(`   Processados com sucesso: ${summary.packsSummary.processedSuccessfully}`);
    console.log(`   Processados com erro: ${summary.packsSummary.processedWithError}`);
    console.log(`   Taxa de sucesso: ${summary.packsSummary.successRate}%`);
    
    console.log(`\n🎯 BREAKDOWN POR CATEGORIA:`);
    console.log(`   Recomendados:`);
    console.log(`     └─ Encontrados: ${summary.categorySummary.recommended.found} (${summary.categorySummary.recommended.new} novos, ${summary.categorySummary.recommended.existing} existentes)`);
    console.log(`     └─ Sucessos: ${summary.categorySummary.recommended.successful} | Falhas: ${summary.categorySummary.recommended.failed}`);
    console.log(`   Keywords:`);
    console.log(`     └─ Encontrados: ${summary.categorySummary.keywords.found} (${summary.categorySummary.keywords.new} novos, ${summary.categorySummary.keywords.existing} existentes)`);
    console.log(`     └─ Sucessos: ${summary.categorySummary.keywords.successful} | Falhas: ${summary.categorySummary.keywords.failed}`);
    
    console.log(`\n🌍 BREAKDOWN POR LOCALE:`);
    Object.entries(summary.localeSummary).forEach(([locale, stats]) => {
      console.log(`   ${locale}:`);
      console.log(`     └─ Encontrados: ${stats.found} (${stats.new} novos, ${stats.existing} existentes)`);
      console.log(`     └─ Sucessos: ${stats.successful} | Falhas: ${stats.failed}`);
    });
    
    console.log(`\n🎨 STICKERS:`);
    console.log(`   Total processados: ${summary.stickersSummary.totalProcessed}`);
    console.log(`   Válidos: ${summary.stickersSummary.validStickers}`);
    console.log(`   Inválidos (ignorados): ${summary.stickersSummary.invalidStickers}`);
    
    if (summary.keywordsSummary.totalKeywords > 0) {
      console.log(`\n🔍 KEYWORDS PROCESSADAS (${summary.keywordsSummary.totalKeywords}):`);
      summary.keywordsSummary.keywords.forEach(k => {
        console.log(`   "${k.keyword}" (${k.locale}): ${k.packsFound} packs`);
      });
    }
    
    console.log(`\n⚡ PERFORMANCE:`);
    console.log(`   Tempo médio por pack: ${summary.performance.averagePackProcessingTime}ms`);
    console.log(`   Packs com tempo medido: ${summary.performance.totalPacksProcessingTimes}`);
    
    console.log(`\n📁 Log detalhado salvo em: ${this.sessionLogFile}`);
    console.log('='.repeat(60) + '\n');
    
    return summary;
  }
  
  // ==================== MÉTODOS UTILITÁRIOS ====================
  
  reset() {
    this.startTime = new Date();
    this.sessionId = this.generateSessionId();
    this.stats = {
      totalPacksFound: 0,
      newPacksFound: 0,
      existingPacksSkipped: 0,
      packsProcessedSuccessfully: 0,
      packsProcessedWithError: 0,
      recommendedPacks: { found: 0, new: 0, existing: 0, successful: 0, failed: 0 },
      keywordPacks: { found: 0, new: 0, existing: 0, successful: 0, failed: 0 },
      totalStickersProcessed: 0,
      validStickersProcessed: 0,
      invalidStickersSkipped: 0,
      processingTimeMs: 0,
      averagePackProcessingTime: 0,
      localeStats: {},
      keywordsProcessed: []
    };
    this.packProcessingTimes = [];
    this.sessionLogFile = path.join(this.logsDir, `session-${this.sessionId}.log`);
    this.logSessionStart();
  }
}

module.exports = SessionStats;
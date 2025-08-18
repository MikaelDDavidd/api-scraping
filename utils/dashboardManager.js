const DashboardLogger = require('./dashboardLogger');
const { EventEmitter } = require('events');

class DashboardManager extends EventEmitter {
  constructor() {
    super();
    this.dashboard = null;
    this.isEnabled = false;
    this.isActive = false;
  }

  /**
   * Inicializa o dashboard
   */
  init() {
    try {
      this.dashboard = new DashboardLogger();
      this.dashboard.init();
      
      // Verificar se o dashboard foi realmente inicializado (não em PM2)
      if (!this.dashboard.isInitialized) {
        this.isEnabled = false;
        this.isActive = false;
        console.log('Dashboard não inicializado - executando em modo headless para PM2');
        return true; // Ainda retorna true para não quebrar o fluxo
      }
      
      this.isEnabled = true;
      this.isActive = true;
      
      // Configurar handlers para eventos do sistema
      this.setupEventHandlers();
      
      this.log('Dashboard inicializado com sucesso', 'success');
      return true;
    } catch (error) {
      console.error('Erro ao inicializar dashboard:', error);
      this.isEnabled = false;
      return false;
    }
  }

  /**
   * Configura handlers de eventos
   */
  setupEventHandlers() {
    // Interceptar process.exit para limpar
    const originalExit = process.exit;
    process.exit = (code) => {
      this.destroy();
      originalExit(code);
    };

    // Interceptar sinais
    process.on('SIGINT', () => {
      this.destroy();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      this.destroy();
      process.exit(0);
    });
  }

  /**
   * Verifica se o dashboard está ativo
   */
  isReady() {
    return this.isEnabled && this.isActive && this.dashboard;
  }

  /**
   * Adiciona keyword ativa
   */
  addKeyword(keyword, locale, status = 'active') {
    if (this.isReady()) {
      this.dashboard.addKeyword(keyword, locale, status);
    }
  }

  /**
   * Remove keyword
   */
  removeKeyword(keyword, locale) {
    if (this.isReady()) {
      this.dashboard.removeKeyword(keyword, locale);
    }
  }

  /**
   * Adiciona log geral
   */
  log(message, level = 'info') {
    // Sempre fazer log no console para PM2 capturar
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const levelIcon = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      success: '✅'
    }[level] || 'ℹ️';
    
    console.log(`[${timestamp}] ${levelIcon} ${message}`);
    
    // Se dashboard visual estiver ativo, adicionar também lá
    if (this.isReady()) {
      this.dashboard.addLog(message, level);
    }
  }

  /**
   * Log de informação
   */
  info(message) {
    this.log(message, 'info');
  }

  /**
   * Log de sucesso
   */
  success(message) {
    this.log(message, 'success');
  }

  /**
   * Log de warning
   */
  warn(message) {
    this.log(message, 'warn');
  }

  /**
   * Log de erro
   */
  error(message) {
    this.log(message, 'error');
  }

  /**
   * Atualiza estatísticas de fila
   */
  updateQueueStats(queueType, stats) {
    if (this.isReady()) {
      this.dashboard.updateQueueStats(queueType, stats);
    }
  }

  /**
   * Adiciona pack em processamento
   */
  startProcessingPack(queueType, packInfo) {
    if (this.isReady()) {
      this.dashboard.addProcessingPack(queueType, packInfo);
      this.log(`Iniciando processamento de pack ${packInfo.name || packInfo.id} na fila ${queueType}`, 'info');
    }
  }

  /**
   * Finaliza processamento de pack
   */
  finishProcessingPack(queueType, packId, success = true) {
    if (this.isReady()) {
      this.dashboard.removeProcessingPack(queueType, packId);
      const status = success ? 'success' : 'error';
      const message = success ? 
        `Pack ${packId} processado com sucesso (${queueType})` : 
        `Erro ao processar pack ${packId} (${queueType})`;
      this.log(message, status);
    }
  }

  /**
   * Atualiza estatísticas de descoberta
   */
  updateDiscoveryStats(found, processed) {
    if (this.isReady()) {
      this.dashboard.updateDiscoveryStats(found, processed);
    }
  }

  /**
   * Log específico para pack encontrado
   */
  logPackFound(packInfo) {
    if (this.isReady()) {
      const message = `Pack encontrado: ${packInfo.name || packInfo.id} (${packInfo.locale || 'pt'})`;
      this.log(message, 'info');
    }
  }

  /**
   * Log específico para pack processado
   */
  logPackProcessed(packInfo, success = true, stickersCount = null) {
    if (this.isReady()) {
      const stickers = stickersCount ? ` - ${stickersCount} figurinhas` : '';
      const message = `Pack ${success ? 'processado' : 'falhou'}: ${packInfo.name || packInfo.id}${stickers}`;
      this.log(message, success ? 'success' : 'error');
    }
  }

  /**
   * Log para início de busca por keyword
   */
  logKeywordSearch(keyword, locale) {
    if (this.isReady()) {
      this.addKeyword(keyword, locale, 'active');
      this.log(`Iniciando busca por keyword: "${keyword}" (${locale})`, 'info');
    }
  }

  /**
   * Log para fim de busca por keyword
   */
  logKeywordComplete(keyword, locale, packsFound = 0) {
    if (this.isReady()) {
      this.removeKeyword(keyword, locale);
      this.log(`Busca por "${keyword}" finalizada - ${packsFound} packs encontrados`, 'success');
    }
  }

  /**
   * Log para erros de API
   */
  logApiError(endpoint, error, retryCount = 0) {
    if (this.isReady()) {
      const retry = retryCount > 0 ? ` (tentativa ${retryCount})` : '';
      this.log(`Erro na API ${endpoint}${retry}: ${error.message}`, 'error');
    }
  }

  /**
   * Log para rate limiting
   */
  logRateLimit(waitTime) {
    if (this.isReady()) {
      this.log(`Rate limit atingido - aguardando ${waitTime}ms`, 'warn');
    }
  }

  /**
   * Log para início de sessão
   */
  logSessionStart(mode, locales, keywords) {
    if (this.isReady()) {
      this.log(`Sessão iniciada - Modo: ${mode}`, 'success');
      if (locales && locales.length > 0) {
        this.log(`Locales: ${locales.join(', ')}`, 'info');
      }
      if (keywords && keywords.length > 0) {
        this.log(`Keywords: ${keywords.slice(0, 3).join(', ')}${keywords.length > 3 ? '...' : ''}`, 'info');
      }
    }
  }

  /**
   * Log para fim de sessão
   */
  logSessionEnd(stats) {
    if (this.isReady()) {
      this.log(`Sessão finalizada - Processados: ${stats.processed}, Sucesso: ${stats.success}`, 'success');
    }
  }

  /**
   * Força renderização
   */
  render() {
    if (this.isReady()) {
      this.dashboard.render();
    }
  }

  /**
   * Destroi o dashboard
   */
  destroy() {
    if (this.dashboard) {
      this.dashboard.destroy();
      this.dashboard = null;
    }
    this.isActive = false;
    this.isEnabled = false;
  }

  /**
   * Cria wrapper que pode ser usado no lugar do logger tradicional
   */
  createLoggerWrapper() {
    return {
      info: (message, meta = {}) => {
        console.log(message); // Manter console log original
        this.info(typeof message === 'string' ? message : JSON.stringify(message));
      },
      
      error: (message, error = null, meta = {}) => {
        console.error(message, error); // Manter console log original  
        const errorMsg = error ? `${message}: ${error.message}` : message;
        this.error(errorMsg);
      },
      
      warn: (message, meta = {}) => {
        console.warn(message); // Manter console log original
        this.warn(typeof message === 'string' ? message : JSON.stringify(message));
      },
      
      debug: (message, meta = {}) => {
        console.debug(message); // Manter console log original
        this.info(typeof message === 'string' ? message : JSON.stringify(message));
      },

      // Métodos específicos do scraper
      packFound: (packId, packName) => {
        this.logPackFound({ id: packId, name: packName });
      },

      packProcessed: (packId, stickersCount, success = true) => {
        this.logPackProcessed({ id: packId }, success, stickersCount);
      }
    };
  }
}

// Instância singleton
const dashboardManager = new DashboardManager();

module.exports = dashboardManager;
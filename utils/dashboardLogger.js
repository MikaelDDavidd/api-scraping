const blessed = require('blessed');
const { EventEmitter } = require('events');

class DashboardLogger extends EventEmitter {
  constructor() {
    super();
    this.screen = null;
    this.boxes = {};
    this.data = {
      keywords: [],
      generalLogs: [],
      lightQueue: { processing: 0, pending: 0, completed: 0 },
      heavyQueue: { processing: 0, pending: 0, completed: 0 },
      systemStats: { uptime: 0, memory: 0, cpu: 0 },
      currentPacks: { light: [], heavy: [] },
      discoveryStats: { found: 0, processed: 0 }
    };
    this.maxLogLines = 50;
    this.isInitialized = false;
  }

  /**
   * Inicializa o dashboard
   */
  init() {
    // Verificar se estamos em ambiente PM2 ou não-TTY
    if (process.env.PM2_HOME || !process.stdout.isTTY) {
      this.isInitialized = false;
      console.log('Dashboard desabilitado em ambiente PM2/não-TTY');
      return;
    }

    this.screen = blessed.screen({
      smartCSR: true,
      title: '🚀 Stickers Scraper Dashboard v2.0'
    });

    // Layout principal
    this.createLayout();
    this.setupEventHandlers();
    this.startUpdateLoop();
    
    this.isInitialized = true;
    this.render();
  }

  /**
   * Cria o layout do dashboard
   */
  createLayout() {
    // Header
    this.boxes.header = blessed.box({
      top: 0,
      left: 0,
      width: '100%',
      height: 3,
      content: ' 🚀 STICKERS SCRAPER DASHBOARD v2.0 - Real Time Monitoring ',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'blue',
        border: {
          fg: 'cyan'
        }
      }
    });

    // Keywords section (top left)
    this.boxes.keywords = blessed.box({
      label: ' 🔍 Keywords Ativas ',
      top: 3,
      left: 0,
      width: '25%',
      height: 12,
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'green'
        }
      },
      scrollable: true
    });

    // System stats (top center)
    this.boxes.system = blessed.box({
      label: ' 💻 Sistema ',
      top: 3,
      left: '25%',
      width: '25%',
      height: 12,
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'cyan'
        }
      }
    });

    // Discovery stats (top right)
    this.boxes.discovery = blessed.box({
      label: ' 🔍 Descoberta ',
      top: 3,
      left: '50%',
      width: '25%',
      height: 12,
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'yellow'
        }
      }
    });

    // Queue overview (top far right)
    this.boxes.queues = blessed.box({
      label: ' 📋 Filas ',
      top: 3,
      left: '75%',
      width: '25%',
      height: 12,
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'magenta'
        }
      }
    });

    // Light queue processing (middle left)
    this.boxes.lightQueue = blessed.box({
      label: ' ⚡ Packs Leves ',
      top: 15,
      left: 0,
      width: '50%',
      height: 10,
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'green'
        }
      },
      scrollable: true
    });

    // Heavy queue processing (middle right)
    this.boxes.heavyQueue = blessed.box({
      label: ' 🔨 Packs Pesados ',
      top: 15,
      left: '50%',
      width: '50%',
      height: 10,
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'red'
        }
      },
      scrollable: true
    });

    // General logs (bottom)
    this.boxes.logs = blessed.box({
      label: ' 📝 Logs Gerais ',
      top: 25,
      left: 0,
      width: '100%',
      height: '100%-25',
      content: '',
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        border: {
          fg: 'white'
        }
      },
      scrollable: true,
      alwaysScroll: true
    });

    // Adicionar todos os boxes à tela
    Object.values(this.boxes).forEach(box => {
      this.screen.append(box);
    });
  }

  /**
   * Configura handlers de eventos
   */
  setupEventHandlers() {
    // ESC ou q para sair
    this.screen.key(['escape', 'q', 'C-c'], () => {
      process.exit(0);
    });

    // Redimensionamento
    this.screen.on('resize', () => {
      this.render();
    });
  }

  /**
   * Inicia loop de atualização
   */
  startUpdateLoop() {
    setInterval(() => {
      this.updateSystemStats();
      this.render();
    }, 1000);
  }

  /**
   * Atualiza estatísticas do sistema
   */
  updateSystemStats() {
    const used = process.memoryUsage();
    this.data.systemStats = {
      uptime: process.uptime(),
      memory: Math.round(used.heapUsed / 1024 / 1024),
      cpu: process.cpuUsage()
    };
  }

  /**
   * Adiciona keyword ativa
   */
  addKeyword(keyword, locale, status = 'active') {
    const existing = this.data.keywords.find(k => k.keyword === keyword && k.locale === locale);
    if (existing) {
      existing.status = status;
      existing.lastUpdate = new Date();
    } else {
      this.data.keywords.push({
        keyword,
        locale,
        status,
        startTime: new Date(),
        lastUpdate: new Date()
      });
    }
  }

  /**
   * Remove keyword
   */
  removeKeyword(keyword, locale) {
    this.data.keywords = this.data.keywords.filter(
      k => !(k.keyword === keyword && k.locale === locale)
    );
  }

  /**
   * Adiciona log geral
   */
  addLog(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const levelIcon = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      success: '✅'
    }[level] || 'ℹ️';

    this.data.generalLogs.unshift(`[${timestamp}] ${levelIcon} ${message}`);
    
    // Manter apenas os últimos logs
    if (this.data.generalLogs.length > this.maxLogLines) {
      this.data.generalLogs = this.data.generalLogs.slice(0, this.maxLogLines);
    }
  }

  /**
   * Atualiza estatísticas de fila
   */
  updateQueueStats(queueType, stats) {
    if (queueType === 'light') {
      this.data.lightQueue = { ...this.data.lightQueue, ...stats };
    } else if (queueType === 'heavy') {
      this.data.heavyQueue = { ...this.data.heavyQueue, ...stats };
    }
  }

  /**
   * Adiciona pack em processamento
   */
  addProcessingPack(queueType, packInfo) {
    if (!this.data.currentPacks[queueType]) {
      this.data.currentPacks[queueType] = [];
    }
    
    this.data.currentPacks[queueType].unshift({
      ...packInfo,
      startTime: new Date()
    });

    // Manter apenas os últimos 10
    if (this.data.currentPacks[queueType].length > 10) {
      this.data.currentPacks[queueType] = this.data.currentPacks[queueType].slice(0, 10);
    }
  }

  /**
   * Remove pack do processamento
   */
  removeProcessingPack(queueType, packId) {
    if (this.data.currentPacks[queueType]) {
      this.data.currentPacks[queueType] = this.data.currentPacks[queueType]
        .filter(pack => pack.id !== packId);
    }
  }

  /**
   * Atualiza estatísticas de descoberta
   */
  updateDiscoveryStats(found, processed) {
    this.data.discoveryStats.found = found;
    this.data.discoveryStats.processed = processed;
  }

  /**
   * Renderiza keywords
   */
  renderKeywords() {
    if (this.data.keywords.length === 0) {
      return '{center}Nenhuma keyword ativa{/center}';
    }

    const lines = this.data.keywords.map(k => {
      const statusIcon = k.status === 'active' ? '🟢' : k.status === 'paused' ? '🟡' : '🔴';
      const duration = Math.round((new Date() - k.startTime) / 1000);
      return `${statusIcon} ${k.keyword} (${k.locale}) - ${duration}s`;
    });

    return lines.join('\\n');
  }

  /**
   * Renderiza estatísticas do sistema
   */
  renderSystemStats() {
    const uptimeHours = Math.floor(this.data.systemStats.uptime / 3600);
    const uptimeMinutes = Math.floor((this.data.systemStats.uptime % 3600) / 60);
    
    return [
      `⏱️  Uptime: ${uptimeHours}h ${uptimeMinutes}m`,
      `💾 Memória: ${this.data.systemStats.memory}MB`,
      `🔥 CPU: Ativo`,
      ``,
      `🚀 Node.js: ${process.version}`,
      `📊 PID: ${process.pid}`
    ].join('\\n');
  }

  /**
   * Renderiza estatísticas de descoberta
   */
  renderDiscoveryStats() {
    const { found, processed } = this.data.discoveryStats;
    const rate = found > 0 ? Math.round((processed / found) * 100) : 0;
    
    return [
      `🔍 Descobertos: ${found}`,
      `✅ Processados: ${processed}`,
      `📊 Taxa: ${rate}%`,
      ``,
      `🎯 Restantes: ${found - processed}`,
      found > 0 ? `🚀 Progresso: ${'█'.repeat(Math.floor(rate/10))}${'░'.repeat(10-Math.floor(rate/10))}` : ''
    ].join('\\n');
  }

  /**
   * Renderiza overview das filas
   */
  renderQueuesOverview() {
    const light = this.data.lightQueue;
    const heavy = this.data.heavyQueue;
    
    return [
      `⚡ LEVES:`,
      `  📥 Pendentes: ${light.pending}`,
      `  🔄 Processando: ${light.processing}`,
      `  ✅ Completos: ${light.completed}`,
      ``,
      `🔨 PESADOS:`,
      `  📥 Pendentes: ${heavy.pending}`,
      `  🔄 Processando: ${heavy.processing}`,
      `  ✅ Completos: ${heavy.completed}`
    ].join('\\n');
  }

  /**
   * Renderiza fila de processamento
   */
  renderProcessingQueue(queueType) {
    const packs = this.data.currentPacks[queueType] || [];
    
    if (packs.length === 0) {
      return `{center}Nenhum pack em processamento{/center}`;
    }

    const lines = packs.map(pack => {
      const duration = Math.round((new Date() - pack.startTime) / 1000);
      const name = (pack.name || pack.id || 'Sem nome').slice(0, 30);
      const stickers = pack.stickers ? `(${pack.stickers} figs)` : '';
      return `🔄 ${name} ${stickers} - ${duration}s`;
    });

    return lines.join('\\n');
  }

  /**
   * Renderiza logs gerais
   */
  renderGeneralLogs() {
    if (this.data.generalLogs.length === 0) {
      return '{center}Nenhum log ainda...{/center}';
    }

    return this.data.generalLogs.join('\\n');
  }

  /**
   * Renderiza todo o dashboard
   */
  render() {
    if (!this.isInitialized) return;

    // Atualizar timestamp no header
    const timestamp = new Date().toLocaleString('pt-BR');
    this.boxes.header.setContent(` 🚀 STICKERS SCRAPER DASHBOARD v2.0 - ${timestamp} `);

    // Atualizar conteúdo de cada seção
    this.boxes.keywords.setContent(this.renderKeywords());
    this.boxes.system.setContent(this.renderSystemStats());
    this.boxes.discovery.setContent(this.renderDiscoveryStats());
    this.boxes.queues.setContent(this.renderQueuesOverview());
    this.boxes.lightQueue.setContent(this.renderProcessingQueue('light'));
    this.boxes.heavyQueue.setContent(this.renderProcessingQueue('heavy'));
    this.boxes.logs.setContent(this.renderGeneralLogs());

    // Auto-scroll logs para o final
    this.boxes.logs.setScrollPerc(100);

    this.screen.render();
  }

  /**
   * Destroi o dashboard
   */
  destroy() {
    if (this.screen) {
      this.screen.destroy();
    }
  }
}

module.exports = DashboardLogger;
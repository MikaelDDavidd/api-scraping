const { EventEmitter } = require('events');
const { info, warn, error } = require('../utils/logger');
const os = require('os');

/**
 * Monitor de recursos do sistema (RAM, CPU, etc.)
 * Monitora uso de recursos e emite alertas/throttling quando necessário
 */
class ResourceMonitor extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      // Limites críticos
      maxMemoryMB: 750, // 75% de 1GB
      maxCPUPercent: 85,
      
      // Intervalos de monitoramento
      monitorInterval: 5000, // 5s
      gcInterval: 30000, // 30s
      
      // Thresholds para alertas
      memoryWarningPercent: 70, // 70% do limite
      cpuWarningPercent: 75,
      
      // Configurações de throttling
      enableAutoThrottling: true,
      throttleMemoryPercent: 80,
      throttleCPUPercent: 80,
      
      ...options
    };
    
    // Estado do monitor
    this.isMonitoring = false;
    this.monitorTimer = null;
    this.gcTimer = null;
    
    // Métricas atuais
    this.currentMetrics = {
      memory: {
        used: 0,
        usedMB: 0,
        percent: 0,
        limit: this.options.maxMemoryMB
      },
      cpu: {
        percent: 0,
        loadAverage: []
      },
      system: {
        totalMemory: os.totalmem(),
        freeMemory: 0,
        platform: os.platform(),
        cpus: os.cpus().length
      }
    };
    
    // Estado de throttling
    this.throttleState = {
      isThrottled: false,
      reason: null,
      since: null
    };
    
    // Histórico para cálculos de média
    this.metricsHistory = [];
    this.maxHistorySize = 12; // 1 minuto de histórico (5s * 12)
    
    info('ResourceMonitor criado', {
      maxMemoryMB: this.options.maxMemoryMB,
      maxCPUPercent: this.options.maxCPUPercent,
      autoThrottling: this.options.enableAutoThrottling
    });
  }

  /**
   * Inicia o monitoramento
   */
  start() {
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    
    // Coleta inicial
    this.collectMetrics();
    
    // Iniciar timers
    this.monitorTimer = setInterval(() => {
      this.collectMetrics();
      this.checkThresholds();
    }, this.options.monitorInterval);
    
    this.gcTimer = setInterval(() => {
      this.forceGarbageCollection();
    }, this.options.gcInterval);
    
    info('🔍 ResourceMonitor iniciado', {
      monitorInterval: this.options.monitorInterval,
      gcInterval: this.options.gcInterval
    });
    
    this.emit('started');
  }

  /**
   * Para o monitoramento
   */
  stop() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = null;
    }
    
    info('🛑 ResourceMonitor parado', {
      finalMetrics: this.getCurrentMetrics()
    });
    
    this.emit('stopped');
  }

  /**
   * Coleta métricas atuais do sistema
   */
  collectMetrics() {
    try {
      // Métricas de memória
      const memUsage = process.memoryUsage();
      const usedMB = Math.round(memUsage.rss / 1024 / 1024);
      const memoryPercent = (usedMB / this.options.maxMemoryMB) * 100;
      
      // Métricas de CPU (load average como proxy)
      const loadAvg = os.loadavg();
      const cpuPercent = Math.min(100, (loadAvg[0] / os.cpus().length) * 100);
      
      // Métricas do sistema
      const freeMemory = os.freemem();
      
      // Atualizar métricas atuais
      this.currentMetrics = {
        memory: {
          used: memUsage.rss,
          usedMB,
          percent: memoryPercent,
          limit: this.options.maxMemoryMB,
          heap: {
            used: Math.round(memUsage.heapUsed / 1024 / 1024),
            total: Math.round(memUsage.heapTotal / 1024 / 1024)
          }
        },
        cpu: {
          percent: cpuPercent,
          loadAverage: loadAvg
        },
        system: {
          totalMemory: os.totalmem(),
          freeMemory,
          platform: os.platform(),
          cpus: os.cpus().length,
          uptime: os.uptime()
        },
        timestamp: Date.now()
      };
      
      // Adicionar ao histórico
      this.metricsHistory.push({
        timestamp: Date.now(),
        memory: memoryPercent,
        cpu: cpuPercent
      });
      
      // Manter histórico limitado
      if (this.metricsHistory.length > this.maxHistorySize) {
        this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
      }
      
      this.emit('metricsCollected', this.currentMetrics);
      
    } catch (err) {
      error('Erro ao coletar métricas', err);
    }
  }

  /**
   * Verifica thresholds e emite alertas
   */
  checkThresholds() {
    const metrics = this.currentMetrics;
    
    // Verificar memória
    if (metrics.memory.percent >= this.options.memoryWarningPercent) {
      const level = metrics.memory.percent >= this.options.throttleMemoryPercent ? 'critical' : 'warning';
      
      this.emit('memoryAlert', {
        level,
        current: metrics.memory.percent,
        limit: 100,
        usedMB: metrics.memory.usedMB,
        limitMB: metrics.memory.limit
      });
      
      if (level === 'critical') {
        warn(`🚨 Memória crítica: ${metrics.memory.usedMB}MB (${metrics.memory.percent.toFixed(1)}%)`);
      }
    }
    
    // Verificar CPU
    if (metrics.cpu.percent >= this.options.cpuWarningPercent) {
      const level = metrics.cpu.percent >= this.options.throttleCPUPercent ? 'critical' : 'warning';
      
      this.emit('cpuAlert', {
        level,
        current: metrics.cpu.percent,
        limit: this.options.maxCPUPercent,
        loadAverage: metrics.cpu.loadAverage
      });
      
      if (level === 'critical') {
        warn(`🚨 CPU crítica: ${metrics.cpu.percent.toFixed(1)}% (load: ${metrics.cpu.loadAverage[0].toFixed(2)})`);
      }
    }
    
    // Auto-throttling
    if (this.options.enableAutoThrottling) {
      this.checkAutoThrottling(metrics);
    }
  }

  /**
   * Verifica se deve ativar/desativar throttling automático
   */
  checkAutoThrottling(metrics) {
    const shouldThrottle = 
      metrics.memory.percent >= this.options.throttleMemoryPercent ||
      metrics.cpu.percent >= this.options.throttleCPUPercent;
    
    if (shouldThrottle && !this.throttleState.isThrottled) {
      // Ativar throttling
      this.throttleState = {
        isThrottled: true,
        reason: metrics.memory.percent >= this.options.throttleMemoryPercent ? 'memory' : 'cpu',
        since: Date.now()
      };
      
      warn(`🐌 Auto-throttling ativado`, {
        reason: this.throttleState.reason,
        memory: `${metrics.memory.percent.toFixed(1)}%`,
        cpu: `${metrics.cpu.percent.toFixed(1)}%`
      });
      
      this.emit('throttleActivated', this.throttleState);
      
    } else if (!shouldThrottle && this.throttleState.isThrottled) {
      // Desativar throttling
      const duration = Date.now() - this.throttleState.since;
      
      info(`🚀 Auto-throttling desativado`, {
        duration: Math.round(duration / 1000) + 's',
        memory: `${metrics.memory.percent.toFixed(1)}%`,
        cpu: `${metrics.cpu.percent.toFixed(1)}%`
      });
      
      this.emit('throttleDeactivated', {
        ...this.throttleState,
        duration
      });
      
      this.throttleState = {
        isThrottled: false,
        reason: null,
        since: null
      };
    }
  }

  /**
   * Força garbage collection se disponível
   */
  forceGarbageCollection() {
    if (global.gc) {
      try {
        const beforeMem = process.memoryUsage().heapUsed;
        global.gc();
        const afterMem = process.memoryUsage().heapUsed;
        const freed = beforeMem - afterMem;
        
        if (freed > 1024 * 1024) { // > 1MB liberado
          info(`🗑️ Garbage collection liberou ${Math.round(freed / 1024 / 1024)}MB`);
        }
        
        this.emit('garbageCollected', { freed });
        
      } catch (err) {
        error('Erro no garbage collection', err);
      }
    }
  }

  /**
   * Retorna métricas atuais
   */
  getCurrentMetrics() {
    return {
      ...this.currentMetrics,
      throttle: this.throttleState,
      averages: this.getAverages()
    };
  }

  /**
   * Calcula médias do histórico
   */
  getAverages() {
    if (this.metricsHistory.length === 0) {
      return { memory: 0, cpu: 0 };
    }
    
    const memorySum = this.metricsHistory.reduce((sum, m) => sum + m.memory, 0);
    const cpuSum = this.metricsHistory.reduce((sum, m) => sum + m.cpu, 0);
    
    return {
      memory: memorySum / this.metricsHistory.length,
      cpu: cpuSum / this.metricsHistory.length,
      samples: this.metricsHistory.length
    };
  }

  /**
   * Verifica se sistema está sob pressão
   */
  isUnderPressure() {
    const metrics = this.currentMetrics;
    return {
      memory: metrics.memory.percent >= this.options.throttleMemoryPercent,
      cpu: metrics.cpu.percent >= this.options.throttleCPUPercent,
      throttled: this.throttleState.isThrottled,
      overall: this.throttleState.isThrottled
    };
  }

  /**
   * Retorna status resumido para logging
   */
  getStatusSummary() {
    const metrics = this.currentMetrics;
    const pressure = this.isUnderPressure();
    
    return {
      memory: `${metrics.memory.usedMB}MB (${metrics.memory.percent.toFixed(1)}%)`,
      cpu: `${metrics.cpu.percent.toFixed(1)}%`,
      throttled: this.throttleState.isThrottled,
      pressure: pressure.overall,
      uptime: Math.round(metrics.system.uptime / 60) + 'm'
    };
  }

  /**
   * Configura limites de recursos
   */
  setLimits(newLimits) {
    this.options = { ...this.options, ...newLimits };
    
    info('Limites de recursos atualizados', {
      maxMemoryMB: this.options.maxMemoryMB,
      maxCPUPercent: this.options.maxCPUPercent
    });
    
    this.emit('limitsUpdated', this.options);
  }
}

module.exports = ResourceMonitor;
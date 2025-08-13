const { EventEmitter } = require('events');
const { info, error, warn } = require('../utils/logger');

/**
 * Classe base para todos os workers
 * Fornece funcionalidades comuns: comunicação, logging, health check
 */
class BaseWorker extends EventEmitter {
  constructor(name, options = {}) {
    super();
    
    this.name = name;
    this.id = `${name}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.isRunning = false;
    this.isPaused = false;
    this.startTime = null;
    this.lastActivity = null;
    
    // Configurações
    this.options = {
      maxRetries: 3,
      retryDelay: 2000,
      healthCheckInterval: 30000, // 30s
      maxIdleTime: 300000, // 5 minutos
      ...options
    };
    
    // Métricas básicas
    this.metrics = {
      tasksProcessed: 0,
      tasksSuccessful: 0,
      tasksFailed: 0,
      averageProcessingTime: 0,
      totalProcessingTime: 0,
      errors: [],
      lastError: null
    };
    
    // Health check automático
    this.healthCheckTimer = null;
    
    info(`Worker criado: ${this.name}`, { id: this.id });
  }

  /**
   * Inicia o worker
   */
  async start() {
    if (this.isRunning) {
      warn(`Worker ${this.name} já está rodando`);
      return;
    }

    try {
      this.isRunning = true;
      this.startTime = Date.now();
      this.lastActivity = Date.now();
      
      info(`🚀 Worker iniciado: ${this.name}`, { id: this.id });
      
      // Inicializar implementação específica
      await this.initialize();
      
      // Começar health check
      this.startHealthCheck();
      
      // Começar loop principal
      this.startMainLoop();
      
      this.emit('started', { workerId: this.id, name: this.name });
      
    } catch (err) {
      error(`Erro ao iniciar worker ${this.name}`, err);
      this.isRunning = false;
      throw err;
    }
  }

  /**
   * Para o worker graciosamente
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    info(`🛑 Parando worker: ${this.name}`, { id: this.id });
    
    this.isRunning = false;
    
    // Parar health check
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Cleanup específico
    await this.cleanup();
    
    this.emit('stopped', { 
      workerId: this.id, 
      name: this.name,
      metrics: this.getMetrics()
    });
    
    info(`✅ Worker parado: ${this.name}`, { 
      id: this.id,
      uptime: this.getUptime(),
      tasksProcessed: this.metrics.tasksProcessed
    });
  }

  /**
   * Pausa o worker temporariamente
   */
  pause() {
    if (!this.isRunning || this.isPaused) {
      return;
    }
    
    this.isPaused = true;
    info(`⏸️ Worker pausado: ${this.name}`, { id: this.id });
    this.emit('paused', { workerId: this.id, name: this.name });
  }

  /**
   * Resume o worker
   */
  resume() {
    if (!this.isRunning || !this.isPaused) {
      return;
    }
    
    this.isPaused = false;
    this.lastActivity = Date.now();
    info(`▶️ Worker resumido: ${this.name}`, { id: this.id });
    this.emit('resumed', { workerId: this.id, name: this.name });
  }

  /**
   * Processa uma tarefa com retry automático
   */
  async processTask(task, taskName = 'task') {
    if (!this.isRunning || this.isPaused) {
      throw new Error(`Worker ${this.name} não está ativo`);
    }

    const startTime = Date.now();
    let lastError = null;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        this.lastActivity = Date.now();
        this.metrics.tasksProcessed++;
        
        // Processar tarefa (implementação específica)
        const result = await this.processTaskImplementation(task);
        
        // Atualizar métricas de sucesso
        this.metrics.tasksSuccessful++;
        const processingTime = Date.now() - startTime;
        this.updateProcessingTime(processingTime);
        
        info(`✅ Tarefa processada: ${taskName}`, {
          worker: this.name,
          attempt,
          processingTime
        });
        
        this.emit('taskCompleted', {
          workerId: this.id,
          taskName,
          processingTime,
          success: true
        });
        
        return result;
        
      } catch (err) {
        lastError = err;
        this.metrics.tasksFailed++;
        this.recordError(err, taskName);
        
        error(`❌ Erro na tentativa ${attempt}/${this.options.maxRetries}`, {
          worker: this.name,
          taskName,
          error: err.message,
          attempt
        });
        
        if (attempt >= this.options.maxRetries) {
          break;
        }
        
        // Delay antes de tentar novamente
        await this.delay(this.options.retryDelay * attempt);
      }
    }
    
    // Se chegou aqui, todas as tentativas falharam
    const processingTime = Date.now() - startTime;
    
    this.emit('taskFailed', {
      workerId: this.id,
      taskName,
      processingTime,
      error: lastError,
      attempts: this.options.maxRetries
    });
    
    throw lastError;
  }

  /**
   * Health check do worker
   */
  checkHealth() {
    const now = Date.now();
    const uptime = this.getUptime();
    const idleTime = now - this.lastActivity;
    
    const health = {
      workerId: this.id,
      name: this.name,
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      uptime,
      idleTime,
      metrics: this.getMetrics(),
      isHealthy: this.isRunning && idleTime < this.options.maxIdleTime
    };
    
    // Emitir evento de health check
    this.emit('healthCheck', health);
    
    // Avisar se worker está idle há muito tempo
    if (idleTime > this.options.maxIdleTime && this.isRunning) {
      warn(`Worker ${this.name} idle há ${Math.round(idleTime/1000)}s`, { id: this.id });
    }
    
    return health;
  }

  /**
   * Retorna métricas do worker
   */
  getMetrics() {
    return {
      ...this.metrics,
      uptime: this.getUptime(),
      successRate: this.metrics.tasksProcessed > 0 ? 
        (this.metrics.tasksSuccessful / this.metrics.tasksProcessed) * 100 : 0
    };
  }

  /**
   * Retorna tempo de atividade em ms
   */
  getUptime() {
    return this.startTime ? Date.now() - this.startTime : 0;
  }

  /**
   * Delay helper
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Atualiza métricas de tempo de processamento
   */
  updateProcessingTime(processingTime) {
    this.metrics.totalProcessingTime += processingTime;
    this.metrics.averageProcessingTime = 
      this.metrics.totalProcessingTime / this.metrics.tasksSuccessful;
  }

  /**
   * Registra erro nas métricas
   */
  recordError(error, context = null) {
    const errorRecord = {
      timestamp: Date.now(),
      message: error.message,
      stack: error.stack,
      context
    };
    
    this.metrics.errors.push(errorRecord);
    this.metrics.lastError = errorRecord;
    
    // Manter apenas os últimos 50 erros
    if (this.metrics.errors.length > 50) {
      this.metrics.errors = this.metrics.errors.slice(-50);
    }
  }

  /**
   * Inicia health check automático
   */
  startHealthCheck() {
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth();
    }, this.options.healthCheckInterval);
  }

  /**
   * Loop principal do worker (implementação específica)
   */
  async startMainLoop() {
    // Implementação específica deve sobrescrever este método
    info(`Loop principal iniciado para ${this.name}`);
  }

  // =============================================================================
  // MÉTODOS ABSTRATOS - DEVEM SER IMPLEMENTADOS PELAS CLASSES FILHAS
  // =============================================================================

  /**
   * Inicialização específica do worker
   */
  async initialize() {
    // Implementação específica
  }

  /**
   * Cleanup específico do worker
   */
  async cleanup() {
    // Implementação específica
  }

  /**
   * Processamento específico de uma tarefa
   */
  async processTaskImplementation(task) {
    throw new Error('processTaskImplementation deve ser implementado pela classe filha');
  }
}

module.exports = BaseWorker;
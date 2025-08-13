const { EventEmitter } = require('events');
const { info, error, warn } = require('../utils/logger');
const fs = require('fs-extra');
const path = require('path');

// Importar filas especializadas
const DiscoveryQueue = require('../queues/discoveryQueue');
const LightQueue = require('../queues/lightQueue');
const HeavyQueue = require('../queues/heavyQueue');

/**
 * Gerenciador centralizado de filas
 * Controla todas as filas do sistema e comunicação entre workers
 */
class QueueManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.options = {
      persistencePath: './queues/state',
      saveInterval: 30000, // 30s
      maxQueueSize: {
        discovery: 100,
        light: 50,
        heavy: 10
      },
      ...options
    };
    
    // Filas especializadas
    this.queues = {
      discovery: new DiscoveryQueue(this.options.maxQueueSize.discovery),
      light: new LightQueue(this.options.maxQueueSize.light),
      heavy: new HeavyQueue(this.options.maxQueueSize.heavy)
    };
    
    // Workers registrados
    this.workers = new Map();
    
    // Estado
    this.isRunning = false;
    this.saveTimer = null;
    
    info('QueueManager criado', { 
      maxSizes: this.options.maxQueueSize,
      persistencePath: this.options.persistencePath
    });
  }

  /**
   * Inicia o gerenciador de filas
   */
  async start() {
    if (this.isRunning) {
      return;
    }

    try {
      this.isRunning = true;
      
      // Carregar estado persistido
      await this.loadState();
      
      // Iniciar salvamento automático
      this.startAutoSave();
      
      info('🚀 QueueManager iniciado', {
        queues: Object.keys(this.queues).map(name => ({
          name,
          size: this.queues[name].size()
        }))
      });
      
      this.emit('started');
      
    } catch (err) {
      error('Erro ao iniciar QueueManager', err);
      this.isRunning = false;
      throw err;
    }
  }

  /**
   * Para o gerenciador graciosamente
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    info('🛑 Parando QueueManager...');
    
    this.isRunning = false;
    
    // Parar auto-save
    if (this.saveTimer) {
      clearInterval(this.saveTimer);
      this.saveTimer = null;
    }
    
    // Salvar estado final
    await this.saveState();
    
    info('✅ QueueManager parado', {
      finalStats: this.getStats()
    });
    
    this.emit('stopped');
  }

  /**
   * Registra um worker
   */
  registerWorker(workerId, workerName, workerInstance = null) {
    this.workers.set(workerId, {
      id: workerId,
      name: workerName,
      instance: workerInstance,
      registeredAt: Date.now(),
      lastSeen: Date.now()
    });
    
    info(`Worker registrado: ${workerName}`, { workerId });
    this.emit('workerRegistered', { workerId, workerName });
  }

  /**
   * Remove registro de um worker
   */
  unregisterWorker(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      this.workers.delete(workerId);
      info(`Worker removido: ${worker.name}`, { workerId });
      this.emit('workerUnregistered', { workerId, workerName: worker.name });
    }
  }

  /**
   * Atualiza last seen de um worker
   */
  updateWorkerActivity(workerId) {
    const worker = this.workers.get(workerId);
    if (worker) {
      worker.lastSeen = Date.now();
    }
  }

  /**
   * Adiciona item à fila
   */
  async addToQueue(queueName, item, priority = 'normal') {
    if (!this.queues[queueName]) {
      throw new Error(`Fila '${queueName}' não existe`);
    }

    const queue = this.queues[queueName];
    
    try {
      const itemId = queue.add(item, priority);
      
      info(`Item adicionado à fila ${queueName}`, {
        itemId,
        priority,
        queueSize: queue.size()
      });
      
      this.emit('itemAdded', { queueName, itemId, queueSize: queue.size() });
      
      return itemId;
    } catch (err) {
      warn(`Erro ao adicionar à fila ${queueName}`, { error: err.message });
      throw err;
    }
  }

  /**
   * Remove próximo item da fila
   */
  async getFromQueue(queueName, workerId = null) {
    if (!this.queues[queueName]) {
      throw new Error(`Fila '${queueName}' não existe`);
    }

    const queue = this.queues[queueName];
    
    if (queue.isEmpty()) {
      return null;
    }
    
    // Atualizar atividade do worker se fornecido
    if (workerId) {
      this.updateWorkerActivity(workerId);
    }
    
    const item = queue.next(workerId);
    
    if (item) {
      info(`Item removido da fila ${queueName}`, {
        itemId: item.id,
        workerId,
        queueSize: queue.size()
      });
      
      this.emit('itemRemoved', { queueName, item, workerId, queueSize: queue.size() });
    }
    
    return item;
  }

  /**
   * Marca item como processado com sucesso
   */
  async markAsProcessed(queueName, itemId, result = null) {
    const queue = this.queues[queueName];
    if (queue && queue.markCompleted) {
      queue.markCompleted(itemId, result);
    }
    
    info(`Item processado: ${itemId}`, { queueName, result });
    this.emit('itemProcessed', { queueName, itemId, result });
  }

  /**
   * Marca item como falhado e possivelmente recoloca na fila
   */
  async markAsFailed(queueName, itemId, errorObj, shouldRetry = true) {
    const queue = this.queues[queueName];
    if (queue && queue.markFailed) {
      queue.markFailed(itemId, errorObj, shouldRetry);
    }
    
    error(`Item falhou: ${itemId}`, { queueName, error: errorObj.message });
    this.emit('itemFailed', { queueName, itemId, error: errorObj });
  }

  /**
   * Retorna tamanho de uma fila
   */
  getQueueSize(queueName) {
    return this.queues[queueName]?.size() || 0;
  }

  /**
   * Retorna estatísticas de todas as filas
   */
  getStats() {
    const queueSizes = {};
    const queueStats = {};
    
    for (const [name, queue] of Object.entries(this.queues)) {
      queueSizes[name] = queue.size();
      queueStats[name] = queue.getStats ? queue.getStats() : {};
    }
    
    return {
      sizes: queueSizes,
      stats: queueStats,
      workers: Array.from(this.workers.values()).map(worker => ({
        id: worker.id,
        name: worker.name,
        registeredAt: worker.registeredAt,
        lastSeen: worker.lastSeen,
        idleTime: Date.now() - worker.lastSeen
      }))
    };
  }

  /**
   * Limpa uma fila
   */
  clearQueue(queueName) {
    if (!this.queues[queueName]) {
      throw new Error(`Fila '${queueName}' não existe`);
    }
    
    const queue = this.queues[queueName];
    const size = queue.size();
    const itemsRemoved = queue.clear();
    
    warn(`Fila ${queueName} limpa`, { itemsRemoved });
    this.emit('queueCleared', { queueName, itemsRemoved });
  }

  /**
   * Salva estado das filas em disco
   */
  async saveState() {
    if (!this.isRunning) {
      return;
    }

    try {
      await fs.ensureDir(this.options.persistencePath);
      
      const queueData = {};
      for (const [name, queue] of Object.entries(this.queues)) {
        queueData[name] = queue.toJSON ? queue.toJSON() : queue;
      }
      
      const state = {
        timestamp: Date.now(),
        queues: queueData
      };
      
      const statePath = path.join(this.options.persistencePath, 'queues.json');
      await fs.writeJSON(statePath, state, { spaces: 2 });
      
      info('Estado das filas salvo', { 
        path: statePath,
        queueSizes: Object.entries(this.queues).map(([name, queue]) => ({
          name, 
          size: queue.size()
        }))
      });
      
    } catch (err) {
      error('Erro ao salvar estado das filas', err);
    }
  }

  /**
   * Carrega estado das filas do disco
   */
  async loadState() {
    try {
      const statePath = path.join(this.options.persistencePath, 'queues.json');
      
      if (await fs.pathExists(statePath)) {
        const state = await fs.readJSON(statePath);
        
        // Restaurar filas especializadas
        if (state.queues) {
          for (const [name, queueData] of Object.entries(state.queues)) {
            if (this.queues[name] && this.queues[name].fromJSON) {
              this.queues[name].fromJSON(queueData);
            }
          }
        }
        
        info('Estado das filas carregado', {
          timestamp: new Date(state.timestamp).toLocaleString('pt-BR'),
          queueSizes: Object.entries(this.queues).map(([name, queue]) => ({
            name,
            size: queue.size()
          }))
        });
      } else {
        info('Nenhum estado anterior encontrado, iniciando com filas vazias');
      }
      
    } catch (err) {
      error('Erro ao carregar estado das filas', err);
      info('Iniciando com filas vazias');
    }
  }

  /**
   * Inicia salvamento automático
   */
  startAutoSave() {
    this.saveTimer = setInterval(() => {
      this.saveState();
    }, this.options.saveInterval);
  }

  /**
   * Retorna status resumido para logging
   */
  getStatusSummary() {
    const stats = this.getStats();
    let totalProcessed = 0;
    let totalFailed = 0;
    
    // Somar estatísticas das filas especializadas
    for (const queueStats of Object.values(stats.stats)) {
      if (queueStats.processed) totalProcessed += queueStats.processed;
      if (queueStats.failed) totalFailed += queueStats.failed;
    }
    
    return {
      queues: stats.sizes,
      workers: stats.workers.length,
      totalProcessed,
      totalFailed
    };
  }
}

module.exports = QueueManager;
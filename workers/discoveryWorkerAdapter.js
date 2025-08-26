/**
 * DISCOVERY WORKER ADAPTER
 * Adapta o novo DiscoveryWorker para trabalhar com o sistema paralelo existente
 */

const EventEmitter = require('events');
const { Worker } = require('worker_threads');
const path = require('path');
const { info, error, warn } = require('../utils/logger');

class DiscoveryWorkerAdapter extends EventEmitter {
  constructor() {
    super();
    
    this.id = `discovery-${Date.now()}`;
    this.name = 'Enhanced Discovery Worker';
    this.isRunning = false;
    this.queueManager = null;
    this.resourceMonitor = null;
    this.worker = null;
    
    this.stats = {
      tasksProcessed: 0,
      packsFound: 0,
      errors: 0,
      startTime: null
    };
  }

  /**
   * Configura o QueueManager
   */
  setQueueManager(queueManager) {
    this.queueManager = queueManager;
    info(`🔗 DiscoveryWorker conectado ao QueueManager`);
  }

  /**
   * Configura o ResourceMonitor
   */
  setResourceMonitor(resourceMonitor) {
    this.resourceMonitor = resourceMonitor;
    info(`🔗 DiscoveryWorker conectado ao ResourceMonitor`);
  }

  /**
   * Inicia o discovery worker
   */
  async start() {
    if (this.isRunning) {
      warn('⚠️  DiscoveryWorker já está rodando');
      return;
    }

    try {
      info(`🚀 Iniciando ${this.name}...`);
      
      // Criar worker thread para descoberta
      const workerPath = path.join(__dirname, 'discoveryWorker.js');
      this.worker = new Worker(`
        const { parentPort, workerData } = require('worker_threads');
        const { run } = require('${workerPath.replace(/\\/g, '\\\\')}');
        run(parentPort, workerData.config);
      `, {
        eval: true,
        workerData: { 
          config: {},
          workerId: this.id 
        }
      });

      // Configurar event listeners do worker
      this.worker.on('message', (message) => {
        this.handleWorkerMessage(message);
      });

      this.worker.on('error', (err) => {
        error('❌ Erro no Discovery Worker:', err);
        this.stats.errors++;
        this.emit('error', err);
      });

      this.worker.on('exit', (code) => {
        if (code !== 0) {
          error(`❌ Discovery Worker saiu com código: ${code}`);
        } else {
          info(`✅ Discovery Worker finalizado`);
        }
      });

      this.isRunning = true;
      this.stats.startTime = Date.now();
      
      info(`✅ ${this.name} iniciado com sucesso`);
      
    } catch (err) {
      error('❌ Erro ao iniciar DiscoveryWorker:', err);
      throw err;
    }
  }

  /**
   * Handle de mensagens do worker thread
   */
  handleWorkerMessage(message) {
    const { type, pack, stats, error: workerError } = message;

    switch (type) {
      case 'pack_found':
        this.handlePackFound(pack);
        break;
        
      case 'discovery_cycle_complete':
        this.handleCycleComplete(stats);
        break;
        
      case 'error':
        this.handleWorkerError(workerError);
        break;
        
      default:
        warn(`⚠️  Mensagem desconhecida do worker: ${type}`);
    }
  }

  /**
   * Processa pack encontrado pelo worker
   */
  handlePackFound(pack) {
    if (!this.queueManager || !pack) {
      warn('⚠️  QueueManager não configurado ou pack inválido');
      return;
    }

    try {
      // Determinar complexidade do pack para classificação
      const complexity = this.calculatePackComplexity(pack);
      
      // Adicionar à fila apropriada
      if (complexity <= 0.3) {
        // Pack simples -> Light Queue
        this.queueManager.addToLightQueue({
          type: 'pack_processing',
          pack: pack,
          priority: 1,
          source: 'discovery',
          complexity: complexity
        });
      } else {
        // Pack complexo -> Heavy Queue
        this.queueManager.addToHeavyQueue({
          type: 'pack_processing',
          pack: pack,
          priority: complexity > 0.7 ? 3 : 2,
          source: 'discovery',
          complexity: complexity
        });
      }

      this.stats.packsFound++;
      this.stats.tasksProcessed++;

      // Emitir evento de tarefa completada
      this.emit('taskCompleted', {
        taskName: `pack_${pack.identifier}`,
        pack: pack,
        complexity: complexity,
        processingTime: 100, // Estimativa
        source: 'discovery'
      });

      info(`📦 Pack descoberto e classificado: ${pack.name} (complexidade: ${complexity.toFixed(2)})`);

    } catch (err) {
      error('❌ Erro ao processar pack encontrado:', err);
      this.stats.errors++;
    }
  }

  /**
   * Handle de ciclo completo
   */
  handleCycleComplete(stats) {
    info('🔄 Ciclo de descoberta completo', stats);
    
    this.emit('cycleComplete', {
      stats: stats,
      workerStats: this.stats
    });
  }

  /**
   * Handle de erro do worker
   */
  handleWorkerError(workerError) {
    error('❌ Erro reportado pelo worker:', workerError);
    this.stats.errors++;
    this.emit('error', new Error(workerError));
  }

  /**
   * Calcula complexidade do pack para classificação
   */
  calculatePackComplexity(pack) {
    let complexity = 0;
    
    // Fatores que aumentam complexidade:
    
    // 1. Número de stickers (mais stickers = mais complexo)
    const stickerCount = pack.stickerCount || 0;
    complexity += Math.min(stickerCount / 30, 0.3); // Máximo 0.3 por quantidade
    
    // 2. Animação (stickers animados são mais complexos)
    if (pack.isAnimated) {
      complexity += 0.2;
    }
    
    // 3. Tamanho dos arquivos (estimativa baseada na quantidade)
    if (pack.resourceFiles && pack.resourceFiles.length > 15) {
      complexity += 0.1;
    }
    
    // 4. Autor desconhecido (pode requerer processamento extra)
    if (!pack.author || pack.author === 'Autor Desconhecido') {
      complexity += 0.1;
    }
    
    // 5. Nome longo (pode indicar complexidade)
    if (pack.name && pack.name.length > 50) {
      complexity += 0.1;
    }

    // Garantir que complexidade está entre 0 e 1
    return Math.min(Math.max(complexity, 0), 1);
  }

  /**
   * Para o discovery worker
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    try {
      info(`🛑 Parando ${this.name}...`);
      
      if (this.worker) {
        // Enviar sinal de parada
        this.worker.postMessage({ type: 'stop' });
        
        // Aguardar um pouco antes de terminar forçadamente
        setTimeout(() => {
          if (this.worker && !this.worker.killed) {
            this.worker.terminate();
          }
        }, 5000);
      }
      
      this.isRunning = false;
      
      const runtime = this.stats.startTime ? (Date.now() - this.stats.startTime) / 1000 : 0;
      
      info(`✅ ${this.name} parado`, {
        runtime: `${runtime.toFixed(1)}s`,
        stats: this.stats
      });
      
    } catch (err) {
      error('❌ Erro ao parar DiscoveryWorker:', err);
    }
  }

  /**
   * Retorna estatísticas do worker
   */
  getStats() {
    const runtime = this.stats.startTime ? (Date.now() - this.stats.startTime) / 1000 : 0;
    
    return {
      ...this.stats,
      runtime: `${runtime.toFixed(1)}s`,
      packsPerSecond: runtime > 0 ? (this.stats.packsFound / runtime).toFixed(2) : '0',
      successRate: this.stats.tasksProcessed > 0 ? 
        ((this.stats.tasksProcessed - this.stats.errors) / this.stats.tasksProcessed * 100).toFixed(1) + '%' : 
        '100%'
    };
  }
}

module.exports = DiscoveryWorkerAdapter;
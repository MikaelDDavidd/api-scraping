#!/usr/bin/env node

/**
 * SERVIÇO DE PROCESSAMENTO
 * 
 * Consome fila de packs descobertos e processa em multithread
 * Pode rodar múltiplas instâncias simultaneamente
 */

require('dotenv').config();

const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs-extra');

class ProcessorService {
  constructor() {
    // Detectar modo dev/prod
    this.isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
    
    // Configurações
    this.maxWorkers = this.isDev ? 2 : 4;
    this.queueFile = path.join(__dirname, 'discovered_packs.json');
    this.processedFile = path.join(__dirname, 'processed_packs.json');
    
    // Paths
    this.packsRepository = this.isDev 
      ? path.join(__dirname, 'stickers_dev')
      : '/home/ubuntu/stickers';
    
    // Workers
    this.activeWorkers = new Set();
    this.isRunning = false;
    this.processedCount = 0;
    this.sessionStart = Date.now();
    
    // Intervalo para verificar fila
    this.queueCheckInterval = 5000; // 5 segundos
    
    console.log(`🔧 Processor Service iniciado (${this.isDev ? 'DEV' : 'PROD'})`);
    console.log(`📁 Salvando em: ${this.packsRepository}`);
    
    this.ensureDirectories();
  }

  async ensureDirectories() {
    await fs.ensureDir(this.packsRepository);
  }

  /**
   * Inicia serviço de processamento
   */
  async start() {
    console.log('🚀 Iniciando processamento de fila...');
    
    this.isRunning = true;
    
    // Loop principal - verifica fila continuamente
    while (this.isRunning) {
      try {
        const packsToProcess = await this.getPacksFromQueue();
        
        if (packsToProcess.length > 0) {
          console.log(`📦 Encontrados ${packsToProcess.length} packs na fila para processar`);
          await this.processPacksBatch(packsToProcess);
        } else {
          // console.log('⏳ Aguardando novos packs na fila...');
        }
        
        await this.sleep(this.queueCheckInterval);
        
      } catch (error) {
        console.error('❌ Erro no loop de processamento:', error.message);
        await this.sleep(10000); // Wait mais tempo em erro
      }
    }
  }

  /**
   * Lê e consome packs da fila compartilhada
   */
  async getPacksFromQueue() {
    try {
      if (!await fs.pathExists(this.queueFile)) {
        return [];
      }

      const queueData = await fs.readJson(this.queueFile);
      const allPacks = queueData.packs || [];
      
      if (allPacks.length === 0) {
        return [];
      }

      // Pegar um lote para processar (evitar conflito entre instâncias)
      const batchSize = this.maxWorkers * 3; // 3 packs por worker
      const batch = allPacks.slice(0, batchSize);
      const remaining = allPacks.slice(batchSize);

      // Atualizar fila removendo packs que vamos processar
      await fs.writeJson(this.queueFile, {
        ...queueData,
        packs: remaining,
        totalPacks: remaining.length,
        lastConsumed: new Date().toISOString()
      }, { spaces: 2 });

      console.log(`📋 Consumindo ${batch.length} packs da fila (${remaining.length} restantes)`);
      return batch;

    } catch (error) {
      console.error('❌ Erro ao ler fila:', error.message);
      return [];
    }
  }

  /**
   * Processa lote de packs com workers
   */
  async processPacksBatch(packs) {
    const packQueue = [...packs]; // Cópia para consumir
    const promises = [];
    
    // Spawnar workers
    for (let i = 0; i < this.maxWorkers && packQueue.length > 0; i++) {
      promises.push(this.spawnWorker(i, packQueue));
    }
    
    await Promise.all(promises);
  }

  /**
   * Cria worker para processar packs
   */
  async spawnWorker(workerId, packQueue) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'pack_worker.js'), {
        workerData: {
          workerId,
          isDev: this.isDev,
          packsRepository: this.packsRepository,
          supabaseUrl: process.env.SUPABASE_URL,
          supabaseKey: process.env.SUPABASE_SERVICE_KEY
        }
      });

      this.activeWorkers.add(worker);
      let processed = 0;

      worker.on('message', async (message) => {
        if (message.type === 'READY') {
          await this.sendNextPackToWorker(worker, packQueue);
          
        } else if (message.type === 'PACK_SUCCESS') {
          processed++;
          this.processedCount++;
          await this.logProcessedPack(message.packId, true, message.stickers);
          console.log(`✅ Worker ${workerId}: ${message.packId} (${message.stickers} stickers) [${this.processedCount} total]`);
          
          await this.sendNextPackToWorker(worker, packQueue);
          
        } else if (message.type === 'PACK_ERROR') {
          processed++;
          await this.logProcessedPack(message.packId, false, 0, message.error);
          console.log(`❌ Worker ${workerId}: ${message.packId} - ${message.error}`);
          
          await this.sendNextPackToWorker(worker, packQueue);
          
        } else if (message.type === 'WORKER_DONE') {
          worker.terminate();
          console.log(`🏁 Worker ${workerId} finalizado (${processed} packs processados)`);
          resolve();
        }
      });

      worker.on('error', (error) => {
        console.error(`❌ Worker ${workerId} erro:`, error);
        reject(error);
      });

      worker.on('exit', () => {
        this.activeWorkers.delete(worker);
      });
    });
  }

  async sendNextPackToWorker(worker, packQueue) {
    if (packQueue.length > 0) {
      const packData = packQueue.shift();
      worker.postMessage({
        type: 'PROCESS_PACK',
        pack: packData.pack, // Pack completo da API
        metadata: {
          packId: packData.packId,
          discoveredBy: packData.discoveredBy,
          discoveredAt: packData.discoveredAt
        }
      });
    } else {
      worker.postMessage({ type: 'FINISH' });
    }
  }

  /**
   * Log de packs processados para estatísticas
   */
  async logProcessedPack(packId, success, stickerCount, error = null) {
    try {
      let processedLog = { processed: [] };
      
      if (await fs.pathExists(this.processedFile)) {
        processedLog = await fs.readJson(this.processedFile);
      }

      processedLog.processed.push({
        packId,
        success,
        stickerCount,
        error,
        processedAt: new Date().toISOString(),
        processorSession: this.sessionStart
      });

      // Manter apenas últimos 1000 registros
      if (processedLog.processed.length > 1000) {
        processedLog.processed = processedLog.processed.slice(-1000);
      }

      await fs.writeJson(this.processedFile, {
        ...processedLog,
        lastUpdated: new Date().toISOString(),
        totalProcessedThisSession: this.processedCount
      }, { spaces: 2 });

    } catch (error) {
      console.error('⚠️ Erro ao logar pack processado:', error.message);
    }
  }

  /**
   * Estatísticas do processamento
   */
  getStats() {
    const runtime = Date.now() - this.sessionStart;
    const runtimeMin = Math.round(runtime / 1000 / 60);
    const packsPerMin = runtimeMin > 0 ? Math.round(this.processedCount / runtimeMin) : 0;

    return {
      processedCount: this.processedCount,
      runtimeMinutes: runtimeMin,
      packsPerMinute: packsPerMin,
      activeWorkers: this.activeWorkers.size
    };
  }

  /**
   * Para o serviço gracefully
   */
  async stop() {
    console.log('🛑 Parando processor service...');
    this.isRunning = false;
    
    // Terminar workers
    for (const worker of this.activeWorkers) {
      await worker.terminate();
    }
    
    const stats = this.getStats();
    console.log(`📊 Sessão finalizada: ${stats.processedCount} packs em ${stats.runtimeMinutes}min (${stats.packsPerMinute}/min)`);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Configurar SUPABASE_URL e SUPABASE_SERVICE_KEY no .env');
    process.exit(1);
  }

  const processor = new ProcessorService();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Recebido SIGINT...');
    await processor.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\\n🛑 Recebido SIGTERM...');
    await processor.stop();
    process.exit(0);
  });

  // Mostrar stats a cada minuto
  setInterval(() => {
    const stats = processor.getStats();
    if (stats.processedCount > 0) {
      console.log(`📊 Stats: ${stats.processedCount} packs, ${stats.runtimeMinutes}min, ${stats.packsPerMinute}/min`);
    }
  }, 60000);

  processor.start().catch(error => {
    console.error('❌ Erro fatal no processor:', error);
    process.exit(1);
  });
}

module.exports = ProcessorService;
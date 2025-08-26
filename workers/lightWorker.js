/**
 * LIGHT WORKER
 * Processa packs estáticos (mais rápido)
 * Baseado na lógica original de processamento
 */

const PackProcessor = require('../services/packProcessor');
const SupabaseClient = require('../services/supabaseClient');
const { info, error, warn } = require('../utils/logger');

class LightWorker {
  constructor(parentPort, workerId, config) {
    this.parentPort = parentPort;
    this.workerId = workerId;
    this.config = config;
    
    this.packProcessor = new PackProcessor();
    this.supabaseClient = new SupabaseClient();
    this.isRunning = false;
    this.currentPack = null;
    
    this.stats = {
      processed: 0,
      failed: 0,
      startTime: Date.now()
    };
  }

  async initialize() {
    info(`⚡ Light Worker ${this.workerId} inicializado`);
  }

  async start() {
    this.isRunning = true;
    await this.initialize();
    
    // Solicitar trabalho imediatamente
    this.requestWork();
    
    // Loop de verificação
    this.workLoop();
  }

  workLoop() {
    setInterval(() => {
      if (!this.isRunning) return;
      
      // Se não está processando nada, solicitar trabalho
      if (!this.currentPack) {
        this.requestWork();
      }
      
    }, 5000); // Verificar a cada 5 segundos
  }

  requestWork() {
    this.parentPort.postMessage({
      type: 'request_work',
      workerId: this.workerId
    });
  }

  async processPack(pack) {
    this.currentPack = pack;
    const startTime = Date.now();
    
    info(`⚡ [Worker ${this.workerId}] Processando pack estático: ${pack.identifier}`);
    
    try {
      // Processar usando a lógica original otimizada
      const result = await this.packProcessor.processStaticPack(pack);
      
      if (result.success) {
        // Salvar no Supabase
        await this.savePackToDatabase(pack, result);
        
        const processingTime = Date.now() - startTime;
        this.stats.processed++;
        
        this.parentPort.postMessage({
          type: 'pack_processed',
          packId: pack.identifier,
          stickers: result.stickerCount,
          processingTime
        });
        
        info(`✅ [Worker ${this.workerId}] Pack ${pack.identifier} processado em ${processingTime}ms`);
        
      } else {
        throw new Error(result.error || 'Falha no processamento');
      }
      
    } catch (err) {
      error(`❌ [Worker ${this.workerId}] Erro ao processar ${pack.identifier}:`, err);
      
      this.stats.failed++;
      this.parentPort.postMessage({
        type: 'pack_failed',
        packId: pack.identifier,
        error: err.message
      });
    }
    
    this.currentPack = null;
    
    // Solicitar próximo trabalho
    setTimeout(() => {
      this.requestWork();
    }, 1000);
  }

  async savePackToDatabase(pack, result) {
    try {
      // Salvar pack (baseado no schema original)
      const packData = {
        identifier: pack.identifier,
        name: pack.name,
        publisher: pack.author,
        tray: result.trayPath,
        is_animated: false, // Light worker só processa estáticos
        downloads: 0,
        lang: pack.language,
        origin: 'stickerly',
        sticker_count: result.stickerCount,
        file_size: result.totalSize,
        created_at: new Date().toISOString()
      };
      
      const { data: savedPack, error: packError } = await this.supabaseClient.supabase.from('packs').insert(packData).select().single();
      if (packError) throw packError;
      
      // Salvar stickers individuais
      for (let i = 0; i < result.stickers.length; i++) {
        const sticker = result.stickers[i];
        const stickerData = {
          pack_id: savedPack.id,
          name: sticker.filename,
          downloads: 0,
          size: sticker.size,
          order_index: i,
          emoji: sticker.emoji || null
        };
        
        const { error: stickerError } = await this.supabaseClient.supabase.from('stickers').insert(stickerData);
        if (stickerError) throw stickerError;
      }
      
      info(`💾 [Worker ${this.workerId}] Pack ${pack.identifier} salvo no banco`);
      
    } catch (err) {
      error(`❌ [Worker ${this.workerId}] Erro ao salvar ${pack.identifier}:`, err);
      throw err;
    }
  }

  getStats() {
    const runtime = (Date.now() - this.stats.startTime) / 1000;
    const rate = runtime > 0 ? (this.stats.processed / runtime * 60).toFixed(1) : 0;
    
    return {
      workerId: this.workerId,
      processed: this.stats.processed,
      failed: this.stats.failed,
      rate: `${rate}/min`,
      currentPack: this.currentPack?.identifier || 'idle'
    };
  }

  stop() {
    this.isRunning = false;
  }
}

module.exports = {
  run: (parentPort, workerId, config) => {
    const worker = new LightWorker(parentPort, workerId, config);
    worker.start();
    
    // Escutar comandos do processo principal
    parentPort.on('message', (message) => {
      switch (message.type) {
        case 'process_pack':
          worker.processPack(message.pack);
          break;
          
        case 'get_stats':
          parentPort.postMessage({
            type: 'stats',
            stats: worker.getStats()
          });
          break;
          
        case 'stop':
          worker.stop();
          break;
      }
    });
  }
};
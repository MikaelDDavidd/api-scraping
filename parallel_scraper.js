#!/usr/bin/env node

/**
 * STICKERS SCRAPER - VERSÃO PARALELA LIMPA
 * Baseado na API original com sistema de workers paralelos
 * 
 * Arquitetura:
 * DiscoveryWorker → Encontra novos packs
 * LightWorker     → Processa packs estáticos (rápido)
 * HeavyWorker     → Processa packs animados (lento)
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs').promises;
const SupabaseClient = require('./services/supabaseClient');
const PackCache = require('./services/packCache');
const { info, error, warn } = require('./utils/logger');

class ParallelScraper {
  constructor() {
    this.workers = {
      discovery: null,
      light: [],
      heavy: []
    };
    
    this.config = {
      maxLightWorkers: 2,
      maxHeavyWorkers: 1,
      queueCheckInterval: 5000,
      maxQueueSize: 100
    };
    
    this.queues = {
      discovery: [],
      light: [],
      heavy: []
    };
    
    this.stats = {
      discovered: 0,
      processed: 0,
      errors: 0,
      startTime: Date.now()
    };
    
    this.supabase = new SupabaseClient();
    this.packCache = new PackCache(this.supabase);
    this.isRunning = false;
  }

  async start() {
    info('🚀 Iniciando Stickers Scraper Paralelo');
    
    // Verificar conexão Supabase
    await this.checkSupabaseConnection();
    
    // Inicializar cache de packs (evita milhares de queries)
    await this.packCache.initialize();
    
    // Exibir estatísticas do banco
    await this.showDatabaseStats();
    
    this.isRunning = true;
    
    // Iniciar workers
    await this.startDiscoveryWorker();
    await this.startProcessingWorkers();
    
    // Loop principal
    this.mainLoop();
    
    info('✅ Sistema iniciado com sucesso!');
  }

  async checkSupabaseConnection() {
    try {
      // Teste simples de conexão usando o cliente interno
      const { error } = await this.supabase.supabase.from('packs').select('count', { count: 'exact', head: true });
      if (error) throw error;
      info('✅ Conexão com Supabase estabelecida');
    } catch (err) {
      error('❌ Erro na conexão com Supabase:', err.message);
      throw err;
    }
  }

  async showDatabaseStats() {
    try {
      // Obter contagens usando count, não dados completos
      const { count: totalPacks, error: packsError } = await this.supabase.supabase.from('packs')
        .select('*', { count: 'exact', head: true });
      
      if (packsError) throw packsError;
      
      const { count: animatedPacks, error: animatedError } = await this.supabase.supabase.from('packs')
        .select('*', { count: 'exact', head: true })
        .eq('is_animated', true);
        
      if (animatedError) throw animatedError;
      
      const staticPacks = (totalPacks || 0) - (animatedPacks || 0);
      
      const { count: totalStickers, error: stickersError } = await this.supabase.supabase.from('stickers')
        .select('*', { count: 'exact', head: true });
        
      if (stickersError) throw stickersError;
      
      const averageStickersPerPack = totalPacks > 0 ? (totalStickers || 0) / totalPacks : 0;
      
      info('┌─────────────────────────────────────────────────────────────────────────────┐');
      info('│                          📊 ESTATÍSTICAS DO BANCO                          │');
      info('├─────────────────────────────────────────────────────────────────────────────┤');
      info(`│ 📦 Total de Packs:    ${String(totalPacks || 0).padStart(8)} │ 🎯 Figurinhas:    ${String(totalStickers || 0).padStart(8)} │`);
      info(`│ 🎬 Animados:          ${String(animatedPacks || 0).padStart(8)} │ 🖼️  Estáticos:       ${String(staticPacks).padStart(8)} │`);
      info(`│ 📊 Média fig/pack:    ${String(Math.round(averageStickersPerPack)).padStart(8)} │                              │`);
      info('└─────────────────────────────────────────────────────────────────────────────┘');
      
    } catch (err) {
      warn('Erro ao obter estatísticas do banco:', err.message);
    }
  }

  async startDiscoveryWorker() {
    info('🔍 Iniciando Discovery Worker...');
    
    this.workers.discovery = new Worker(__filename, {
      workerData: { 
        type: 'discovery',
        config: this.config
      }
    });
    
    this.workers.discovery.on('message', (message) => {
      this.handleDiscoveryMessage(message);
    });
    
    this.workers.discovery.on('error', (err) => {
      error('❌ Erro no Discovery Worker:', err);
      this.stats.errors++;
    });
  }

  async startProcessingWorkers() {
    info(`⚡ Iniciando ${this.config.maxLightWorkers} Light Workers...`);
    
    // Light Workers (packs estáticos)
    for (let i = 0; i < this.config.maxLightWorkers; i++) {
      const worker = new Worker(__filename, {
        workerData: { 
          type: 'light',
          workerId: i,
          config: this.config
        }
      });
      
      worker.on('message', (message) => {
        this.handleProcessingMessage(message, 'light');
      });
      
      worker.on('error', (err) => {
        error(`❌ Erro no Light Worker ${i}:`, err);
        this.stats.errors++;
      });
      
      this.workers.light.push(worker);
    }
    
    info(`🔥 Iniciando ${this.config.maxHeavyWorkers} Heavy Workers...`);
    
    // Heavy Workers (packs animados)
    for (let i = 0; i < this.config.maxHeavyWorkers; i++) {
      const worker = new Worker(__filename, {
        workerData: { 
          type: 'heavy',
          workerId: i,
          config: this.config
        }
      });
      
      worker.on('message', (message) => {
        this.handleProcessingMessage(message, 'heavy');
      });
      
      worker.on('error', (err) => {
        error(`❌ Erro no Heavy Worker ${i}:`, err);
        this.stats.errors++;
      });
      
      this.workers.heavy.push(worker);
    }
  }

  handleDiscoveryMessage(message) {
    switch (message.type) {
      case 'pack_found':
        this.stats.discovered++;
        
        // Classificar e adicionar à fila apropriada
        if (message.pack.isAnimated) {
          this.queues.heavy.push(message.pack);
          info(`📦 Pack animado descoberto: ${message.pack.identifier} (Heavy Queue: ${this.queues.heavy.length})`);
        } else {
          this.queues.light.push(message.pack);
          info(`📦 Pack estático descoberto: ${message.pack.identifier} (Light Queue: ${this.queues.light.length})`);
        }
        break;
        
      case 'discovery_complete':
        info('✅ Discovery round completa');
        break;
        
      case 'error':
        error('❌ Erro no Discovery:', message.error);
        this.stats.errors++;
        break;
    }
  }

  handleProcessingMessage(message, workerType) {
    switch (message.type) {
      case 'pack_processed':
        this.stats.processed++;
        // Atualizar cache: pack processado com sucesso
        this.packCache.markPackAsAdded(message.packId);
        info(`✅ Pack processado (${workerType}): ${message.packId} - ${message.stickers} stickers`);
        break;
        
      case 'pack_failed':
        // Atualizar cache: remover da fila de processamento
        this.packCache.markPackAsFailed(message.packId);
        warn(`⚠️  Pack falhou (${workerType}): ${message.packId} - ${message.error}`);
        this.stats.errors++;
        break;
        
      case 'request_work':
        this.sendWorkToWorker(message.workerId, workerType);
        break;
    }
  }

  sendWorkToWorker(workerId, workerType) {
    const queue = this.queues[workerType];
    const workers = this.workers[workerType];
    
    if (queue.length > 0 && workers[workerId]) {
      const pack = queue.shift();
      workers[workerId].postMessage({
        type: 'process_pack',
        pack: pack
      });
    }
  }

  mainLoop() {
    setInterval(async () => {
      if (!this.isRunning) return;
      
      // Estatísticas periódicas
      const runtime = Math.floor((Date.now() - this.stats.startTime) / 1000);
      const rate = runtime > 0 ? (this.stats.processed / runtime * 60).toFixed(1) : 0;
      const cacheStats = this.packCache.getStats();
      
      info(`📈 Status: ${this.stats.discovered} descobertos | ${this.stats.processed} processados | ${rate}/min`);
      info(`📊 Cache: ${cacheStats.existingPacks} existentes | ${cacheStats.processingPacks} processando | Filas: L:${this.queues.light.length} H:${this.queues.heavy.length}`);
      
      // Atualizar cache se necessário
      await this.packCache.updateCacheIfNeeded();
      
    }, 30000); // A cada 30 segundos
  }

  async shutdown() {
    info('🛑 Iniciando shutdown...');
    this.isRunning = false;
    
    // Fechar workers
    if (this.workers.discovery) {
      await this.workers.discovery.terminate();
    }
    
    for (const worker of this.workers.light) {
      await worker.terminate();
    }
    
    for (const worker of this.workers.heavy) {
      await worker.terminate();
    }
    
    info('✅ Shutdown completo');
  }
}

// =============================================================================
// WORKER IMPLEMENTATIONS
// =============================================================================

if (!isMainThread) {
  const { type, workerId, config } = workerData;
  
  switch (type) {
    case 'discovery':
      require('./workers/discoveryWorker').run(parentPort, config);
      break;
      
    case 'light':
      require('./workers/lightWorker').run(parentPort, workerId, config);
      break;
      
    case 'heavy':
      require('./workers/heavyWorker').run(parentPort, workerId, config);
      break;
  }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

if (isMainThread) {
  const scraper = new ParallelScraper();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    await scraper.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await scraper.shutdown();
    process.exit(0);
  });
  
  // Start scraper
  scraper.start().catch(err => {
    error('💥 Falha crítica:', err);
    process.exit(1);
  });
}
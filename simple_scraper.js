#!/usr/bin/env node

/**
 * SCRAPER MULTITHREAD SIMPLES
 * Baseado na API original mas com Workers para paralelização
 * 
 * Features:
 * - Multithread para busca e processamento simultâneo
 * - Verificação paginada no Supabase para evitar duplicados
 * - Salvamento no Supabase + arquivos locais (dev/prod)
 * - Limpeza automática de logs antigos
 */

require('dotenv').config();

const { Worker } = require('worker_threads');
const path = require('path');
const fs = require('fs-extra');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

class SimpleMultithreadScraper {
  constructor() {
    // Detectar modo dev/prod
    this.isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
    
    // Configurações
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      {
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );

    this.maxWorkers = this.isDev ? 2 : 4; // Menos workers em dev
    this.activeWorkers = new Set();
    this.packQueue = [];
    this.existingPacks = new Set(); // Cache de packs existentes
    
    // Paths condicionais
    this.dataCapture = path.join(__dirname, 'data_captured');
    this.packsRepository = this.isDev 
      ? path.join(__dirname, 'stickers_dev') // Dev: pasta local
      : '/home/ubuntu/stickers'; // Prod: VPS
    
    // Controle de logs
    this.maxLogFiles = 100; // Máximo 100 arquivos de log
    this.logCleanupInterval = 30 * 60 * 1000; // Limpar a cada 30min
    
    this.ensureDirectories();
    this.startLogCleanup();
    this.loadExistingPacks();
  }

  async ensureDirectories() {
    await fs.ensureDir(this.dataCapture);
    await fs.ensureDir(this.packsRepository);
    console.log(`📁 Modo: ${this.isDev ? 'DEV' : 'PROD'} | Salvando em: ${this.packsRepository}`);
  }

  /**
   * Carrega packs existentes do Supabase com paginação
   */
  async loadExistingPacks() {
    console.log('📋 Carregando packs existentes do Supabase...');
    
    let page = 0;
    const pageSize = 1000;
    let totalLoaded = 0;

    while (true) {
      try {
        const { data, error } = await this.supabase
          .from('packs')
          .select('identifier')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;

        if (!data || data.length === 0) break;

        // Adicionar ao cache
        data.forEach(pack => this.existingPacks.add(pack.identifier));
        totalLoaded += data.length;
        page++;

        console.log(`📄 Carregados ${totalLoaded} packs existentes...`);
        
      } catch (error) {
        console.error('❌ Erro ao carregar packs existentes:', error.message);
        break;
      }
    }

    console.log(`✅ Cache carregado: ${totalLoaded} packs existentes`);
  }

  /**
   * Inicia limpeza automática de logs
   */
  startLogCleanup() {
    setInterval(async () => {
      await this.cleanupOldLogs();
    }, this.logCleanupInterval);
  }

  /**
   * Remove logs antigos para economizar espaço
   */
  async cleanupOldLogs() {
    try {
      const files = await fs.readdir(this.dataCapture);
      const jsonFiles = files
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(this.dataCapture, file),
          time: fs.statSync(path.join(this.dataCapture, file)).mtime
        }))
        .sort((a, b) => b.time - a.time); // Mais recentes primeiro

      if (jsonFiles.length > this.maxLogFiles) {
        const filesToDelete = jsonFiles.slice(this.maxLogFiles);
        
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
        }
        
        console.log(`🧹 Removidos ${filesToDelete.length} logs antigos`);
      }
    } catch (error) {
      console.error('❌ Erro na limpeza de logs:', error.message);
    }
  }

  /**
   * Função principal
   */
  async start() {
    console.log('🚀 Iniciando scraper multithread simples...');
    
    // 1. Buscar packs do Stickerly
    await this.fetchStickerlyPacks();
    
    // 2. Processar em paralelo com workers
    await this.processPacksWithWorkers();
    
    console.log('✅ Scraper finalizado');
  }

  /**
   * Busca packs do Stickerly (baseado na API original)
   */
  async fetchStickerlyPacks() {
    const locales = [
      { locale: 'pt-BR', lang: 'pt' },
      { locale: 'en-US', lang: 'en' }
    ];
    
    for (const item of locales) {
      console.log(`📥 Buscando packs para: ${item.locale}`);
      
      try {
        // Buscar recomendados (igual API original)
        const response = await axios({
          method: "get",
          url: "http://api.sticker.ly/v3.1/stickerPack/recommend?withAnimation=true",
          responseType: "json",
          headers: {
            "User-Agent": `androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; ${item.locale};)`,
            Connection: "Keep-Alive",
            Host: "api.sticker.ly",
            "x-duid": "20fa5a958492bbd3",
            "Accept-Encoding": "gzip",
          },
        });

        const packs = response.data?.result?.packs || [];
        
        if (packs.length > 0) {
          // Filtrar packs não existentes
          const newPacks = packs.filter(pack => !this.existingPacks.has(pack.packId));
          
          if (newPacks.length > 0) {
            // Salvar JSON (temporário, será removido pela limpeza)
            const jsonName = this.generateJsonName(item.locale);
            const filePath = path.join(this.dataCapture, jsonName);
            await fs.writeFile(filePath, JSON.stringify(newPacks, null, 2));
            
            // Adicionar à queue
            newPacks.forEach(pack => {
              this.packQueue.push({
                ...pack,
                lang: item.lang,
                locale: item.locale,
                jsonFile: jsonName
              });
            });
            
            console.log(`📄 ${newPacks.length}/${packs.length} packs novos para ${item.locale}`);
          } else {
            console.log(`✨ Nenhum pack novo para ${item.locale}`);
          }
        }
        
        // Sleep para não sobrecarregar API
        await this.sleep(3000);
        
      } catch (error) {
        console.error(`❌ Erro ao buscar ${item.locale}:`, error.message);
      }
    }
    
    console.log(`📦 Total de packs na queue: ${this.packQueue.length}`);
  }

  /**
   * Processa packs com workers
   */
  async processPacksWithWorkers() {
    if (this.packQueue.length === 0) {
      console.log('ℹ️  Nenhum pack para processar');
      return;
    }

    console.log(`🔄 Processando ${this.packQueue.length} packs com ${this.maxWorkers} workers...`);
    
    const promises = [];
    
    // Spawnar workers
    for (let i = 0; i < this.maxWorkers && this.packQueue.length > 0; i++) {
      promises.push(this.spawnWorker(i));
    }
    
    await Promise.all(promises);
  }

  /**
   * Cria worker para processar packs
   */
  async spawnWorker(workerId) {
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
      let isFinishing = false;

      worker.on('message', async (message) => {
        if (message.type === 'READY' && !isFinishing) {
          await this.sendNextPackToWorker(worker);
          
        } else if (message.type === 'PACK_SUCCESS') {
          console.log(`✅ Worker ${workerId}: ${message.packId} (${message.stickers} stickers)`);
          // Adicionar ao cache de existentes
          this.existingPacks.add(message.packId);
          
          if (!isFinishing) {
            await this.sendNextPackToWorker(worker);
          }
          
        } else if (message.type === 'PACK_ERROR') {
          console.log(`❌ Worker ${workerId}: ${message.packId} - ${message.error}`);
          
          if (!isFinishing) {
            await this.sendNextPackToWorker(worker);
          }
          
        } else if (message.type === 'WORKER_DONE') {
          worker.terminate();
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

  async sendNextPackToWorker(worker) {
    if (this.packQueue.length > 0) {
      const pack = this.packQueue.shift();
      worker.postMessage({
        type: 'PROCESS_PACK',
        pack: pack
      });
    } else {
      worker.postMessage({ type: 'FINISH' });
    }
  }

  // Utilitários
  generateJsonName(locale = 'unknown') {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-');
    return `stickerly_${locale}_${timestamp}.json`;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async stop() {
    console.log('🛑 Parando scraper...');
    
    for (const worker of this.activeWorkers) {
      await worker.terminate();
    }
    
    console.log('✅ Scraper parado');
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  // Verificar variáveis de ambiente
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Configurar SUPABASE_URL e SUPABASE_SERVICE_KEY no .env');
    process.exit(1);
  }

  const scraper = new SimpleMultithreadScraper();
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\\n🛑 Parando scraper...');
    await scraper.stop();
    process.exit(0);
  });

  // Iniciar
  scraper.start().catch(error => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
}

module.exports = SimpleMultithreadScraper;
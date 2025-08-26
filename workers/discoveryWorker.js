/**
 * DISCOVERY WORKER
 * Responsável por descobrir novos packs na API do Sticker.ly
 * Baseado na lógica original da API
 */

const StickerlyClient = require('../services/stickerlyClient');
const SupabaseClient = require('../services/supabaseClient');
const PackCache = require('../services/packCache');
const { info, error, warn } = require('../utils/logger');

class DiscoveryWorker {
  constructor(parentPort, config) {
    this.parentPort = parentPort;
    this.config = config;
    this.stickerlyClient = new StickerlyClient();
    this.supabaseClient = new SupabaseClient();
    this.packCache = new PackCache(this.supabaseClient);
    this.isRunning = false;
    
    // Estados da descoberta
    this.currentLocale = 0;
    this.currentPage = 0;
    this.locales = ['br']; // Apenas BR como na API original
    this.lastDiscoveryTime = 0;
    this.discoveryInterval = 30000; // 30 segundos entre rounds
  }

  async initialize() {
    await this.packCache.initialize();
    info('🔍 Discovery Worker inicializado');
  }

  async start() {
    this.isRunning = true;
    await this.initialize();
    this.discoveryLoop();
  }

  async discoveryLoop() {
    while (this.isRunning) {
      try {
        const now = Date.now();
        
        // Verificar se é hora de uma nova descoberta
        if (now - this.lastDiscoveryTime >= this.discoveryInterval) {
          await this.discoverPacks();
          this.lastDiscoveryTime = now;
        }
        
        // Pequena pausa para não sobrecarregar
        await this.sleep(5000);
        
      } catch (err) {
        error('❌ Erro no discovery loop:', err);
        this.parentPort.postMessage({
          type: 'error',
          error: err.message
        });
        
        // Pausa maior em caso de erro
        await this.sleep(10000);
      }
    }
  }

  async discoverPacks() {
    const locale = this.locales[this.currentLocale];
    
    info(`🌍 Descobrindo packs - Locale: ${locale}, Página: ${this.currentPage}`);
    
    try {
      // Buscar packs recomendados (baseado na API original)
      const packs = await this.stickerlyClient.getRecommendedPacks(locale, this.currentPage);
      
      if (!packs || packs.length === 0) {
        info(`📄 Nenhum pack encontrado - ${locale}:${this.currentPage}`);
        this.nextPage();
        return;
      }
      
      // Filtrar novos packs usando CACHE (instantâneo!)
      const newPacks = this.packCache.filterNewPacks(packs);
      
      info(`📦 Encontrados ${packs.length} packs, ${newPacks.length} novos`);
      
      // Enviar novos packs para processamento
      for (const pack of newPacks) {
        // Validação básica (baseada na API original)
        if (this.isValidPack(pack)) {
          info(`✅ Pack válido enviado: ${pack.identifier}`);
          this.parentPort.postMessage({
            type: 'pack_found',
            pack: {
              identifier: pack.identifier,
              name: pack.title,
              author: pack.publisher,
              isAnimated: pack.isAnimated,
              language: locale,
              stickerCount: pack.stickerCount,
              resourceUrlPrefix: pack.resourceUrlPrefix,
              resourceFiles: pack.resourceFiles,
              trayImageFile: pack.trayImageFile
            }
          });
        } else {
          warn(`❌ Pack inválido rejeitado: ${pack.identifier} (${pack.title})`);
        }
      }
      
      this.nextPage();
      
    } catch (err) {
      error(`❌ Erro ao descobrir packs ${locale}:${this.currentPage}:`, err);
      this.parentPort.postMessage({
        type: 'error',
        error: err.message
      });
      
      this.nextPage();
    }
  }

  isValidPack(pack) {
    // Validações baseadas na API original
    if (!pack.identifier || !pack.title) {
      return false;
    }
    
    if (!pack.stickerCount || pack.stickerCount < 3 || pack.stickerCount > 30) {
      return false;
    }
    
    if (!pack.resourceFiles || pack.resourceFiles.length === 0) {
      return false;
    }
    
    // Verificar se tem nome de autor válido
    if (!pack.publisher || pack.publisher.trim().length === 0) {
      return false;
    }
    
    return true;
  }

  nextPage() {
    this.currentPage++;
    
    // API Recommend tem limite - cursor sempre retorna mesmos 577 packs
    // Após algumas páginas, começar busca por keywords (método search)
    if (this.currentPage > 10) { // Limite de páginas recommend
      info('🔄 Mudando para Search API após esgotamento do Recommend');
      this.currentPage = 0;
      
      this.parentPort.postMessage({
        type: 'discovery_complete'
      });
      
      // Pausa maior entre ciclos completos  
      this.lastDiscoveryTime = Date.now() + 300000; // 5 minutos para evitar spam
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  stop() {
    this.isRunning = false;
  }
}

module.exports = {
  run: (parentPort, config) => {
    const worker = new DiscoveryWorker(parentPort, config);
    worker.start();
    
    // Escutar comandos do processo principal
    parentPort.on('message', (message) => {
      switch (message.type) {
        case 'stop':
          worker.stop();
          break;
      }
    });
  }
};
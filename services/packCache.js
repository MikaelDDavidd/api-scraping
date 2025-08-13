const { info, warn, error } = require('../utils/logger');

/**
 * Cache de packs existentes para evitar reprocessamento
 * Mantém em memória os IDs de todos os packs já processados
 */
class PackCache {
  constructor(supabaseClient) {
    this.supabaseClient = supabaseClient;
    this.existingPacks = new Set();
    this.isLoaded = false;
    this.lastUpdate = null;
    this.loadingPromise = null;
    
    // Configurações
    this.maxCacheSize = 50000; // Máximo de 50k pack IDs em cache
    this.refreshInterval = 300000; // 5 minutos
    this.autoRefreshTimer = null;
  }

  /**
   * Carrega cache de packs existentes do Supabase
   */
  async loadExistingPacks(forceReload = false) {
    // Se já está carregando, aguardar o processo atual
    if (this.loadingPromise && !forceReload) {
      return await this.loadingPromise;
    }

    // Se já carregou recentemente e não é força, pular
    if (this.isLoaded && !forceReload && this.lastUpdate && 
        (Date.now() - this.lastUpdate) < this.refreshInterval) {
      return this.existingPacks.size;
    }

    // Criar promessa de loading
    this.loadingPromise = this._performLoad();
    const result = await this.loadingPromise;
    this.loadingPromise = null;
    
    return result;
  }

  /**
   * Executa o carregamento real do cache
   */
  async _performLoad() {
    const startTime = Date.now();
    
    try {
      info('📚 Carregando cache de packs existentes do Supabase...');
      
      // Buscar apenas os identifiers (mais rápido)
      const { data: packs, error: fetchError } = await this.supabaseClient.supabase
        .from('packs')
        .select('identifier')
        .order('created_at', { ascending: false }); // Mais recentes primeiro
      
      if (fetchError) {
        throw fetchError;
      }
      
      // Limpar cache atual
      this.existingPacks.clear();
      
      // Adicionar ao cache
      let addedCount = 0;
      for (const pack of packs) {
        if (pack.identifier) {
          this.existingPacks.add(pack.identifier);
          addedCount++;
          
          // Limite de segurança para memória
          if (addedCount >= this.maxCacheSize) {
            warn(`Cache limitado a ${this.maxCacheSize} packs (havia ${packs.length} total)`);
            break;
          }
        }
      }
      
      this.isLoaded = true;
      this.lastUpdate = Date.now();
      
      const duration = Date.now() - startTime;
      info(`✅ Cache carregado: ${addedCount} packs em ${duration}ms`, {
        totalInDB: packs.length,
        cached: addedCount,
        duration
      });
      
      // Configurar auto-refresh se não estiver configurado
      this.startAutoRefresh();
      
      return addedCount;
      
    } catch (err) {
      error('❌ Erro ao carregar cache de packs', err);
      
      // Se falhou, manter cache vazio mas marcar como carregado 
      // para não bloquear o sistema
      this.isLoaded = true;
      this.lastUpdate = Date.now();
      
      throw err;
    }
  }

  /**
   * Verifica se um pack já existe
   */
  exists(packId) {
    if (!this.isLoaded) {
      warn('⚠️ Cache não foi carregado ainda, assumindo pack não existe');
      return false;
    }
    
    return this.existingPacks.has(packId);
  }

  /**
   * Adiciona pack ao cache (quando processado com sucesso)
   */
  addPack(packId) {
    if (!packId) return;
    
    this.existingPacks.add(packId);
    
    // Verificar limite de memória
    if (this.existingPacks.size > this.maxCacheSize) {
      warn(`Cache excedeu limite de ${this.maxCacheSize}, não adicionando novos packs`);
      return false;
    }
    
    return true;
  }

  /**
   * Filtra lista de packs removendo os que já existem
   */
  filterNewPacks(packs) {
    if (!this.isLoaded) {
      warn('⚠️ Cache não carregado, retornando todos os packs');
      return packs;
    }
    
    const newPacks = packs.filter(pack => !this.exists(pack.packId));
    
    if (newPacks.length !== packs.length) {
      info(`🔍 Filtrados ${packs.length - newPacks.length} packs duplicados`, {
        original: packs.length,
        new: newPacks.length,
        duplicates: packs.length - newPacks.length
      });
    }
    
    return newPacks;
  }

  /**
   * Retorna estatísticas do cache
   */
  getStats() {
    return {
      isLoaded: this.isLoaded,
      size: this.existingPacks.size,
      maxSize: this.maxCacheSize,
      lastUpdate: this.lastUpdate,
      lastUpdateAge: this.lastUpdate ? Date.now() - this.lastUpdate : null,
      autoRefreshEnabled: !!this.autoRefreshTimer
    };
  }

  /**
   * Inicia atualização automática do cache
   */
  startAutoRefresh() {
    // Limpar timer existente
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
    }
    
    // Configurar novo timer
    this.autoRefreshTimer = setInterval(async () => {
      try {
        info('🔄 Auto-refresh do cache de packs...');
        await this.loadExistingPacks(true);
      } catch (err) {
        error('Erro no auto-refresh do cache', err);
      }
    }, this.refreshInterval);
    
    info(`⏰ Auto-refresh configurado para cada ${this.refreshInterval/1000/60} minutos`);
  }

  /**
   * Para atualização automática
   */
  stopAutoRefresh() {
    if (this.autoRefreshTimer) {
      clearInterval(this.autoRefreshTimer);
      this.autoRefreshTimer = null;
      info('⏹️ Auto-refresh do cache parado');
    }
  }

  /**
   * Força refresh do cache
   */
  async refresh() {
    return await this.loadExistingPacks(true);
  }

  /**
   * Limpa o cache
   */
  clear() {
    this.existingPacks.clear();
    this.isLoaded = false;
    this.lastUpdate = null;
    info('🗑️ Cache de packs limpo');
  }

  /**
   * Retorna amostra do cache para debug
   */
  getSample(count = 10) {
    const sample = Array.from(this.existingPacks).slice(0, count);
    return {
      total: this.existingPacks.size,
      sample: sample
    };
  }

  /**
   * Cleanup ao destruir instância
   */
  destroy() {
    this.stopAutoRefresh();
    this.clear();
  }
}

module.exports = PackCache;
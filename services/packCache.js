/**
 * PACK CACHE SERVICE
 * Sistema inteligente de cache para evitar milhares de queries ao banco
 * 
 * Mantém duas listas em memória:
 * 1. existingPacks - Packs já no banco (carregada na inicialização)
 * 2. processingPacks - Packs sendo processados (evita duplicatas na fila)
 */

const { info, warn, error } = require('../utils/logger');

class PackCache {
  constructor(supabaseClient) {
    this.supabaseClient = supabaseClient;
    
    // Lista de packs que já existem no banco
    this.existingPacks = new Set();
    
    // Lista de packs que estão sendo processados (na fila)
    this.processingPacks = new Set();
    
    this.isInitialized = false;
    this.lastUpdate = 0;
    this.updateInterval = 300000; // 5 minutos para recarregar cache
  }

  /**
   * Inicializa o cache carregando todos os identifiers do banco
   */
  async initialize() {
    info('🔄 Inicializando cache de packs...');
    
    try {
      // Carregar TODOS os identifiers do banco - sem limite de paginação
      let allPacks = [];
      let from = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data: batch, error } = await this.supabaseClient.supabase
          .from('packs')
          .select('identifier')
          .range(from, from + batchSize - 1);
          
        if (error) throw error;
        
        if (!batch || batch.length === 0) break;
        
        allPacks = allPacks.concat(batch);
        from += batchSize;
        
        info(`📥 Carregados ${allPacks.length} packs no cache...`);
        
        if (batch.length < batchSize) break; // Última página
      }
      
      // Adicionar todos ao Set para busca O(1)
      this.existingPacks.clear();
      for (const pack of allPacks || []) {
        this.existingPacks.add(pack.identifier);
      }
      
      this.isInitialized = true;
      this.lastUpdate = Date.now();
      
      info(`✅ Cache inicializado com ${this.existingPacks.size} packs existentes`);
      
    } catch (err) {
      error('❌ Erro ao inicializar cache:', err.message);
      throw err;
    }
  }

  /**
   * Verifica se um pack é novo (não existe e não está sendo processado)
   */
  isNewPack(identifier) {
    // Verificar se já existe no banco
    if (this.existingPacks.has(identifier)) {
      return false;
    }
    
    // Verificar se já está sendo processado
    if (this.processingPacks.has(identifier)) {
      return false;
    }
    
    return true;
  }

  /**
   * Filtra apenas packs novos de uma lista
   */
  filterNewPacks(packs) {
    const newPacks = [];
    
    for (const pack of packs) {
      if (this.isNewPack(pack.identifier)) {
        newPacks.push(pack);
        // Adicionar à lista de processamento para evitar duplicatas
        this.processingPacks.add(pack.identifier);
      }
    }
    
    return newPacks;
  }

  /**
   * Move pack da lista de processamento para existentes (sucesso)
   */
  markPackAsAdded(identifier) {
    this.processingPacks.delete(identifier);
    this.existingPacks.add(identifier);
    info(`✅ Pack ${identifier} adicionado ao cache de existentes`);
  }

  /**
   * Remove pack da lista de processamento (falhou)
   */
  markPackAsFailed(identifier) {
    this.processingPacks.delete(identifier);
    warn(`⚠️  Pack ${identifier} removido da fila de processamento (falhou)`);
  }

  /**
   * Atualiza o cache periodicamente (evita ficar muito desatualizado)
   */
  async updateCacheIfNeeded() {
    const now = Date.now();
    
    if (now - this.lastUpdate > this.updateInterval) {
      info('🔄 Atualizando cache de packs...');
      
      try {
        // Buscar apenas packs adicionados recentemente
        const lastUpdateDate = new Date(this.lastUpdate).toISOString();
        
        const { data: newPacks, error } = await this.supabaseClient.supabase
          .from('packs')
          .select('identifier')
          .gte('created_at', lastUpdateDate);
          
        if (!error && newPacks) {
          for (const pack of newPacks) {
            this.existingPacks.add(pack.identifier);
          }
          
          info(`🔄 Cache atualizado com ${newPacks.length} novos packs`);
        }
        
        this.lastUpdate = now;
        
      } catch (err) {
        warn('⚠️  Erro ao atualizar cache:', err.message);
      }
    }
  }

  /**
   * Estatísticas do cache
   */
  getStats() {
    return {
      existingPacks: this.existingPacks.size,
      processingPacks: this.processingPacks.size,
      totalCached: this.existingPacks.size + this.processingPacks.size,
      isInitialized: this.isInitialized,
      lastUpdate: new Date(this.lastUpdate).toISOString(),
      cacheAge: Math.floor((Date.now() - this.lastUpdate) / 1000)
    };
  }

  /**
   * Limpar cache (para testes)
   */
  clear() {
    this.existingPacks.clear();
    this.processingPacks.clear();
    this.isInitialized = false;
    this.lastUpdate = 0;
  }
}

module.exports = PackCache;
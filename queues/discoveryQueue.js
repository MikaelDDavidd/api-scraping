/**
 * Fila para descoberta de novos packs
 * Contém IDs de packs encontrados que precisam ser baixados e classificados
 */
class DiscoveryQueue {
  constructor(maxSize = 100) {
    this.items = [];
    this.maxSize = maxSize;
    this.processed = new Set(); // Cache de IDs já processados
    this.stats = {
      added: 0,
      processed: 0,
      duplicatesSkipped: 0
    };
  }

  /**
   * Adiciona pack para descoberta
   */
  add(packData, priority = 'normal') {
    // Verificar duplicados
    if (this.processed.has(packData.packId)) {
      this.stats.duplicatesSkipped++;
      return false;
    }

    // Verificar se fila está cheia
    if (this.items.length >= this.maxSize) {
      // Para discovery, remover mais antigo (FIFO)
      const removed = this.items.shift();
      console.log(`Discovery queue cheia, removido item antigo: ${removed.packId}`);
    }

    const item = {
      id: `discovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      packId: packData.packId,
      name: packData.name,
      source: packData.source || 'unknown', // 'recommend' ou 'search'
      keyword: packData.keyword || null,
      locale: packData.locale || 'pt-BR',
      resourceFiles: packData.resourceFiles,
      resourceUrlPrefix: packData.resourceUrlPrefix,
      isAnimated: packData.isAnimated,
      addedAt: Date.now(),
      priority
    };

    // Adicionar na posição correta
    if (priority === 'high') {
      this.items.unshift(item);
    } else {
      this.items.push(item);
    }

    this.stats.added++;
    return item.id;
  }

  /**
   * Remove próximo item para processamento
   */
  next() {
    if (this.items.length === 0) {
      return null;
    }

    const item = this.items.shift();
    this.processed.add(item.packId);
    this.stats.processed++;
    
    return item;
  }

  /**
   * Verifica se pack já foi processado
   */
  wasProcessed(packId) {
    return this.processed.has(packId);
  }

  /**
   * Retorna tamanho atual
   */
  size() {
    return this.items.length;
  }

  /**
   * Verifica se está vazia
   */
  isEmpty() {
    return this.items.length === 0;
  }

  /**
   * Retorna estatísticas
   */
  getStats() {
    return {
      ...this.stats,
      currentSize: this.items.length,
      maxSize: this.maxSize,
      processedCacheSize: this.processed.size
    };
  }

  /**
   * Limpa a fila
   */
  clear() {
    const removed = this.items.length;
    this.items = [];
    return removed;
  }

  /**
   * Limpa cache de processados (para economizar memória)
   */
  clearProcessedCache() {
    const size = this.processed.size;
    this.processed.clear();
    return size;
  }

  /**
   * Serializa para persistência
   */
  toJSON() {
    return {
      items: this.items,
      processed: Array.from(this.processed),
      stats: this.stats,
      maxSize: this.maxSize
    };
  }

  /**
   * Deserializa da persistência
   */
  fromJSON(data) {
    this.items = data.items || [];
    this.processed = new Set(data.processed || []);
    this.stats = data.stats || this.stats;
    this.maxSize = data.maxSize || this.maxSize;
  }
}

module.exports = DiscoveryQueue;
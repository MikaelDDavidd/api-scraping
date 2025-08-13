/**
 * Fila para processamento de stickers leves
 * Contém packs simples que podem ser processados rapidamente
 */
class LightQueue {
  constructor(maxSize = 50) {
    this.items = [];
    this.maxSize = maxSize;
    this.processing = new Set(); // IDs sendo processados
    this.stats = {
      added: 0,
      processed: 0,
      failed: 0,
      avgProcessingTime: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * Adiciona pack para processamento leve
   */
  add(packData, priority = 'normal') {
    // Verificar se fila está cheia
    if (this.items.length >= this.maxSize) {
      throw new Error(`Light queue está cheia (${this.maxSize})`);
    }

    const item = {
      id: `light_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      packId: packData.packId,
      name: packData.name,
      authorName: packData.authorName,
      locale: packData.locale || 'pt-BR',
      resourceFiles: packData.resourceFiles, // Array original de arquivos
      resourceUrlPrefix: packData.resourceUrlPrefix, // URL prefix for downloads
      downloadedFiles: packData.downloadedFiles, // Array de arquivos já baixados (se houver)
      trayImage: packData.trayImage,
      isAnimated: packData.isAnimated,
      classification: 'light',
      estimatedSize: packData.estimatedSize || 0,
      stickerCount: packData.stickerCount || (packData.resourceFiles ? packData.resourceFiles.length : 0),
      addedAt: Date.now(),
      priority,
      attempts: 0,
      maxAttempts: 2 // Poucos retries para itens leves
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
  next(workerId = null) {
    if (this.items.length === 0) {
      return null;
    }

    const item = this.items.shift();
    
    // Marcar como sendo processado
    this.processing.add(item.id);
    item.startedAt = Date.now();
    item.workerId = workerId;
    
    return item;
  }

  /**
   * Marca item como processado com sucesso
   */
  markCompleted(itemId, result = null) {
    this.processing.delete(itemId);
    this.stats.processed++;
    
    // Atualizar tempo de processamento se disponível
    if (result && result.processingTime) {
      this.stats.totalProcessingTime += result.processingTime;
      this.stats.avgProcessingTime = this.stats.totalProcessingTime / this.stats.processed;
    }
    
    return true;
  }

  /**
   * Marca item como falhado
   */
  markFailed(itemId, error, shouldRetry = true) {
    this.processing.delete(itemId);
    this.stats.failed++;
    
    // TODO: Implementar retry logic se shouldRetry = true
    // Por enquanto apenas remove da fila
    
    return false;
  }

  /**
   * Verifica se item está sendo processado
   */
  isProcessing(itemId) {
    return this.processing.has(itemId);
  }

  /**
   * Retorna items sendo processados há muito tempo (possível travamento)
   */
  getStuckItems(timeoutMs = 300000) { // 5 minutos
    const now = Date.now();
    const stuckItems = [];
    
    // Note: Precisaríamos manter referência aos items sendo processados
    // para implementar isso completamente
    
    return stuckItems;
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
   * Verifica se tem espaço
   */
  hasSpace() {
    return this.items.length < this.maxSize;
  }

  /**
   * Retorna estatísticas
   */
  getStats() {
    return {
      ...this.stats,
      currentSize: this.items.length,
      maxSize: this.maxSize,
      processing: this.processing.size,
      successRate: this.stats.processed > 0 ? 
        (this.stats.processed / (this.stats.processed + this.stats.failed)) * 100 : 0
    };
  }

  /**
   * Retorna próximo item sem removê-lo (peek)
   */
  peek() {
    return this.items.length > 0 ? this.items[0] : null;
  }

  /**
   * Limpa a fila
   */
  clear() {
    const removed = this.items.length;
    this.items = [];
    this.processing.clear();
    return removed;
  }

  /**
   * Retorna items por prioridade
   */
  getItemsByPriority() {
    const high = this.items.filter(item => item.priority === 'high');
    const normal = this.items.filter(item => item.priority === 'normal');
    
    return { high, normal };
  }

  /**
   * Serializa para persistência
   */
  toJSON() {
    return {
      items: this.items,
      processing: Array.from(this.processing),
      stats: this.stats,
      maxSize: this.maxSize
    };
  }

  /**
   * Deserializa da persistência
   */
  fromJSON(data) {
    this.items = data.items || [];
    this.processing = new Set(data.processing || []);
    this.stats = data.stats || this.stats;
    this.maxSize = data.maxSize || this.maxSize;
    
    // Limpar items que estavam sendo processados (assumir que falharam)
    this.processing.clear();
  }
}

module.exports = LightQueue;
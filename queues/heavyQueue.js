/**
 * Fila para processamento de stickers pesados
 * Contém packs complexos que requerem processamento intensivo
 */
class HeavyQueue {
  constructor(maxSize = 10) {
    this.items = [];
    this.maxSize = maxSize;
    this.processing = new Set(); // IDs sendo processados
    this.stats = {
      added: 0,
      processed: 0,
      failed: 0,
      avgProcessingTime: 0,
      totalProcessingTime: 0,
      complexityScores: []
    };
  }

  /**
   * Adiciona pack para processamento pesado
   */
  add(packData, priority = 'normal') {
    // Verificar se fila está cheia
    if (this.items.length >= this.maxSize) {
      throw new Error(`Heavy queue está cheia (${this.maxSize})`);
    }

    // Calcular score de complexidade
    const complexityScore = this.calculateComplexity(packData);

    const item = {
      id: `heavy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      packId: packData.packId,
      name: packData.name,
      locale: packData.locale || 'pt-BR',
      downloadedFiles: packData.downloadedFiles, // Array de arquivos já baixados
      trayImage: packData.trayImage,
      isAnimated: packData.isAnimated,
      classification: 'heavy',
      complexityScore,
      estimatedSize: packData.estimatedSize || 0,
      stickerCount: packData.stickerCount || 0,
      estimatedProcessingTime: this.estimateProcessingTime(complexityScore),
      addedAt: Date.now(),
      priority,
      attempts: 0,
      maxAttempts: 5 // Mais retries para itens complexos
    };

    // Adicionar ordenado por prioridade E complexidade
    this.insertSorted(item);

    this.stats.added++;
    this.stats.complexityScores.push(complexityScore);
    
    return item.id;
  }

  /**
   * Calcula score de complexidade do pack
   */
  calculateComplexity(packData) {
    let score = 0;
    
    // Tamanho dos arquivos
    if (packData.estimatedSize > 1024 * 1024) score += 3; // > 1MB
    else if (packData.estimatedSize > 500 * 1024) score += 2; // > 500KB
    else score += 1;
    
    // Quantidade de stickers
    if (packData.stickerCount > 20) score += 3;
    else if (packData.stickerCount > 10) score += 2;
    else score += 1;
    
    // Se é animado
    if (packData.isAnimated) score += 4;
    
    // Tipo de arquivo dominante
    const fileTypes = packData.downloadedFiles?.map(f => f.type) || [];
    if (fileTypes.includes('gif')) score += 3;
    if (fileTypes.includes('webp')) score += 1;
    
    return Math.min(10, score); // Score máximo de 10
  }

  /**
   * Estima tempo de processamento baseado na complexidade
   */
  estimateProcessingTime(complexityScore) {
    // Tempo base: 10s, +5s por ponto de complexidade
    return 10000 + (complexityScore * 5000);
  }

  /**
   * Insere item na posição correta (ordenado por prioridade e complexidade)
   */
  insertSorted(item) {
    let insertIndex = this.items.length;
    
    // Encontrar posição correta
    for (let i = 0; i < this.items.length; i++) {
      const existing = this.items[i];
      
      // Prioridade alta sempre vem primeiro
      if (item.priority === 'high' && existing.priority !== 'high') {
        insertIndex = i;
        break;
      }
      
      // Se mesma prioridade, ordenar por complexidade (menor primeiro para balanceamento)
      if (item.priority === existing.priority) {
        if (item.complexityScore < existing.complexityScore) {
          insertIndex = i;
          break;
        }
      }
    }
    
    this.items.splice(insertIndex, 0, item);
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
    
    // Atualizar tempo de processamento
    if (result && result.processingTime) {
      this.stats.totalProcessingTime += result.processingTime;
      this.stats.avgProcessingTime = this.stats.totalProcessingTime / this.stats.processed;
    }
    
    return true;
  }

  /**
   * Marca item como falhado e possivelmente recoloca na fila
   */
  markFailed(itemId, error, shouldRetry = true) {
    this.processing.delete(itemId);
    this.stats.failed++;
    
    // TODO: Implementar retry logic
    // Itens pesados podem ser re-adicionados com attempts++
    
    return false;
  }

  /**
   * Retorna item menos complexo (para worker light auxiliar)
   */
  getSimplest() {
    // Procurar item com menor complexidade
    let simplest = null;
    let simpleIndex = -1;
    
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (!simplest || item.complexityScore < simplest.complexityScore) {
        simplest = item;
        simpleIndex = i;
      }
    }
    
    if (simplest && simplest.complexityScore <= 5) { // Só se for relativamente simples
      this.items.splice(simpleIndex, 1);
      this.processing.add(simplest.id);
      simplest.startedAt = Date.now();
      return simplest;
    }
    
    return null;
  }

  /**
   * Verifica se item está sendo processado
   */
  isProcessing(itemId) {
    return this.processing.has(itemId);
  }

  /**
   * Retorna items sendo processados há muito tempo
   */
  getStuckItems(timeoutMs = 600000) { // 10 minutos para heavy
    const now = Date.now();
    const stuckItems = [];
    
    // Note: Para implementação completa, precisaríamos manter 
    // referências aos items sendo processados com timestamps
    
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
    const avgComplexity = this.stats.complexityScores.length > 0 ?
      this.stats.complexityScores.reduce((a, b) => a + b, 0) / this.stats.complexityScores.length : 0;
    
    return {
      ...this.stats,
      currentSize: this.items.length,
      maxSize: this.maxSize,
      processing: this.processing.size,
      avgComplexity: avgComplexity.toFixed(1),
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
   * Retorna resumo de complexidade da fila
   */
  getComplexityReport() {
    if (this.items.length === 0) {
      return { simple: 0, medium: 0, complex: 0 };
    }
    
    const simple = this.items.filter(item => item.complexityScore <= 3).length;
    const medium = this.items.filter(item => item.complexityScore >= 4 && item.complexityScore <= 6).length;
    const complex = this.items.filter(item => item.complexityScore >= 7).length;
    
    return { simple, medium, complex };
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
    
    // Limpar items que estavam sendo processados
    this.processing.clear();
  }
}

module.exports = HeavyQueue;
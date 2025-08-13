const BaseWorker = require('./baseWorker');
const StickerlyClient = require('../services/stickerlyClient');
const ImageProcessor = require('../services/imageProcessor');
const SupabaseClient = require('../services/supabaseClient');
const { info, error, warn } = require('../utils/logger');

/**
 * Worker especializado para processamento de stickers complexos/pesados
 * - Processa packs com muitos stickers (>10)
 * - Lida com animações complexas (>5 frames)
 * - Processamento minucioso com qualidade máxima
 * - Timeout maior (120s vs 30s do light)
 * - Pode auxiliar light processor quando disponível
 */
class HeavyProcessor extends BaseWorker {
  constructor(queueManager, resourceMonitor) {
    super('HeavyProcessor', {
      healthCheckInterval: 30000, // 30s (mais longo que light)
      maxRetries: 5, // Mais tentativas para packs complexos
      retryDelay: 5000, // 5s entre tentativas
      taskTimeout: 120000, // 120s timeout para processamento complexo
      maxConcurrentTasks: 1 // Processamento individual para máxima qualidade
    });
    
    this.queueManager = queueManager;
    this.resourceMonitor = resourceMonitor;
    
    // Serviços para heavy processing
    this.stickerlyClient = new StickerlyClient();
    this.imageProcessor = new ImageProcessor();
    
    // Configurar Supabase para processamento pesado
    process.env.USE_LOCAL_STORAGE = 'true';
    process.env.LOCAL_STORAGE_PATH = './test_storage';
    process.env.STORAGE_BASE_URL = 'http://localhost';
    
    this.supabaseClient = new SupabaseClient();
    
    // Métricas específicas do heavy processor
    this.heavyMetrics = {
      packsProcessed: 0,
      packsSuccessful: 0,
      avgProcessingTime: 0,
      totalStickersProcessed: 0,
      complexAnimationsProcessed: 0,
      stickerErrors: 0,
      uploadErrors: 0,
      complexityScores: [], // Array de scores de complexidade
      largePacksProcessed: 0, // Packs > 15 stickers
      fallbackTasksFromLight: 0 // Tasks que vieram do light processor
    };
    
    // Limites para heavy processing
    this.limits = {
      maxStickersPerPack: 30, // WhatsApp limit
      maxStickerSizeKB: 500, // Maior que light (500KB)
      maxPackSizeMB: 10, // 10MB pack total máximo
      maxAnimatedFrames: 50, // Até 50 frames para animações complexas
      processingTimeoutMs: 120000, // 2 minutos por pack
      qualityThreshold: 0.95, // 95% qualidade mínima para heavy
      concurrentDownloads: 3 // Mais downloads simultâneos que light
    };

    // Sistema de fallback - pode processar tasks light quando heavy queue vazia
    this.fallbackEnabled = true;
    this.fallbackCheckInterval = 15000; // Verifica fallback a cada 15s
  }

  async initialize() {
    info(`Inicializando ${this.name} para processamento pesado...`);
    
    // Registrar no queue manager se fornecido
    if (this.queueManager) {
      this.queueManager.registerWorker(this.id, this.name, this);
    }
    
    // Event listeners para monitoramento de recursos
    if (this.resourceMonitor) {
      this.resourceMonitor.on('memoryAlert', this.handleMemoryAlert.bind(this));
      this.resourceMonitor.on('throttleActivated', this.handleThrottleActivated.bind(this));
    }
  }

  /**
   * Implementação do processamento de tarefa
   */
  async processTaskImplementation(task) {
    const taskType = task.type || 'process-heavy-pack';
    
    switch (taskType) {
      case 'process-heavy-pack':
        return await this.processHeavyPack(task.pack);
      case 'process-complex-animation':
        return await this.processComplexAnimation(task.sticker, task.packId);
      case 'fallback-light-pack':
        // Heavy processor auxiliando light processor
        this.heavyMetrics.fallbackTasksFromLight++;
        return await this.processLightPackAsFallback(task.pack);
      default:
        throw new Error(`Tipo de tarefa desconhecido para HeavyProcessor: ${taskType}`);
    }
  }

  /**
   * Processa um pack pesado/complexo completo
   */
  async processHeavyPack(pack) {
    const startTime = Date.now();
    
    // Validação básica do pack
    if (!pack || !pack.packId) {
      throw new Error('Pack inválido ou sem packId');
    }
    
    const packId = pack.packId;
    
    try {
      info(`🔨 Processando pack pesado: ${packId}`, {
        name: pack.name,
        stickerCount: pack.resourceFiles?.length || 0,
        isAnimated: pack.isAnimated,
        estimatedComplexity: this.calculateComplexityScore(pack)
      });

      // Validação para heavy processing
      const validation = this.validateHeavyPack(pack);
      if (!validation.valid) {
        warn(`Pack não é processável: ${packId}`, validation);
        return { success: false, reason: 'validation_failed', issues: validation.issues };
      }

      // Verificar recursos antes do processamento (mais rigoroso que light)
      if (this.resourceMonitor?.isUnderPressure().overall) {
        warn('Sistema sob alta pressão, pausando heavy processor...');
        await this.delay(10000); // Pausa maior que light
        throw new Error('High system pressure detected');
      }

      // Processar stickers com qualidade máxima
      const stickerResults = await this.processStickersHighQuality(pack);
      
      if (stickerResults.validStickers.length === 0) {
        warn(`Nenhum sticker válido encontrado: ${packId}`);
        return { success: false, reason: 'no_valid_stickers' };
      }

      // Análise de qualidade pós-processamento
      const qualityAnalysis = this.analyzePackQuality(stickerResults);
      if (qualityAnalysis.overallQuality < this.limits.qualityThreshold) {
        warn(`Qualidade insuficiente para pack: ${packId}`, qualityAnalysis);
        return { success: false, reason: 'quality_threshold_not_met', analysis: qualityAnalysis };
      }

      // Criar tray com processamento avançado
      const trayFile = await this.createAdvancedTray(stickerResults.validStickers[0], packId, pack.isAnimated);
      
      // Preparar dados do pack com metadados avançados
      const packData = {
        identifier: packId,
        name: pack.name || 'Pack sem nome',
        publisher: pack.authorName || 'Autor desconhecido',
        is_animated: pack.isAnimated || false,
        lang: this.getLanguageFromLocale(pack.locale || 'pt-BR'),
        level: 1, // Nível 1 para packs heavy (vs 0 para light)
        zip_size: 0,
        processing_type: 'heavy', // Flag para identificar origem
        complexity_score: qualityAnalysis.complexityScore,
        quality_metrics: qualityAnalysis,
        heavy_processing_time: Date.now() - startTime
      };

      // Upload com verificação de integridade
      const dbPackId = await this.supabaseClient.uploadPack(
        packData,
        stickerResults.validStickers,
        trayFile
      );

      const processingTime = Date.now() - startTime;

      if (dbPackId) {
        // Sucesso - atualizar métricas heavy
        this.updateHeavyMetrics(true, processingTime, stickerResults.validStickers.length, 0, qualityAnalysis.complexityScore);
        
        // Verificar se é pack grande
        if (stickerResults.validStickers.length > 15) {
          this.heavyMetrics.largePacksProcessed++;
        }

        info(`✅ Pack pesado processado com sucesso: ${packId}`, {
          dbPackId,
          stickersProcessed: stickerResults.validStickers.length,
          processingTime: `${processingTime}ms`,
          complexityScore: qualityAnalysis.complexityScore,
          qualityScore: `${(qualityAnalysis.overallQuality * 100).toFixed(1)}%`,
          avgTimePerSticker: `${Math.round(processingTime / stickerResults.validStickers.length)}ms`
        });

        return {
          success: true,
          packId,
          dbPackId,
          stickersProcessed: stickerResults.validStickers.length,
          processingTime,
          type: 'heavy',
          complexityScore: qualityAnalysis.complexityScore,
          qualityMetrics: qualityAnalysis
        };
      } else {
        // Erro no upload
        this.updateHeavyMetrics(false, processingTime, stickerResults.validStickers.length, 1, qualityAnalysis.complexityScore);
        return { success: false, reason: 'upload_failed' };
      }

    } catch (err) {
      const processingTime = Date.now() - startTime;
      this.updateHeavyMetrics(false, processingTime, 0, 0, 0);
      error(`❌ Erro no processamento do pack pesado: ${packId}`, err);
      throw err;
    } finally {
      // Limpeza mais rigorosa para heavy processing
      await this.imageProcessor.cleanupTemp();
      
      // Forçar garbage collection se disponível
      if (global.gc) {
        global.gc();
      }
    }
  }

  /**
   * Validação específica para heavy processing
   */
  validateHeavyPack(pack) {
    const issues = [];

    // Verificar quantidade de stickers (aceita mais que light)
    const stickerCount = pack.resourceFiles?.length || 0;
    if (stickerCount > this.limits.maxStickersPerPack) {
      issues.push(`Muitos stickers: ${stickerCount} (WhatsApp limit: ${this.limits.maxStickersPerPack})`);
    }

    if (stickerCount < 3) {
      issues.push(`Poucos stickers: ${stickerCount} (mínimo: 3)`);
    }

    // Verificar tamanho estimado (mais generoso que light)
    const estimatedSize = this.estimatePackSize(pack);
    if (estimatedSize > this.limits.maxPackSizeMB * 1024 * 1024) {
      issues.push(`Pack muito pesado: ~${Math.round(estimatedSize/1024/1024)}MB (limite: ${this.limits.maxPackSizeMB}MB)`);
    }

    // Heavy processor aceita qualquer complexidade de animação
    // (não rejeita por complexidade como light processor)

    const complexityScore = this.calculateComplexityScore(pack);

    return {
      valid: issues.length === 0,
      issues,
      estimatedSize,
      stickerCount,
      complexityScore
    };
  }

  /**
   * Calcula score de complexidade do pack
   */
  calculateComplexityScore(pack) {
    let score = 0;
    
    // Quantidade de arquivos (peso maior que light)
    const fileCount = pack.resourceFiles?.length || 0;
    if (fileCount > 20) score += 5;
    else if (fileCount > 15) score += 4;
    else if (fileCount > 10) score += 3;
    else score += 1;
    
    // Se é animado (peso significativo)
    if (pack.isAnimated) score += 6;
    
    // Tipos de arquivos complexos
    const hasWebP = pack.resourceFiles?.some(file => file.toLowerCase().includes('.webp'));
    const hasGif = pack.resourceFiles?.some(file => file.toLowerCase().includes('.gif'));
    if (hasWebP) score += 3;
    if (hasGif) score += 2;
    
    // Popularidade (packs populares podem ser mais complexos)
    if (pack.viewCount > 50000) score += 2;
    else if (pack.viewCount > 10000) score += 1;
    
    return Math.min(score, 20); // Máximo 20
  }

  /**
   * Processa stickers com qualidade máxima
   */
  async processStickersHighQuality(pack) {
    const validStickers = [];
    const errors = [];
    const packId = pack.packId;
    const urlPrefix = pack.resourceUrlPrefix;
    
    // Validar se pack tem resourceFiles
    if (!pack.resourceFiles || !Array.isArray(pack.resourceFiles) || pack.resourceFiles.length === 0) {
      throw new Error('Pack não tem stickers válidos para processar');
    }
    
    info(`🔄 Processando ${pack.resourceFiles.length} stickers (modo heavy - qualidade máxima)...`);

    // Processar stickers sequencialmente para máxima qualidade (vs paralelo no light)
    // Mas com alguns downloads em paralelo para eficiência
    const semaphore = this.createSemaphore(this.limits.concurrentDownloads);
    
    const stickerPromises = pack.resourceFiles.map(async (stickerFile, index) => {
      return semaphore.acquire(async () => {
        try {
          const stickerUrl = urlPrefix + stickerFile;
          
          // Download com timeout maior que light
          const buffer = await this.stickerlyClient.downloadFile(stickerUrl, 30000); // 30s timeout
          
          // Validação rigorosa (vs quick no light)
          const rigorousValidation = await this.rigorousValidateSticker(buffer, stickerFile);
          if (!rigorousValidation.valid) {
            warn(`Sticker rejeitado (validação rigorosa): ${stickerFile}`, rigorousValidation.reason);
            errors.push({ file: stickerFile, error: rigorousValidation.reason });
            return null;
          }

          // Processamento com qualidade máxima
          const processed = await this.imageProcessor.processStickerImage(
            buffer,
            stickerFile,
            packId,
            pack.isAnimated
          );

          // Adicionar metadados avançados
          processed.originalName = stickerFile;
          processed.index = index;
          processed.qualityScore = rigorousValidation.qualityScore;
          processed.complexityScore = rigorousValidation.complexityScore;
          processed.processingMode = 'heavy';

          return processed;

        } catch (err) {
          error(`Erro ao processar sticker heavy ${stickerFile}`, err);
          errors.push({ file: stickerFile, error: err.message });
          return null;
        }
      });
    });

    const results = await Promise.all(stickerPromises);
    const validResults = results.filter(r => r !== null);

    // Contar animações complexas processadas
    const complexAnimations = validResults.filter(r => r.qualityScore && r.qualityScore.isComplexAnimation);
    this.heavyMetrics.complexAnimationsProcessed += complexAnimations.length;

    return {
      validStickers: validResults,
      errors,
      successRate: validResults.length / pack.resourceFiles.length,
      complexAnimationsCount: complexAnimations.length
    };
  }

  /**
   * Validação rigorosa de sticker (vs quick no light)
   */
  async rigorousValidateSticker(buffer, filename) {
    // Verificar tamanho (mais generoso que light)
    if (buffer.length > this.limits.maxStickerSizeKB * 1024) {
      return {
        valid: false,
        reason: `Arquivo muito grande: ${Math.round(buffer.length/1024)}KB (limite: ${this.limits.maxStickerSizeKB}KB)`
      };
    }

    // Verificar se é imagem válida
    if (!this.imageProcessor.isValidFormat(filename)) {
      return {
        valid: false,
        reason: 'Formato de arquivo inválido'
      };
    }

    // Análise avançada para WebP/animações
    let qualityScore = { qualityIndex: 0.5, isComplexAnimation: false };
    let complexityScore = 1;

    if (filename.toLowerCase().includes('.webp')) {
      try {
        const info = await this.imageProcessor.getWebPInfo(buffer);
        
        if (info.totalFrames) {
          complexityScore += Math.min(info.totalFrames / 10, 5); // Até +5 por frames
          
          if (info.totalFrames > 10) {
            qualityScore.isComplexAnimation = true;
            qualityScore.qualityIndex = 0.8; // Animações complexas são high-quality
          }
        }
        
        // Verificar dimensões se disponível
        if (info.width && info.height) {
          const resolution = info.width * info.height;
          if (resolution > 512 * 512) {
            qualityScore.qualityIndex += 0.2; // Bonus por alta resolução
          }
        }
        
      } catch (err) {
        // Se não conseguir analisar, assumir que é válido mas simples
        warn(`Não foi possível analisar WebP: ${filename}`, err.message);
      }
    }

    return { 
      valid: true, 
      qualityScore: qualityScore,
      complexityScore: Math.min(complexityScore, 10) // Máximo 10
    };
  }

  /**
   * Analisa qualidade geral do pack processado
   */
  analyzePackQuality(stickerResults) {
    const { validStickers, errors } = stickerResults;
    
    if (validStickers.length === 0) {
      return { overallQuality: 0, complexityScore: 0 };
    }

    // Calcular qualidade média
    const avgQuality = validStickers.reduce((sum, sticker) => {
      return sum + (sticker.qualityScore?.qualityIndex || 0.5);
    }, 0) / validStickers.length;

    // Calcular complexidade média
    const avgComplexity = validStickers.reduce((sum, sticker) => {
      return sum + (sticker.complexityScore || 1);
    }, 0) / validStickers.length;

    // Penalizar por erros
    const errorPenalty = errors.length * 0.05; // -5% por erro
    const successRate = validStickers.length / (validStickers.length + errors.length);
    
    const overallQuality = Math.max(0, (avgQuality * successRate) - errorPenalty);

    return {
      overallQuality,
      complexityScore: avgComplexity,
      avgQualityIndex: avgQuality,
      successRate,
      errorCount: errors.length,
      complexAnimations: validStickers.filter(s => s.qualityScore?.isComplexAnimation).length,
      totalStickers: validStickers.length
    };
  }

  /**
   * Cria tray com processamento avançado
   */
  async createAdvancedTray(firstSticker, packId, isAnimated) {
    try {
      const TRAY_NAME = 'tray.png';
      
      if (isAnimated && firstSticker.buffer) {
        // Extração avançada com otimização de qualidade
        info(`Criando tray avançado para pack ANIMADO: ${packId}`);
        return await this.imageProcessor.createTrayFromAnimated(
          firstSticker.buffer,
          TRAY_NAME,
          packId
        );
      } else if (firstSticker.buffer) {
        // Processamento avançado para packs estáticos
        info(`Criando tray avançado para pack ESTÁTICO: ${packId}`);
        return await this.imageProcessor.createTrayFromStatic(
          firstSticker.buffer,
          TRAY_NAME,
          packId,
          'tray_source.png'
        );
      }
      
      throw new Error('Primeiro sticker não disponível para tray avançado');
    } catch (err) {
      error(`Erro ao criar tray avançado: ${packId}`, err);
      return null;
    }
  }

  /**
   * Processa pack light como fallback (quando heavy queue vazia)
   */
  async processLightPackAsFallback(pack) {
    info(`🔄 Heavy processor processando pack light como fallback: ${pack.packId}`);
    
    // Usar lógica simplificada similar ao light processor mas com qualidade heavy
    const result = await this.processHeavyPack(pack);
    
    if (result.success) {
      result.type = 'light-fallback';
      result.note = 'Processed by heavy processor as fallback';
    }
    
    return result;
  }

  /**
   * Loop principal do heavy processor
   */
  async startMainLoop() {
    info(`🔄 Loop principal iniciado para ${this.name}`);
    
    while (this.isRunning) {
      if (this.isPaused) {
        await this.delay(1000);
        continue;
      }
      
      try {
        // Verificar pressão de recursos (mais rigoroso que light)
        if (this.resourceMonitor?.isUnderPressure().memory || 
            this.resourceMonitor?.isUnderPressure().cpu) {
          warn('Sistema sob pressão, pausando heavy processor...');
          await this.delay(10000); // Pausa maior que light
          continue;
        }

        let taskProcessed = false;

        // 1. Prioridade: Processar fila heavy
        if (this.queueManager) {
          const heavyTask = await this.queueManager.getFromQueue('heavy');
          
          if (heavyTask) {
            // Validar task antes de processar
            if (!heavyTask || !heavyTask.packId) {
              warn('Tarefa inválida recebida da fila heavy', { task: heavyTask });
            } else {
              info(`📋 Processando tarefa da fila heavy: ${heavyTask.packId}`);
              
              const result = await this.processTask({
                type: 'process-heavy-pack',
                pack: heavyTask
              }, `process-heavy-pack-${heavyTask.packId}`);

              if (result.success) {
                this.queueManager.markCompleted('heavy', heavyTask.id);
              } else {
                this.queueManager.markFailed('heavy', heavyTask.id, result.reason);
              }
              
              taskProcessed = true;
            }
          }
        }

        // 2. Fallback: Se não há tasks heavy e fallback habilitado, processar light
        if (!taskProcessed && this.fallbackEnabled && this.queueManager) {
          const lightTask = await this.queueManager.getFromQueue('light');
          
          if (lightTask && lightTask.packId) {
            info(`🔄 Heavy processor auxiliando: processando task light ${lightTask.packId}`);
            
            const result = await this.processTask({
              type: 'fallback-light-pack',
              pack: lightTask
            }, `fallback-light-pack-${lightTask.packId}`);

            if (result.success) {
              this.queueManager.markCompleted('light', lightTask.id);
            } else {
              this.queueManager.markFailed('light', lightTask.id, result.reason);
            }
            
            taskProcessed = true;
          }
        }

        if (!taskProcessed) {
          // Nenhuma tarefa disponível, aguardar mais tempo que light
          await this.delay(3000);
        }

      } catch (err) {
        error('Erro no loop principal do heavy processor', err);
        await this.delay(5000); // Delay maior após erro
      }
    }
  }

  /**
   * Utilitários
   */
  
  estimatePackSize(pack) {
    // Estimativa mais precisa baseada na complexidade
    const fileCount = pack.resourceFiles?.length || 0;
    const complexityScore = this.calculateComplexityScore(pack);
    
    // Base size aumenta com complexidade
    const baseStickerSize = pack.isAnimated ? 200 * 1024 : 100 * 1024; // 200KB animado, 100KB estático
    const complexityMultiplier = 1 + (complexityScore / 20); // 1x to 2x based on complexity
    
    return fileCount * baseStickerSize * complexityMultiplier;
  }

  createSemaphore(limit) {
    let count = 0;
    const waitQueue = [];

    return {
      async acquire(fn) {
        if (count < limit) {
          count++;
          try {
            return await fn();
          } finally {
            count--;
            if (waitQueue.length > 0) {
              const next = waitQueue.shift();
              next();
            }
          }
        } else {
          return new Promise((resolve) => {
            waitQueue.push(async () => {
              count++;
              try {
                const result = await fn();
                resolve(result);
              } catch (err) {
                resolve(null);
              } finally {
                count--;
                if (waitQueue.length > 0) {
                  const next = waitQueue.shift();
                  next();
                }
              }
            });
          });
        }
      }
    };
  }

  updateHeavyMetrics(success, processingTime, stickersProcessed, uploadErrors, complexityScore) {
    this.heavyMetrics.packsProcessed++;
    if (success) {
      this.heavyMetrics.packsSuccessful++;
    }
    
    // Atualizar média de tempo de processamento
    const totalTime = this.heavyMetrics.avgProcessingTime * (this.heavyMetrics.packsProcessed - 1) + processingTime;
    this.heavyMetrics.avgProcessingTime = totalTime / this.heavyMetrics.packsProcessed;
    
    this.heavyMetrics.totalStickersProcessed += stickersProcessed;
    this.heavyMetrics.uploadErrors += uploadErrors;
    
    // Armazenar complexity scores para análise
    if (complexityScore > 0) {
      this.heavyMetrics.complexityScores.push(complexityScore);
    }
  }

  getLanguageFromLocale(locale) {
    const langMap = {
      'pt-BR': 'pt',
      'en-US': 'en',
      'es-ES': 'es',
      'fr-FR': 'fr'
    };
    return langMap[locale] || 'pt';
  }

  // Event handlers
  handleMemoryAlert(alert) {
    warn(`💾 Heavy processor recebeu alerta de memória: ${alert.current}%`);
    if (alert.current > 80) { // Threshold menor que light por usar mais recursos
      info('Pausando heavy processor por pressão de memória...');
      this.pause();
      setTimeout(() => {
        if (this.resourceMonitor && !this.resourceMonitor.isUnderPressure().memory) {
          this.resume();
        }
      }, 15000); // Pausa mais longa que light
    }
  }

  handleThrottleActivated(state) {
    info(`🐌 Heavy processor ativou throttling: ${state.reason}`);
    // Heavy processor para completamente durante throttling intenso
    if (state.reason === 'memory_critical') {
      this.pause();
    }
  }

  /**
   * Estatísticas específicas do heavy processor
   */
  getHeavyStats() {
    const baseStats = super.getMetrics();
    
    // Calcular complexidade média
    const avgComplexity = this.heavyMetrics.complexityScores.length > 0
      ? this.heavyMetrics.complexityScores.reduce((a, b) => a + b, 0) / this.heavyMetrics.complexityScores.length
      : 0;

    return {
      ...baseStats,
      type: 'heavy',
      heavy: {
        ...this.heavyMetrics,
        successRate: this.heavyMetrics.packsProcessed > 0 
          ? (this.heavyMetrics.packsSuccessful / this.heavyMetrics.packsProcessed * 100).toFixed(1)
          : 0,
        avgStickersPerPack: this.heavyMetrics.packsProcessed > 0
          ? (this.heavyMetrics.totalStickersProcessed / this.heavyMetrics.packsProcessed).toFixed(1) 
          : 0,
        avgComplexityScore: avgComplexity.toFixed(1),
        fallbackRate: this.heavyMetrics.packsProcessed > 0
          ? (this.heavyMetrics.fallbackTasksFromLight / this.heavyMetrics.packsProcessed * 100).toFixed(1) + '%'
          : '0%'
      },
      limits: this.limits,
      queueInfo: this.queueManager ? {
        heavyQueueSize: this.queueManager.getQueueSize('heavy'),
        lightQueueSize: this.queueManager.getQueueSize('light'),
        pendingHeavyTasks: this.queueManager.getStats().sizes.heavy,
        pendingLightTasks: this.queueManager.getStats().sizes.light
      } : null,
      fallback: {
        enabled: this.fallbackEnabled,
        taskCount: this.heavyMetrics.fallbackTasksFromLight
      }
    };
  }
}

module.exports = HeavyProcessor;
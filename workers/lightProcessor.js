const BaseWorker = require('./baseWorker');
const StickerlyClient = require('../services/stickerlyClient');
const ImageProcessor = require('../services/imageProcessor');
const SupabaseClient = require('../services/supabaseClient');
const { info, error, warn } = require('../utils/logger');

/**
 * Worker otimizado para processamento rápido de stickers simples/leves
 * - Processa packs com poucos stickers (<= 10)
 * - Prioriza velocidade sobre complexidade
 * - Não processa animações pesadas
 * - Timeout menor (30s vs 120s)
 */
class LightProcessor extends BaseWorker {
  constructor(queueManager, resourceMonitor) {
    super('LightProcessor', {
      healthCheckInterval: 20000, // 20s
      maxRetries: 2, // Menos tentativas para falhar rápido
      retryDelay: 3000, // 3s entre tentativas
      taskTimeout: 30000, // 30s timeout (vs 120s do heavy)
      maxConcurrentTasks: 2 // Pode processar 2 stickers simultaneamente
    });
    
    this.queueManager = queueManager;
    this.resourceMonitor = resourceMonitor;
    
    // Serviços otimizados para light processing
    this.stickerlyClient = new StickerlyClient();
    this.imageProcessor = new ImageProcessor();
    
    // Configurar Supabase para processamento leve
    process.env.USE_LOCAL_STORAGE = 'true';
    process.env.LOCAL_STORAGE_PATH = './test_storage';
    process.env.STORAGE_BASE_URL = 'http://localhost';
    
    this.supabaseClient = new SupabaseClient();
    
    // Métricas específicas do light processor
    this.lightMetrics = {
      packsProcessed: 0,
      packsSuccessful: 0,
      avgProcessingTime: 0,
      totalStickersProcessed: 0,
      stickerErrors: 0,
      uploadErrors: 0
    };
    
    // Limites para light processing
    this.limits = {
      maxStickersPerPack: 10, // Máximo de 10 stickers
      maxStickerSizeKB: 150, // Máximo 150KB por sticker
      maxPackSizeKB: 800, // Máximo 800KB por pack total
      maxAnimatedFrames: 5, // Máximo 5 frames em animações
      processingTimeoutMs: 25000 // 25s por pack
    };
  }

  async initialize() {
    info(`Inicializando ${this.name} para processamento leve...`);
    
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
    const taskType = task.type || 'process-light-pack';
    
    switch (taskType) {
      case 'process-light-pack':
        return await this.processLightPack(task.pack);
      case 'process-single-sticker':
        return await this.processSingleSticker(task.sticker, task.packId);
      default:
        throw new Error(`Tipo de tarefa desconhecido para LightProcessor: ${taskType}`);
    }
  }

  /**
   * Processa um pack leve completo
   */
  async processLightPack(pack) {
    const startTime = Date.now();
    
    // Validação básica do pack
    if (!pack || !pack.packId) {
      throw new Error('Pack inválido ou sem packId');
    }
    
    const packId = pack.packId;
    
    try {
      info(`📦 Processando pack leve: ${packId}`, {
        name: pack.name,
        stickerCount: pack.resourceFiles?.length || 0,
        isAnimated: pack.isAnimated
      });

      // Validação inicial para light processing
      const validation = this.validateLightPack(pack);
      if (!validation.valid) {
        warn(`Pack não é adequado para light processing: ${packId}`, validation);
        // Rejeitar para fila heavy
        if (this.queueManager) {
          await this.queueManager.addToQueue('heavy', {
            ...pack,
            reason: 'rejected_from_light',
            issues: validation.issues
          }, 'high');
        }
        return { success: false, reason: 'redirected_to_heavy', issues: validation.issues };
      }

      // Verificar recursos antes do processamento
      if (this.resourceMonitor?.isUnderPressure().memory) {
        warn('Memória sob pressão, pausando light processor...');
        await this.delay(5000);
        throw new Error('Memory pressure detected');
      }

      // Processar stickers de forma otimizada
      const stickerResults = await this.processStickersOptimized(pack);
      
      if (stickerResults.validStickers.length === 0) {
        warn(`Nenhum sticker válido encontrado: ${packId}`);
        return { success: false, reason: 'no_valid_stickers' };
      }

      // Criar tray otimizado
      const trayFile = await this.createOptimizedTray(stickerResults.validStickers[0], packId, pack.isAnimated);
      
      // Preparar dados do pack
      const packData = {
        identifier: packId,
        name: pack.name || 'Pack sem nome',
        publisher: pack.authorName || 'Autor desconhecido',
        is_animated: pack.isAnimated || false,
        lang: this.getLanguageFromLocale(pack.locale || 'pt-BR'),
        level: 0,
        zip_size: 0,
        processing_type: 'light' // Flag para identificar origem
      };

      // Upload otimizado
      const dbPackId = await this.supabaseClient.uploadPack(
        packData,
        stickerResults.validStickers,
        trayFile
      );

      const processingTime = Date.now() - startTime;

      if (dbPackId) {
        // Sucesso
        this.updateLightMetrics(true, processingTime, stickerResults.validStickers.length, 0);
        
        info(`✅ Pack leve processado com sucesso: ${packId}`, {
          dbPackId,
          stickersProcessed: stickerResults.validStickers.length,
          processingTime: `${processingTime}ms`,
          avgTimePerSticker: `${Math.round(processingTime / stickerResults.validStickers.length)}ms`
        });

        return {
          success: true,
          packId,
          dbPackId,
          stickersProcessed: stickerResults.validStickers.length,
          processingTime,
          type: 'light'
        };
      } else {
        // Erro no upload
        this.updateLightMetrics(false, processingTime, stickerResults.validStickers.length, 1);
        return { success: false, reason: 'upload_failed' };
      }

    } catch (err) {
      const processingTime = Date.now() - startTime;
      this.updateLightMetrics(false, processingTime, 0, 0);
      error(`❌ Erro no processamento do pack leve: ${packId}`, err);
      throw err;
    } finally {
      // Limpeza rápida
      await this.imageProcessor.cleanupTemp();
    }
  }

  /**
   * Validação específica para light processing
   */
  validateLightPack(pack) {
    const issues = [];

    // Verificar quantidade de stickers
    const stickerCount = pack.resourceFiles?.length || 0;
    if (stickerCount > this.limits.maxStickersPerPack) {
      issues.push(`Muitos stickers: ${stickerCount} (limite: ${this.limits.maxStickersPerPack})`);
    }

    // Verificar se é muito animado para light processing
    if (pack.isAnimated) {
      // Light processor ainda pode processar animações simples
      const hasComplexAnimations = this.detectComplexAnimations(pack);
      if (hasComplexAnimations) {
        issues.push('Animações muito complexas para light processing');
      }
    }

    // Verificar tamanho estimado
    const estimatedSize = this.estimatePackSize(pack);
    if (estimatedSize > this.limits.maxPackSizeKB * 1024) {
      issues.push(`Pack muito pesado: ~${Math.round(estimatedSize/1024)}KB (limite: ${this.limits.maxPackSizeKB}KB)`);
    }

    return {
      valid: issues.length === 0,
      issues,
      estimatedSize,
      stickerCount
    };
  }

  /**
   * Processa stickers de forma otimizada para light processing
   */
  async processStickersOptimized(pack) {
    const validStickers = [];
    const errors = [];
    const packId = pack.packId;
    const urlPrefix = pack.resourceUrlPrefix;
    
    // Validar se pack tem resourceFiles - com tentativa de recuperação
    if (!pack.resourceFiles || !Array.isArray(pack.resourceFiles) || pack.resourceFiles.length === 0) {
      warn(`Pack ${packId} sem resourceFiles, tentando regenerar...`, {
        hasResourceFiles: !!pack.resourceFiles,
        isArray: Array.isArray(pack.resourceFiles),
        length: pack.resourceFiles?.length || 0
      });
      
      // Tentar regenerar resourceFiles se possível
      if (this.canRegenerateResourceFiles(pack)) {
        const stickerCount = pack.stickerCount || pack.resourceFiles?.length || 10; // Default 10
        info(`Regenerando resourceFiles para pack ${packId} com ${stickerCount} stickers`);
        pack.resourceFiles = this.generateResourceFiles(stickerCount, pack.isAnimated);
      } else {
        throw new Error(`Pack ${packId} não tem stickers válidos e não foi possível regenerar`);
      }
    }
    
    info(`🔄 Processando ${pack.resourceFiles.length} stickers (modo light)...`);

    // Processar stickers com limite de concorrência
    const semaphore = this.createSemaphore(this.options.maxConcurrentTasks);
    
    const stickerPromises = pack.resourceFiles.map(async (stickerFile, index) => {
      return semaphore.acquire(async () => {
        try {
          const stickerUrl = urlPrefix + stickerFile;
          
          // Download com timeout menor
          const buffer = await this.stickerlyClient.downloadFile(stickerUrl, 60000); // 60s timeout
          
          // Validação rápida
          const quickValidation = await this.quickValidateSticker(buffer, stickerFile);
          if (!quickValidation.valid) {
            warn(`Sticker rejeitado: ${stickerFile}`, quickValidation.reason);
            errors.push({ file: stickerFile, error: quickValidation.reason });
            return null;
          }

          // Processamento otimizado
          const processed = await this.imageProcessor.processStickerImage(
            buffer,
            stickerFile,
            packId,
            pack.isAnimated
          );

          processed.originalName = stickerFile;
          processed.index = index;

          return processed;

        } catch (err) {
          error(`Erro ao processar sticker ${stickerFile}`, err);
          errors.push({ file: stickerFile, error: err.message });
          return null;
        }
      });
    });

    const results = await Promise.all(stickerPromises);
    const validResults = results.filter(r => r !== null);

    return {
      validStickers: validResults,
      errors,
      successRate: validResults.length / pack.resourceFiles.length
    };
  }

  /**
   * Validação rápida de sticker
   */
  async quickValidateSticker(buffer, filename) {
    // Verificar se buffer existe
    if (!buffer || buffer.length === 0) {
      return { valid: false, reason: 'empty_buffer' };
    }

    // Verificar tamanho
    if (buffer.length > this.limits.maxStickerSizeKB * 1024) {
      return {
        valid: false,
        reason: `Arquivo muito grande: ${Math.round(buffer.length/1024)}KB`
      };
    }

    // Verificar se é imagem válida (verificação básica)
    if (!this.imageProcessor.isValidFormat(filename)) {
      return {
        valid: false,
        reason: 'Formato de arquivo inválido'
      };
    }

    // Validação rigorosa de integridade RIFF/WebP
    if (filename.toLowerCase().includes('.webp')) {
      // WebP deve começar com 'RIFF' nos primeiros 4 bytes
      if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF') {
        return { valid: false, reason: 'corrupted_webp_header' };
      }
      
      // Verificar se tem 'WEBP' na posição correta
      if (buffer.toString('ascii', 8, 12) !== 'WEBP') {
        return { valid: false, reason: 'corrupted_webp_format' };
      }
      
      // Verificar tamanho do arquivo no header RIFF
      try {
        const fileSizeFromHeader = buffer.readUInt32LE(4) + 8;
        if (Math.abs(buffer.length - fileSizeFromHeader) > 100) { // Tolerância de 100 bytes
          return { valid: false, reason: 'incomplete_download_size_mismatch' };
        }
      } catch (err) {
        return { valid: false, reason: 'corrupted_file_structure' };
      }
    }

    // Tamanho mínimo para ser válido
    if (buffer.length < 1024) { // 1KB mínimo
      return { valid: false, reason: 'file_too_small' };
    }

    // Verificação adicional para WebP animado
    if (filename.toLowerCase().includes('.webp')) {
      try {
        const info = await this.imageProcessor.getWebPInfo(buffer);
        if (info.totalFrames && info.totalFrames > this.limits.maxAnimatedFrames) {
          return {
            valid: false,
            reason: `Muitos frames: ${info.totalFrames} (limite: ${this.limits.maxAnimatedFrames})`
          };
        }
      } catch (err) {
        // Se não conseguir analisar, assumir que é válido
      }
    }

    return { valid: true };
  }

  /**
   * Cria tray otimizado (versão mais rápida)
   */
  async createOptimizedTray(firstSticker, packId, isAnimated) {
    try {
      const TRAY_NAME = 'tray.png';
      
      if (isAnimated && firstSticker.buffer) {
        // Extração rápida do primeiro frame
        return await this.imageProcessor.createTrayFromAnimated(
          firstSticker.buffer,
          TRAY_NAME,
          packId
        );
      } else if (firstSticker.buffer) {
        // Cópia direta para packs estáticos
        return await this.imageProcessor.createTrayFromStatic(
          firstSticker.buffer,
          TRAY_NAME,
          packId,
          'tray_source.png'
        );
      }
      
      throw new Error('Primeiro sticker não disponível para tray');
    } catch (err) {
      error(`Erro ao criar tray otimizado: ${packId}`, err);
      return null;
    }
  }

  /**
   * Loop principal do light processor
   */
  async startMainLoop() {
    info(`🔄 Loop principal iniciado para ${this.name}`);
    
    while (this.isRunning) {
      if (this.isPaused) {
        await this.delay(1000);
        continue;
      }
      
      try {
        // Verificar pressão de recursos
        if (this.resourceMonitor?.isUnderPressure().overall) {
          warn('Sistema sob pressão, pausando light processor...');
          await this.delay(5000);
          continue;
        }

        // Buscar próxima tarefa da fila light
        if (this.queueManager) {
          const task = await this.queueManager.getFromQueue('light');
          
          if (task) {
            // Validar task antes de processar
            if (!task || !task.packId) {
              warn('Tarefa inválida recebida da fila light', { task });
              await this.delay(2000);
              continue;
            }
            
            info(`📋 Processando tarefa da fila light: ${task.packId}`);
            
            const result = await this.processTask({
              type: 'process-light-pack',
              pack: task
            }, `process-light-pack-${task.packId}`);

            if (result.success) {
              // Marcar como concluído na fila
              await this.queueManager.markAsProcessed('light', task.id, result);
            } else if (result.reason === 'redirected_to_heavy') {
              // Já foi redirecionado para heavy queue
              await this.queueManager.markAsProcessed('light', task.id, result);
            } else {
              // Marcar como falhou
              await this.queueManager.markAsFailed('light', task.id, { message: result.reason });
            }
          } else {
            // Nenhuma tarefa disponível, aguardar
            await this.delay(2000);
          }
        } else {
          // Sem queue manager, aguardar
          await this.delay(5000);
        }

      } catch (err) {
        error('Erro no loop principal do light processor', err);
        await this.delay(3000);
      }
    }
  }

  /**
   * Utilitários
   */
  
  detectComplexAnimations(pack) {
    // Heurística simples para detectar animações complexas
    const fileCount = pack.resourceFiles?.length || 0;
    const hasWebP = pack.resourceFiles?.some(f => f.toLowerCase().includes('.webp'));
    
    // Se tem muitos arquivos WebP, pode ser complexo
    return pack.isAnimated && fileCount > 8 && hasWebP;
  }

  estimatePackSize(pack) {
    // Estimativa baseada na quantidade de arquivos
    const fileCount = pack.resourceFiles?.length || 0;
    const avgStickerSize = pack.isAnimated ? 100 * 1024 : 50 * 1024; // 100KB animado, 50KB estático
    return fileCount * avgStickerSize;
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

  updateLightMetrics(success, processingTime, stickersProcessed, uploadErrors) {
    this.lightMetrics.packsProcessed++;
    if (success) {
      this.lightMetrics.packsSuccessful++;
    }
    
    // Atualizar média de tempo de processamento
    const totalTime = this.lightMetrics.avgProcessingTime * (this.lightMetrics.packsProcessed - 1) + processingTime;
    this.lightMetrics.avgProcessingTime = totalTime / this.lightMetrics.packsProcessed;
    
    this.lightMetrics.totalStickersProcessed += stickersProcessed;
    this.lightMetrics.uploadErrors += uploadErrors;
  }

  /**
   * Gera resourceFiles quando não estão disponíveis
   */
  generateResourceFiles(stickerCount, isAnimated = false) {
    const files = [];
    const extension = isAnimated ? '.webp' : '.webp'; // Sempre WebP agora
    
    for (let i = 1; i <= stickerCount; i++) {
      // Gerar nomes de arquivos comuns
      const filename = `sticker_${i.toString().padStart(2, '0')}${extension}`;
      files.push(filename);
    }
    
    info(`Generated ${files.length} resourceFiles`, { stickerCount, isAnimated });
    return files;
  }

  /**
   * Valida pack antes de tentar regenerar resourceFiles
   */
  canRegenerateResourceFiles(pack) {
    return (
      pack.resourceUrlPrefix && 
      pack.resourceUrlPrefix.trim() !== '' &&
      (pack.stickerCount > 0 || pack.resourceFiles?.length > 0)
    );
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
    warn(`💾 Light processor recebeu alerta de memória: ${alert.current}%`);
    if (alert.current > 85) {
      info('Pausando light processor por pressão de memória...');
      this.pause();
      setTimeout(() => {
        if (this.resourceMonitor && !this.resourceMonitor.isUnderPressure().memory) {
          this.resume();
        }
      }, 10000);
    }
  }

  handleThrottleActivated(state) {
    info(`🐌 Light processor ativou throttling: ${state.reason}`);
    // Light processor se adapta automaticamente com delays maiores
  }

  /**
   * Estatísticas específicas do light processor
   */
  getLightStats() {
    const baseStats = super.getMetrics();
    return {
      ...baseStats,
      type: 'light',
      light: {
        ...this.lightMetrics,
        successRate: this.lightMetrics.packsProcessed > 0 
          ? (this.lightMetrics.packsSuccessful / this.lightMetrics.packsProcessed * 100).toFixed(1)
          : 0,
        avgStickersPerPack: this.lightMetrics.packsProcessed > 0
          ? (this.lightMetrics.totalStickersProcessed / this.lightMetrics.packsProcessed).toFixed(1) 
          : 0
      },
      limits: this.limits,
      queueInfo: this.queueManager ? {
        lightQueueSize: this.queueManager.getQueueSize('light'),
        pendingTasks: this.queueManager.getStats().sizes.light
      } : null
    };
  }
}

module.exports = LightProcessor;
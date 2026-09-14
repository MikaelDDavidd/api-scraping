const fs = require('fs-extra');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { config } = require('../config/config');
const { info, error, debug, warn, stickerProcessed } = require('../utils/logger');

const execFileAsync = promisify(execFile);

class ImageProcessor {
  constructor() {
    this.tempDir = config.storage.tempDir;
    this.ensureTempDir();
  }

  /**
   * Garante que o diretório temporário existe
   */
  async ensureTempDir() {
    try {
      await fs.ensureDir(this.tempDir);
    } catch (err) {
      error('Erro ao criar diretório temporário', err);
      throw err;
    }
  }

  /**
   * Valida formato de arquivo
   */
  isValidFormat(filename) {
    const ext = path.extname(filename).toLowerCase();
    return config.storage.allowedFormats.includes(ext);
  }

  /**
   * Valida tamanho do arquivo
   */
  isValidSize(buffer) {
    return buffer.length <= config.storage.maxFileSize;
  }

  /**
   * Processa imagem de sticker EXATAMENTE como código original
   * - DEVE ser exatamente 512x512 pixels
   * - DEVE ser WebP
   * - DEVE ter fundo transparente
   * - DEVE respeitar limites de tamanho
   * - PRESERVA animação se detectada no arquivo
   */
  async processStickerImage(buffer, filename, packId, isAnimated = false) {
    try {
      debug(`Processando sticker: ${filename}`, { packId, isAnimated });

      // Validações básicas
      if (!this.isValidFormat(filename)) {
        throw new Error(`Formato não suportado: ${filename}`);
      }

      // Salvar temporariamente
      const tempInputPath = path.join(this.tempDir, `input_${Date.now()}_${filename}`);
      const tempOutputPath = path.join(this.tempDir, `output_${Date.now()}_${this.changeExtension(filename, '.webp')}`);
      
      await fs.writeFile(tempInputPath, buffer);

      let outputBuffer;
      let outputFilename = this.changeExtension(filename, '.webp');
      let actuallyAnimated = false;

      try {
        // Verificar se o arquivo é realmente animado (como na API original)
        const fileInfo = await this.getWebPInfo(tempInputPath);
        actuallyAnimated = fileInfo.totalFrames > 1;
        
        info(`Analisando arquivo: ${filename}`, {
          packId,
          apiFlagAnimated: isAnimated,
          actuallyAnimated,
          totalFrames: fileInfo.totalFrames || 0
        });

        if (actuallyAnimated && isAnimated) {
          // Arquivo realmente animado E API diz que é animado: preservar animação
          info(`Processando como ANIMADO PRESERVADO`, {
            filename: outputFilename,
            packId,
            totalFrames: fileInfo.totalFrames
          });
          
          // Usar novo método de tratamento automático para garantir conformidade
          const treatment = await this.treatAnimatedWebP(tempInputPath, tempOutputPath);
          
        } else {
          // Arquivo estático OU API diz que é estático: processar como estático
          info(`Processando como ESTÁTICO`, {
            filename: outputFilename,
            packId,
            reason: !actuallyAnimated ? 'arquivo_nao_animado' : 'api_flag_estatico'
          });
          
          await execFileAsync('cwebp', [
            '-q', config.image.quality.toString(),
            '-resize', '512', '512',
            tempInputPath,
            '-o', tempOutputPath
          ]);
        }

        // Ler resultado
        outputBuffer = await fs.readFile(tempOutputPath);

        // Validar tamanho final (usando limite conservador)
        const maxSize = (actuallyAnimated && isAnimated) ? config.image.maxAnimatedSize : config.image.maxStaticSize;
        if (outputBuffer.length > maxSize) {
          warn(`Sticker excede limite de tamanho`, {
            filename: outputFilename,
            packId,
            size: outputBuffer.length,
            maxSize,
            isAnimated: actuallyAnimated && isAnimated
          });
          
          // Tentar recompressão com qualidade menor
          if (actuallyAnimated && isAnimated) {
            // Para animados, usar novo método de tratamento que já garante conformidade
            info(`Aplicando tratamento automático para reduzir tamanho`, {
              filename: outputFilename,
              packId,
              currentSize: outputBuffer.length,
              targetSize: maxSize
            });
            
            // Reprocessar com tratamento automático e qualidade menor
            const treatment = await this.treatAnimatedWebP(tempInputPath, tempOutputPath, 60);
            outputBuffer = await fs.readFile(tempOutputPath);
            
            // Se ainda estiver grande, tentar compressão mais agressiva
            if (outputBuffer.length > maxSize) {
              await this.resizeAnimatedWebPAggressive(tempInputPath, tempOutputPath, 40, maxSize);
              outputBuffer = await fs.readFile(tempOutputPath);
            }
          } else {
            // Para estáticos, recompressão normal
            const lowerQuality = Math.max(50, config.image.quality - 20);
            await execFileAsync('cwebp', [
              '-q', lowerQuality.toString(),
              '-resize', '512', '512',
              tempInputPath,
              '-o', tempOutputPath
            ]);
            outputBuffer = await fs.readFile(tempOutputPath);
          }
          
          if (outputBuffer.length > maxSize) {
            throw new Error(`Sticker muito grande mesmo após recompressão: ${outputBuffer.length} bytes`);
          }
          
          info(`Sticker recomprimido`, {
            filename: outputFilename,
            packId,
            newSize: outputBuffer.length
          });
        }

        stickerProcessed(outputFilename, packId, true);
        
        return {
          buffer: outputBuffer,
          filename: outputFilename,
          originalFilename: filename,
          isAnimated: actuallyAnimated && isAnimated, // Verdadeiro apenas se realmente animado E API confirma
          emoji: this.generateDefaultEmojis(filename),
          metadata: {
            width: 512,
            height: 512,
            format: 'webp',
            size: outputBuffer.length,
            animated: actuallyAnimated && isAnimated,
            totalFrames: fileInfo.totalFrames || 1
          }
        };

      } finally {
        // Limpar arquivos temporários
        await this.removeTemporary(path.basename(tempInputPath));
        await this.removeTemporary(path.basename(tempOutputPath));
      }

    } catch (err) {
      error(`Erro ao processar sticker: ${filename}`, err, { packId });
      stickerProcessed(filename, packId, false);
      throw err;
    }
  }

  /**
   * Cria imagem de tray EXATAMENTE como código original
   * - DEVE ser PNG (não WebP)
   * - DEVE ser exatamente 96x96 pixels
   * - DEVE ser menos de 50KB
   */
  async createTrayImage(buffer, filename, packId) {
    try {
      info(`Criando tray para pack: ${packId}`, { filename });

      const tempInputPath = path.join(this.tempDir, `tray_input_${Date.now()}_${filename}`);
      const tempOutputPath = path.join(this.tempDir, `tray_output_${Date.now()}_tray.png`);
      
      await fs.writeFile(tempInputPath, buffer);

      try {
        // Usar dwebp para converter WebP para PNG e redimensionar
        await execFileAsync('dwebp', [
          tempInputPath,
          '-resize', '96', '96',
          '-o', tempOutputPath
        ]);

        const trayBuffer = await fs.readFile(tempOutputPath);

        // Validar tamanho (deve ser < 50KB)
        if (trayBuffer.length > config.image.maxTraySize) {
          throw new Error(`Tray muito grande: ${trayBuffer.length} bytes`);
        }

        info(`Tray criado com sucesso`, {
          packId,
          filename: 'tray.png',
          size: trayBuffer.length
        });

        return {
          buffer: trayBuffer,
          filename: 'tray.png',
          metadata: {
            width: 96,
            height: 96,
            format: 'png',
            size: trayBuffer.length
          }
        };

      } finally {
        await this.removeTemporary(path.basename(tempInputPath));
        await this.removeTemporary(path.basename(tempOutputPath));
      }

    } catch (err) {
      error(`Erro ao criar tray para pack: ${packId}`, err, { filename });
      throw err;
    }
  }

  /**
   * Replica webpmux_info do código original
   * Usa o utilitário nativo webpmux
   */
  async getWebPInfo(buffer) {
    try {
      const tempPath = path.join(this.tempDir, `webpinfo_${Date.now()}.webp`);
      await fs.writeFile(tempPath, buffer);

      try {
        const { stdout } = await execFileAsync('webpmux', ['-info', tempPath]);
        
        const info = {
          canvasSize: null,
          duration: 0
        };

        const lines = stdout.split('\n');
        
        // Procurar por "Number of frames"
        const framesLine = lines.find(line => line.indexOf('Number of frames') === 0);
        if (framesLine) {
          info.totalFrames = parseInt(framesLine.split(': ')[1]);
        }

        // Procurar por "Canvas size"
        const sizeLine = lines.find(line => line.indexOf('Canvas size') === 0);
        if (sizeLine) {
          const sizeStr = sizeLine.split(': ')[1];
          const [width, height] = sizeStr.split(' x ').map(s => parseInt(s));
          info.canvasSize = { width, height };
        }

        return info;

      } finally {
        await this.removeTemporary(path.basename(tempPath));
      }

    } catch (err) {
      debug('Erro ao obter WebP info', { error: err.message });
      return {
        canvasSize: null,
        duration: 0
      };
    }
  }

  /**
   * Cria tray de pack ANIMADO - extrai primeiro frame (como webpmux_getframe)
   */
  async createTrayFromAnimated(buffer, filename, packId) {
    try {
      info(`Criando tray de pack animado (extraindo frame 1)`, { packId, filename });

      const tempInputPath = path.join(this.tempDir, `animated_input_${Date.now()}.webp`);
      const tempFramePath = path.join(this.tempDir, `frame_${Date.now()}.webp`);
      const tempOutputPath = path.join(this.tempDir, `animated_tray_${Date.now()}.png`);
      
      await fs.writeFile(tempInputPath, buffer);

      try {
        // Extrair primeiro frame usando webpmux (como original linha 203-207)
        await execFileAsync('webpmux', [
          '-get', 'frame', '1',
          tempInputPath,
          '-o', tempFramePath
        ]);

        // Converter frame para PNG e redimensionar para 96x96
        await execFileAsync('dwebp', [
          tempFramePath,
          '-resize', '96', '96',
          '-o', tempOutputPath
        ]);

        const trayBuffer = await fs.readFile(tempOutputPath);

        info(`Tray de pack animado criado`, {
          packId,
          filename,
          size: trayBuffer.length
        });

        return {
          buffer: trayBuffer,
          filename: filename,
          metadata: {
            width: 96,
            height: 96,
            format: 'png',
            size: trayBuffer.length
          }
        };

      } finally {
        await this.removeTemporary(path.basename(tempInputPath));
        await this.removeTemporary(path.basename(tempFramePath));
        await this.removeTemporary(path.basename(tempOutputPath));
      }

    } catch (err) {
      error(`Erro ao criar tray de pack animado: ${packId}`, err, { filename });
      throw err;
    }
  }

  /**
   * Cria tray de pack ESTÁTICO - copia primeiro sticker
   */
  async createTrayFromStatic(buffer, filename, packId, originalName) {
    try {
      info(`Criando tray de pack estático (copiando sticker)`, { 
        packId, 
        filename, 
        originalName 
      });

      const tempInputPath = path.join(this.tempDir, `static_input_${Date.now()}_${originalName || filename}`);
      const tempWebpPath = path.join(this.tempDir, `static_webp_${Date.now()}.webp`);
      const tempOutputPath = path.join(this.tempDir, `static_tray_${Date.now()}.png`);
      
      await fs.writeFile(tempInputPath, buffer);

      try {
        // Se original era PNG, converter para WebP primeiro (linha 216 do original)
        if (originalName && originalName.endsWith('.png')) {
          info(`Sticker original era PNG, convertendo para WebP primeiro`, { packId, originalName });
          await execFileAsync('cwebp', [
            '-q', '80',
            tempInputPath,
            '-o', tempWebpPath
          ]);
        } else {
          // Se já é WebP, apenas copiar
          await fs.copyFile(tempInputPath, tempWebpPath);
        }

        // Converter para PNG e redimensionar para 96x96 (linha 220 do original)
        await execFileAsync('dwebp', [
          tempWebpPath,
          '-resize', '96', '96',
          '-o', tempOutputPath
        ]);

        const trayBuffer = await fs.readFile(tempOutputPath);

        info(`Tray de pack estático criado`, {
          packId,
          filename,
          originalName,
          size: trayBuffer.length
        });

        return {
          buffer: trayBuffer,
          filename: filename,
          metadata: {
            width: 96,
            height: 96,
            format: 'png',
            size: trayBuffer.length
          }
        };

      } finally {
        await this.removeTemporary(path.basename(tempInputPath));
        await this.removeTemporary(path.basename(tempWebpPath));
        await this.removeTemporary(path.basename(tempOutputPath));
      }

    } catch (err) {
      error(`Erro ao criar tray de pack estático: ${packId}`, err, { filename, originalName });
      throw err;
    }
  }

  /**
   * Obtém informações detalhadas do WebP incluindo duração individual de frames
   */
  async getWebPInfo(filePath) {
    try {
      const { stdout } = await execFileAsync('webpmux', ['-info', filePath]);
      
      const info = {
        totalFrames: 0,
        duration: 0,
        size: { w: 0, h: 0 },
        frameDurations: [], // Array com duração individual de cada frame
        minFrameDuration: null,
        maxFrameDuration: null,
        avgFrameDuration: null
      };
      
      const lines = stdout.split('\n');
      
      // Extrair número de frames
      const framesLine = lines.find(line => line.indexOf('Number of frames') === 0);
      if (framesLine) {
        info.totalFrames = parseInt(framesLine.split(': ')[1]) || 0;
      }
      
      // Extrair tamanho do canvas
      const sizeLine = lines.find(line => line.indexOf('Canvas size') === 0);
      if (sizeLine) {
        const sizeStr = sizeLine.split(': ')[1];
        if (sizeStr) {
          const [w, h] = sizeStr.split(' x ').map(n => parseInt(n));
          info.size = { w: w || 0, h: h || 0 };
        }
      }
      
      // Calcular duração total e individual dos frames
      const headerIndex = lines.findIndex(line => line.indexOf('No.:') === 0);
      if (headerIndex >= 0) {
        let duration = 0;
        for (let i = headerIndex + 1; i < lines.length; i++) {
          const columns = lines[i].split(/\s+/).filter(col => col !== '');
          if (columns[6]) {
            const frameDuration = parseInt(columns[6]) || 0;
            info.frameDurations.push(frameDuration);
            duration += frameDuration;
          }
        }
        info.duration = duration;
        
        // Calcular estatísticas dos frames
        if (info.frameDurations.length > 0) {
          info.minFrameDuration = Math.min(...info.frameDurations);
          info.maxFrameDuration = Math.max(...info.frameDurations);
          info.avgFrameDuration = Math.round(duration / info.frameDurations.length);
        }
      }
      
      return info;
    } catch (err) {
      debug('Erro ao obter info do WebP', err);
      return { 
        totalFrames: 0, 
        duration: 0, 
        size: { w: 0, h: 0 },
        frameDurations: [],
        minFrameDuration: null,
        maxFrameDuration: null,
        avgFrameDuration: null
      };
    }
  }

  /**
   * Trata automaticamente animações para atender requisitos do WhatsApp
   * - Duração máxima: 10 segundos (10000ms)
   * - Frame mínimo: 8ms
   * - Tamanho máximo: 450KB (conservador)
   */
  async treatAnimatedWebP(inputPath, outputPath, quality = config.image.quality) {
    try {
      const info = await this.getWebPInfo(inputPath);
      
      // Se não é animado, processar como estático
      if (info.totalFrames <= 1) {
        await execFileAsync('cwebp', [
          '-q', quality.toString(),
          '-resize', '512', '512',
          inputPath,
          '-o', outputPath
        ]);
        return { treated: false, reason: 'not_animated' };
      }
      
      let needsTreatment = false;
      const treatments = [];
      
      // Verificar se precisa tratamento
      if (info.duration > 10000) {
        needsTreatment = true;
        treatments.push('duration_exceeded');
        warn(`Animação muito longa: ${info.duration}ms, será ajustada para 10s`);
      }
      
      if (info.minFrameDuration && info.minFrameDuration < 8) {
        needsTreatment = true;
        treatments.push('frame_too_fast');
        warn(`Frames muito rápidos detectados: ${info.minFrameDuration}ms, serão ajustados para 8ms mínimo`);
      }
      
      if (!needsTreatment) {
        // Se não precisa tratamento, apenas redimensionar normalmente
        await this.resizeAnimatedWebP(inputPath, outputPath, quality);
        return { treated: false, reason: 'already_compliant' };
      }
      
      // APLICAR TRATAMENTOS
      const frameDir = path.join(this.tempDir, `treat_${Date.now()}`);
      await fs.ensureDir(frameDir);
      
      try {
        // Estratégia de tratamento baseada no problema
        let targetFrameCount = info.totalFrames;
        let targetFrameDuration = info.avgFrameDuration || 100;
        
        // TRATAMENTO 1: Duração > 10 segundos
        if (info.duration > 10000) {
          // Opção A: Reduzir número de frames mantendo fluidez
          const reductionFactor = Math.ceil(info.duration / 10000);
          if (reductionFactor > 1 && info.totalFrames > 30) {
            // Se tem muitos frames, podemos pular alguns
            targetFrameCount = Math.ceil(info.totalFrames / reductionFactor);
            info(`Reduzindo de ${info.totalFrames} para ${targetFrameCount} frames (fator: ${reductionFactor})`);
          } else {
            // Se tem poucos frames, ajustar duração individual
            targetFrameDuration = Math.floor(10000 / info.totalFrames);
            info(`Ajustando duração dos frames para ${targetFrameDuration}ms`);
          }
        }
        
        // TRATAMENTO 2: Frames < 8ms
        if (info.minFrameDuration && info.minFrameDuration < 8) {
          targetFrameDuration = Math.max(targetFrameDuration, 8);
          info(`Ajustando duração mínima dos frames para 8ms`);
        }
        
        // Garantir que duração total não exceda 10s após ajustes
        const projectedDuration = targetFrameCount * targetFrameDuration;
        if (projectedDuration > 10000) {
          targetFrameDuration = Math.floor(10000 / targetFrameCount);
          info(`Ajuste final: ${targetFrameCount} frames x ${targetFrameDuration}ms = ${targetFrameCount * targetFrameDuration}ms`);
        }
        
        // Extrair e processar frames
        const frameFiles = [];
        const frameSkip = Math.ceil(info.totalFrames / targetFrameCount);
        let extractedCount = 0;
        
        for (let i = 1; i <= info.totalFrames; i += frameSkip) {
          const framePath = path.join(frameDir, `frame_${extractedCount}.webp`);
          await execFileAsync('webpmux', ['-get', 'frame', i.toString(), inputPath, '-o', framePath]);
          
          // Redimensionar frame
          const resizedPath = path.join(frameDir, `resized_${extractedCount}.webp`);
          await execFileAsync('cwebp', [
            '-q', quality.toString(),
            '-resize', '512', '512',
            framePath,
            '-o', resizedPath
          ]);
          
          frameFiles.push(resizedPath);
          extractedCount++;
        }
        
        // Recriar WebP animado com frames tratados
        const webpmuxArgs = [];
        frameFiles.forEach((framePath) => {
          webpmuxArgs.push('-frame', framePath, `+${targetFrameDuration}`);
        });
        webpmuxArgs.push('-loop', '0', '-o', outputPath);
        
        await execFileAsync('webpmux', webpmuxArgs);
        
        // Verificar resultado final
        const finalInfo = await this.getWebPInfo(outputPath);
        info(`Tratamento concluído`, {
          original: {
            frames: info.totalFrames,
            duration: info.duration,
            minFrame: info.minFrameDuration
          },
          treated: {
            frames: finalInfo.totalFrames,
            duration: finalInfo.duration,
            minFrame: finalInfo.minFrameDuration
          },
          treatments: treatments
        });
        
        return {
          treated: true,
          treatments: treatments,
          original: info,
          final: finalInfo
        };
        
      } finally {
        await fs.remove(frameDir);
      }
      
    } catch (err) {
      error('Erro ao tratar WebP animado', err);
      // Fallback: tentar redimensionar normalmente
      await this.resizeAnimatedWebP(inputPath, outputPath, quality);
      return { treated: false, reason: 'treatment_failed', error: err.message };
    }
  }

  /**
   * Redimensiona WebP animado preservando animação (como na API original)
   */
  async resizeAnimatedWebP(inputPath, outputPath, quality = config.image.quality) {
    try {
      // Primeiro, obter informações do arquivo
      const info = await this.getWebPInfo(inputPath);
      
      if (info.totalFrames <= 1) {
        // Se não é realmente animado, usar processamento estático
        await execFileAsync('cwebp', [
          '-q', quality.toString(),
          '-resize', '512', '512',
          inputPath,
          '-o', outputPath
        ]);
        return;
      }
      
      // Para arquivos realmente animados, extrair frames, redimensionar e recriar
      const frameDir = path.join(this.tempDir, `frames_${Date.now()}`);
      await fs.ensureDir(frameDir);
      
      try {
        // Extrair todos os frames
        const frameFiles = [];
        for (let i = 1; i <= info.totalFrames; i++) {
          const framePath = path.join(frameDir, `frame_${i}.webp`);
          await execFileAsync('webpmux', ['-get', 'frame', i.toString(), inputPath, '-o', framePath]);
          
          // Redimensionar o frame
          const resizedPath = path.join(frameDir, `resized_${i}.webp`);
          await execFileAsync('cwebp', [
            '-q', quality.toString(),
            '-resize', '512', '512',
            framePath,
            '-o', resizedPath
          ]);
          
          frameFiles.push(resizedPath);
        }
        
        // Recriar WebP animado com frames redimensionados
        const duration = Math.max(100, Math.floor(info.duration / info.totalFrames)); // Duração por frame
        const webpmuxArgs = [];
        
        frameFiles.forEach((framePath, index) => {
          webpmuxArgs.push('-frame', framePath, `+${duration}`);
        });
        
        webpmuxArgs.push('-loop', '0', '-o', outputPath);
        
        await execFileAsync('webpmux', webpmuxArgs);
        
      } finally {
        // Limpar diretório de frames
        await fs.remove(frameDir);
      }
      
    } catch (err) {
      error('Erro ao redimensionar WebP animado', err);
      // Fallback: processar como estático
      await execFileAsync('cwebp', [
        '-q', quality.toString(),
        '-resize', '512', '512',
        inputPath,
        '-o', outputPath
      ]);
    }
  }

  /**
   * Compressão agressiva para WebP animados grandes
   */
  async resizeAnimatedWebPAggressive(inputPath, outputPath, quality, targetSize) {
    try {
      const info = await this.getWebPInfo(inputPath);
      
      if (info.totalFrames <= 1) {
        await execFileAsync('cwebp', [
          '-q', quality.toString(),
          '-resize', '512', '512',
          inputPath,
          '-o', outputPath
        ]);
        return;
      }
      
      const frameDir = path.join(this.tempDir, `aggressive_frames_${Date.now()}`);
      await fs.ensureDir(frameDir);
      
      try {
        let frameSkip = 1; // Começar sem pular frames
        
        // Se tem muitos frames (>50), tentar reduzir frames para economizar espaço
        if (info.totalFrames > 50) {
          frameSkip = Math.ceil(info.totalFrames / 30); // Reduzir para no máximo 30 frames
        }
        
        const frameFiles = [];
        let frameCount = 0;
        
        for (let i = 1; i <= info.totalFrames; i += frameSkip) {
          const framePath = path.join(frameDir, `frame_${i}.webp`);
          await execFileAsync('webpmux', ['-get', 'frame', i.toString(), inputPath, '-o', framePath]);
          
          // Redimensionar com qualidade agressiva
          const resizedPath = path.join(frameDir, `resized_${frameCount}.webp`);
          await execFileAsync('cwebp', [
            '-q', quality.toString(),
            '-m', '6', // Máximo esforço de compressão
            '-resize', '512', '512',
            framePath,
            '-o', resizedPath
          ]);
          
          frameFiles.push(resizedPath);
          frameCount++;
        }
        
        // Ajustar duração baseado nos frames que sobrou
        const adjustedDuration = Math.max(80, Math.floor((info.duration * frameSkip) / frameCount));
        const webpmuxArgs = [];
        
        frameFiles.forEach((framePath) => {
          webpmuxArgs.push('-frame', framePath, `+${adjustedDuration}`);
        });
        
        webpmuxArgs.push('-loop', '0', '-o', outputPath);
        
        await execFileAsync('webpmux', webpmuxArgs);
        
        // Verificar se ainda está muito grande
        const outputStats = await fs.stat(outputPath);
        if (outputStats.size > targetSize && frameSkip === 1 && quality > 20) {
          // Tentar uma vez mais com qualidade ainda menor
          warn(`Ainda muito grande (${outputStats.size}), tentando qualidade ${quality - 10}`, {
            targetSize
          });
          await this.resizeAnimatedWebPAggressive(inputPath, outputPath, quality - 10, targetSize);
        }
        
      } finally {
        await fs.remove(frameDir);
      }
      
    } catch (err) {
      error('Erro na compressão agressiva de WebP animado', err);
      // Fallback final: processar como estático com qualidade baixa
      await execFileAsync('cwebp', [
        '-q', '25',
        '-resize', '512', '512',
        inputPath,
        '-o', outputPath
      ]);
    }
  }

  /**
   * Verifica se imagem é animada usando webpmux_info
   */
  async isAnimated(buffer) {
    try {
      const tempPath = path.join(this.tempDir, `check_${Date.now()}.webp`);
      await fs.writeFile(tempPath, buffer);
      
      try {
        const info = await this.getWebPInfo(tempPath);
        return info.totalFrames > 1;
      } finally {
        await this.removeTemporary(path.basename(tempPath));
      }
    } catch (err) {
      debug('Erro ao verificar se WebP é animado', err);
      return false;
    }
  }

  /**
   * Salva imagem temporariamente
   */
  async saveTemporary(buffer, filename) {
    try {
      const tempPath = path.join(this.tempDir, filename);
      await fs.writeFile(tempPath, buffer);
      return tempPath;
    } catch (err) {
      error(`Erro ao salvar arquivo temporário: ${filename}`, err);
      throw err;
    }
  }

  /**
   * Remove arquivo temporário
   */
  async removeTemporary(filename) {
    try {
      const tempPath = path.join(this.tempDir, filename);
      await fs.remove(tempPath);
    } catch (err) {
      debug(`Erro ao remover arquivo temporário: ${filename}`, { error: err.message });
    }
  }

  /**
   * Limpa diretório temporário
   */
  async cleanupTemp() {
    try {
      await fs.emptyDir(this.tempDir);
      info('Diretório temporário limpo');
    } catch (err) {
      error('Erro ao limpar diretório temporário', err);
    }
  }

  /**
   * Muda extensão do arquivo
   */
  changeExtension(filename, newExt) {
    const name = path.parse(filename).name;
    return name + newExt;
  }

  /**
   * Gera emojis padrão baseado no nome do arquivo
   */
  generateDefaultEmojis(filename) {
    const emojiMap = {
      'smile': ['😊', '😄', '😃'],
      'happy': ['😊', '😄', '🙂'],
      'sad': ['😢', '😭', '☹️'],
      'angry': ['😠', '😡', '😤'],
      'love': ['❤️', '😍', '🥰'],
      'laugh': ['😂', '🤣', '😆'],
      'cry': ['😢', '😭', '😿'],
      'surprised': ['😲', '😮', '😯'],
      'cool': ['😎', '🆒', '👍'],
      'wink': ['😉', '😜', '😋'],
      'thumbs': ['👍', '👎', '🤝'],
      'hand': ['🤚', '✋', '👋'],
      'peace': ['✌️', '☮️', '🕊️'],
      'ok': ['👌', '✅', '👍'],
      'clap': ['👏', '🙌', '💪'],
      'cat': ['🐱', '😸', '🙀'],
      'dog': ['🐶', '🐕', '🦮'],
      'heart': ['❤️', '💖', '💕'],
      'fire': ['🔥', '💥', '⚡'],
      'star': ['⭐', '🌟', '✨'],
      'work': ['💼', '👔', '💻'],
      'computer': ['💻', '🖥️', '⌨️'],
      'phone': ['📱', '☎️', '📞'],
      'food': ['🍕', '🍔', '🍟'],
      'coffee': ['☕', '🍵', '🥤'],
      'cake': ['🎂', '🧁', '🍰'],
      'football': ['⚽', '🏈', '🏆'],
      'music': ['🎵', '🎶', '🎧'],
      'party': ['🎉', '🥳', '🎊'],
      'brasil': ['🇧🇷', '💚', '💛'],
      'futebol': ['⚽', '🏆', '🇧🇷'],
      'carnaval': ['🎭', '🎉', '💃']
    };

    const filename_lower = filename.toLowerCase();
    
    for (const [keyword, emojis] of Object.entries(emojiMap)) {
      if (filename_lower.includes(keyword)) {
        return emojis;
      }
    }
    
    const genericEmojis = [
      ['😊', '🙂', '😄'],
      ['😎', '🤔', '😮'],
      ['👍', '✌️', '🤚'],
      ['❤️', '💖', '⭐'],
      ['🔥', '💥', '✨']
    ];
    
    const randomIndex = Math.floor(Math.random() * genericEmojis.length);
    return genericEmojis[randomIndex];
  }

  /**
   * Valida se imagem está corrompida (suporta PNG e WebP)
   */
  async validateImage(buffer, filename = 'unknown') {
    try {
      // Detectar formato do arquivo
      const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
      const isWebP = buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
      
      if (!isPng && !isWebP) {
        debug('Formato de arquivo não suportado', { filename });
        return false;
      }

      // Validação básica de tamanho
      if (buffer.length < 100) {
        debug('Arquivo muito pequeno', { filename, size: buffer.length });
        return false;
      }

      // Para PNG: validação simples (verifica se não está truncado)
      if (isPng) {
        // PNG deve terminar com IEND chunk (00 00 00 00 49 45 4E 44 AE 42 60 82)
        const endSignature = [0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82];
        const bufferEnd = buffer.slice(-8);
        
        for (let i = 0; i < endSignature.length; i++) {
          if (bufferEnd[i] !== endSignature[i]) {
            debug('PNG corrompido: assinatura final inválida', { filename });
            return false;
          }
        }
        return true;
      }

      // Para WebP: usar webpmux como antes
      if (isWebP) {
        const tempPath = path.join(this.tempDir, `validate_${Date.now()}.webp`);
        await fs.writeFile(tempPath, buffer);

        try {
          await execFileAsync('webpmux', ['-info', tempPath]);
          return true;
        } catch (err) {
          debug('WebP corrompido detectado', { filename, error: err.message });
          return false;
        } finally {
          await this.removeTemporary(path.basename(tempPath));
        }
      }

      return false;
    } catch (err) {
      debug('Erro na validação de imagem', { filename, error: err.message });
      return false;
    }
  }
}

module.exports = ImageProcessor;
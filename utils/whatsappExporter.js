const fs = require('fs-extra');
const path = require('path');
const { info, error, warn } = require('./logger');

/**
 * Utilitários para exportação de stickers compatíveis com WhatsApp
 * Baseado na documentação oficial do WhatsApp Stickers
 */
class WhatsAppExporter {
  
  /**
   * Gera estrutura de dados compatível com whatsapp_stickers_exporter
   */
  static generateStickerPackData(pack, stickerFiles, trayFile) {
    try {
      // Validar requisitos mínimos
      if (!pack.identifier || !pack.name) {
        throw new Error('Pack deve ter identifier e name');
      }

      if (!Array.isArray(stickerFiles) || stickerFiles.length < 3 || stickerFiles.length > 30) {
        throw new Error('Pack deve ter entre 3 e 30 stickers');
      }

      if (!trayFile || !trayFile.buffer) {
        throw new Error('Pack deve ter tray image válida');
      }

      // Preparar dados dos stickers
      const stickers = stickerFiles.map((sticker, index) => {
        if (!sticker.emoji || sticker.emoji.length === 0) {
          throw new Error(`Sticker ${index} deve ter pelo menos 1 emoji`);
        }

        return {
          filename: sticker.filename,
          path: sticker.path || `sticker_${index}.webp`,
          emoji: sticker.emoji,
          size: sticker.metadata?.size || 0,
          animated: sticker.isAnimated || false
        };
      });

      // Preparar dados do pack
      const packData = {
        identifier: pack.identifier.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
        title: pack.name.substring(0, 128), // Limite do WhatsApp
        author: pack.publisher || 'Unknown',
        trayImagePath: 'tray.png',
        publisherWebsite: '',
        privacyPolicyWebsite: '',
        licenseAgreementWebsite: '',
        isAnimated: pack.is_animated || false,
        stickers: stickers,
        
        // Metadados adicionais
        totalSize: stickers.reduce((sum, s) => sum + s.size, 0) + (trayFile.metadata?.size || 0),
        stickerCount: stickers.length,
        language: pack.lang || 'pt'
      };

      info('Dados do pack gerados para WhatsApp', {
        identifier: packData.identifier,
        title: packData.title,
        stickerCount: packData.stickerCount,
        isAnimated: packData.isAnimated,
        totalSize: packData.totalSize
      });

      return packData;

    } catch (err) {
      error('Erro ao gerar dados do pack para WhatsApp', err);
      throw err;
    }
  }

  /**
   * Valida se pack está totalmente compatível com WhatsApp
   */
  static validateWhatsAppCompatibility(packData) {
    const errors = [];
    const warnings = [];

    try {
      // Validações obrigatórias
      if (!packData.identifier || packData.identifier.length < 1) {
        errors.push('Identifier é obrigatório');
      }

      if (!packData.title || packData.title.length < 1) {
        errors.push('Title é obrigatório');
      }

      if (!packData.author || packData.author.length < 1) {
        errors.push('Author é obrigatório');
      }

      if (!Array.isArray(packData.stickers) || packData.stickers.length < 3) {
        errors.push('Pack deve ter pelo menos 3 stickers');
      }

      if (packData.stickers && packData.stickers.length > 30) {
        errors.push('Pack não pode ter mais de 30 stickers');
      }

      // Validações dos stickers
      if (packData.stickers) {
        packData.stickers.forEach((sticker, index) => {
          if (!sticker.emoji || sticker.emoji.length === 0) {
            errors.push(`Sticker ${index} deve ter pelo menos 1 emoji`);
          }

          if (!sticker.filename || !sticker.filename.endsWith('.webp')) {
            errors.push(`Sticker ${index} deve ser arquivo WebP`);
          }

          // Validar tamanhos
          if (sticker.size > 500 * 1024 && sticker.animated) {
            warnings.push(`Sticker animado ${index} muito grande (${sticker.size} bytes)`);
          } else if (sticker.size > 100 * 1024 && !sticker.animated) {
            warnings.push(`Sticker estático ${index} muito grande (${sticker.size} bytes)`);
          }
        });
      }

      // Validações da tray
      if (!packData.trayImagePath) {
        errors.push('Tray image é obrigatória');
      }

      // Validações de comprimento
      if (packData.title && packData.title.length > 128) {
        warnings.push('Title muito longo, será truncado');
      }

      if (packData.author && packData.author.length > 128) {
        warnings.push('Author muito longo, será truncado');
      }

      // Log dos resultados
      if (errors.length > 0) {
        error('Pack não compatível com WhatsApp', null, { 
          identifier: packData.identifier,
          errors 
        });
        return { valid: false, errors, warnings };
      }

      if (warnings.length > 0) {
        warn('Pack tem avisos de compatibilidade', { 
          identifier: packData.identifier,
          warnings 
        });
      }

      info('Pack totalmente compatível com WhatsApp', {
        identifier: packData.identifier,
        stickerCount: packData.stickers.length
      });

      return { valid: true, errors: [], warnings };

    } catch (err) {
      error('Erro na validação de compatibilidade', err);
      return { valid: false, errors: ['Erro interno na validação'], warnings: [] };
    }
  }

  /**
   * Gera metadados JSON para app Flutter
   */
  static generateFlutterMetadata(packData) {
    try {
      const metadata = {
        android_play_store_link: '',
        ios_app_store_link: '',
        sticker_packs: [{
          identifier: packData.identifier,
          name: packData.title,
          publisher: packData.author,
          tray_image_file: packData.trayImagePath,
          publisher_email: '',
          publisher_website: packData.publisherWebsite || '',
          privacy_policy_website: packData.privacyPolicyWebsite || '',
          license_agreement_website: packData.licenseAgreementWebsite || '',
          image_data_version: '1',
          avoid_cache: false,
          animated_sticker_pack: packData.isAnimated,
          stickers: packData.stickers.map(sticker => ({
            image_file: sticker.filename,
            emojis: sticker.emoji
          }))
        }]
      };

      return metadata;
    } catch (err) {
      error('Erro ao gerar metadados Flutter', err);
      throw err;
    }
  }

  /**
   * Salva metadados em arquivo JSON
   */
  static async saveMetadataFile(packData, outputPath) {
    try {
      const metadata = this.generateFlutterMetadata(packData);
      const filePath = path.join(outputPath, `${packData.identifier}_metadata.json`);
      
      await fs.ensureDir(path.dirname(filePath));
      await fs.writeJson(filePath, metadata, { spaces: 2 });
      
      info('Metadados salvos', { 
        identifier: packData.identifier,
        filePath 
      });
      
      return filePath;
    } catch (err) {
      error('Erro ao salvar metadados', err);
      throw err;
    }
  }

  /**
   * Gera estatísticas do pack
   */
  static generatePackStats(packData) {
    try {
      const stats = {
        identifier: packData.identifier,
        title: packData.title,
        stickerCount: packData.stickers.length,
        isAnimated: packData.isAnimated,
        totalSize: packData.totalSize,
        averageStickerSize: Math.round(packData.totalSize / packData.stickers.length),
        
        // Estatísticas de emojis
        totalEmojis: packData.stickers.reduce((sum, s) => sum + s.emoji.length, 0),
        averageEmojisPerSticker: Math.round(
          packData.stickers.reduce((sum, s) => sum + s.emoji.length, 0) / packData.stickers.length
        ),
        
        // Estatísticas de tamanho
        largestSticker: Math.max(...packData.stickers.map(s => s.size)),
        smallestSticker: Math.min(...packData.stickers.map(s => s.size)),
        
        // Conformidade
        whatsappCompliant: this.validateWhatsAppCompatibility(packData).valid,
        
        // Metadados
        language: packData.language,
        createdAt: new Date().toISOString()
      };

      return stats;
    } catch (err) {
      error('Erro ao gerar estatísticas do pack', err);
      return null;
    }
  }

  /**
   * Formata dados para log de auditoria
   */
  static formatAuditLog(packData, action = 'created') {
    try {
      const stats = this.generatePackStats(packData);
      
      return {
        action,
        timestamp: new Date().toISOString(),
        pack: {
          identifier: packData.identifier,
          title: packData.title,
          author: packData.author,
          language: packData.language
        },
        stats,
        compliance: this.validateWhatsAppCompatibility(packData)
      };
    } catch (err) {
      error('Erro ao formatar log de auditoria', err);
      return null;
    }
  }
}

module.exports = WhatsAppExporter;
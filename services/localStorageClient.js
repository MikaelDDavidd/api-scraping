const fs = require('fs-extra');
const path = require('path');
const { info, error, warn, uploadSuccess, uploadError } = require('../utils/logger');

class LocalStorageClient {
  constructor() {
    // Configurações para storage local na VPS
    this.baseStoragePath = process.env.LOCAL_STORAGE_PATH || '/home/ubuntu/stickers';
    this.baseUrl = process.env.STORAGE_BASE_URL || 'http://localhost';
    
    // Garantir que o diretório base existe
    this.ensureBaseDirectory();
  }

  /**
   * Garante que o diretório base de storage existe
   */
  async ensureBaseDirectory() {
    try {
      await fs.ensureDir(this.baseStoragePath);
      info('Diretório de storage local verificado', { path: this.baseStoragePath });
    } catch (err) {
      error('Erro ao criar diretório de storage local', err);
      throw err;
    }
  }

  /**
   * Verifica se pack já existe no sistema de arquivos local
   */
  async packExists(identifier) {
    try {
      const packPath = path.join(this.baseStoragePath, identifier);
      const exists = await fs.pathExists(packPath);
      return exists ? identifier : null;
    } catch (err) {
      error('Erro ao verificar se pack existe no storage local', err, { identifier });
      return null;
    }
  }

  /**
   * Cria diretório para um pack
   */
  async createPackDirectory(identifier) {
    try {
      const packPath = path.join(this.baseStoragePath, identifier);
      await fs.ensureDir(packPath);
      info(`Diretório do pack criado`, { packPath });
      return packPath;
    } catch (err) {
      error('Erro ao criar diretório do pack', err, { identifier });
      throw err;
    }
  }

  /**
   * Faz upload de arquivo para o storage local
   */
  async uploadFile(buffer, filePath, contentType = 'image/webp') {
    try {
      const fullPath = path.join(this.baseStoragePath, filePath);
      const directory = path.dirname(fullPath);
      
      // Garantir que o diretório existe
      await fs.ensureDir(directory);
      
      // Escrever arquivo
      await fs.writeFile(fullPath, buffer);
      
      // Verificar se foi escrito corretamente
      const stats = await fs.stat(fullPath);
      if (stats.size !== buffer.length) {
        throw new Error(`Tamanho do arquivo não confere: esperado ${buffer.length}, obtido ${stats.size}`);
      }
      
      uploadSuccess(filePath, buffer.length);
      return filePath; // Retorna o caminho relativo
    } catch (err) {
      uploadError(filePath, err);
      throw err;
    }
  }

  /**
   * Verifica se arquivo existe no storage local
   */
  async fileExists(filePath) {
    try {
      const fullPath = path.join(this.baseStoragePath, filePath);
      return await fs.pathExists(fullPath);
    } catch (err) {
      return false;
    }
  }

  /**
   * Obtém URL pública do arquivo (via Nginx)
   */
  getPublicUrl(filePath) {
    // Remove barras duplas e garante que começa com /
    const cleanPath = filePath.replace(/\/+/g, '/');
    const normalizedPath = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
    
    return `${this.baseUrl}/stickers${normalizedPath}`;
  }

  /**
   * Upload de pack completo (tray + stickers) - versão local
   */
  async uploadPack(packData, stickerFiles, trayFile) {
    const packId = packData.identifier;
    
    try {
      info(`Iniciando upload local do pack: ${packId}`);

      // 1. Criar diretório do pack
      await this.createPackDirectory(packId);

      // 2. Upload da tray (DEVE ser PNG para WhatsApp)
      let trayPath = null;
      if (trayFile) {
        trayPath = `${packData.identifier}/tray.png`;
        await this.uploadFile(trayFile.buffer, trayPath, 'image/png');
      }

      // 3. Upload dos stickers
      const uploadedStickers = [];
      for (const sticker of stickerFiles) {
        try {
          const stickerPath = `${packData.identifier}/${sticker.filename}`;
          
          // Verificar se arquivo já existe para evitar re-upload
          const exists = await this.fileExists(stickerPath);
          if (!exists) {
            await this.uploadFile(sticker.buffer, stickerPath);
          }
          
          uploadedStickers.push({
            ...sticker,
            path: stickerPath,
            publicUrl: this.getPublicUrl(stickerPath)
          });

        } catch (stickerError) {
          error(`Erro ao fazer upload do sticker: ${sticker.filename}`, stickerError);
          // Continua com os outros stickers mesmo se um falhar
        }
      }

      info(`Pack upload local completo`, {
        packId,
        totalStickers: uploadedStickers.length,
        successfulStickers: uploadedStickers.length,
        basePath: this.baseStoragePath
      });

      return {
        packId,
        trayUrl: trayPath ? this.getPublicUrl(trayPath) : null,
        stickers: uploadedStickers,
        localPath: path.join(this.baseStoragePath, packId)
      };

    } catch (err) {
      error(`Erro no upload local do pack: ${packId}`, err);
      throw err;
    }
  }

  /**
   * Lista packs no storage local
   */
  async listLocalPacks() {
    try {
      const items = await fs.readdir(this.baseStoragePath);
      const packs = [];
      
      for (const item of items) {
        const itemPath = path.join(this.baseStoragePath, item);
        const stats = await fs.stat(itemPath);
        
        if (stats.isDirectory()) {
          // Contar arquivos no pack
          const packFiles = await fs.readdir(itemPath);
          const stickerCount = packFiles.filter(f => f !== 'tray.png').length;
          const hasTray = packFiles.includes('tray.png');
          
          // Calcular tamanho total
          let totalSize = 0;
          for (const file of packFiles) {
            const filePath = path.join(itemPath, file);
            const fileStats = await fs.stat(filePath);
            totalSize += fileStats.size;
          }
          
          packs.push({
            identifier: item,
            stickerCount,
            hasTray,
            totalSize,
            files: packFiles,
            createdAt: stats.birthtime,
            modifiedAt: stats.mtime
          });
        }
      }
      
      return packs;
    } catch (err) {
      error('Erro ao listar packs locais', err);
      return [];
    }
  }

  /**
   * Obtém estatísticas do storage local
   */
  async getStorageStats() {
    try {
      const packs = await this.listLocalPacks();
      
      const stats = {
        totalPacks: packs.length,
        totalStickers: packs.reduce((sum, pack) => sum + pack.stickerCount, 0),
        totalSize: packs.reduce((sum, pack) => sum + pack.totalSize, 0),
        packsWithTray: packs.filter(pack => pack.hasTray).length,
        averagePackSize: 0,
        averageStickersPerPack: 0,
        largestPacks: packs
          .sort((a, b) => b.totalSize - a.totalSize)
          .slice(0, 10)
          .map(pack => ({
            identifier: pack.identifier,
            size: pack.totalSize,
            stickerCount: pack.stickerCount
          }))
      };
      
      if (stats.totalPacks > 0) {
        stats.averagePackSize = Math.round(stats.totalSize / stats.totalPacks);
        stats.averageStickersPerPack = Math.round(stats.totalStickers / stats.totalPacks);
      }
      
      return stats;
    } catch (err) {
      error('Erro ao obter estatísticas do storage local', err);
      return null;
    }
  }

  /**
   * Remove pack do storage local
   */
  async removePack(identifier) {
    try {
      const packPath = path.join(this.baseStoragePath, identifier);
      await fs.remove(packPath);
      info(`Pack removido do storage local`, { identifier, packPath });
      return true;
    } catch (err) {
      error('Erro ao remover pack do storage local', err, { identifier });
      return false;
    }
  }

  /**
   * Limpa arquivos órfãos ou corrompidos
   */
  async cleanupOrphanFiles() {
    try {
      info('Iniciando limpeza de arquivos órfãos no storage local');
      
      const packs = await this.listLocalPacks();
      let cleanedFiles = 0;
      let cleanedPacks = 0;
      
      for (const pack of packs) {
        const packPath = path.join(this.baseStoragePath, pack.identifier);
        
        // Verificar se pack tem pelo menos um sticker
        if (pack.stickerCount === 0) {
          warn(`Pack vazio encontrado, removendo: ${pack.identifier}`);
          await fs.remove(packPath);
          cleanedPacks++;
          continue;
        }
        
        // Verificar arquivos corrompidos (tamanho 0)
        for (const fileName of pack.files) {
          const filePath = path.join(packPath, fileName);
          const stats = await fs.stat(filePath);
          
          if (stats.size === 0) {
            warn(`Arquivo corrompido encontrado, removendo: ${pack.identifier}/${fileName}`);
            await fs.remove(filePath);
            cleanedFiles++;
          }
        }
        
        // Verificar se pack ainda tem arquivos após limpeza
        const remainingFiles = await fs.readdir(packPath);
        if (remainingFiles.length === 0) {
          warn(`Pack vazio após limpeza, removendo: ${pack.identifier}`);
          await fs.remove(packPath);
          cleanedPacks++;
        }
      }
      
      info(`Limpeza concluída`, {
        cleanedFiles,
        cleanedPacks,
        remainingPacks: packs.length - cleanedPacks
      });
      
      return { cleanedFiles, cleanedPacks };
    } catch (err) {
      error('Erro na limpeza de arquivos órfãos', err);
      return { cleanedFiles: 0, cleanedPacks: 0 };
    }
  }

  /**
   * Verifica integridade de um pack
   */
  async verifyPackIntegrity(identifier) {
    try {
      const packPath = path.join(this.baseStoragePath, identifier);
      
      if (!await fs.pathExists(packPath)) {
        return { valid: false, error: 'Pack não encontrado' };
      }
      
      const files = await fs.readdir(packPath);
      const issues = [];
      
      // Verificar se tem tray
      if (!files.includes('tray.png')) {
        issues.push('Tray ausente');
      }
      
      // Verificar arquivos
      for (const file of files) {
        const filePath = path.join(packPath, file);
        const stats = await fs.stat(filePath);
        
        if (stats.size === 0) {
          issues.push(`Arquivo vazio: ${file}`);
        }
        
        if (file !== 'tray.png' && !file.match(/\.(webp|png|jpg|jpeg)$/i)) {
          issues.push(`Formato inválido: ${file}`);
        }
      }
      
      const stickerCount = files.filter(f => f !== 'tray.png').length;
      if (stickerCount < 3) {
        issues.push(`Poucos stickers: ${stickerCount} (mínimo 3)`);
      }
      
      return {
        valid: issues.length === 0,
        issues,
        fileCount: files.length,
        stickerCount,
        hasTray: files.includes('tray.png')
      };
    } catch (err) {
      return {
        valid: false,
        error: err.message
      };
    }
  }
}

module.exports = LocalStorageClient;
const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/config');
const { info, error, warn, uploadSuccess, uploadError } = require('../utils/logger');
const LocalStorageClient = require('./localStorageClient');

class SupabaseClient {
  constructor() {
    // Cliente com permissões de administrador
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
    
    this.bucketName = config.supabase.bucketName;
    
    // Decidir se usar storage local ou Supabase
    this.useLocalStorage = process.env.USE_LOCAL_STORAGE === 'true' || process.env.USE_LOCAL_STORAGE === '1';
    
    if (this.useLocalStorage) {
      this.localStorageClient = new LocalStorageClient();
      info('Usando storage local para arquivos', { 
        path: process.env.LOCAL_STORAGE_PATH || '/home/ubuntu/stickers',
        baseUrl: process.env.STORAGE_BASE_URL || 'http://localhost'
      });
    } else {
      info('Usando Supabase Storage para arquivos');
    }
  }

  /**
   * Verifica se pack já existe no banco
   */
  async packExists(identifier) {
    try {
      const { data, error: queryError } = await this.supabase
        .from('packs')
        .select('id, identifier')
        .eq('identifier', identifier)
        .single();

      if (queryError && queryError.code !== 'PGRST116') {
        throw queryError;
      }

      return data ? data.id : null;
    } catch (err) {
      error('Erro ao verificar se pack existe', err, { identifier });
      return null;
    }
  }

  /**
   * Retorna todos os IDs de packs existentes (para cache)
   */
  async getAllPackIds() {
    try {
      const { data, error: queryError } = await this.supabase
        .from('packs')
        .select('identifier');

      if (queryError) {
        throw queryError;
      }

      return data ? data.map(pack => pack.identifier) : [];
    } catch (err) {
      error('Erro ao buscar todos os IDs de packs', err);
      return [];
    }
  }

  /**
   * Cria novo pack no banco de dados
   */
  async createPack(packData) {
    try {
      info(`Criando pack: ${packData.name}`, { identifier: packData.identifier });

      const { data, error: insertError } = await this.supabase
        .from('packs')
        .insert({
          identifier: packData.identifier,
          name: packData.name.replace(/'/g, ""), // Remove aspas para evitar problemas SQL
          publisher: packData.publisher || '',
          tray: 'tray.png',
          zip_size: packData.zip_size || 0,
          is_animated: packData.is_animated || false,
          downloads: 0,
          level: packData.level || 0,
          lang: packData.lang || 'pt',
          origin: 'sticker.ly',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      info(`Pack criado com sucesso`, { 
        packId: data.id, 
        identifier: packData.identifier 
      });

      return data.id;
    } catch (err) {
      error('Erro ao criar pack', err, { packData });
      throw err;
    }
  }

  /**
   * Cria sticker no banco de dados
   */
  async createSticker(stickerData) {
    try {
      const { data, error: insertError } = await this.supabase
        .from('stickers')
        .insert({
          pack_id: stickerData.pack_id,
          name: stickerData.name,
          downloads: 0,
          size: stickerData.size || 0,
          // Salvar emojis como JSONB (após executar migration)
          emoji: stickerData.emoji ? stickerData.emoji : ['😊'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (insertError) {
        throw insertError;
      }

      return data.id;
    } catch (err) {
      error('Erro ao criar sticker', err, { stickerData });
      throw err;
    }
  }

  /**
   * Faz upload de arquivo para o Storage (Supabase ou Local)
   */
  async uploadFile(buffer, filePath, contentType = 'image/webp') {
    if (this.useLocalStorage) {
      return await this.localStorageClient.uploadFile(buffer, filePath, contentType);
    }

    try {
      info(`Iniciando upload: ${filePath}`);

      const { data, error: uploadError } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, buffer, {
          contentType,
          cacheControl: '3600',
          upsert: true // Sobrescreve se arquivo já existir
        });

      if (uploadError) {
        throw uploadError;
      }

      uploadSuccess(filePath, buffer.length);
      return data.path;
    } catch (err) {
      uploadError(filePath, err);
      throw err;
    }
  }

  /**
   * Verifica se arquivo existe no Storage (Supabase ou Local)
   */
  async fileExists(filePath) {
    if (this.useLocalStorage) {
      return await this.localStorageClient.fileExists(filePath);
    }

    try {
      const { data, error: listError } = await this.supabase.storage
        .from(this.bucketName)
        .list(filePath.substring(0, filePath.lastIndexOf('/')), {
          limit: 1,
          search: filePath.substring(filePath.lastIndexOf('/') + 1)
        });

      if (listError) {
        throw listError;
      }

      return data && data.length > 0;
    } catch (err) {
      // Se não conseguir verificar, assume que não existe
      return false;
    }
  }

  /**
   * Obtém URL pública do arquivo (Supabase ou Local)
   */
  getPublicUrl(filePath) {
    if (this.useLocalStorage) {
      return this.localStorageClient.getPublicUrl(filePath);
    }

    const { data } = this.supabase.storage
      .from(this.bucketName)
      .getPublicUrl(filePath);
    
    return data.publicUrl;
  }

  /**
   * Upload de pack completo (tray + stickers) - Híbrido
   */
  async uploadPack(packData, stickerFiles, trayFile) {
    const packId = packData.identifier;
    
    try {
      info(`Iniciando upload do pack: ${packId}`, { 
        useLocalStorage: this.useLocalStorage 
      });

      let uploadResult;

      if (this.useLocalStorage) {
        // Upload local - não cria no banco, apenas salva arquivos
        uploadResult = await this.localStorageClient.uploadPack(packData, stickerFiles, trayFile);
      } else {
        // Upload Supabase original
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

        uploadResult = {
          packId,
          uploadedStickers,
          trayPath
        };
      }

      // 4. Criar pack no banco (sempre no Supabase para metadados)
      const dbPackId = await this.createPack({
        ...packData,
        tray: `tray.png`
      });

      // 5. Criar stickers no banco (sempre no Supabase para metadados)
      const stickersToSave = this.useLocalStorage ? 
        uploadResult.stickers : uploadResult.uploadedStickers;

      for (const sticker of stickersToSave) {
        try {
          await this.createSticker({
            pack_id: dbPackId,
            name: sticker.filename,
            size: sticker.metadata?.size || 0
          });
        } catch (err) {
          error(`Erro ao criar sticker no banco: ${sticker.filename}`, err);
        }
      }

      info(`Pack upload completo`, {
        packId,
        dbPackId,
        totalStickers: stickersToSave.length,
        storageType: this.useLocalStorage ? 'local' : 'supabase'
      });

      return dbPackId;

    } catch (err) {
      error(`Erro no upload do pack: ${packId}`, err);
      throw err;
    }
  }

  /**
   * Atualiza estatísticas de scraping
   */
  async updateStats(metric, value) {
    try {
      await this.supabase
        .from('stats')
        .insert({
          metric_name: metric,
          metric_value: value,
          date: new Date().toISOString()
        });
    } catch (err) {
      warn('Erro ao atualizar estatísticas', { metric, value, error: err.message });
    }
  }

  /**
   * Salva estado do scraping
   */
  async saveScrapingState(state) {
    try {
      const { error: upsertError } = await this.supabase
        .from('scraping_state')
        .upsert({
          id: 1,
          current_keyword_index: state.keywordIndex || 0,
          current_page: state.currentPage || 0,
          total_processed: state.totalProcessed || 0,
          updated_at: new Date().toISOString()
        });

      if (upsertError) {
        throw upsertError;
      }

      info('Estado do scraping salvo', state);
    } catch (err) {
      error('Erro ao salvar estado do scraping', err, state);
    }
  }

  /**
   * Carrega estado do scraping
   */
  async loadScrapingState() {
    try {
      const { data, error: queryError } = await this.supabase
        .from('scraping_state')
        .select('*')
        .eq('id', 1)
        .single();

      if (queryError && queryError.code !== 'PGRST116') {
        throw queryError;
      }

      return data || {
        current_keyword_index: 0,
        current_page: 0,
        total_processed: 0
      };
    } catch (err) {
      warn('Erro ao carregar estado do scraping', { error: err.message });
      return {
        current_keyword_index: 0,
        current_page: 0,
        total_processed: 0
      };
    }
  }

  /**
   * Lista packs existentes
   */
  async listPacks(limit = 100, offset = 0) {
    try {
      const { data, error: queryError } = await this.supabase
        .from('packs')
        .select('id, identifier, name, publisher, is_animated, downloads, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (queryError) {
        throw queryError;
      }

      return data || [];
    } catch (err) {
      error('Erro ao listar packs', err);
      return [];
    }
  }

  /**
   * Remove arquivos órfãos do storage
   */
  async cleanupOrphanFiles() {
    try {
      info('Iniciando limpeza de arquivos órfãos');

      // Lista todos os arquivos no storage (raiz do bucket)
      const { data: files, error: listError } = await this.supabase.storage
        .from(this.bucketName)
        .list('', {
          limit: 1000,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (listError) {
        throw listError;
      }

      // Lista todos os packs no banco
      const packs = await this.listPacks(1000);
      const packIdentifiers = new Set(packs.map(p => p.identifier));

      // Encontra arquivos órfãos (pastas de packs que não existem no banco)
      const orphanFiles = files.filter(file => {
        // Se é uma pasta (pack), verifica se existe no banco
        return file.name && !packIdentifiers.has(file.name);
      });

      info(`Encontrados ${orphanFiles.length} arquivos órfãos para remoção`);

      // Remove arquivos órfãos
      for (const file of orphanFiles) {
        try {
          // Listar arquivos dentro da pasta do pack órfão
          const { data: packFiles } = await this.supabase.storage
            .from(this.bucketName)
            .list(file.name);

          if (packFiles) {
            // Remover todos os arquivos da pasta
            const filesToRemove = packFiles.map(f => `${file.name}/${f.name}`);
            await this.supabase.storage
              .from(this.bucketName)
              .remove(filesToRemove);
          }
          
          info(`Pack órfão removido: ${file.name}`);
        } catch (err) {
          warn(`Erro ao remover pack órfão: ${file.name}`, { error: err.message });
        }
      }

    } catch (err) {
      error('Erro na limpeza de arquivos órfãos', err);
    }
  }
}

module.exports = SupabaseClient;
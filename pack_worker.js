/**
 * WORKER PARA PROCESSAMENTO DE PACKS
 * Processa um pack individual (download, conversão, upload)
 * Baseado na lógica da API original
 */

const { parentPort, workerData } = require('worker_threads');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

class PackWorker {
  constructor() {
    this.workerId = workerData.workerId;
    this.isDev = workerData.isDev;
    this.packsRepository = workerData.packsRepository;
    
    // Supabase client
    this.supabase = createClient(
      workerData.supabaseUrl,
      workerData.supabaseKey,
      {
        auth: { autoRefreshToken: false, persistSession: false }
      }
    );

    this.bucketName = 'sticker-packs';
    
    // Timeouts
    this.downloadTimeout = 30000; // 30s
    this.processTimeout = 60000; // 1min

    this.log(`Worker ${this.workerId} iniciado (${this.isDev ? 'DEV' : 'PROD'})`);
    
    // Sinalizar que está pronto
    parentPort.postMessage({ type: 'READY' });
  }

  log(message) {
    console.log(`[Worker ${this.workerId}] ${message}`);
  }

  /**
   * Processa um pack completo
   */
  async processPack(pack) {
    const packId = pack.packId;
    const packStartTime = Date.now();
    
    try {
      this.log(`Processando pack: ${packId}`);

      // 1. Criar diretório do pack
      const packDir = path.join(this.packsRepository, packId);
      await fs.ensureDir(packDir);

      // 2. Download e validação dos stickers
      const stickersResult = await this.downloadAndValidateStickers(pack, packDir);
      
      if (stickersResult.validStickers.length === 0) {
        throw new Error('Nenhum sticker válido encontrado');
      }

      // 3. Criar tray
      const trayPath = await this.createTray(pack, packDir, stickersResult.firstSticker);

      // 4. Upload para Supabase (banco + storage)
      await this.uploadToSupabase(pack, stickersResult.validStickers, trayPath);

      const processingTime = Date.now() - packStartTime;
      this.log(`✅ Pack ${packId} completo (${stickersResult.validStickers.length} stickers, ${processingTime}ms)`);

      return {
        success: true,
        packId,
        stickers: stickersResult.validStickers.length,
        processingTime
      };

    } catch (error) {
      this.log(`❌ Erro no pack ${packId}: ${error.message}`);
      
      // Limpar diretório em caso de erro
      try {
        const packDir = path.join(this.packsRepository, packId);
        await fs.remove(packDir);
      } catch (cleanupError) {
        // Ignorar erros de cleanup
      }

      return {
        success: false,
        packId,
        error: error.message
      };
    }
  }

  /**
   * Download e validação dos stickers (baseado na API original)
   */
  async downloadAndValidateStickers(pack, packDir) {
    const urlPrefix = pack.resourceUrlPrefix;
    const stickers = pack.resourceFiles;
    const validStickers = [];
    let firstSticker = null;

    for (let i = 0; i < stickers.length; i++) {
      const stickerFile = stickers[i];
      const stickerUrl = urlPrefix + stickerFile;
      const stickerPath = path.join(packDir, stickerFile);

      try {
        // Download com timeout
        const response = await this.downloadWithTimeout(stickerUrl, this.downloadTimeout);
        await fs.writeFile(stickerPath, response.data);

        // Validar imagem
        const isValid = await this.validateImage(stickerPath);
        
        if (isValid) {
          // Converter nome para WebP se necessário (como API original)
          let stickerName = stickerFile;
          if (stickerFile.endsWith('.png')) {
            stickerName = stickerFile.replace('.png', '.webp');
            
            // Converter PNG para WebP
            const webpPath = path.join(packDir, stickerName);
            await sharp(stickerPath)
              .webp({ quality: 80 })
              .toFile(webpPath);
            
            // Remover PNG original
            await fs.unlink(stickerPath);
          }

          validStickers.push({
            originalName: stickerFile,
            finalName: stickerName,
            path: path.join(packDir, stickerName)
          });

          // Primeiro sticker será usado para tray
          if (i === 0) {
            firstSticker = {
              originalName: stickerFile,
              finalName: stickerName,
              path: path.join(packDir, stickerName)
            };
          }

          this.log(`✓ Sticker válido: ${stickerName}`);
        } else {
          this.log(`✗ Sticker inválido: ${stickerFile}`);
          // Remover arquivo inválido
          await fs.unlink(stickerPath);
        }

      } catch (error) {
        this.log(`✗ Erro no sticker ${stickerFile}: ${error.message}`);
        
        // Remover arquivo corrompido se existir
        try {
          await fs.unlink(stickerPath);
        } catch (unlinkError) {
          // Ignorar
        }
      }
    }

    return { validStickers, firstSticker };
  }

  /**
   * Download com timeout
   */
  async downloadWithTimeout(url, timeout) {
    return axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      timeout: timeout,
      headers: {
        'User-Agent': 'androidapp.stickerly/1.17.3'
      }
    });
  }

  /**
   * Validar imagem usando Sharp
   */
  async validateImage(imagePath) {
    try {
      const metadata = await sharp(imagePath).metadata();
      
      // Verificações básicas
      if (!metadata.width || !metadata.height) {
        return false;
      }

      // Verificar dimensões do WhatsApp (96x96 a 512x512)
      if (metadata.width < 96 || metadata.width > 512 || 
          metadata.height < 96 || metadata.height > 512) {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Criar tray (baseado na API original)
   */
  async createTray(pack, packDir, firstSticker) {
    const trayPath = path.join(packDir, 'tray.png');

    try {
      if (firstSticker) {
        // Criar tray a partir do primeiro sticker (96x96 PNG)
        await sharp(firstSticker.path)
          .resize(96, 96)
          .png()
          .toFile(trayPath);
        
        this.log(`✓ Tray criado: tray.png`);
        return trayPath;
      } else {
        throw new Error('Nenhum sticker válido para criar tray');
      }
    } catch (error) {
      throw new Error(`Erro ao criar tray: ${error.message}`);
    }
  }

  /**
   * Upload para Supabase (banco + storage)
   */
  async uploadToSupabase(pack, validStickers, trayPath) {
    try {
      // 1. Inserir pack no banco
      const packData = {
        identifier: pack.packId,
        name: (pack.name || 'Pack sem nome').replace(/'/g, ''),
        publisher: (pack.authorName || 'Autor desconhecido').replace(/'/g, ''),
        tray: 'tray.png',
        zip_size: 0,
        level: 0,
        is_animated: pack.isAnimated ? true : false,
        downloads: 0,
        origin: 'sticker.ly',
        date: new Date().toISOString(),
        lang: pack.lang || 'pt'
      };

      const { data: packInserted, error: packError } = await this.supabase
        .from('packs')
        .insert(packData)
        .select('id')
        .single();

      if (packError) throw packError;

      const packDbId = packInserted.id;
      this.log(`✓ Pack inserido no banco: ID ${packDbId}`);

      // 2. Upload da tray para storage
      if (!this.isDev) { // Só fazer upload para storage em produção
        const trayBuffer = await fs.readFile(trayPath);
        const trayStoragePath = `${pack.packId}/tray.png`;
        
        const { error: trayUploadError } = await this.supabase.storage
          .from(this.bucketName)
          .upload(trayStoragePath, trayBuffer, {
            contentType: 'image/png',
            upsert: true
          });

        if (trayUploadError) {
          this.log(`⚠️ Erro upload tray: ${trayUploadError.message}`);
        } else {
          this.log(`✓ Tray enviado para storage`);
        }
      }

      // 3. Upload dos stickers para storage (se não dev)
      let uploadedCount = 0;
      for (const sticker of validStickers) {
        try {
          if (!this.isDev) {
            const stickerBuffer = await fs.readFile(sticker.path);
            const stickerStoragePath = `${pack.packId}/${sticker.finalName}`;
            
            const { error: stickerUploadError } = await this.supabase.storage
              .from(this.bucketName)
              .upload(stickerStoragePath, stickerBuffer, {
                contentType: 'image/webp',
                upsert: true
              });

            if (stickerUploadError) {
              this.log(`⚠️ Erro upload sticker ${sticker.finalName}: ${stickerUploadError.message}`);
              continue;
            }
          }

          // 4. Inserir sticker no banco
          const { error: stickerDbError } = await this.supabase
            .from('stickers')
            .insert({
              name: sticker.finalName,
              pack_id: packDbId
            });

          if (stickerDbError) {
            this.log(`⚠️ Erro inserir sticker ${sticker.finalName}: ${stickerDbError.message}`);
          } else {
            uploadedCount++;
          }

        } catch (stickerError) {
          this.log(`⚠️ Erro processar sticker ${sticker.finalName}: ${stickerError.message}`);
        }
      }

      this.log(`✓ Upload completo: ${uploadedCount}/${validStickers.length} stickers`);

      if (uploadedCount === 0) {
        throw new Error('Nenhum sticker foi enviado com sucesso');
      }

    } catch (error) {
      throw new Error(`Erro no upload Supabase: ${error.message}`);
    }
  }
}

// Worker main
const worker = new PackWorker();

parentPort.on('message', async (message) => {
  if (message.type === 'PROCESS_PACK') {
    const result = await worker.processPack(message.pack);
    
    if (result.success) {
      parentPort.postMessage({
        type: 'PACK_SUCCESS',
        packId: result.packId,
        stickers: result.stickers
      });
    } else {
      parentPort.postMessage({
        type: 'PACK_ERROR',
        packId: result.packId,
        error: result.error
      });
    }
    
  } else if (message.type === 'FINISH') {
    worker.log('Worker finalizando...');
    parentPort.postMessage({ type: 'WORKER_DONE' });
  }
});
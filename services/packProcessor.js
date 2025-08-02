const fs = require("fs-extra");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const { config } = require("../config/config");
const StickerlyClient = require("./stickerlyClient");
const ImageProcessor = require("./imageProcessor");
const SupabaseClient = require("./supabaseClient");
const {
  info,
  error,
  warn,
  packFound,
  packProcessed,
  scrapingStart,
  scrapingEnd,
} = require("../utils/logger");

class PackProcessor {
  constructor() {
    this.stickerlyClient = new StickerlyClient();
    this.imageProcessor = new ImageProcessor();
    this.supabaseClient = new SupabaseClient();
    this.processedPacks = new Set();
    this.failedPacks = new Set();
    this.existingPackIds = new Set(); // Cache de IDs existentes
    this.cacheLoaded = false;
  }

  /**
   * Processa um pack completo do sticker.ly
   */
  async processPack(pack, locale = "pt-BR") {
    const packId = pack.packId;

    try {
      packFound(packId, pack.name);

      // Salvar flag original da API para comparação
      const originalApiFlag = pack.isAnimated;
      info(`Pack obtido da API`, {
        packId,
        name: pack.name,
        originalApiFlag: originalApiFlag,
        authorName: pack.authorName,
      });

      // Verificar se pack já foi processado nesta sessão
      if (this.processedPacks.has(packId)) {
        info(`Pack já processado nesta sessão: ${packId}`);
        return false;
      }

      // Verificar se pack já existe no banco
      const existingPackId = await this.supabaseClient.packExists(packId);
      if (existingPackId) {
        info(`Pack já existe no banco: ${packId}`);
        this.processedPacks.add(packId);
        return false;
      }

      // Validar dados do pack
      if (!this.stickerlyClient.validatePack(pack)) {
        warn(`Pack inválido: ${packId}`);
        this.failedPacks.add(packId);
        return false;
      }

      // CRÍTICO: Validar requisitos do WhatsApp
      if (!this.validateWhatsAppRequirements(pack)) {
        warn(`Pack não atende requisitos do WhatsApp: ${packId}`);
        this.failedPacks.add(packId);
        return false;
      }

      // Processar stickers (MANTÉM pack.isAnimated original da API)
      const stickerResult = await this.processPackStickers(pack);
      const stickersWithStatus = stickerResult.stickersWithStatus;
      const trayImage = stickerResult.trayImage;

      // Filtrar apenas stickers válidos
      const validStickers = stickersWithStatus.filter((s) => s.status);
      if (validStickers.length === 0) {
        warn(`Nenhum sticker válido encontrado para pack: ${packId}`);
        this.failedPacks.add(packId);
        return false;
      }

      // Criar tray baseado no primeiro sticker original (EXATO como original)
      const firstValidSticker = validStickers[0].processedSticker;
      const trayFile = await this.createPackTray(
        firstValidSticker,
        packId,
        trayImage,
        pack.isAnimated
      );

      // Preparar array de stickers processados para upload
      const validStickerFiles = validStickers.map((s) => s.processedSticker);

      info(`Preparando dados do pack`, {
        packId,
        originalApiFlag: originalApiFlag,
        detectedAnimated: pack.isAnimated,
        flagChanged: originalApiFlag !== pack.isAnimated,
        stickerCount: validStickers.length,
      });

      // Preparar dados do pack (USANDO A FLAG JÁ ATUALIZADA)
      const packData = {
        identifier: packId,
        name: pack.name || "Pack sem nome",
        publisher: pack.authorName || "Autor desconhecido",
        is_animated: pack.isAnimated || false, // Agora usa a flag corrigida
        lang: this.getLanguageFromLocale(locale),
        level: 0,
        zip_size: 0,
      };

      // Validação final antes do upload
      const finalValidation = this.validateFinalPack(
        packData,
        validStickerFiles,
        trayFile
      );
      if (!finalValidation.valid) {
        warn(`Pack falhou na validação final: ${packId}`, finalValidation);
        this.failedPacks.add(packId);
        return false;
      }

      // Upload para Supabase usando dados corretos
      const dbPackId = await this.supabaseClient.uploadPack(
        packData,
        validStickerFiles,
        trayFile
      );

      if (dbPackId) {
        this.processedPacks.add(packId);
        // Atualizar cache com novo pack adicionado
        if (this.cacheLoaded) {
          this.existingPackIds.add(packId);
        }
        packProcessed(packId, validStickers.length, true);

        info(`Upload concluído com sucesso`, {
          packId,
          dbPackId,
          isAnimated: pack.isAnimated,
          validStickers: validStickers.length,
          totalStickers: stickersWithStatus.length,
        });

        return true;
      } else {
        this.failedPacks.add(packId);
        packProcessed(packId, validStickers.length, false);
        return false;
      }
    } catch (err) {
      error(`Erro ao processar pack: ${packId}`, err);
      this.failedPacks.add(packId);
      packProcessed(packId, 0, false);
      return false;
    } finally {
      // Limpar arquivos temporários
      await this.imageProcessor.cleanupTemp();
    }
  }

  /**
   * Processa todos os stickers de um pack
   * CÓPIA EXATA DO CÓDIGO ORIGINAL (linhas 166-198)
   */
  async processPackStickers(pack) {
    const packId = pack.packId;
    const urlPrefix = pack.resourceUrlPrefix;
    const stickers = pack.resourceFiles; // mesmo nome do original
    const stickersWithStatus = []; // exatamente como original
    let trayImage = "";

    info(`Processando ${stickers.length} stickers para pack: ${packId}`);
    info(`Pack is_animated da API: ${pack.isAnimated}`);

    for (let item in stickers) {
      let stickerName = stickers[item];

      // EXATO: conversão PNG para WebP no nome (linhas 168-171)
      if (stickers[item].substr(-4) == ".png") {
        stickerName =
          stickerName.substr(0, stickerName.indexOf(".png")) + ".webp";
      }

      // EXATO: primeiro sticker vira tray (linhas 172-174)
      if (parseInt(item) == 0) {
        trayImage = stickers[item];
      }

      console.log(stickers[item]); // mesmo log do original
      let status = true;

      try {
        // Download do sticker
        const stickerUrl = urlPrefix + stickers[item];
        const buffer = await this.stickerlyClient.downloadFile(stickerUrl);

        // Validar imagem
        const isValid = await this.imageProcessor.validateImage(buffer, stickers[item]);
        if (!isValid) {
          warn(`Imagem corrompida: ${stickers[item]}`, { packId });
          status = false;
        } else {
          // EXATO: validação de frames (linhas 186-191)
          const stickerInfo = await this.imageProcessor.getWebPInfo(buffer);
          if (!("totalFrames" in stickerInfo) && pack.isAnimated) {
            warn(`Sticker sem frames em pack animado: ${stickers[item]}`, {
              packId,
              stickerInfo: stickerInfo,
            });
            status = false;
          }
        }

        // Processar sticker se status = true
        if (status) {
          const processedSticker =
            await this.imageProcessor.processStickerImage(
              buffer,
              stickers[item],
              packId,
              pack.isAnimated // USA A FLAG ORIGINAL DA API, NÃO DETECTADA
            );

          // Adicionar campos necessários para compatibilidade
          processedSticker.originalName = stickers[item];
          processedSticker.stickerName = stickerName;

          stickersWithStatus.push({
            status: status,
            name: stickerName,
            processedSticker: processedSticker,
          });
        } else {
          stickersWithStatus.push({
            status: status,
            name: stickerName,
            processedSticker: null,
          });
        }

        // Delay entre downloads
        if (parseInt(item) < stickers.length - 1) {
          await this.stickerlyClient.delay(500);
        }
      } catch (err) {
        error(`Erro ao processar sticker: ${stickers[item]}`, err, { packId });
        stickersWithStatus.push({
          status: false,
          name: stickerName,
          processedSticker: null,
        });
        continue;
      }
    }

    info(`Pack processado`, {
      packId,
      totalStickers: stickers.length,
      validStickers: stickersWithStatus.filter((s) => s.status).length,
      trayImage: trayImage,
      packIsAnimated: pack.isAnimated, // FLAG NUNCA É ALTERADA
    });

    // Retornar dados no formato esperado
    return {
      stickersWithStatus: stickersWithStatus,
      trayImage: "tray.png", // Sempre usar nome padrão
    };
  }

  /**
   * Cria tray do pack EXATAMENTE como código original (linhas 200-224)
   */
  async createPackTray(firstSticker, packId, trayImageOriginal, isAnimated) {
    try {
      if (!firstSticker || !firstSticker.buffer) {
        throw new Error("Primeiro sticker não disponível para criar tray");
      }

      const TRAY_NAME = "tray.png";

      if (isAnimated) {
        // EXATO: Para pack animado, extrair primeiro frame (linhas 201-208)
        info(`Criando tray para pack ANIMADO: ${packId}`, {
          trayImageOriginal,
        });

        // No original, ele usa webpmux_getframe para extrair frame 1
        // Vamos simular isso extraindo primeiro frame do WebP animado
        const tray = await this.imageProcessor.createTrayFromAnimated(
          firstSticker.buffer,
          TRAY_NAME,
          packId
        );

        return tray;
      } else {
        // EXATO: Para pack estático, copiar primeiro sticker (linhas 209-224)
        info(`Criando tray para pack ESTÁTICO: ${packId}`, {
          trayImageOriginal,
        });

        const tray = await this.imageProcessor.createTrayFromStatic(
          firstSticker.buffer,
          TRAY_NAME,
          packId,
          trayImageOriginal
        );

        return tray;
      }
    } catch (err) {
      error(`Erro ao criar tray para pack: ${packId}`, err);
      return null;
    }
  }

  /**
   * Carrega todos os IDs de packs existentes no banco para cache
   */
  async loadExistingPackIds() {
    if (this.cacheLoaded) return;
    
    try {
      info('Carregando cache de IDs existentes...');
      const existingIds = await this.supabaseClient.getAllPackIds();
      this.existingPackIds = new Set(existingIds);
      this.cacheLoaded = true;
      info(`Cache carregado: ${this.existingPackIds.size} packs existentes`, {
        sampleIds: existingIds.slice(0, 5) // Mostrar primeiros 5 IDs como exemplo
      });
    } catch (err) {
      error('Erro ao carregar cache de IDs', err);
      // Fallback para verificação individual
      this.cacheLoaded = false;
    }
  }

  /**
   * Verifica se pack existe (usa cache se disponível)
   */
  async packExistsOptimized(packId) {
    if (this.cacheLoaded) {
      return this.existingPackIds.has(packId);
    }
    // Fallback para verificação individual
    const exists = await this.supabaseClient.packExists(packId);
    return exists !== null;
  }

  /**
   * Processa packs recomendados (sem paginação como na API original)
   */
  async processRecommendedPacks(locale = "pt-BR") {
    if (!config.scraping.useRecommendedPacks) {
      info('Processamento de packs recomendados desabilitado');
      return { total: 0, successful: 0, failed: 0 };
    }

    try {
      info(`Processando packs recomendados (chamada única)`, { locale });
      
      // Carregar cache de IDs existentes
      await this.loadExistingPackIds();

      // Buscar packs recomendados (sem paginação)
      const allPacks = await this.stickerlyClient.getRecommendedPacksSingle(locale);
      const validPacks = this.stickerlyClient.filterValidPacks(allPacks);
      
      if (validPacks.length === 0) {
        info('Nenhum pack recomendado encontrado', { locale });
        return { total: 0, successful: 0, failed: 0 };
      }

      let successfulPacks = 0;
      let processedPacks = 0;
      let skippedExisting = 0;
      const targetNewPacks = config.scraping.maxPacksPerRun;

      info(`Processando ${validPacks.length} packs recomendados`, {
        locale,
        totalPacks: validPacks.length,
        targetNewPacks
      });

      // Processar todos os packs recomendados
      for (let i = 0; i < validPacks.length && successfulPacks < targetNewPacks; i++) {
        const pack = validPacks[i];

        try {
          // Verificar se já foi processado nesta sessão
          if (this.processedPacks.has(pack.packId)) {
            skippedExisting++;
            continue;
          }

          // Verificar se já existe no banco
          const existingPackId = await this.packExistsOptimized(pack.packId);
          if (existingPackId) {
            skippedExisting++;
            continue;
          }

          // Pack novo encontrado
          info(`Pack NOVO recomendado: ${pack.packId}`, {
            packName: pack.name,
            index: i + 1,
            totalSkipped: skippedExisting
          });

          // Processar pack
          const success = await this.processPack(pack, locale);
          processedPacks++;
          
          if (success) {
            successfulPacks++;
            info(`Pack recomendado processado (${successfulPacks}/${targetNewPacks})`, {
              packId: pack.packId,
              packName: pack.name
            });
          }

          // Delay entre packs
          await this.stickerlyClient.delay();
        } catch (err) {
          error(`Erro ao processar pack recomendado: ${pack.packId}`, err);
          processedPacks++;
        }
      }

      info(`Resultado packs recomendados para ${locale}:`, {
        total: processedPacks,
        successful: successfulPacks,
        failed: processedPacks - successfulPacks,
        totalFound: validPacks.length,
        skippedExisting: skippedExisting
      });

      return {
        total: processedPacks,
        successful: successfulPacks,
        failed: processedPacks - successfulPacks,
      };
    } catch (err) {
      error(`Erro no processamento de packs recomendados`, err, { locale });
      return { total: 0, successful: 0, failed: 0 };
    }
  }

  /**
   * Processa packs por busca de palavras-chave (como na API original)
   */
  async processKeywordSearch(keywords = [], locale = "pt-BR") {
    if (!config.scraping.useKeywordSearch) {
      info('Busca por keywords desabilitada');
      return { total: 0, successful: 0, failed: 0 };
    }

    // Usar keywords da configuração se não fornecidas
    const keywordsToUse = keywords.length > 0 ? keywords : config.scraping.keywords;
    
    if (!Array.isArray(keywordsToUse) || keywordsToUse.length === 0) {
      warn("Lista de keywords vazia");
      return { total: 0, successful: 0, failed: 0 };
    }

    // Carregar cache de IDs existentes
    await this.loadExistingPackIds();
    
    let totalProcessed = 0;
    let totalSuccessful = 0;
    let totalSkipped = 0;

    info(`Iniciando busca por keywords`, {
      locale,
      keywords: keywordsToUse,
      totalKeywords: keywordsToUse.length
    });

    for (const keyword of keywordsToUse) {
      try {
        info(`Processando keyword: ${keyword}`, { locale });

        // Buscar todos os packs para esta keyword (com paginação)
        const packs = await this.stickerlyClient.searchAllPacks(keyword, locale);
        const validPacks = this.stickerlyClient.filterValidPacks(packs);

        if (validPacks.length === 0) {
          info(`Nenhum pack encontrado para keyword: ${keyword}`);
          continue;
        }

        let keywordProcessed = 0;
        let keywordSuccessful = 0;
        let keywordSkipped = 0;
        const maxPacksPerKeyword = config.scraping.maxPacksPerKeyword;

        // Processar packs desta keyword
        for (let i = 0; i < Math.min(validPacks.length, maxPacksPerKeyword); i++) {
          const pack = validPacks[i];

          try {
            // Verificar se já foi processado
            if (this.processedPacks.has(pack.packId)) {
              keywordSkipped++;
              continue;
            }

            // Verificar se já existe no banco
            const existingPackId = await this.packExistsOptimized(pack.packId);
            if (existingPackId) {
              keywordSkipped++;
              continue;
            }

            // Processar pack novo
            const success = await this.processPack(pack, locale);
            keywordProcessed++;
            
            if (success) {
              keywordSuccessful++;
              info(`Pack keyword processado: ${pack.packId}`, {
                keyword,
                packName: pack.name,
                keywordSuccess: keywordSuccessful
              });
            }

            await this.stickerlyClient.delay();
          } catch (err) {
            error(`Erro ao processar pack de keyword: ${pack.packId}`, err);
            keywordProcessed++;
          }
        }

        totalProcessed += keywordProcessed;
        totalSuccessful += keywordSuccessful;
        totalSkipped += keywordSkipped;

        info(`Keyword processada: ${keyword}`, {
          locale,
          packsFound: validPacks.length,
          packsProcessed: keywordProcessed,
          successful: keywordSuccessful,
          skipped: keywordSkipped,
          totalSuccessful: totalSuccessful
        });

        // Delay entre keywords
        await this.stickerlyClient.delay(3000);
      } catch (err) {
        error(`Erro ao processar keyword: ${keyword}`, err, { locale });
      }
    }

    // Atualizar estatísticas
    await this.supabaseClient.updateStats("keyword_packs_processed", totalProcessed);
    await this.supabaseClient.updateStats("keyword_packs_success", totalSuccessful);

    info(`Resultado busca por keywords para ${locale}:`, {
      totalKeywords: keywordsToUse.length,
      totalProcessed,
      totalSuccessful,
      totalFailed: totalProcessed - totalSuccessful,
      totalSkipped
    });

    return {
      total: totalProcessed,
      successful: totalSuccessful,
      failed: totalProcessed - totalSuccessful,
    };
  }

  /**
   * Executa scraping completo
   */
  async runFullScraping(keywords = []) {
    const results = {
      locales: {},
      keywords: {},
      summary: { total: 0, successful: 0, failed: 0 },
    };

    try {
      info("Iniciando scraping completo");

      // Processar por locale usando estratégia dupla (como API original)
      for (const localeConfig of config.scraping.locales) {
        const locale = localeConfig.locale;
        
        try {
          // 1. Packs recomendados (sem paginação)
          if (config.scraping.useRecommendedPacks) {
            const recommendedResult = await this.processRecommendedPacks(locale);
            
            if (!results.locales[locale]) {
              results.locales[locale] = { recommended: {}, keywords: {} };
            }
            results.locales[locale].recommended = recommendedResult;

            results.summary.total += recommendedResult.total;
            results.summary.successful += recommendedResult.successful;
            results.summary.failed += recommendedResult.failed;
          }

          // 2. Busca por keywords (com paginação)
          if (config.scraping.useKeywordSearch) {
            const keywordResult = await this.processKeywordSearch(keywords, locale);
            
            if (!results.locales[locale]) {
              results.locales[locale] = { recommended: {}, keywords: {} };
            }
            
            if (!results.keywords[locale]) {
              results.keywords[locale] = keywordResult;
            }
            results.locales[locale].keywords = keywordResult;

            results.summary.total += keywordResult.total;
            results.summary.successful += keywordResult.successful;
            results.summary.failed += keywordResult.failed;
          }
          
        } catch (err) {
          error(`Erro no scraping de locale: ${locale}`, err);
        }
      }

      info("Scraping completo finalizado (estratégia dupla)", {
        ...results.summary,
        strategy: {
          recommendedPacks: config.scraping.useRecommendedPacks,
          keywordSearch: config.scraping.useKeywordSearch,
          keywordsUsed: config.scraping.keywords
        }
      });

      // Atualizar estatísticas finais
      await this.supabaseClient.updateStats("total_scraping_runs", 1);
      await this.supabaseClient.updateStats(
        "total_packs_processed",
        results.summary.total
      );
      await this.supabaseClient.updateStats(
        "total_packs_success",
        results.summary.successful
      );

      return results;
    } catch (err) {
      error("Erro no scraping completo", err);
      throw err;
    }
  }

  /**
   * Retorna estatísticas da sessão atual
   */
  getSessionStats() {
    return {
      processedPacks: this.processedPacks.size,
      failedPacks: this.failedPacks.size,
      successRate:
        (this.processedPacks.size /
          (this.processedPacks.size + this.failedPacks.size)) *
        100,
    };
  }

  /**
   * Converte locale para código de idioma
   */
  getLanguageFromLocale(locale) {
    const langMap = {
      "pt-BR": "pt",
      "en-US": "en",
      "es-ES": "es",
      "fr-FR": "fr",
    };

    return langMap[locale] || "pt";
  }

  /**
   * Valida se pack atende requisitos específicos do WhatsApp
   */
  validateWhatsAppRequirements(pack) {
    try {
      // 1. Verificar quantidade de stickers (3-30 obrigatório)
      if (
        !pack.resourceFiles ||
        pack.resourceFiles.length < 3 ||
        pack.resourceFiles.length > 30
      ) {
        warn(`Pack deve ter entre 3 e 30 stickers`, {
          packId: pack.packId,
          count: pack.resourceFiles?.length || 0,
        });
        return false;
      }

      // 2. Verificar se tem nome válido
      if (!pack.name || pack.name.trim().length === 0) {
        warn(`Pack deve ter nome válido`, { packId: pack.packId });
        return false;
      }

      // 3. Verificar se tem autor
      if (!pack.authorName || pack.authorName.trim().length === 0) {
        warn(`Pack deve ter autor válido`, { packId: pack.packId });
        return false;
      }

      // 4. Verificar se tem recursos válidos
      if (!pack.resourceUrlPrefix || !Array.isArray(pack.resourceFiles)) {
        warn(`Pack deve ter recursos válidos`, { packId: pack.packId });
        return false;
      }

      // 5. Validar formatos de arquivo aceitos
      const validExtensions = [".webp", ".png", ".gif"];
      const invalidFiles = pack.resourceFiles.filter((file) => {
        const ext = file.toLowerCase().substring(file.lastIndexOf("."));
        return !validExtensions.includes(ext);
      });

      if (invalidFiles.length > 0) {
        warn(`Pack contém arquivos com formato inválido`, {
          packId: pack.packId,
          invalidFiles: invalidFiles.slice(0, 3), // Mostrar apenas os primeiros 3
        });
        return false;
      }

      info(`Pack passou na validação do WhatsApp`, {
        packId: pack.packId,
        stickerCount: pack.resourceFiles.length,
        isAnimated: pack.isAnimated,
      });

      return true;
    } catch (err) {
      error(`Erro na validação do WhatsApp`, err, { packId: pack.packId });
      return false;
    }
  }

  /**
   * Validação final do pack antes do upload
   */
  validateFinalPack(packData, stickerFiles, trayFile) {
    const issues = [];

    // Validar tray
    if (!trayFile || trayFile.metadata.size > config.image.maxTraySize) {
      issues.push(
        `Tray inválido ou muito grande: ${
          trayFile?.metadata?.size || "undefined"
        } bytes`
      );
    }

    // Validar stickers
    const maxStickerSize = packData.is_animated
      ? config.image.maxAnimatedSize
      : config.image.maxStaticSize;
    const oversizedStickers = stickerFiles.filter(
      (s) => s.metadata.size > maxStickerSize
    );

    if (oversizedStickers.length > 0) {
      issues.push(
        `${oversizedStickers.length} stickers excedem limite de tamanho`
      );
    }

    // Validar quantidade
    if (stickerFiles.length < 3 || stickerFiles.length > 30) {
      issues.push(`Quantidade inválida de stickers: ${stickerFiles.length}`);
    }

    // Validar emojis
    const stickersWithoutEmoji = stickerFiles.filter(
      (s) => !s.emoji || s.emoji.length === 0
    );
    if (stickersWithoutEmoji.length > 0) {
      issues.push(`${stickersWithoutEmoji.length} stickers sem emoji`);
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Limpa dados da sessão
   */
  clearSession() {
    this.processedPacks.clear();
    this.failedPacks.clear();
    info("Sessão limpa");
  }
}

module.exports = PackProcessor;

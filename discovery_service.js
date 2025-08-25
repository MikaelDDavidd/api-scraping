#!/usr/bin/env node

/**
 * SERVIÇO DE DESCOBERTA CONTÍNUA
 * 
 * Roda em 1 instância apenas, fazendo busca contínua por:
 * - Packs recomendados
 * - Keywords brasileiras com paginação
 * - Busca expandida
 * 
 * Salva IDs novos em fila compartilhada para processamento
 */

require('dotenv').config();

const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

class DiscoveryService {
  constructor() {
    // Supabase para verificar existência
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Fila compartilhada
    this.queueFile = path.join(__dirname, 'discovered_packs.json');
    this.existingPacksCache = new Set();
    
    // Estado da descoberta
    this.discoveryState = {
      currentKeywordIndex: 0,
      currentPage: 0,
      lastRecommendedCheck: 0,
      totalDiscovered: 0,
      session: Date.now()
    };

    // Keywords brasileiras (da config original + mais)
    this.keywords = [
      // Trending e populares
      'brasil', 'brasileiro', 'carnaval', 'futebol', 'flamengo', 'corinthians',
      'palmeiras', 'santos', 'vasco', 'botafogo', 'são paulo', 'cruzeiro',
      
      // Sentimentos e expressões
      'amor', 'saudade', 'feliz', 'triste', 'raiva', 'ansiedade', 'alegria',
      'bom dia', 'boa noite', 'boa tarde', 'fim de semana', 'segunda feira',
      
      // Memes e cultura
      'meme', 'engraçado', 'humor', 'viral', 'trending', 'chapolin',
      'chaves', 'turma monica', 'memes brasil',
      
      // Categorias gerais
      'trabalho', 'família', 'amigos', 'festa', 'natal', 'ano novo',
      'aniversário', 'casamento', 'formatura',
      
      // Música e entretenimento
      'música', 'funk', 'sertanejo', 'pagode', 'rap', 'pop brasileiro',
      'anitta', 'wesley safadão', 'gusttavo lima',
      
      // Diversos
      'whatsapp', 'figurinha', 'sticker', 'animado', 'fofo', 'kawaii',
      'coração', 'estrela', 'sol', 'lua', 'café', 'pizza'
    ];

    this.recommendedInterval = 30 * 60 * 1000; // 30 min
    this.keywordDelay = 2000; // 2s entre requests
    this.maxPagesPerKeyword = 50; // Máximo 50 páginas por keyword
    
    console.log(`🔍 Discovery Service iniciado com ${this.keywords.length} keywords`);
  }

  /**
   * Inicia serviço de descoberta contínua
   */
  async start() {
    console.log('🚀 Iniciando descoberta contínua...');
    
    // Carregar cache de packs existentes
    await this.loadExistingPacks();
    
    // Carregar estado anterior se existir
    await this.loadState();
    
    // Loop principal
    while (true) {
      try {
        // 1. Verificar recomendados se passou do intervalo
        await this.checkRecommended();
        
        // 2. Buscar próxima keyword/página
        await this.searchNextKeyword();
        
        // 3. Salvar estado
        await this.saveState();
        
        // 4. Delay entre operações
        await this.sleep(this.keywordDelay);
        
      } catch (error) {
        console.error('❌ Erro no loop de descoberta:', error.message);
        await this.sleep(5000); // Wait mais tempo em caso de erro
      }
    }
  }

  /**
   * Carrega packs existentes do Supabase (paginado)
   */
  async loadExistingPacks() {
    console.log('📋 Carregando packs existentes...');
    
    let page = 0;
    const pageSize = 1000;
    let totalLoaded = 0;

    while (true) {
      try {
        const { data, error } = await this.supabase
          .from('packs')
          .select('identifier')
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        data.forEach(pack => this.existingPacksCache.add(pack.identifier));
        totalLoaded += data.length;
        page++;

        if (totalLoaded % 1000 === 0) {
          console.log(`📄 ${totalLoaded} packs existentes carregados...`);
        }
        
      } catch (error) {
        console.error('❌ Erro ao carregar packs existentes:', error.message);
        break;
      }
    }

    console.log(`✅ Cache carregado: ${totalLoaded} packs existentes`);
  }

  /**
   * Verifica packs recomendados
   */
  async checkRecommended() {
    const now = Date.now();
    if (now - this.discoveryState.lastRecommendedCheck < this.recommendedInterval) {
      return; // Ainda não é hora
    }

    console.log('🎯 Verificando packs recomendados...');
    
    try {
      const response = await axios({
        method: "get",
        url: "http://api.sticker.ly/v3.1/stickerPack/recommend?withAnimation=true",
        responseType: "json",
        headers: {
          "User-Agent": "androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; pt-BR;)",
          Connection: "Keep-Alive",
          Host: "api.sticker.ly",
          "x-duid": "20fa5a958492bbd3",
          "Accept-Encoding": "gzip",
        },
      });

      const packs = response.data?.result?.packs || [];
      const newPacks = this.filterNewPacks(packs);
      
      if (newPacks.length > 0) {
        await this.addToQueue(newPacks, 'recommended');
        console.log(`📦 ${newPacks.length}/${packs.length} novos packs recomendados adicionados`);
      } else {
        console.log(`✨ Nenhum pack novo nos recomendados`);
      }

      this.discoveryState.lastRecommendedCheck = now;
      
    } catch (error) {
      console.error('❌ Erro ao buscar recomendados:', error.message);
    }
  }

  /**
   * Busca próxima keyword/página
   */
  async searchNextKeyword() {
    const keyword = this.keywords[this.discoveryState.currentKeywordIndex];
    const page = this.discoveryState.currentPage;
    
    console.log(`🔍 Buscando: "${keyword}" - página ${page}`);
    
    try {
      const response = await axios({
        method: "POST",
        url: "http://api.sticker.ly:80/v3.1/stickerPack/search?withAnimation=true",
        responseType: "json",
        data: {
          keyword: keyword,
          cursor: page,
        },
        headers: {
          "User-Agent": "androidapp.stickerly/1.17.3 (Redmi 7; U; Android 29; pt-BR; pt-BR;)",
          Connection: "Keep-Alive",
          Host: "api.sticker.ly",
          "x-duid": "20fa5a958492bbd3",
          "Accept-Encoding": "gzip",
        },
      });

      const packs = response.data?.result?.stickerPacks || [];
      
      if (packs.length > 0) {
        const newPacks = this.filterNewPacks(packs);
        
        if (newPacks.length > 0) {
          await this.addToQueue(newPacks, `search_${keyword}`);
          console.log(`📦 ${newPacks.length}/${packs.length} novos para "${keyword}" p.${page}`);
        } else {
          console.log(`✨ Nenhum novo em "${keyword}" p.${page}`);
        }
        
        // Próxima página
        this.discoveryState.currentPage++;
        
      } else {
        // Sem packs, ir para próxima keyword
        console.log(`🔚 "${keyword}" esgotada em ${page} páginas`);
        this.nextKeyword();
      }

      // Limitar páginas por keyword
      if (this.discoveryState.currentPage >= this.maxPagesPerKeyword) {
        console.log(`📊 "${keyword}" atingiu limite de ${this.maxPagesPerKeyword} páginas`);
        this.nextKeyword();
      }
      
    } catch (error) {
      console.error(`❌ Erro ao buscar "${keyword}":`, error.message);
      // Em caso de erro, pular para próxima keyword
      this.nextKeyword();
    }
  }

  /**
   * Avança para próxima keyword
   */
  nextKeyword() {
    this.discoveryState.currentKeywordIndex++;
    this.discoveryState.currentPage = 0;
    
    // Se chegou ao fim, recomeçar
    if (this.discoveryState.currentKeywordIndex >= this.keywords.length) {
      this.discoveryState.currentKeywordIndex = 0;
      console.log('🔄 Reiniciando ciclo de keywords...');
    }
  }

  /**
   * Filtra packs novos (não existentes)
   */
  filterNewPacks(packs) {
    return packs.filter(pack => {
      const packId = pack.packId;
      return packId && !this.existingPacksCache.has(packId);
    });
  }

  /**
   * Adiciona packs novos à fila
   */
  async addToQueue(packs, source) {
    // Carregar fila atual
    let queue = [];
    if (await fs.pathExists(this.queueFile)) {
      const queueData = await fs.readJson(this.queueFile);
      queue = queueData.packs || [];
    }

    // Adicionar novos packs
    const newEntries = packs.map(pack => ({
      packId: pack.packId,
      name: pack.name || 'Unknown',
      author: pack.authorName || 'Unknown',
      isAnimated: pack.isAnimated || false,
      discoveredAt: new Date().toISOString(),
      discoveredBy: source,
      session: this.discoveryState.session,
      pack: pack // Pack completo para processamento
    }));

    queue.push(...newEntries);

    // Atualizar cache local para evitar duplicados na mesma sessão
    packs.forEach(pack => {
      this.existingPacksCache.add(pack.packId);
    });

    // Salvar fila atualizada
    await fs.writeJson(this.queueFile, {
      lastUpdated: new Date().toISOString(),
      totalPacks: queue.length,
      session: this.discoveryState.session,
      packs: queue
    }, { spaces: 2 });

    this.discoveryState.totalDiscovered += newEntries.length;
    console.log(`📝 Fila atualizada: +${newEntries.length} packs (total: ${queue.length})`);
  }

  /**
   * Carrega estado da descoberta
   */
  async loadState() {
    const stateFile = path.join(__dirname, 'discovery_state.json');
    
    if (await fs.pathExists(stateFile)) {
      try {
        this.discoveryState = await fs.readJson(stateFile);
        console.log(`🔄 Estado carregado: keyword ${this.discoveryState.currentKeywordIndex}, página ${this.discoveryState.currentPage}`);
      } catch (error) {
        console.log('⚠️ Erro ao carregar estado, começando do zero');
      }
    }
  }

  /**
   * Salva estado atual
   */
  async saveState() {
    const stateFile = path.join(__dirname, 'discovery_state.json');
    await fs.writeJson(stateFile, this.discoveryState, { spaces: 2 });
  }

  /**
   * Sleep helper
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
    console.error('❌ Configurar SUPABASE_URL e SUPABASE_SERVICE_KEY no .env');
    process.exit(1);
  }

  const service = new DiscoveryService();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\\n🛑 Parando discovery service...');
    process.exit(0);
  });

  service.start().catch(error => {
    console.error('❌ Erro fatal no discovery:', error);
    process.exit(1);
  });
}

module.exports = DiscoveryService;
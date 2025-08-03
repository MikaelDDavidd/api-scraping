const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/config');
const { info, warn, error } = require('../utils/logger');

class FastDuplicateChecker {
  constructor() {
    this.supabase = createClient(
      config.supabase.url,
      config.supabase.serviceKey
    );
    
    // Cache em memória para verificação ultra-rápida
    this.existingPackIds = new Set();
    this.cacheLoaded = false;
    this.lastCacheUpdate = null;
  }

  /**
   * Carrega TODOS os pack IDs existentes em memória de uma vez
   * Isso permite verificação O(1) por pack ID
   */
  async loadExistingPacksCache() {
    const startTime = Date.now();
    info('Carregando cache completo de pack IDs existentes...');

    try {
      // 🚀 PAGINAÇÃO para buscar TODOS os packs (contornar limite de 1000)
      let allPacks = [];
      let page = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data: packs, error: fetchError } = await this.supabase
          .from('packs')
          .select('identifier')
          .order('created_at', { ascending: false })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (fetchError) {
          throw fetchError;
        }

        if (packs && packs.length > 0) {
          allPacks.push(...packs);
          info(`Página ${page + 1}: ${packs.length} packs carregados (total: ${allPacks.length})`);
          
          // Se retornou menos que o tamanho da página, não há mais dados
          hasMore = packs.length === pageSize;
          page++;
        } else {
          hasMore = false;
        }
      }

      // Converter para Set para lookup O(1)
      this.existingPackIds = new Set(allPacks.map(p => p.identifier));
      this.cacheLoaded = true;
      this.lastCacheUpdate = Date.now();

      const duration = Date.now() - startTime;
      info(`Cache carregado: ${this.existingPackIds.size} pack IDs em ${duration}ms (${page} páginas)`);
      
      return this.existingPackIds.size;

    } catch (err) {
      error('Erro ao carregar cache de pack IDs', err);
      // Fallback: continuar sem cache (vai usar verificação lenta)
      this.existingPackIds = new Set();
      this.cacheLoaded = false;
      return 0;
    }
  }

  /**
   * Verificação ULTRA-RÁPIDA em batch
   * Separa 500 packs em ~1ms ao invés de 500 queries individuais
   */
  async batchCheckDuplicates(packs) {
    if (!packs || packs.length === 0) {
      return { newPacks: [], existingPacks: [] };
    }

    const startTime = Date.now();
    
    // Se cache não carregado, carregar agora
    if (!this.cacheLoaded) {
      await this.loadExistingPacksCache();
    }

    const newPacks = [];
    const existingPacks = [];

    // Verificação O(1) por pack - ULTRA RÁPIDA
    for (const pack of packs) {
      if (!pack.packId) {
        warn('Pack sem packId encontrado, ignorando', { pack: pack.name || 'unknown' });
        continue;
      }

      if (this.existingPackIds.has(pack.packId)) {
        existingPacks.push(pack);
      } else {
        newPacks.push(pack);
        // Adicionar ao cache para próximas verificações na mesma sessão
        this.existingPackIds.add(pack.packId);
      }
    }

    const duration = Date.now() - startTime;
    
    info(`Verificação em batch: ${packs.length} packs em ${duration}ms`, {
      newPacks: newPacks.length,
      existingPacks: existingPacks.length,
      duplicateRate: `${((existingPacks.length / packs.length) * 100).toFixed(1)}%`,
      avgTimePerPack: `${(duration / packs.length).toFixed(2)}ms`
    });

    return { newPacks, existingPacks };
  }

  /**
   * Verificação em lote via database (fallback se cache falhar)
   * Ainda assim muito mais rápida que verificação individual
   */
  async batchCheckDuplicatesDB(packIds) {
    const startTime = Date.now();
    
    try {
      // Query única com todos os IDs
      const { data: existingPacks, error: queryError } = await this.supabase
        .from('packs')
        .select('identifier')
        .in('identifier', packIds);

      if (queryError) {
        throw queryError;
      }

      const existingIds = new Set(existingPacks.map(p => p.identifier));
      const newIds = packIds.filter(id => !existingIds.has(id));

      const duration = Date.now() - startTime;
      info(`Verificação DB batch: ${packIds.length} IDs em ${duration}ms`, {
        existing: existingIds.size,
        new: newIds.length
      });

      return { existingIds, newIds };

    } catch (err) {
      error('Erro na verificação em lote no DB', err);
      return { existingIds: new Set(), newIds: packIds };
    }
  }

  /**
   * Verificação híbrida: cache + DB para casos edge
   */
  async hybridBatchCheck(packs) {
    // 1. Primeiro usar cache em memória (ultra-rápido)
    const cacheResult = await this.batchCheckDuplicates(packs);
    
    // 2. Se cache muito desatualizado (>1h), fazer verificação adicional no DB
    const cacheAge = Date.now() - (this.lastCacheUpdate || 0);
    const oneHour = 60 * 60 * 1000;
    
    if (cacheAge > oneHour && cacheResult.newPacks.length > 0) {
      info('Cache antigo, fazendo verificação adicional no DB...');
      
      const newPackIds = cacheResult.newPacks.map(p => p.packId);
      const dbResult = await this.batchCheckDuplicatesDB(newPackIds);
      
      // Ajustar resultado baseado na verificação do DB
      const finalNewPacks = cacheResult.newPacks.filter(p => 
        dbResult.newIds.includes(p.packId)
      );
      
      const additionalExisting = cacheResult.newPacks.filter(p => 
        !dbResult.newIds.includes(p.packId)
      );
      
      info(`Verificação híbrida: ${additionalExisting.length} packs eram duplicados no DB`);
      
      return {
        newPacks: finalNewPacks,
        existingPacks: [...cacheResult.existingPacks, ...additionalExisting]
      };
    }
    
    return cacheResult;
  }

  /**
   * Processar packs em chunks para melhor performance
   */
  async processPacksInChunks(allPacks, chunkSize = 100) {
    const results = {
      allNewPacks: [],
      allExistingPacks: [],
      totalProcessed: 0,
      chunksProcessed: 0
    };

    for (let i = 0; i < allPacks.length; i += chunkSize) {
      const chunk = allPacks.slice(i, i + chunkSize);
      const chunkResult = await this.batchCheckDuplicates(chunk);
      
      results.allNewPacks.push(...chunkResult.newPacks);
      results.allExistingPacks.push(...chunkResult.existingPacks);
      results.totalProcessed += chunk.length;
      results.chunksProcessed++;

      // Log de progresso a cada chunk
      if (results.chunksProcessed % 5 === 0 || i + chunkSize >= allPacks.length) {
        info(`Progresso verificação: ${results.totalProcessed}/${allPacks.length} packs`, {
          newFound: results.allNewPacks.length,
          duplicates: results.allExistingPacks.length,
          chunksProcessed: results.chunksProcessed
        });
      }
    }

    return results;
  }

  /**
   * Atualizar cache com novos packs processados
   */
  updateCacheWithNewPacks(newPackIds) {
    newPackIds.forEach(id => this.existingPackIds.add(id));
    info(`Cache atualizado com ${newPackIds.length} novos pack IDs`);
  }

  /**
   * Limpar cache (para testes ou reset)
   */
  clearCache() {
    this.existingPackIds.clear();
    this.cacheLoaded = false;
    this.lastCacheUpdate = null;
    info('Cache de pack IDs limpo');
  }

  /**
   * Estatísticas do cache
   */
  getCacheStats() {
    return {
      cacheLoaded: this.cacheLoaded,
      cachedPackIds: this.existingPackIds.size,
      lastUpdate: this.lastCacheUpdate,
      cacheAge: this.lastCacheUpdate ? Date.now() - this.lastCacheUpdate : null
    };
  }

  /**
   * Verificação super rápida de um único pack (O(1))
   */
  isPackDuplicate(packId) {
    return this.existingPackIds.has(packId);
  }

  /**
   * Benchmark da verificação
   */
  async benchmarkDuplicateCheck(testPacks) {
    console.log('🏁 BENCHMARK: Verificação de Duplicados\n');

    // Preparar dados de teste
    const packIds = testPacks.map(p => p.packId).slice(0, 1000); // Máximo 1000 para teste

    console.log(`Testando com ${packIds.length} packs...\n`);

    // 1. Método antigo (simulado): verificação individual
    console.log('1️⃣ Método individual (simulado):');
    const oldStart = Date.now();
    // Simular delay de query individual (2ms por pack)
    await new Promise(resolve => setTimeout(resolve, packIds.length * 2));
    const oldDuration = Date.now() - oldStart;
    console.log(`   Tempo: ${oldDuration}ms (${(oldDuration/packIds.length).toFixed(2)}ms por pack)`);

    // 2. Método novo: batch em memória
    console.log('\n2️⃣ Método batch em memória:');
    const newStart = Date.now();
    const result = await this.batchCheckDuplicates(testPacks);
    const newDuration = Date.now() - newStart;
    console.log(`   Tempo: ${newDuration}ms (${(newDuration/packIds.length).toFixed(2)}ms por pack)`);
    console.log(`   Resultado: ${result.newPacks.length} novos, ${result.existingPacks.length} duplicados`);

    // 3. Comparação
    console.log('\n📊 COMPARAÇÃO:');
    const improvement = ((oldDuration - newDuration) / oldDuration * 100).toFixed(1);
    const speedup = (oldDuration / newDuration).toFixed(1);
    console.log(`   Melhoria: ${improvement}% mais rápido`);
    console.log(`   Speedup: ${speedup}x mais veloz`);
    console.log(`   Economia de tempo: ${oldDuration - newDuration}ms`);

    return {
      oldDuration,
      newDuration,
      improvement: parseFloat(improvement),
      speedup: parseFloat(speedup)
    };
  }
}

module.exports = FastDuplicateChecker;
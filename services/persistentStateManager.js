const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/config');

class PersistentStateManager {
  constructor() {
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
    
    this.currentState = {
      currentLocaleIndex: 0,
      currentKeywordIndex: 0,
      currentPage: 0,
      lastProcessedPackId: null,
      totalRuntimeHours: 0,
      cyclesCompleted: 0,
      lastCycleAt: null
    };
  }

  /**
   * Carrega o estado persistente do Supabase
   */
  async loadState() {
    try {
      const { data, error } = await this.supabase
        .from('scraping_persistent_state')
        .select('*')
        .eq('id', 1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        this.currentState = {
          currentLocaleIndex: data.current_locale_index || 0,
          currentKeywordIndex: data.current_keyword_index || 0,
          currentPage: data.current_page || 0,
          lastProcessedPackId: data.last_processed_pack_id,
          totalRuntimeHours: parseFloat(data.total_runtime_hours) || 0,
          cyclesCompleted: data.cycles_completed || 0,
          lastCycleAt: data.last_cycle_at
        };
        
        console.log('📂 Estado persistente carregado:', this.currentState);
      } else {
        console.log('📂 Nenhum estado persistente encontrado, iniciando do zero');
        await this.saveState(); // Cria o registro inicial
      }
      
      return this.currentState;
    } catch (error) {
      console.error('❌ Erro ao carregar estado persistente:', error);
      return this.currentState;
    }
  }

  /**
   * Salva o estado atual no Supabase
   */
  async saveState() {
    try {
      const { error } = await this.supabase
        .from('scraping_persistent_state')
        .upsert({
          id: 1,
          current_locale_index: this.currentState.currentLocaleIndex,
          current_keyword_index: this.currentState.currentKeywordIndex,
          current_page: this.currentState.currentPage,
          last_processed_pack_id: this.currentState.lastProcessedPackId,
          total_runtime_hours: this.currentState.totalRuntimeHours,
          cycles_completed: this.currentState.cyclesCompleted,
          last_cycle_at: this.currentState.lastCycleAt,
          updated_at: new Date().toISOString()
        });

      if (error) {
        throw error;
      }

      console.log('💾 Estado persistente salvo');
    } catch (error) {
      console.error('❌ Erro ao salvar estado persistente:', error);
    }
  }

  /**
   * Atualiza o índice do locale atual
   */
  async updateLocaleIndex(index) {
    this.currentState.currentLocaleIndex = index;
    await this.saveState();
  }

  /**
   * Atualiza o índice da keyword atual
   */
  async updateKeywordIndex(index) {
    this.currentState.currentKeywordIndex = index;
    await this.saveState();
  }

  /**
   * Atualiza a página atual
   */
  async updateCurrentPage(page) {
    this.currentState.currentPage = page;
    await this.saveState();
  }

  /**
   * Atualiza o último pack processado
   */
  async updateLastProcessedPack(packId) {
    this.currentState.lastProcessedPackId = packId;
    await this.saveState();
  }

  /**
   * Incrementa o tempo total de execução
   */
  async addRuntimeHours(hours) {
    this.currentState.totalRuntimeHours += hours;
    await this.saveState();
  }

  /**
   * Marca um ciclo completo
   */
  async completeCycle() {
    this.currentState.cyclesCompleted++;
    this.currentState.lastCycleAt = new Date().toISOString();
    // Reset para próximo ciclo
    this.currentState.currentLocaleIndex = 0;
    this.currentState.currentKeywordIndex = 0;
    this.currentState.currentPage = 0;
    await this.saveState();
  }

  /**
   * Reset completo do estado (para manutenção)
   */
  async resetState() {
    this.currentState = {
      currentLocaleIndex: 0,
      currentKeywordIndex: 0,
      currentPage: 0,
      lastProcessedPackId: null,
      totalRuntimeHours: 0,
      cyclesCompleted: 0,
      lastCycleAt: null
    };
    await this.saveState();
    console.log('🔄 Estado persistente resetado');
  }

  /**
   * Obtém informações sobre o progresso atual
   */
  getProgress(totalLocales, totalKeywords) {
    const totalSteps = totalLocales * totalKeywords;
    const currentStep = (this.currentState.currentLocaleIndex * totalKeywords) + this.currentState.currentKeywordIndex + 1;
    const progressPercentage = ((currentStep / totalSteps) * 100).toFixed(1);
    
    return {
      currentStep,
      totalSteps,
      progressPercentage,
      currentLocaleIndex: this.currentState.currentLocaleIndex,
      currentKeywordIndex: this.currentState.currentKeywordIndex,
      currentPage: this.currentState.currentPage,
      cyclesCompleted: this.currentState.cyclesCompleted,
      totalRuntimeHours: this.currentState.totalRuntimeHours.toFixed(2),
      lastCycleAt: this.currentState.lastCycleAt
    };
  }

  /**
   * Verifica se deve pular para próximo item baseado no estado
   */
  shouldSkipTo(localeIndex, keywordIndex, page = 0) {
    return localeIndex < this.currentState.currentLocaleIndex ||
           (localeIndex === this.currentState.currentLocaleIndex && 
            keywordIndex < this.currentState.currentKeywordIndex) ||
           (localeIndex === this.currentState.currentLocaleIndex && 
            keywordIndex === this.currentState.currentKeywordIndex && 
            page < this.currentState.currentPage);
  }

  /**
   * Obtém estatísticas de uptime
   */
  getUptimeStats() {
    const uptimeDays = this.currentState.totalRuntimeHours / 24;
    const avgCycleTime = this.currentState.cyclesCompleted > 0 ? 
      this.currentState.totalRuntimeHours / this.currentState.cyclesCompleted : 0;
    
    return {
      totalRuntimeHours: this.currentState.totalRuntimeHours.toFixed(2),
      totalRuntimeDays: uptimeDays.toFixed(2),
      cyclesCompleted: this.currentState.cyclesCompleted,
      avgCycleTimeHours: avgCycleTime.toFixed(2),
      lastCycleAt: this.currentState.lastCycleAt
    };
  }
}

module.exports = PersistentStateManager;
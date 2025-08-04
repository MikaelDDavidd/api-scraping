const { createClient } = require('@supabase/supabase-js');
const { config } = require('../config/config');
const { v4: uuidv4 } = require('uuid');
const os = require('os');

class MetricsLogger {
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
    
    this.sessionId = uuidv4();
    this.sessionStartTime = Date.now();
    this.metrics = {
      packsFound: 0,
      packsProcessed: 0,
      packsFailed: 0,
      packsSkipped: 0,
      processingTimes: [],
      apiResponseTimes: []
    };
  }

  /**
   * Inicia uma nova sessão de scraping
   */
  async startSession(executionMode, locales, keywords) {
    try {
      const serverInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpus: os.cpus().length
      };

      await this.supabase
        .from('session_metrics')
        .insert({
          session_id: this.sessionId,
          started_at: new Date().toISOString(),
          execution_mode: executionMode,
          locales_processed: locales,
          keywords_used: keywords,
          server_info: serverInfo,
          status: 'running'
        });

      await this.logEvent('session_start', null, {
        execution_mode: executionMode,
        locales: locales,
        keywords: keywords,
        server_info: serverInfo
      });

      console.log(`📊 Sessão iniciada: ${this.sessionId}`);
    } catch (error) {
      console.error('Erro ao iniciar sessão de métricas:', error);
    }
  }

  /**
   * Finaliza a sessão de scraping
   */
  async endSession(status = 'completed') {
    try {
      const duration = Date.now() - this.sessionStartTime;
      
      await this.supabase
        .from('session_metrics')
        .update({
          ended_at: new Date().toISOString(),
          total_duration_ms: duration,
          total_packs_found: this.metrics.packsFound,
          total_packs_processed: this.metrics.packsProcessed,
          total_packs_failed: this.metrics.packsFailed,
          total_packs_skipped: this.metrics.packsSkipped,
          status: status
        })
        .eq('session_id', this.sessionId);

      await this.logEvent('session_end', null, {
        duration_ms: duration,
        total_processed: this.metrics.packsProcessed,
        total_failed: this.metrics.packsFailed,
        status: status
      });

      console.log(`📊 Sessão finalizada: ${this.sessionId} (${Math.round(duration/1000)}s)`);
    } catch (error) {
      console.error('Erro ao finalizar sessão de métricas:', error);
    }
  }

  /**
   * Loga um evento específico
   */
  async logEvent(eventType, packInfo = null, details = {}) {
    try {
      await this.supabase
        .from('scraping_logs')
        .insert({
          session_id: this.sessionId,
          event_type: eventType,
          pack_identifier: packInfo?.identifier,
          pack_name: packInfo?.name,
          locale: packInfo?.locale,
          keyword: packInfo?.keyword,
          source: packInfo?.source,
          details: details,
          duration_ms: details.duration_ms,
          success: details.success !== false,
          error_message: details.error_message,
          created_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Erro ao logar evento:', error);
    }
  }

  /**
   * Loga erro detalhado
   */
  async logError(errorType, error, context = {}) {
    try {
      await this.supabase
        .from('error_logs')
        .insert({
          session_id: this.sessionId,
          error_type: errorType,
          error_code: error.code || 'UNKNOWN',
          error_message: error.message || error.toString(),
          stack_trace: error.stack,
          context: context,
          pack_identifier: context.packId,
          locale: context.locale,
          keyword: context.keyword,
          retry_count: context.retryCount || 0,
          created_at: new Date().toISOString()
        });
    } catch (logError) {
      console.error('Erro ao logar erro:', logError);
    }
  }

  /**
   * Registra métrica de performance
   */
  async logPerformanceMetric(metricName, value, unit = 'ms', context = {}) {
    try {
      await this.supabase
        .from('performance_insights')
        .insert({
          session_id: this.sessionId,
          metric_name: metricName,
          metric_value: value,
          metric_unit: unit,
          context: context,
          measured_at: new Date().toISOString()
        });
    } catch (error) {
      console.error('Erro ao logar métrica de performance:', error);
    }
  }

  /**
   * Incrementa contador de packs encontrados
   */
  incrementPacksFound() {
    this.metrics.packsFound++;
  }

  /**
   * Incrementa contador de packs processados
   */
  incrementPacksProcessed() {
    this.metrics.packsProcessed++;
  }

  /**
   * Incrementa contador de packs falhados
   */
  incrementPacksFailed() {
    this.metrics.packsFailed++;
  }

  /**
   * Incrementa contador de packs pulados
   */
  incrementPacksSkipped() {
    this.metrics.packsSkipped++;
  }

  /**
   * Registra tempo de processamento de pack
   */
  recordPackProcessingTime(duration) {
    this.metrics.processingTimes.push(duration);
    this.logPerformanceMetric('pack_processing_time', duration, 'ms');
  }

  /**
   * Registra tempo de resposta da API
   */
  recordApiResponseTime(duration) {
    this.metrics.apiResponseTimes.push(duration);
    this.logPerformanceMetric('api_response_time', duration, 'ms');
  }

  /**
   * Obtém estatísticas da sessão atual
   */
  getSessionStats() {
    const avgProcessingTime = this.metrics.processingTimes.length > 0 
      ? this.metrics.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.processingTimes.length 
      : 0;

    const avgApiResponseTime = this.metrics.apiResponseTimes.length > 0 
      ? this.metrics.apiResponseTimes.reduce((a, b) => a + b, 0) / this.metrics.apiResponseTimes.length 
      : 0;

    return {
      sessionId: this.sessionId,
      duration: Date.now() - this.sessionStartTime,
      packsFound: this.metrics.packsFound,
      packsProcessed: this.metrics.packsProcessed,
      packsFailed: this.metrics.packsFailed,
      packsSkipped: this.metrics.packsSkipped,
      avgProcessingTime: Math.round(avgProcessingTime),
      avgApiResponseTime: Math.round(avgApiResponseTime),
      successRate: this.metrics.packsFound > 0 ? 
        ((this.metrics.packsProcessed / this.metrics.packsFound) * 100).toFixed(1) : 0
    };
  }
}

module.exports = MetricsLogger;
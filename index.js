#!/usr/bin/env node

const { config, validateConfig } = require('./config/config');
const PackProcessor = require('./services/packProcessor');
const OptimizedPackProcessor = require('./services/optimizedPackProcessor');
const MetricsLogger = require('./services/metricsLogger');
const PersistentStateManager = require('./services/persistentStateManager');
const { info, error, warn } = require('./utils/logger');

// Validar configurações no início
try {
  validateConfig();
  info('Configurações validadas com sucesso');
} catch (err) {
  error('Erro na validação das configurações', err);
  process.exit(1);
}

// Configuração global de processo
process.env.TZ = 'America/Recife';

// Handler para erros não capturados
process.on('uncaughtException', (err) => {
  error('Erro não capturado', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  error('Promise rejeitada não tratada', reason);
  process.exit(1);
});

// Variáveis globais para cleanup
let globalMetricsLogger = null;
let globalStateManager = null;

// Handler para sinal de parada
process.on('SIGINT', () => {
  info('Recebido sinal de parada (SIGINT)');
  gracefulShutdown();
});

process.on('SIGTERM', () => {
  info('Recebido sinal de término (SIGTERM)');
  gracefulShutdown();
});

async function gracefulShutdown() {
  info('🛑 Iniciando parada graceful...');
  
  try {
    // Salvar estado persistente se existir
    if (globalStateManager) {
      info('💾 Salvando estado persistente...');
      await globalStateManager.saveState();
    }
    
    // Finalizar sessão de métricas se existir
    if (globalMetricsLogger) {
      info('📊 Finalizando sessão de métricas...');
      await globalMetricsLogger.endSession('interrupted');
    }
    
    info('✅ Recursos limpos com sucesso');
    process.exit(0);
  } catch (err) {
    error('❌ Erro durante parada graceful', err);
    process.exit(1);
  }
}

/**
 * Função principal do scraper
 */
async function main() {
  try {
    info('🚀 Iniciando Stickers Scraper');
    info(`Configuração: ${config.scraping.locales.length} locales, max ${config.scraping.maxPacksPerRun} packs por execução`);

    // Selecionar processor baseado no modo
    const mode = process.argv[2];
    const useOptimized = mode && (mode.includes('optimized') || mode.includes('turbo'));
    const processor = useOptimized ? new OptimizedPackProcessor() : new PackProcessor();
    
    if (useOptimized) {
      info('🚀 Modo OTIMIZADO ativado - usando descobertas da API');
    }

    // Keywords padrão baseadas no código original
    const defaultKeywords = [
      'memes',
      'emoji',
      'animado',
      'brasileiro',
      'whatsapp',
      'telegram',
      'funny',
      'amor',
      'trabalho',
      'família',
      'amigos',
      'feliz',
      'triste',
      'raiva',
      'surpresa',
      'festa',
      'natal',
      'ano novo',
      'halloween',
      'carnaval'
    ];

    // Argumentos da linha de comando
    const args = process.argv.slice(2);
    const command = args[0];

    switch (command) {
      case 'recommended':
        // Processar apenas packs recomendados
        info('Modo: Processamento de packs recomendados');
        for (const localeConfig of config.scraping.locales) {
          const result = await processor.processRecommendedPacks(localeConfig.locale);
          info(`Resultado para ${localeConfig.locale}:`, result);
        }
        break;

      case 'keywords':
        // Processar apenas por keywords
        const keywords = args.slice(1);
        const keywordsToUse = keywords.length > 0 ? keywords : defaultKeywords;
        
        info(`Modo: Processamento por keywords (${keywordsToUse.length} palavras)`);
        
        for (const localeConfig of config.scraping.locales) {
          const result = await processor.processKeywordSearch(keywordsToUse, localeConfig.locale);
          info(`Resultado para ${localeConfig.locale}:`, result);
        }
        break;

      case 'full':
        // Processamento completo
        const customKeywords = args.slice(1);
        const fullKeywords = customKeywords.length > 0 ? customKeywords : defaultKeywords;
        
        info(`Modo: Processamento completo (recomendados + ${fullKeywords.length} keywords)`);
        
        const fullResult = await processor.runFullScraping(fullKeywords);
        info('Resultado final:', fullResult);
        break;

      case 'test':
        // Modo de teste com apenas 1 pack por locale
        info('Modo: Teste (1 pack por locale)');
        config.scraping.maxPacksPerRun = 1;
        
        const testResult = await processor.runFullScraping(['test']);
        info('Resultado do teste:', testResult);
        break;

      case 'continuous':
      case 'daemon':
      case 'vps':
        // ⭐ NOVO: Modo contínuo otimizado para VPS
        const continuousKeywords = args.slice(1);
        const keywordsForContinuous = continuousKeywords.length > 0 ? continuousKeywords : config.scraping.keywords;
        
        info(`🔄 Modo: Scraping contínuo VPS (24/7)`);
        info(`Keywords: ${keywordsForContinuous.join(', ')}`);
        info(`Locales: ${config.scraping.locales.map(l => l.locale).join(', ')}`);
        info(`⚠️  Pressione Ctrl+C para parar graciosamente`);
        
        // Inicializar logger de métricas e estado persistente
        const metricsLogger = new MetricsLogger();
        const stateManager = new PersistentStateManager();
        
        // Definir globalmente para cleanup
        globalMetricsLogger = metricsLogger;
        globalStateManager = stateManager;
        
        // Inicia o scraping contínuo com persistência
        await startContinuousVPSScraping(processor, metricsLogger, stateManager, keywordsForContinuous);
        return; // Nunca chegará aqui

      case 'optimized':
      case 'turbo':
        // 🚀 NOVO: Modo otimizado com descobertas da API
        const optimizedKeywords = args.slice(1);
        const keywordsForOptimized = optimizedKeywords.length > 0 ? optimizedKeywords : defaultKeywords;
        
        info(`🚀 Modo: Scraping OTIMIZADO`);
        info(`   - Usa endpoint leve (v1) quando possível`);
        info(`   - Filtros de categoria inteligentes`);
        info(`   - Cache avançado de duplicados`);
        info(`   - Estratégia adaptativa discovery vs. efficiency`);
        info(`Keywords: ${keywordsForOptimized.join(', ')}`);
        
        const optimizedResult = await processor.runFullOptimizedScraping(keywordsForOptimized);
        info('Resultado otimizado:', optimizedResult);
        break;

      case 'stats':
        // Mostrar estatísticas da sessão
        processor.printApuracao(); // Log simples primeiro
        processor.printSessionSummary(); // Log detalhado depois
        return;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        return;

      default:
        // Modo padrão: processamento completo
        info('Modo padrão: Processamento completo');
        const defaultResult = await processor.runFullScraping(defaultKeywords);
        info('Resultado final:', defaultResult);
        break;
    }

    // Mostrar relatório final da sessão
    info('✅ Scraping finalizado com sucesso');
    processor.printApuracao(); // Log simples primeiro
    processor.printSessionSummary(); // Log detalhado depois

  } catch (err) {
    error('❌ Erro fatal no scraper', err);
    process.exit(1);
  }
}

/**
 * Função para scraping contínuo otimizado para VPS
 */
async function startContinuousVPSScraping(processor, metricsLogger, stateManager, keywords) {
  const locales = config.scraping.locales;
  let cycleStartTime = Date.now();
  
  try {
    // Carregar estado persistente
    await stateManager.loadState();
    
    // Iniciar sessão de métricas
    await metricsLogger.startSession('continuous_vps', 
      locales.map(l => l.locale), 
      keywords
    );
    
    info('🚀 Iniciando scraping contínuo VPS');
    info(`📊 Estado atual: Locale ${stateManager.currentState.currentLocaleIndex}/${locales.length}, Keyword ${stateManager.currentState.currentKeywordIndex}/${keywords.length}`);
    
    // Loop infinito
    while (true) {
      try {
        // Verificar se completou um ciclo
        if (stateManager.currentState.currentLocaleIndex >= locales.length) {
          await stateManager.completeCycle();
          const cycleTime = (Date.now() - cycleStartTime) / (1000 * 60 * 60); // horas
          await stateManager.addRuntimeHours(cycleTime);
          
          info(`✅ Ciclo ${stateManager.currentState.cyclesCompleted} completo em ${cycleTime.toFixed(2)}h`);
          await metricsLogger.logEvent('cycle_completed', null, {
            cycle_number: stateManager.currentState.cyclesCompleted,
            cycle_duration_hours: cycleTime,
            total_runtime_hours: stateManager.currentState.totalRuntimeHours
          });
          
          cycleStartTime = Date.now();
          continue;
        }
        
        // Obter locale e keyword atuais
        const currentLocale = locales[stateManager.currentState.currentLocaleIndex];
        const currentKeyword = keywords[stateManager.currentState.currentKeywordIndex];
        
        info(`🎯 Processando: ${currentLocale.locale} + "${currentKeyword}" (Página ${stateManager.currentState.currentPage})`);
        
        // Processar packs da keyword atual
        const searchResult = await processor.processKeywordSearch(
          [currentKeyword], 
          currentLocale.locale,
          stateManager.currentState.currentPage
        );
        
        await metricsLogger.logEvent('keyword_processed', null, {
          locale: currentLocale.locale,
          keyword: currentKeyword,
          page: stateManager.currentState.currentPage,
          packs_found: searchResult.totalPacksFound || 0,
          packs_processed: searchResult.totalPacksProcessed || 0
        });
        
        // Atualizar métricas
        if (searchResult.totalPacksFound) {
          metricsLogger.metrics.packsFound += searchResult.totalPacksFound;
        }
        if (searchResult.totalPacksProcessed) {
          metricsLogger.metrics.packsProcessed += searchResult.totalPacksProcessed;
        }
        
        // Verificar se tem mais páginas
        const hasMorePages = searchResult.hasMorePages;
        
        if (hasMorePages && stateManager.currentState.currentPage < 10) {
          // Próxima página da mesma keyword
          await stateManager.updateCurrentPage(stateManager.currentState.currentPage + 1);
        } else {
          // Próxima keyword
          await stateManager.updateCurrentPage(0);
          
          if (stateManager.currentState.currentKeywordIndex + 1 >= keywords.length) {
            // Próximo locale
            await stateManager.updateKeywordIndex(0);
            await stateManager.updateLocaleIndex(stateManager.currentState.currentLocaleIndex + 1);
          } else {
            // Próxima keyword do mesmo locale
            await stateManager.updateKeywordIndex(stateManager.currentState.currentKeywordIndex + 1);
          }
        }
        
        // Status report a cada 10 iterações
        const progress = stateManager.getProgress(locales.length, keywords.length);
        if (progress.currentStep % 10 === 0) {
          const stats = metricsLogger.getSessionStats();
          info(`📊 Progresso: ${progress.progressPercentage}% - Packs: ${stats.packsProcessed} processados, ${stats.packsFailed} falharam`);
        }
        
        // Delay entre requests para não sobrecarregar a API
        const delayMs = config.scraping.delayBetweenRequests;
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
        
      } catch (iterationError) {
        error('❌ Erro na iteração do scraping contínuo', iterationError);
        
        await metricsLogger.logError('iteration_error', iterationError, {
          locale: locales[stateManager.currentState.currentLocaleIndex]?.locale,
          keyword: keywords[stateManager.currentState.currentKeywordIndex],
          page: stateManager.currentState.currentPage
        });
        
        // Aguardar um pouco antes de tentar novamente
        await new Promise(resolve => setTimeout(resolve, 30000)); // 30s
      }
    }
    
  } catch (fatalError) {
    error('❌ Erro fatal no scraping contínuo VPS', fatalError);
    
    await metricsLogger.logError('fatal_error', fatalError);
    await metricsLogger.endSession('failed');
    
    process.exit(1);
  }
}

/**
 * Mostra ajuda do programa
 */
function showHelp() {
  console.log(`
🎯 Stickers Scraper - Sistema de scraping de stickers do sticker.ly

Uso: node index.js [comando] [opções]

Comandos disponíveis:
  recommended           Processa apenas packs recomendados
  keywords [palavras]   Processa apenas por busca de keywords
  full [palavras]       Processamento completo (recomendados + keywords)
  optimized [palavras]  🚀 Scraping OTIMIZADO (usa descobertas da API)
  turbo [palavras]      🚀 Alias para 'optimized'
  continuous [palavras] ⭐ Scraping contínuo VPS com persistência - roda 24/7
  daemon [palavras]     ⭐ Alias para 'continuous'
  vps [palavras]        ⭐ Alias para 'continuous'
  test                  Modo de teste (1 pack por locale)
  stats                 Mostra estatísticas da sessão atual
  help, --help, -h      Mostra esta ajuda

Exemplos:
  node index.js                           # Processamento padrão completo
  node index.js recommended               # Apenas packs recomendados
  node index.js keywords memes funny      # Busca por "memes" e "funny"
  node index.js full amor trabalho        # Completo com keywords customizadas
  node index.js optimized                 # 🚀 Scraping otimizado (RECOMENDADO)
  node index.js turbo memes love          # 🚀 Scraping otimizado com keywords específicas
  node index.js continuous                # ⭐ Scraping contínuo VPS (PRODUÇÃO)
  node index.js vps memes love            # ⭐ Scraping VPS com keywords específicas
  node index.js daemon                    # ⭐ Modo daemon para VPS
  node index.js test                      # Teste rápido

⭐ MODO VPS (NOVIDADE):
  - Estado persistente: retoma de onde parou após reinicialização
  - Métricas detalhadas salvas no Supabase
  - Logs de erro estruturados para debugging
  - Graceful shutdown com Ctrl+C
  - Ciclos infinitos com controle de progresso
  - Otimizado para execução 24/7 na VPS Oracle Cloud

🚀 MODO OTIMIZADO (Novidade):
  - Usa endpoint leve (v1) quando possível (~53KB vs ~780KB)
  - Aplica filtros de categoria descobertos na investigação da API
  - Cache inteligente para pular duplicados mais rapidamente
  - Estratégia adaptativa: discovery mode vs. efficiency mode
  - Taxa de sucesso muito maior em encontrar packs novos

Configuração:
  Edite o arquivo .env para configurar Supabase e outros parâmetros.
  
Keywords padrão:
  memes, emoji, animado, brasileiro, whatsapp, telegram, funny, amor,
  trabalho, família, amigos, feliz, triste, raiva, surpresa, festa,
  natal, ano novo, halloween, carnaval

Locales suportados:
  ${config.scraping.locales.map(l => `${l.locale} (${l.lang})`).join(', ')}
`);
}

// Executar programa
if (require.main === module) {
  main().catch(err => {
    error('Erro não tratado na função principal', err);
    process.exit(1);
  });
}

module.exports = { main, PackProcessor };
#!/usr/bin/env node

const { config, validateConfig } = require('./config/config');
const PackProcessor = require('./services/packProcessor');
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
  info('Iniciando parada graceful...');
  
  try {
    // Limpeza de recursos se necessário
    info('Recursos limpos com sucesso');
    process.exit(0);
  } catch (err) {
    error('Erro durante parada graceful', err);
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

    const processor = new PackProcessor();

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

      case 'stats':
        // Mostrar estatísticas da sessão
        const stats = processor.getSessionStats();
        info('Estatísticas da sessão:', stats);
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

    // Mostrar estatísticas finais
    const finalStats = processor.getSessionStats();
    info('📊 Estatísticas finais da sessão:', finalStats);

    info('✅ Scraping finalizado com sucesso');

  } catch (err) {
    error('❌ Erro fatal no scraper', err);
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
  test                  Modo de teste (1 pack por locale)
  stats                 Mostra estatísticas da sessão atual
  help, --help, -h      Mostra esta ajuda

Exemplos:
  node index.js                           # Processamento padrão completo
  node index.js recommended               # Apenas packs recomendados
  node index.js keywords memes funny      # Busca por "memes" e "funny"
  node index.js full amor trabalho        # Completo com keywords customizadas
  node index.js test                      # Teste rápido

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
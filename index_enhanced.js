#!/usr/bin/env node

const { config, validateConfig } = require('./config/config');
const EnhancedPackProcessor = require('./services/enhancedPackProcessor');
const log = require('./utils/betterLogger');
const chalk = require('chalk');

// Validar configurações
try {
  validateConfig();
} catch (err) {
  log.error('Erro na validação das configurações', err);
  process.exit(1);
}

// Handler para erros não capturados
process.on('uncaughtException', (err) => {
  log.error('Erro não capturado', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  log.error('Promise rejeitada não tratada', reason);
  process.exit(1);
});

// Handler para parada graceful
let processor = null;

async function gracefulShutdown() {
  console.log(chalk.yellow('\n\n🛑 Encerrando aplicação...'));
  
  if (processor) {
    await processor.finishSession();
  }
  
  console.log(chalk.green('✅ Aplicação encerrada com sucesso!\n'));
  process.exit(0);
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

/**
 * Função principal
 */
async function main() {
  console.clear();
  console.log(chalk.cyan.bold(`
╔════════════════════════════════════════╗
║        STICKERS SCRAPER v2.0           ║
║         Sistema Otimizado               ║
╚════════════════════════════════════════╝
`));

  const mode = process.argv[2] || 'default';
  processor = new EnhancedPackProcessor();

  // Keywords padrão
  const defaultKeywords = ['memes', 'emoji', 'brasil', 'amor'];
  
  try {
    switch(mode) {
      case 'test':
        console.log(chalk.blue('🧪 Modo TESTE - Processando 1 pack por keyword\n'));
        
        // Processar apenas 1 pack de teste
        await processor.loadCache();
        const testKeyword = 'test';
        const testPacks = await processor.processKeywordSearch(testKeyword, 'pt-BR', 1);
        
        if (testPacks.length > 0) {
          await processor.processPack(testPacks[0]);
        }
        
        break;
        
      case 'keywords':
        const keywords = process.argv.slice(3).length > 0 
          ? process.argv.slice(3) 
          : defaultKeywords;
          
        console.log(chalk.blue(`🔍 Modo KEYWORDS - Processando: ${keywords.join(', ')}\n`));
        
        await processor.loadCache();
        
        for (const keyword of keywords) {
          console.log(chalk.yellow(`\n📋 Processando keyword: "${keyword}"`));
          
          const packs = await processor.processKeywordSearch(
            keyword, 
            'pt-BR', 
            config.scraping.maxPacksPerKeyword
          );
          
          console.log(chalk.green(`   Encontrados: ${packs.length} novos packs`));
          
          for (const pack of packs) {
            await processor.processPack(pack);
          }
        }
        
        break;
        
      case 'recommended':
        console.log(chalk.blue('🌟 Modo RECOMENDADOS\n'));
        
        await processor.loadCache();
        const recommendedPacks = await processor.processRecommendedPacks('pt-BR');
        
        for (const pack of recommendedPacks) {
          await processor.processPack(pack);
        }
        
        break;
        
      case 'stats':
        console.log(chalk.magenta('📊 Exibindo estatísticas...\n'));
        
        const SearchCache = require('./services/searchCache');
        const cache = new SearchCache();
        const stats = cache.getStats();
        
        console.log(chalk.white('Cache de Buscas:'));
        console.log(`  • Total de entradas: ${stats.totalEntries}`);
        console.log(`  • Keywords únicas: ${stats.keywords.length}`);
        console.log(`  • Keywords: ${stats.keywords.join(', ')}`);
        
        if (stats.oldestEntry) {
          console.log(`  • Entrada mais antiga: ${new Date(stats.oldestEntry).toLocaleDateString()}`);
        }
        if (stats.newestEntry) {
          console.log(`  • Entrada mais recente: ${new Date(stats.newestEntry).toLocaleDateString()}`);
        }
        
        break;
        
      case 'clear-cache':
        console.log(chalk.red('🗑️  Limpando cache...\n'));
        
        const fs = require('fs-extra');
        await fs.remove('.cache');
        console.log(chalk.green('✅ Cache limpo com sucesso!'));
        
        break;
        
      case 'help':
        console.log(chalk.white(`
Comandos disponíveis:

  ${chalk.cyan('node index_enhanced.js test')}
    Testa com 1 pack apenas

  ${chalk.cyan('node index_enhanced.js keywords [palavra1] [palavra2]')}
    Busca por keywords específicas

  ${chalk.cyan('node index_enhanced.js recommended')}
    Busca packs recomendados

  ${chalk.cyan('node index_enhanced.js stats')}
    Exibe estatísticas do cache

  ${chalk.cyan('node index_enhanced.js clear-cache')}
    Limpa o cache de buscas

  ${chalk.cyan('node monitor.js [--watch]')}
    Monitora o progresso em tempo real
        `));
        break;
        
      default:
        console.log(chalk.blue('🚀 Modo PADRÃO - Recomendados + Keywords\n'));
        
        await processor.loadCache();
        
        // Processar recomendados
        console.log(chalk.yellow('📦 Buscando packs recomendados...'));
        const packs = await processor.processRecommendedPacks('pt-BR');
        
        for (const pack of packs.slice(0, 10)) {
          await processor.processPack(pack);
        }
        
        // Processar keywords
        for (const keyword of defaultKeywords.slice(0, 3)) {
          console.log(chalk.yellow(`\n🔍 Buscando "${keyword}"...`));
          
          const keywordPacks = await processor.processKeywordSearch(
            keyword, 
            'pt-BR', 
            10
          );
          
          for (const pack of keywordPacks) {
            await processor.processPack(pack);
          }
        }
    }
    
    // Finalizar sessão
    await processor.finishSession();
    
  } catch (err) {
    log.error('Erro durante execução', err);
    process.exit(1);
  }
}

// Executar
main();
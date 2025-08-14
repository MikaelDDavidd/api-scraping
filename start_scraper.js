#!/usr/bin/env node

/**
 * Script para iniciar apenas o scraper (hardware limitado)
 * 
 * Componentes ativos:
 * - Discovery Worker (encontra packs)
 * - Light Processor (processa todos os packs)
 * - Queue Manager (gerencia filas com tamanhos reduzidos)
 * 
 * Componentes desabilitados:
 * - Resource Monitor (economiza memória)
 * - Heavy Processor (economiza CPU/memória)
 */

const { ParallelScrapingSystem } = require('./run_parallel_system');
const { info, error } = require('./utils/logger');

async function startScraperOnly() {
  info('🚀 Iniciando Sistema de Scraping Otimizado para Hardware Limitado\n');
  
  const system = new ParallelScrapingSystem();
  
  // Handlers para shutdown graceful
  process.on('SIGINT', async () => {
    info('\n🛑 Recebido SIGINT (Ctrl+C), parando sistema...');
    await system.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    info('\n🛑 Recebido SIGTERM, parando sistema...');
    await system.shutdown();
    process.exit(0);
  });

  try {
    // Inicializar em modo scraper (sem heavy processor e resource monitor)
    await system.initialize(true);
    
    // Iniciar monitoramento básico
    system.startMonitoring();
    
    info('\n🎯 Sistema de Scraping rodando em modo otimizado!');
    info('💡 Todos os packs serão processados pelo Light Processor');
    info('📊 Use Ctrl+C para parar gracefully\n');
    
    // Status inicial detalhado
    setTimeout(async () => {
      await system.printStatus();
    }, 5000); // Status após 5 segundos
    
    // Manter processo ativo
    process.stdin.resume();
    
  } catch (err) {
    error('💥 Falha crítica no sistema:', err);
    await system.shutdown();
    process.exit(1);
  }
}

// Executar
if (require.main === module) {
  startScraperOnly();
}

module.exports = { startScraperOnly };
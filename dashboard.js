#!/usr/bin/env node

/**
 * Dashboard standalone para monitoramento em tempo real
 * Execute com: node dashboard.js
 */

const dashboardManager = require('./utils/dashboardManager');
const fs = require('fs');
const path = require('path');

console.log('🚀 Iniciando Dashboard de Monitoramento...');

// Inicializar dashboard
if (!dashboardManager.init()) {
  console.error('❌ Falha ao inicializar dashboard');
  process.exit(1);
}

// Simular dados para demonstração
let demoMode = process.argv.includes('--demo');

if (demoMode) {
  console.log('📊 Modo demonstração ativado');
  
  // Simular keywords ativas
  setTimeout(() => {
    dashboardManager.addKeyword('memes', 'pt', 'active');
    dashboardManager.addKeyword('funny', 'en', 'active');
    dashboardManager.addKeyword('amor', 'pt', 'active');
  }, 1000);

  // Simular logs
  setTimeout(() => {
    dashboardManager.logSessionStart('FULL_SCAN', ['pt', 'en'], ['memes', 'funny', 'amor']);
  }, 2000);

  // Simular descoberta de packs
  let found = 0;
  let processed = 0;
  
  const simulateDiscovery = () => {
    found += Math.floor(Math.random() * 5) + 1;
    dashboardManager.updateDiscoveryStats(found, processed);
    
    if (Math.random() > 0.7) {
      processed += Math.floor(Math.random() * 3) + 1;
      if (processed > found) processed = found;
      dashboardManager.updateDiscoveryStats(found, processed);
    }
  };

  // Simular processamento
  const simulateProcessing = () => {
    if (Math.random() > 0.6) {
      const packTypes = ['light', 'heavy'];
      const queueType = packTypes[Math.floor(Math.random() * 2)];
      const packId = `pack_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const packName = ['Memes Engraçados', 'Stickers de Amor', 'Animais Fofos', 'Reações'][Math.floor(Math.random() * 4)];
      
      dashboardManager.startProcessingPack(queueType, {
        id: packId,
        name: packName,
        stickers: Math.floor(Math.random() * 30) + 5
      });

      // Finalizar após alguns segundos
      setTimeout(() => {
        dashboardManager.finishProcessingPack(queueType, packId, Math.random() > 0.1);
      }, Math.random() * 8000 + 2000);
    }
  };

  // Simular atualizações de filas
  const simulateQueues = () => {
    dashboardManager.updateQueueStats('light', {
      pending: Math.floor(Math.random() * 50),
      processing: Math.floor(Math.random() * 5),
      completed: Math.floor(Math.random() * 200) + 100
    });

    dashboardManager.updateQueueStats('heavy', {
      pending: Math.floor(Math.random() * 20),
      processing: Math.floor(Math.random() * 3),
      completed: Math.floor(Math.random() * 80) + 50
    });
  };

  // Executar simulações
  setInterval(simulateDiscovery, 3000);
  setInterval(simulateProcessing, 4000);
  setInterval(simulateQueues, 5000);

  // Logs aleatórios
  const randomLogs = [
    'Pack "Memes 2024" adicionado com sucesso',
    'API rate limit atingido, aguardando...',
    'Conectando com Supabase...',
    'Cache atualizado com 150 novos packs',
    'Worker pesado iniciado',
    'Descoberta de packs concluída para keyword "funny"'
  ];

  setInterval(() => {
    const message = randomLogs[Math.floor(Math.random() * randomLogs.length)];
    const levels = ['info', 'success', 'warn'];
    const level = levels[Math.floor(Math.random() * levels.length)];
    dashboardManager.log(message, level);
  }, 2000);

} else {
  // Modo normal - conectar com sistema real
  dashboardManager.info('Dashboard conectado - aguardando dados do sistema...');
  
  // Monitorar arquivos de estado se existirem
  const stateFiles = [
    './parallel_production_state/queues.json',
    './parallel_production_state/discovery_state.json'
  ];

  const monitorStateFiles = () => {
    stateFiles.forEach(filePath => {
      if (fs.existsSync(filePath)) {
        try {
          const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
          
          if (filePath.includes('queues.json')) {
            // Adaptar estrutura de dados para o formato esperado pelo dashboard
            if (data.queues) {
              if (data.queues.light) {
                const lightStats = {
                  pending: data.queues.light.items ? data.queues.light.items.length : 0,
                  processing: data.queues.light.processing ? data.queues.light.processing.length : 0,
                  completed: data.queues.light.stats ? data.queues.light.stats.processed : 0
                };
                dashboardManager.updateQueueStats('light', lightStats);
              }
              if (data.queues.heavy) {
                const heavyStats = {
                  pending: data.queues.heavy.items ? data.queues.heavy.items.length : 0,
                  processing: data.queues.heavy.processing ? data.queues.heavy.processing.length : 0,
                  completed: data.queues.heavy.stats ? data.queues.heavy.stats.processed : 0
                };
                dashboardManager.updateQueueStats('heavy', heavyStats);
              }
              if (data.queues.discovery) {
                const totalFound = data.queues.discovery.stats ? data.queues.discovery.stats.added : 0;
                const totalProcessed = data.queues.discovery.stats ? data.queues.discovery.stats.processed : 0;
                dashboardManager.updateDiscoveryStats(totalFound, totalProcessed);
              }
            }
          }
          
          if (filePath.includes('discovery_state.json')) {
            if (data.totalFound && data.totalProcessed) {
              dashboardManager.updateDiscoveryStats(data.totalFound, data.totalProcessed);
            }
          }
        } catch (error) {
          // Ignorar erros de parse
        }
      }
    });
  };

  // Monitorar a cada 2 segundos
  setInterval(monitorStateFiles, 2000);
}

dashboardManager.info('Dashboard iniciado! Use Ctrl+C ou ESC para sair');

// Manter processo ativo
setInterval(() => {
  // Keep alive
}, 1000);
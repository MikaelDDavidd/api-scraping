#!/usr/bin/env node

/**
 * MONITOR WEB - Dashboard para acompanhar o sistema
 * Expõe API REST e interface web para monitoramento
 */

const express = require('express');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

class WebMonitor {
  constructor() {
    this.queueFile = path.join(__dirname, 'discovered_packs.json');
    this.processedFile = path.join(__dirname, 'processed_packs.json');
    this.stateFile = path.join(__dirname, 'discovery_state.json');
    this.stickersDir = process.env.NODE_ENV === 'development' 
      ? path.join(__dirname, 'stickers_dev')
      : '/home/ubuntu/stickers';
  }

  async getStats() {
    const stats = {
      timestamp: new Date().toISOString(),
      services: await this.getServicesStatus(),
      queue: await this.getQueueStats(),
      discovery: await this.getDiscoveryStats(),
      processing: await this.getProcessingStats(),
      storage: await this.getStorageStats()
    };

    return stats;
  }

  async getServicesStatus() {
    // Em Docker, verificamos via arquivos de estado
    return {
      discovery: {
        status: await fs.pathExists(this.stateFile) ? 'running' : 'stopped',
        lastUpdate: await this.getFileTime(this.stateFile)
      },
      processors: {
        // Estimar pelo arquivo de processados
        status: await fs.pathExists(this.processedFile) ? 'running' : 'stopped',
        lastUpdate: await this.getFileTime(this.processedFile)
      }
    };
  }

  async getQueueStats() {
    try {
      if (!await fs.pathExists(this.queueFile)) {
        return { size: 0, lastUpdated: null };
      }

      const queueData = await fs.readJson(this.queueFile);
      return {
        size: queueData.totalPacks || 0,
        lastUpdated: queueData.lastUpdated,
        session: queueData.session
      };
    } catch (error) {
      return { size: 0, lastUpdated: null, error: error.message };
    }
  }

  async getDiscoveryStats() {
    try {
      if (!await fs.pathExists(this.stateFile)) {
        return { currentKeyword: 0, currentPage: 0, totalDiscovered: 0 };
      }

      const state = await fs.readJson(this.stateFile);
      return {
        currentKeywordIndex: state.currentKeywordIndex || 0,
        currentPage: state.currentPage || 0,
        totalDiscovered: state.totalDiscovered || 0,
        lastRecommendedCheck: state.lastRecommendedCheck || 0,
        session: state.session
      };
    } catch (error) {
      return { currentKeyword: 0, currentPage: 0, totalDiscovered: 0, error: error.message };
    }
  }

  async getProcessingStats() {
    try {
      if (!await fs.pathExists(this.processedFile)) {
        return { totalProcessed: 0, successes: 0, failures: 0 };
      }

      const processedData = await fs.readJson(this.processedFile);
      const processed = processedData.processed || [];
      
      const successes = processed.filter(p => p.success).length;
      const failures = processed.filter(p => !p.success).length;

      return {
        totalProcessed: processedData.totalProcessedThisSession || 0,
        successes,
        failures,
        successRate: processed.length > 0 ? (successes / processed.length * 100).toFixed(1) : 0,
        lastProcessed: processedData.lastUpdated
      };
    } catch (error) {
      return { totalProcessed: 0, successes: 0, failures: 0, error: error.message };
    }
  }

  async getStorageStats() {
    try {
      if (!await fs.pathExists(this.stickersDir)) {
        return { packsCount: 0, diskUsage: '0B' };
      }

      const files = await fs.readdir(this.stickersDir);
      const dirs = files.filter(async (file) => {
        const stat = await fs.stat(path.join(this.stickersDir, file));
        return stat.isDirectory();
      });

      return {
        packsCount: dirs.length,
        diskUsage: 'N/A' // Difícil calcular em Docker sem ferramentas extras
      };
    } catch (error) {
      return { packsCount: 0, diskUsage: '0B', error: error.message };
    }
  }

  async getFileTime(filePath) {
    try {
      if (!await fs.pathExists(filePath)) return null;
      const stat = await fs.stat(filePath);
      return stat.mtime.toISOString();
    } catch (error) {
      return null;
    }
  }
}

const monitor = new WebMonitor();

// API Endpoints
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await monitor.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/queue', async (req, res) => {
  try {
    const stats = await monitor.getQueueStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dashboard HTML
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🔍 Stickers Monitor</title>
    <style>
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0; padding: 20px; background: #f5f5f5;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { text-align: center; margin-bottom: 30px; }
        .stats-grid { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
            gap: 20px; 
        }
        .stat-card { 
            background: white; 
            padding: 20px; 
            border-radius: 10px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        .stat-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; }
        .stat-value { font-size: 24px; font-weight: bold; color: #2563eb; }
        .stat-label { font-size: 14px; color: #666; margin-top: 5px; }
        .status-running { color: #16a34a; }
        .status-stopped { color: #dc2626; }
        .last-update { font-size: 12px; color: #999; margin-top: 10px; }
        .refresh-btn {
            background: #2563eb; color: white; border: none;
            padding: 10px 20px; border-radius: 5px; cursor: pointer;
            margin: 20px 0;
        }
        .refresh-btn:hover { background: #1d4ed8; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Stickers Discovery & Processing Monitor</h1>
            <button class="refresh-btn" onclick="loadStats()">🔄 Atualizar</button>
            <div id="timestamp" class="last-update"></div>
        </div>
        
        <div class="stats-grid">
            <!-- Serviços -->
            <div class="stat-card">
                <div class="stat-title">🔍 Discovery Service</div>
                <div id="discovery-status" class="stat-value">-</div>
                <div class="stat-label">Status do serviço</div>
                <div id="discovery-update" class="last-update"></div>
            </div>
            
            <div class="stat-card">
                <div class="stat-title">🔧 Processor Services</div>
                <div id="processor-status" class="stat-value">-</div>
                <div class="stat-label">Status dos processadores</div>
                <div id="processor-update" class="last-update"></div>
            </div>
            
            <!-- Fila -->
            <div class="stat-card">
                <div class="stat-title">📦 Fila de Packs</div>
                <div id="queue-size" class="stat-value">-</div>
                <div class="stat-label">Packs aguardando processamento</div>
                <div id="queue-update" class="last-update"></div>
            </div>
            
            <!-- Descoberta -->
            <div class="stat-card">
                <div class="stat-title">🔍 Progresso da Descoberta</div>
                <div id="discovery-keyword" class="stat-value">-</div>
                <div class="stat-label">Keyword atual</div>
                <div id="discovery-total" class="last-update"></div>
            </div>
            
            <!-- Processamento -->
            <div class="stat-card">
                <div class="stat-title">📊 Processamento</div>
                <div id="processed-total" class="stat-value">-</div>
                <div class="stat-label">Total processado</div>
                <div id="processed-rate" class="last-update"></div>
            </div>
            
            <!-- Armazenamento -->
            <div class="stat-card">
                <div class="stat-title">💾 Armazenamento</div>
                <div id="storage-packs" class="stat-value">-</div>
                <div class="stat-label">Packs salvos</div>
                <div id="storage-usage" class="last-update"></div>
            </div>
        </div>
    </div>

    <script>
        async function loadStats() {
            try {
                const response = await fetch('/api/stats');
                const stats = await response.json();
                
                // Timestamp
                document.getElementById('timestamp').textContent = 
                    'Última atualização: ' + new Date(stats.timestamp).toLocaleString('pt-BR');
                
                // Serviços
                const discoveryStatus = stats.services.discovery.status;
                document.getElementById('discovery-status').textContent = 
                    discoveryStatus === 'running' ? '✅ Rodando' : '❌ Parado';
                document.getElementById('discovery-status').className = 
                    'stat-value ' + (discoveryStatus === 'running' ? 'status-running' : 'status-stopped');
                document.getElementById('discovery-update').textContent = 
                    stats.services.discovery.lastUpdate ? 
                    'Última atividade: ' + new Date(stats.services.discovery.lastUpdate).toLocaleString('pt-BR') : 
                    'Sem atividade recente';
                
                const processorStatus = stats.services.processors.status;
                document.getElementById('processor-status').textContent = 
                    processorStatus === 'running' ? '✅ Rodando' : '❌ Parado';
                document.getElementById('processor-status').className = 
                    'stat-value ' + (processorStatus === 'running' ? 'status-running' : 'status-stopped');
                document.getElementById('processor-update').textContent = 
                    stats.services.processors.lastUpdate ? 
                    'Última atividade: ' + new Date(stats.services.processors.lastUpdate).toLocaleString('pt-BR') : 
                    'Sem atividade recente';
                
                // Fila
                document.getElementById('queue-size').textContent = stats.queue.size.toLocaleString('pt-BR');
                document.getElementById('queue-update').textContent = 
                    stats.queue.lastUpdated ? 
                    'Última atualização: ' + new Date(stats.queue.lastUpdated).toLocaleString('pt-BR') : 
                    'Nunca atualizada';
                
                // Descoberta
                document.getElementById('discovery-keyword').textContent = 
                    '#' + stats.discovery.currentKeywordIndex + ' (página ' + stats.discovery.currentPage + ')';
                document.getElementById('discovery-total').textContent = 
                    'Total descoberto: ' + stats.discovery.totalDiscovered.toLocaleString('pt-BR');
                
                // Processamento
                document.getElementById('processed-total').textContent = stats.processing.totalProcessed.toLocaleString('pt-BR');
                document.getElementById('processed-rate').textContent = 
                    'Taxa de sucesso: ' + stats.processing.successRate + '%' +
                    ' (✅' + stats.processing.successes + ' ❌' + stats.processing.failures + ')';
                
                // Armazenamento
                document.getElementById('storage-packs').textContent = stats.storage.packsCount.toLocaleString('pt-BR');
                document.getElementById('storage-usage').textContent = 'Uso do disco: ' + stats.storage.diskUsage;
                
            } catch (error) {
                console.error('Erro ao carregar stats:', error);
                alert('Erro ao carregar estatísticas: ' + error.message);
            }
        }
        
        // Carregar stats na inicialização
        loadStats();
        
        // Auto-refresh a cada 30 segundos
        setInterval(loadStats, 30000);
    </script>
</body>
</html>
  `);
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Monitor Web disponível em http://localhost:${PORT}`);
  console.log(`📊 API disponível em http://localhost:${PORT}/api/stats`);
});

module.exports = app;
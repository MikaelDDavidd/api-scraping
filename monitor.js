#!/usr/bin/env node

const fs = require('fs-extra');
const path = require('path');
const chalk = require('chalk');

class ScraperMonitor {
  constructor() {
    this.cacheFile = path.join('.cache', 'search_history.json');
    this.statsFile = path.join('logs', 'session_stats.json');
    this.stickersDir = process.env.LOCAL_STORAGE_PATH || './stickers';
  }

  async getStats() {
    const stats = {
      cache: { entries: 0, keywords: [] },
      storage: { packs: 0, totalSize: 0 },
      logs: { size: 0, files: 0 }
    };

    // Cache stats
    if (fs.existsSync(this.cacheFile)) {
      const cache = await fs.readJson(this.cacheFile);
      stats.cache.entries = Object.keys(cache).length;
      const keywords = new Set();
      Object.values(cache).forEach(entry => keywords.add(entry.keyword));
      stats.cache.keywords = Array.from(keywords);
    }

    // Storage stats
    if (fs.existsSync(this.stickersDir)) {
      const packs = await fs.readdir(this.stickersDir);
      stats.storage.packs = packs.length;
      
      for (const pack of packs) {
        const packPath = path.join(this.stickersDir, pack);
        const packStats = await fs.stat(packPath);
        if (packStats.isDirectory()) {
          const files = await fs.readdir(packPath);
          for (const file of files) {
            const filePath = path.join(packPath, file);
            const fileStats = await fs.stat(filePath);
            stats.storage.totalSize += fileStats.size;
          }
        }
      }
    }

    // Logs stats
    const logsDir = 'logs';
    if (fs.existsSync(logsDir)) {
      const logFiles = await fs.readdir(logsDir);
      stats.logs.files = logFiles.length;
      
      for (const file of logFiles) {
        const filePath = path.join(logsDir, file);
        const fileStats = await fs.stat(filePath);
        stats.logs.size += fileStats.size;
      }
    }

    return stats;
  }

  formatSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  async display() {
    console.clear();
    console.log(chalk.cyan.bold('\n╔════════════════════════════════════════╗'));
    console.log(chalk.cyan.bold('║     SCRAPER MONITOR - ESTATÍSTICAS     ║'));
    console.log(chalk.cyan.bold('╚════════════════════════════════════════╝\n'));

    const stats = await this.getStats();

    // Cache
    console.log(chalk.yellow.bold('📂 CACHE DE BUSCAS:'));
    console.log(chalk.white(`   Páginas em cache: ${stats.cache.entries}`));
    console.log(chalk.white(`   Keywords únicas: ${stats.cache.keywords.length}`));
    if (stats.cache.keywords.length > 0) {
      console.log(chalk.gray(`   Últimas: ${stats.cache.keywords.slice(-3).join(', ')}`));
    }

    // Storage
    console.log(chalk.green.bold('\n💾 ARMAZENAMENTO:'));
    console.log(chalk.white(`   Packs salvos: ${stats.storage.packs}`));
    console.log(chalk.white(`   Tamanho total: ${this.formatSize(stats.storage.totalSize)}`));
    if (stats.storage.packs > 0) {
      console.log(chalk.gray(`   Média por pack: ${this.formatSize(stats.storage.totalSize / stats.storage.packs)}`));
    }

    // Logs
    console.log(chalk.magenta.bold('\n📝 LOGS:'));
    console.log(chalk.white(`   Arquivos de log: ${stats.logs.files}`));
    console.log(chalk.white(`   Tamanho total: ${this.formatSize(stats.logs.size)}`));

    // Dicas
    console.log(chalk.blue.bold('\n💡 COMANDOS ÚTEIS:'));
    console.log(chalk.gray('   node index.js test      - Testar com 1 pack'));
    console.log(chalk.gray('   node index.js           - Rodar scraping completo'));
    console.log(chalk.gray('   tail -f logs/*.log      - Ver logs em tempo real'));
    console.log(chalk.gray('   rm -rf .cache           - Limpar cache de buscas'));

    console.log(chalk.cyan('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));
  }

  async watch() {
    await this.display();
    
    // Atualizar a cada 5 segundos
    setInterval(async () => {
      await this.display();
    }, 5000);
  }
}

// Executar monitor
const monitor = new ScraperMonitor();

if (process.argv.includes('--watch')) {
  monitor.watch();
} else {
  monitor.display();
}
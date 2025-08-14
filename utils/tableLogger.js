const { info } = require('./logger');

class TableLogger {
  /**
   * Exibe estatísticas do banco em formato tabela
   */
  static logBankStats(stats) {
    const lines = [];
    
    lines.push('┌─────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                          📊 ESTATÍSTICAS DO BANCO                          │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
    lines.push(`│ 📦 Total de Packs:     ${stats.totalPacks.toString().padStart(8)} ${stats.totalPacks > 0 ? '✅' : '⭕'} │ 🎯 Figurinhas:    ${stats.totalStickers.toString().padStart(10)} │`);
    lines.push(`│ 🎬 Animados:           ${stats.animatedPacks.toString().padStart(8)} ${stats.animatedPacks > 0 ? '🎥' : '⭕'} │ 🖼️  Estáticos:     ${stats.staticPacks.toString().padStart(10)} │`);
    lines.push(`│ 📊 Média fig/pack:     ${stats.avgStickersPerPack.toString().padStart(8)} ${stats.avgStickersPerPack > 0 ? '📈' : '⭕'} │                              │`);
    
    // Idiomas
    if (Object.keys(stats.packsByLanguage).length > 0) {
      lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
      lines.push('│                          🌍 PACKS POR IDIOMA                               │');
      lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
      
      Object.entries(stats.packsByLanguage)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5) // Top 5 idiomas
        .forEach(([lang, count]) => {
          const flag = lang === 'pt' ? '🇧🇷' : lang === 'en' ? '🇺🇸' : lang === 'es' ? '🇪🇸' : '🌐';
          lines.push(`│ ${flag} ${lang.toUpperCase().padEnd(6)}: ${count.toString().padStart(8)} packs                                        │`);
        });
    }
    
    lines.push('└─────────────────────────────────────────────────────────────────────────────┘');
    
    lines.forEach(line => info(line));
  }

  /**
   * Exibe detalhes de pack recém-adicionado
   */
  static logPackAdded(packData, stickersCount, bankStats) {
    const lines = [];
    
    lines.push('┌─────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                        ✅ PACK ADICIONADO COM SUCESSO                       │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
    lines.push(`│ 🆔 ID: ${packData.identifier?.padEnd(10) || 'N/A'.padEnd(10)} │ 📝 Nome: ${(packData.name || 'Sem nome').slice(0, 30).padEnd(30)} │`);
    lines.push(`│ 🎯 Figurinhas: ${stickersCount.toString().padStart(6)} ${stickersCount > 0 ? '🎉' : '⚠️ '} │ 🎬 Animado: ${packData.is_animated ? 'Sim ✅' : 'Não ❌'}                │`);
    lines.push(`│ 🌍 Idioma: ${(packData.lang || 'pt').toUpperCase().padEnd(6)} │ 👤 Autor: ${(packData.publisher || 'Desconhecido').slice(0, 25).padEnd(25)} │`);
    lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
    lines.push('│                          📊 TOTAIS NO BANCO AGORA                          │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
    lines.push(`│ 📦 Total Packs: ${bankStats.totalPacks.toString().padStart(8)} │ 🎯 Total Figurinhas: ${bankStats.totalStickers.toString().padStart(12)} │`);
    lines.push(`│ 🎬 Animados:    ${bankStats.animatedPacks.toString().padStart(8)} │ 🖼️  Estáticos:       ${bankStats.staticPacks.toString().padStart(12)} │`);
    lines.push('└─────────────────────────────────────────────────────────────────────────────┘');
    
    lines.forEach(line => info(line));
  }

  /**
   * Exibe progresso de descoberta/processamento
   */
  static logProgress(discovered, processed, queuesInfo) {
    const lines = [];
    
    lines.push('┌─────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                            🚀 PROGRESSO ATUAL                              │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
    lines.push(`│ 🔍 Descobertos: ${discovered.toString().padStart(8)} │ ✅ Processados: ${processed.toString().padStart(8)} │ 📊 Taxa: ${discovered > 0 ? Math.round(processed/discovered*100) : 0}%     │`);
    lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
    lines.push('│                            📋 FILAS ATIVAS                                 │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
    lines.push(`│ 🔍 Discovery: ${(queuesInfo.discovery || 0).toString().padStart(6)} │ ⚡ Light: ${(queuesInfo.light || 0).toString().padStart(6)} │ 🔨 Heavy: ${(queuesInfo.heavy || 0).toString().padStart(6)} │`);
    lines.push('└─────────────────────────────────────────────────────────────────────────────┘');
    
    lines.forEach(line => info(line));
  }

  /**
   * Exibe status do sistema
   */
  static logSystemStatus(uptime, memoryMB, cpuPercent) {
    const uptimeHours = Math.floor(uptime / 3600000);
    const uptimeMinutes = Math.floor((uptime % 3600000) / 60000);
    
    const lines = [];
    
    lines.push('┌─────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                           💻 STATUS DO SISTEMA                             │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
    lines.push(`│ ⏱️  Uptime: ${uptimeHours}h ${uptimeMinutes}m │ 💾 Memória: ${memoryMB}MB │ 🔥 CPU: ${cpuPercent.toFixed(1)}%       │`);
    lines.push('└─────────────────────────────────────────────────────────────────────────────┘');
    
    lines.forEach(line => info(line));
  }

  /**
   * Exibe banner de inicialização
   */
  static logStartupBanner(mode = 'SCRAPER') {
    const lines = [];
    
    lines.push('┌─────────────────────────────────────────────────────────────────────────────┐');
    lines.push('│                     🚀 STICKERS SCRAPER SYSTEM v2.0                       │');
    lines.push('├─────────────────────────────────────────────────────────────────────────────┤');
    lines.push(`│                            Modo: ${mode.padEnd(20)}                       │`);
    lines.push(`│                        Data: ${new Date().toLocaleString('pt-BR').padEnd(20)}                    │`);
    lines.push('└─────────────────────────────────────────────────────────────────────────────┘');
    
    lines.forEach(line => info(line));
  }
}

module.exports = TableLogger;
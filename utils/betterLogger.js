const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs-extra');
const chalk = require('chalk');

// Criar diretório de logs se não existir
const logsDir = path.join(process.cwd(), 'logs');
fs.ensureDirSync(logsDir);

// Formato customizado mais limpo
const cleanFormat = winston.format.printf(({ level, message, timestamp, ...metadata }) => {
  // Ignorar logs muito verbosos
  if (message?.includes('Arquivo baixado com sucesso') && level === 'info') {
    return null; // Não logar downloads individuais
  }
  
  // Simplificar mensagens
  let logMessage = message;
  
  // Adicionar metadados relevantes de forma concisa
  if (metadata && Object.keys(metadata).length > 0) {
    // Filtrar metadados desnecessários
    const { service, stack, ...cleanMeta } = metadata;
    if (Object.keys(cleanMeta).length > 0) {
      logMessage += ` | ${JSON.stringify(cleanMeta)}`;
    }
  }
  
  return logMessage ? `${timestamp} [${level}] ${logMessage}` : null;
});

// Configuração de rotação de arquivos
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logsDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m', // Máximo 10MB por arquivo
  maxFiles: '3d', // Manter apenas 3 dias de logs
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: false }), // Não incluir stack traces completos
    cleanFormat
  )
});

// Logger para console com cores e símbolos
const consoleFormat = winston.format.printf(({ level, message, timestamp }) => {
  const icons = {
    error: '❌',
    warn: '⚠️',
    info: '✓',
    debug: '🔍'
  };
  
  const colors = {
    error: chalk.red,
    warn: chalk.yellow,
    info: chalk.green,
    debug: chalk.gray
  };
  
  const icon = icons[level] || '';
  const colorFn = colors[level] || chalk.white;
  
  // Mensagens especiais com formatação melhor
  if (message?.includes('Pack processado')) {
    return chalk.green.bold(`${icon} Pack processado com sucesso!`);
  }
  
  if (message?.includes('Erro')) {
    return chalk.red(`${icon} ${message}`);
  }
  
  if (message?.includes('stickers para pack')) {
    return chalk.cyan(`📦 ${message}`);
  }
  
  if (message?.includes('Iniciando')) {
    return chalk.blue.bold(`🚀 ${message}`);
  }
  
  return colorFn(`${icon} ${message}`);
});

// Criar logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    fileRotateTransport,
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        consoleFormat
      )
    })
  ]
});

// Função para limpar logs antigos na inicialização
const cleanOldLogs = () => {
  try {
    const files = fs.readdirSync(logsDir);
    const now = Date.now();
    const threeDays = 3 * 24 * 60 * 60 * 1000;
    
    files.forEach(file => {
      const filePath = path.join(logsDir, file);
      const stats = fs.statSync(filePath);
      
      if (now - stats.mtime.getTime() > threeDays) {
        fs.removeSync(filePath);
        console.log(chalk.gray(`Removido log antigo: ${file}`));
      }
    });
  } catch (err) {
    console.error('Erro ao limpar logs antigos:', err);
  }
};

// Limpar logs antigos na inicialização
cleanOldLogs();

// Objeto com funções de log simplificadas
const log = {
  info: (message, meta = {}) => {
    // Filtrar mensagens muito frequentes
    if (message.includes('Baixando arquivo') || 
        message.includes('Analisando arquivo') ||
        message.includes('Processando como')) {
      return; // Não logar estas mensagens repetitivas
    }
    logger.info(message, meta);
  },
  
  error: (message, error = null, meta = {}) => {
    if (error) {
      logger.error(`${message}: ${error.message}`, meta);
    } else {
      logger.error(message, meta);
    }
  },
  
  warn: (message, meta = {}) => {
    logger.warn(message, meta);
  },
  
  debug: (message, meta = {}) => {
    logger.debug(message, meta);
  },
  
  success: (message, meta = {}) => {
    logger.info(`✅ ${message}`, meta);
  },
  
  progress: (current, total, message) => {
    const percent = Math.round((current / total) * 100);
    const progressBar = '█'.repeat(Math.floor(percent / 5)) + '░'.repeat(20 - Math.floor(percent / 5));
    console.log(chalk.cyan(`\r[${progressBar}] ${percent}% - ${message}`));
  },
  
  stats: (stats) => {
    console.log(chalk.magenta.bold('\n📊 Estatísticas da Sessão:'));
    console.log(chalk.white(`   • Packs processados: ${stats.packsProcessed || 0}`));
    console.log(chalk.white(`   • Novos packs: ${stats.newPacks || 0}`));
    console.log(chalk.white(`   • Duplicados evitados: ${stats.duplicatesSkipped || 0}`));
    console.log(chalk.white(`   • Taxa de sucesso: ${stats.successRate || 0}%`));
    console.log(chalk.white(`   • Tempo total: ${stats.duration || '0s'}\n`));
  }
};

module.exports = log;
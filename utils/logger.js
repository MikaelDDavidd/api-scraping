const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { config } = require('../config/config');

// Criar diretório de logs se não existir
const logDir = path.dirname(config.logging.file);
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Configuração do logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'stickers-scraper' },
  transports: [
    // Log para arquivo
    new winston.transports.File({
      filename: config.logging.file,
      maxsize: config.logging.maxSize,
      maxFiles: config.logging.maxFiles,
      tailable: true
    }),
    
    // Log para console em desenvolvimento
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
        winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
          let msg = `${timestamp} [${service}] ${level}: ${message}`;
          
          // Adicionar metadados se existirem
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          if (metaStr) {
            msg += `\n${metaStr}`;
          }
          
          return msg;
        })
      )
    })
  ]
});

// Métodos de conveniência
const logMethods = {
  info: (message, meta = {}) => logger.info(message, meta),
  error: (message, error = null, meta = {}) => {
    const errorMeta = error ? { error: error.message, stack: error.stack, ...meta } : meta;
    logger.error(message, errorMeta);
  },
  warn: (message, meta = {}) => logger.warn(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),
  
  // Log específicos para scraping
  packFound: (packId, packName) => {
    logger.info('Pack encontrado', { packId, packName, event: 'pack_found' });
  },
  
  packProcessed: (packId, stickersCount, success = true) => {
    logger.info('Pack processado', { 
      packId, 
      stickersCount, 
      success, 
      event: 'pack_processed' 
    });
  },
  
  stickerProcessed: (stickerName, packId, success = true) => {
    logger.debug('Sticker processado', { 
      stickerName, 
      packId, 
      success, 
      event: 'sticker_processed' 
    });
  },
  
  uploadSuccess: (fileName, size) => {
    logger.info('Upload realizado com sucesso', { 
      fileName, 
      size, 
      event: 'upload_success' 
    });
  },
  
  uploadError: (fileName, error) => {
    logger.error('Erro no upload', error, { 
      fileName, 
      event: 'upload_error' 
    });
  },
  
  scrapingStart: (locale, totalPacks = null) => {
    logger.info('Iniciando scraping', { 
      locale, 
      totalPacks, 
      event: 'scraping_start' 
    });
  },
  
  scrapingEnd: (locale, processedPacks, successfulPacks) => {
    logger.info('Scraping finalizado', { 
      locale, 
      processedPacks, 
      successfulPacks, 
      event: 'scraping_end' 
    });
  }
};

module.exports = { logger, ...logMethods };
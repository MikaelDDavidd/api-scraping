module.exports = {
  apps: [
    {
      // Aplicação principal - Modo VPS contínuo
      name: 'stickers-scraper-vps',
      script: 'index.js',
      args: 'vps',
      cwd: '/home/ubuntu/stickers-scraper/api-scraping',
      
      // Configurações de execução
      instances: 1, // Apenas 1 instância para evitar conflitos de estado
      exec_mode: 'fork', // Fork mode para aplicações com estado
      
      // Auto-restart
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000, // 5 segundos entre restarts
      
      // Configurações de ambiente
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Recife'
      },
      
      // Logs
      log_file: './logs/pm2-combined.log',
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      
      // Limits de recursos (ajustar conforme VPS)
      max_memory_restart: '1G', // Restart se usar mais de 1GB RAM
      
      // Configurações avançadas
      kill_timeout: 30000, // 30s para graceful shutdown
      listen_timeout: 10000,
      
      // Monitoramento
      monitoring: false, // Desabilitar PM2 Plus por enquanto
      
      // Configurações específicas para scraping
      time: true, // Adicionar timestamp nos logs
      merge_logs: true, // Unificar logs de múltiplas instâncias
      
      // Variáveis de ambiente específicas
      env_production: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info',
        TZ: 'America/Recife'
      }
    },
    
    // Aplicação de teste - Para executar testes periódicos
    {
      name: 'stickers-scraper-test',
      script: 'index.js',
      args: 'test',
      cwd: '/home/ubuntu/stickers-scraper/api-scraping',
      
      // Executar como cron job - não auto-restart
      autorestart: false,
      instances: 1,
      exec_mode: 'fork',
      
      // Logs separados para testes
      log_file: './logs/pm2-test-combined.log',
      out_file: './logs/pm2-test-out.log',
      error_file: './logs/pm2-test-error.log',
      
      env: {
        NODE_ENV: 'development',
        LOG_LEVEL: 'debug'
      }
    },
    
    // Aplicação de estatísticas - Para gerar relatórios
    {
      name: 'stickers-scraper-stats',
      script: 'index.js',
      args: 'stats',
      cwd: '/home/ubuntu/stickers-scraper/api-scraping',
      
      // Não auto-restart (executar sob demanda)
      autorestart: false,
      instances: 1,
      exec_mode: 'fork',
      
      // Logs de estatísticas
      log_file: './logs/pm2-stats-combined.log',
      out_file: './logs/pm2-stats-out.log',
      error_file: './logs/pm2-stats-error.log',
      
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      }
    }
  ],
  
  // Configurações de deploy (opcional)
  deploy: {
    production: {
      user: 'ubuntu',
      host: ['YOUR_VPS_IP'], // Substituir pelo IP da VPS
      ref: 'origin/main',
      repo: 'https://github.com/seu-usuario/seu-repo.git', // Substituir pelo seu repo
      path: '/home/ubuntu/stickers-scraper',
      'post-deploy': 'cd api-scraping && npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': 'apt update && apt install git -y'
    }
  }
};
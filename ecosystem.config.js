module.exports = {
  apps: [
    {
      // Aplicação principal - Sistema Paralelo de Produção
      name: "stickers-parallel-scraper",
      script: "run_parallel_system.js",
      cwd: "/home/ubuntu/api-scraping",

      // Configurações de execução
      instances: 1, // Apenas 1 instância para evitar conflitos de estado
      exec_mode: "fork", // Fork mode para aplicações com estado

      // Auto-restart
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000, // 5 segundos entre restarts

      // Configurações de ambiente
      env: {
        NODE_ENV: "production",
        TZ: "America/Recife",
        ENABLE_PARALLEL_PROCESSING: "true",
        MAX_MEMORY_MB: "700",
        CPU_USAGE_TARGET: "80",
      },

      // Logs
      log_file: "./logs/pm2-combined.log",
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Limits de recursos (ajustar conforme VPS)
      max_memory_restart: "1G", // Restart se usar mais de 1GB RAM

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
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        TZ: "America/Recife",
      },
    },

    {
      // Dashboard de Monitoramento em Tempo Real
      name: "stickers-dashboard",
      script: "dashboard.js",
      cwd: "/home/ubuntu/api-scraping",

      // Configurações de execução
      instances: 1,
      exec_mode: "fork",

      // Auto-restart desabilitado (dashboard é opcional)
      autorestart: false,
      max_restarts: 3,
      restart_delay: 10000,

      // Configurações de ambiente
      env: {
        NODE_ENV: "production",
        TZ: "America/Recife",
        DASHBOARD_MODE: "normal"
      },

      // Logs separados
      log_file: "./logs/pm2-dashboard-combined.log",
      out_file: "./logs/pm2-dashboard-out.log",
      error_file: "./logs/pm2-dashboard-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",

      // Configurações específicas
      kill_timeout: 5000, // Dashboard pode terminar rapidamente
      listen_timeout: 3000,
      time: true,
      merge_logs: true,

      env_demo: {
        NODE_ENV: "development",
        DASHBOARD_MODE: "demo"
      }
    },

    // Aplicação de teste - Para executar testes periódicos
    // {
    //   name: "stickers-scraper-test",
    //   script: "index.js",
    //   args: "test",
    //   cwd: "/home/ubuntu/api-scraping",

    //   // Executar como cron job - não auto-restart
    //   autorestart: false,
    //   instances: 1,
    //   exec_mode: "fork",

    //   // Logs separados para testes
    //   log_file: "./logs/pm2-test-combined.log",
    //   out_file: "./logs/pm2-test-out.log",
    //   error_file: "./logs/pm2-test-error.log",

    //   env: {
    //     NODE_ENV: "development",
    //     LOG_LEVEL: "debug",
    //   },
    // },
  ],

  // Configurações de deploy (opcional)
  deploy: {
    production: {
      user: "ubuntu",
      host: ["YOUR_VPS_IP"], // Substituir pelo IP da VPS
      ref: "origin/main",
      repo: "https://github.com/seu-usuario/seu-repo.git", // Substituir pelo seu repo
      path: "/home/ubuntu/stickers-scraper",
      "post-deploy":
        "cd api-scraping && npm install && pm2 reload ecosystem.config.js --env production",
      "pre-setup": "apt update && apt install git -y",
    },
  },
};

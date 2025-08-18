module.exports = {
  apps: [
    {
      // Sistema Paralelo de Produção - Única instância
      name: "stickers-parallel-production",
      script: "run_parallel_system.js",
      cwd: "/home/ubuntu/api-scraping",

      // Configurações de execução - APENAS 1 INSTÂNCIA
      instances: 1,
      exec_mode: "fork",

      // Auto-restart controlado
      autorestart: true,
      max_restarts: 5, // Reduzido para evitar loops
      min_uptime: "30s", // Mínimo 30s para considerar como started
      restart_delay: 10000, // 10s entre restarts

      // Ambiente de produção Ubuntu
      env: {
        NODE_ENV: "production",
        TZ: "America/Sao_Paulo",
        
        // Configurações de storage para Ubuntu
        USE_LOCAL_STORAGE: "false", // Usar Supabase em produção
        STORAGE_BASE_URL: "http://136.248.96.180",
        
        // Limites para VPS
        MAX_MEMORY_MB: "800",
        MAX_CPU_PERCENT: "75",
        
        // Configurações de scraping
        MAX_CONCURRENT_DISCOVERY: "2",
        MAX_CONCURRENT_LIGHT: "1", 
        MAX_CONCURRENT_HEAVY: "1",
        
        // Evitar testes automáticos
        DISABLE_AUTO_TESTS: "true",
        PRODUCTION_MODE: "true"
      },

      // Logs organizados
      log_file: "/home/ubuntu/api-scraping/logs/production.log",
      out_file: "/home/ubuntu/api-scraping/logs/production-out.log", 
      error_file: "/home/ubuntu/api-scraping/logs/production-error.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      log_type: "json",

      // Controle de recursos
      max_memory_restart: "900M", // Restart se exceder 900MB
      
      // Shutdown graceful
      kill_timeout: 45000, // 45s para parar workers
      wait_ready: true,
      listen_timeout: 15000,

      // Configurações de produção
      node_args: "--max-old-space-size=1024", // Limite de memória Node.js
      time: true,
      merge_logs: false, // Logs separados para debug
      
      // Watch desabilitado (produção)
      watch: false,
      ignore_watch: ["logs", "temp", "stickers*", "test*"],

      // Variáveis específicas por ambiente  
      env_production: {
        NODE_ENV: "production",
        LOG_LEVEL: "info",
        TZ: "America/Sao_Paulo",
        STORAGE_PATH: "/home/ubuntu/stickers"
      }
    },

  ]
};

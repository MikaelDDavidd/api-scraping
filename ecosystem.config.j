module.exports = {
    apps: [{
      name: 'stickers-scraper',
      script: 'index.js',
      args: 'continuous',
      cwd: '/home/ubuntu/api-scraping',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        TZ: 'America/Sao_Paulo'
      },
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
    }]
  };
  EOF

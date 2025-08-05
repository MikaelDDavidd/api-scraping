#!/bin/bash

# Script para deploy do scraper na VPS Oracle Cloud
# Execução: ./deploy-to-vps.sh

set -e

echo "🚀 Iniciando deploy do Stickers Scraper na VPS..."

VPS_USER="ubuntu"
VPS_IP="136.248.96.180"
VPS_PATH="/home/ubuntu/api-scraping"
LOCAL_PATH="$(pwd)"

echo "📋 Configurações:"
echo "   VPS: $VPS_USER@$VPS_IP"
echo "   Caminho VPS: $VPS_PATH"
echo "   Caminho Local: $LOCAL_PATH"

# 1. Criar diretório na VPS se não existir
echo "📁 Criando diretórios na VPS..."
ssh $VPS_USER@$VPS_IP "mkdir -p $VPS_PATH"
ssh $VPS_USER@$VPS_IP "mkdir -p /home/ubuntu/stickers"

# 2. Rsync dos arquivos (excluindo node_modules e logs)
echo "📤 Enviando arquivos para VPS..."
rsync -avz --progress \
  --exclude 'node_modules/' \
  --exclude 'logs/' \
  --exclude 'temp/' \
  --exclude '.git/' \
  --exclude '.env' \
  --exclude 'data_captured/' \
  ./ $VPS_USER@$VPS_IP:$VPS_PATH/

# 3. Configurar .env na VPS
echo "⚙️  Configurando variáveis de ambiente..."
ssh $VPS_USER@$VPS_IP "cd $VPS_PATH && cat > .env << 'EOF'
# Supabase Configuration (para metadados dos packs)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Storage Configuration
SUPABASE_BUCKET_NAME=stickers

# Local Storage Configuration (VPS Mode)
USE_LOCAL_STORAGE=true
LOCAL_STORAGE_PATH=/home/ubuntu/stickers
STORAGE_BASE_URL=http://136.248.96.180

# Scraping Configuration
MAX_PACKS_PER_RUN=100
DELAY_BETWEEN_REQUESTS=1000
MAX_RETRIES=3
MAX_RUNTIME_HOURS=24

# Logging
LOG_LEVEL=info
EOF"

# 4. Instalar dependências
echo "📦 Instalando dependências Node.js..."
ssh $VPS_USER@$VPS_IP "cd $VPS_PATH && npm install --production"

# 5. Instalar PM2 globalmente se não existir
echo "🔧 Configurando PM2..."
ssh $VPS_USER@$VPS_IP "npm list -g pm2 &>/dev/null || sudo npm install -g pm2"

# 6. Configurar PM2 ecosystem
echo "📋 Configurando PM2 ecosystem..."
ssh $VPS_USER@$VPS_IP "cd $VPS_PATH && cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'stickers-scraper',
    script: 'index.js',
    args: 'continuous',
    cwd: '/home/ubuntu/api-scraping',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '2G',
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
EOF"

# 7. Criar diretório de logs
ssh $VPS_USER@$VPS_IP "mkdir -p $VPS_PATH/logs"

# 8. Configurar permissões
echo "🔐 Configurando permissões..."
ssh $VPS_USER@$VPS_IP "chmod +x $VPS_PATH/index.js"
ssh $VPS_USER@$VPS_IP "chown -R ubuntu:ubuntu $VPS_PATH"
ssh $VPS_USER@$VPS_IP "chown -R ubuntu:ubuntu /home/ubuntu/stickers"

# 9. Testar configuração
echo "✅ Testando configuração..."
ssh $VPS_USER@$VPS_IP "cd $VPS_PATH && node index.js help"

echo ""
echo "🎉 Deploy concluído com sucesso!"
echo ""
echo "📋 Próximos passos:"
echo "   1. Configure suas credenciais do Supabase no arquivo .env"
echo "   2. Inicie o scraper: ssh $VPS_USER@$VPS_IP 'cd $VPS_PATH && pm2 start ecosystem.config.js'"
echo "   3. Monitore os logs: ssh $VPS_USER@$VPS_IP 'cd $VPS_PATH && pm2 logs stickers-scraper'"
echo "   4. Acesse os stickers: http://136.248.96.180/stickers/"
echo ""
echo "🚀 Comandos PM2 úteis:"
echo "   pm2 start ecosystem.config.js    # Iniciar"
echo "   pm2 stop stickers-scraper        # Parar"
echo "   pm2 restart stickers-scraper     # Reiniciar"
echo "   pm2 logs stickers-scraper        # Ver logs"
echo "   pm2 monit                        # Monitor em tempo real"
echo "   pm2 save && pm2 startup          # Auto-start no boot"
echo ""
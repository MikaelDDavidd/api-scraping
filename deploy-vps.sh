#!/bin/bash

# Script de deploy para VPS Oracle Cloud
# Execute este script na VPS após fazer upload dos arquivos

set -e

echo "🚀 Iniciando deploy do Stickers Scraper na VPS..."

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para logging
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Verificar se está rodando como root
if [[ $EUID -eq 0 ]]; then
   error "Este script não deve ser executado como root"
   exit 1
fi

# Atualizar sistema
log "Atualizando sistema Ubuntu..."
sudo apt update && sudo apt upgrade -y

# Instalar Node.js 18+
log "Instalando Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

log "Versão do Node.js: $(node --version)"
log "Versão do npm: $(npm --version)"

# Verificar se Sharp pode ser compilado
log "Verificando dependências para Sharp..."
sudo apt-get install -y build-essential libvips-dev

# Instalar dependências do projeto
log "Instalando dependências npm..."
npm install --production

# Verificar se arquivo .env existe
if [ ! -f ".env" ]; then
    warn "Arquivo .env não encontrado!"
    echo "Crie o arquivo .env com as seguintes variáveis:"
    echo "SUPABASE_URL=sua_url_aqui"
    echo "SUPABASE_ANON_KEY=sua_chave_anonima_aqui"
    echo "SUPABASE_SERVICE_KEY=sua_chave_servico_aqui"
    echo "MAX_PACKS_PER_RUN=50"
    echo "DELAY_BETWEEN_REQUESTS=2000"
    echo "MAX_RETRIES=3"
    echo "LOG_LEVEL=info"
    exit 1
fi

# Testar configuração
log "Testando configuração..."
if ! node -e "require('./config/config').validateConfig()"; then
    error "Configuração inválida. Verifique o arquivo .env"
    exit 1
fi

# Criar diretórios necessários
log "Criando diretórios..."
mkdir -p logs temp

# Configurar logrotate
log "Configurando rotação de logs..."
sudo tee /etc/logrotate.d/stickers-scraper > /dev/null <<EOF
/home/ubuntu/stickers-scraper/api-scraping/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        sudo systemctl reload stickers-scraper.service > /dev/null 2>&1 || true
    endscript
}
EOF

# Instalar service systemd
log "Instalando serviço systemd..."
sudo cp stickers-scraper.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable stickers-scraper.service

# Criar script de monitoramento
log "Criando script de monitoramento..."
cat > monitor.sh << 'EOF'
#!/bin/bash

# Script de monitoramento do Stickers Scraper

case "$1" in
    status)
        echo "=== Status do Serviço ==="
        sudo systemctl status stickers-scraper.service --no-pager
        echo ""
        echo "=== Últimas 20 linhas do log ==="
        sudo journalctl -u stickers-scraper.service -n 20 --no-pager
        ;;
    start)
        echo "Iniciando serviço..."
        sudo systemctl start stickers-scraper.service
        ;;
    stop)
        echo "Parando serviço..."
        sudo systemctl stop stickers-scraper.service
        ;;
    restart)
        echo "Reiniciando serviço..."
        sudo systemctl restart stickers-scraper.service
        ;;
    logs)
        echo "=== Logs em tempo real (Ctrl+C para sair) ==="
        sudo journalctl -u stickers-scraper.service -f
        ;;
    test)
        echo "Executando teste..."
        node index.js test
        ;;
    *)
        echo "Uso: $0 {status|start|stop|restart|logs|test}"
        echo ""
        echo "Comandos disponíveis:"
        echo "  status  - Mostra status do serviço e últimos logs"
        echo "  start   - Inicia o serviço"
        echo "  stop    - Para o serviço"
        echo "  restart - Reinicia o serviço"
        echo "  logs    - Mostra logs em tempo real"
        echo "  test    - Executa teste do scraper"
        exit 1
        ;;
esac
EOF

chmod +x monitor.sh

# Teste básico
log "Executando teste básico..."
if node index.js test; then
    log "✅ Teste executado com sucesso!"
else
    error "❌ Teste falhou. Verifique a configuração."
    exit 1
fi

log "🎉 Deploy concluído com sucesso!"
echo ""
echo "=== Próximos passos ==="
echo "1. Iniciar serviço: ./monitor.sh start"
echo "2. Ver status: ./monitor.sh status"
echo "3. Ver logs: ./monitor.sh logs"
echo "4. Parar serviço: ./monitor.sh stop"
echo ""
echo "=== URLs úteis para monitoramento ==="
echo "- Logs do sistema: sudo journalctl -u stickers-scraper.service -f"
echo "- Status: sudo systemctl status stickers-scraper.service"
echo "- Restart: sudo systemctl restart stickers-scraper.service"
echo ""
echo "O serviço irá iniciar automaticamente após reboot da VPS."
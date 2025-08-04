#!/bin/bash

# Script de deploy para VPS Oracle Cloud com PM2
# Execute este script na VPS após fazer upload dos arquivos

set -e

echo "🚀 Iniciando deploy do Stickers Scraper na VPS com PM2..."

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

# Instalar PM2 globalmente
log "Instalando PM2..."
if ! command -v pm2 &> /dev/null; then
    sudo npm install -g pm2
fi

log "Versão do PM2: $(pm2 --version)"

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

# Configurar logrotate para PM2
log "Configurando rotação de logs do PM2..."
sudo tee /etc/logrotate.d/stickers-scraper-pm2 > /dev/null <<EOF
/home/ubuntu/stickers-scraper/api-scraping/logs/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        pm2 reloadLogs > /dev/null 2>&1 || true
    endscript
}
EOF

# Configurar PM2 para auto-start
log "Configurando PM2 para auto-start..."
pm2 startup ubuntu -u ubuntu --hp /home/ubuntu

# Instalar logrotate do PM2
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true

# Criar script de monitoramento PM2
log "Criando script de monitoramento PM2..."
cat > monitor.sh << 'EOF'
#!/bin/bash

# Script de monitoramento do Stickers Scraper com PM2

case "$1" in
    status)
        echo "=== Status dos Processos PM2 ==="
        pm2 status
        echo ""
        echo "=== Informações detalhadas ==="
        pm2 describe stickers-scraper-vps
        ;;
    start)
        echo "Iniciando aplicação principal..."
        pm2 start ecosystem.config.js --only stickers-scraper-vps
        ;;
    stop)
        echo "Parando aplicação principal..."
        pm2 stop stickers-scraper-vps
        ;;
    restart)
        echo "Reiniciando aplicação principal..."
        pm2 restart stickers-scraper-vps
        ;;
    reload)
        echo "Recarregando aplicação (zero downtime)..."
        pm2 reload stickers-scraper-vps
        ;;
    logs)
        echo "=== Logs em tempo real (Ctrl+C para sair) ==="
        pm2 logs stickers-scraper-vps
        ;;
    test)
        echo "Executando teste..."
        pm2 start ecosystem.config.js --only stickers-scraper-test
        sleep 5
        pm2 logs stickers-scraper-test --lines 20
        ;;
    stats)
        echo "Executando relatório de estatísticas..."
        pm2 start ecosystem.config.js --only stickers-scraper-stats
        sleep 3
        pm2 logs stickers-scraper-stats --lines 50
        ;;
    monit)
        echo "Abrindo monitor PM2..."
        pm2 monit
        ;;
    delete)
        echo "Removendo todos os processos..."
        pm2 delete all
        ;;
    deploy)
        echo "Deploy completo..."
        pm2 stop all
        pm2 delete all
        pm2 start ecosystem.config.js
        pm2 save
        ;;
    save)
        echo "Salvando configuração atual..."
        pm2 save
        ;;
    *)
        echo "Uso: $0 {status|start|stop|restart|reload|logs|test|stats|monit|delete|deploy|save}"
        echo ""
        echo "Comandos PM2 disponíveis:"
        echo "  status   - Mostra status de todos os processos"
        echo "  start    - Inicia aplicação principal"
        echo "  stop     - Para aplicação principal"
        echo "  restart  - Reinicia aplicação principal"
        echo "  reload   - Recarrega com zero downtime"
        echo "  logs     - Mostra logs em tempo real"
        echo "  test     - Executa teste do scraper"
        echo "  stats    - Executa relatório de estatísticas"
        echo "  monit    - Abre monitor interativo do PM2"
        echo "  delete   - Remove todos os processos"
        echo "  deploy   - Deploy completo (stop, delete, start)"
        echo "  save     - Salva configuração atual"
        echo ""
        echo "Comandos PM2 diretos úteis:"
        echo "  pm2 list                    - Lista processos"
        echo "  pm2 logs                    - Todos os logs"
        echo "  pm2 flush                   - Limpa logs"
        echo "  pm2 reset <app>             - Reset stats"
        echo "  pm2 show <app>              - Detalhes do app"
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

log "🎉 Deploy com PM2 concluído com sucesso!"
echo ""
echo "=== Próximos passos ==="
echo "1. Deploy completo: ./monitor.sh deploy"
echo "2. Ver status: ./monitor.sh status"
echo "3. Ver logs: ./monitor.sh logs"
echo "4. Monitor interativo: ./monitor.sh monit"
echo "5. Parar serviço: ./monitor.sh stop"
echo ""
echo "=== Comandos PM2 úteis ==="
echo "- Status: pm2 status"
echo "- Logs: pm2 logs"
echo "- Monitor: pm2 monit"
echo "- Restart: pm2 restart all"
echo "- Info detalhada: pm2 show stickers-scraper-vps"
echo ""
echo "=== Auto-start configurado ==="
echo "Execute 'pm2 save' após iniciar os processos para salvar o estado"
echo "Os processos irão iniciar automaticamente após reboot da VPS"
echo ""
echo "=== Aplicações disponíveis ==="
echo "- stickers-scraper-vps: Aplicação principal (contínua)"
echo "- stickers-scraper-test: Executar testes"
echo "- stickers-scraper-stats: Gerar estatísticas"
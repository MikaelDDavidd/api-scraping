#!/bin/bash

# Script com comandos PM2 úteis para o Stickers Scraper
# Este arquivo contém comandos frequentemente usados

echo "🔧 Comandos PM2 para Stickers Scraper"
echo "======================================"

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

cmd() {
    echo -e "${GREEN}$1${NC}"
}

desc() {
    echo -e "${YELLOW}  → $1${NC}"
}

section() {
    echo ""
    echo -e "${BLUE}=== $1 ===${NC}"
}

section "BÁSICOS"
cmd "pm2 start ecosystem.config.js"
desc "Inicia todas as aplicações definidas no ecosystem"

cmd "pm2 start ecosystem.config.js --only stickers-scraper-vps"
desc "Inicia apenas a aplicação principal"

cmd "pm2 stop all"
desc "Para todas as aplicações"

cmd "pm2 restart all"
desc "Reinicia todas as aplicações"

cmd "pm2 delete all"
desc "Remove todas as aplicações"

section "MONITORAMENTO"
cmd "pm2 status"
desc "Lista status de todas as aplicações"

cmd "pm2 monit"
desc "Monitor interativo em tempo real"

cmd "pm2 logs"
desc "Logs de todas as aplicações em tempo real"

cmd "pm2 logs stickers-scraper-vps"
desc "Logs apenas da aplicação principal"

cmd "pm2 logs --lines 100"
desc "Mostra últimas 100 linhas dos logs"

section "INFORMAÇÕES DETALHADAS"
cmd "pm2 show stickers-scraper-vps"
desc "Informações detalhadas da aplicação principal"

cmd "pm2 describe stickers-scraper-vps"
desc "Descrição completa da aplicação"

cmd "pm2 list"
desc "Lista simples de processos"

section "GERENCIAMENTO DE LOGS"
cmd "pm2 flush"
desc "Limpa todos os logs"

cmd "pm2 reloadLogs"
desc "Recarrega arquivos de log"

cmd "pm2 logs --json"
desc "Logs em formato JSON"

section "PERFORMANCE E ESTATÍSTICAS"
cmd "pm2 reset all"
desc "Reseta estatísticas de CPU/memória"

cmd "pm2 reset stickers-scraper-vps"
desc "Reseta estatísticas da aplicação principal"

cmd "pm2 web"
desc "Interface web na porta 9615 (se instalado pm2-web)"

section "PERSISTÊNCIA E AUTO-START"
cmd "pm2 save"
desc "Salva configuração atual para auto-start"

cmd "pm2 resurrect"
desc "Restaura aplicações salvas"

cmd "pm2 unstartup"
desc "Remove auto-start"

cmd "pm2 startup"
desc "Configura auto-start"

section "RECARREGAMENTO ZERO DOWNTIME"
cmd "pm2 reload all"
desc "Recarga todas as apps sem downtime"

cmd "pm2 reload stickers-scraper-vps"
desc "Recarga app principal sem downtime"

cmd "pm2 gracefulReload all"
desc "Recarga graceful de todas as apps"

section "DEBUGGING"
cmd "pm2 logs --err"
desc "Apenas logs de erro"

cmd "pm2 logs --out"
desc "Apenas logs de output"

cmd "pm2 logs stickers-scraper-vps --timestamp"
desc "Logs com timestamp"

cmd "pm2 prettylist"
desc "Lista formatada e colorida"

section "CONFIGURAÇÃO AVANÇADA"
cmd "pm2 set pm2-logrotate:max_size 10M"
desc "Configura tamanho máximo dos logs"

cmd "pm2 set pm2-logrotate:retain 30"
desc "Mantém 30 arquivos de log rotacionados"

cmd "pm2 install pm2-logrotate"
desc "Instala módulo de rotação de logs"

cmd "pm2 install pm2-auto-pull"
desc "Instala auto-pull do Git"

section "COMANDOS ÚTEIS PARA PRODUÇÃO"
cmd "./monitor.sh deploy"
desc "Deploy completo (stop, delete, start, save)"

cmd "./monitor.sh status"
desc "Status detalhado via script personalizado"

cmd "./monitor.sh monit"
desc "Monitor via script personalizado"

cmd "pm2 start ecosystem.config.js --env production"
desc "Inicia com variáveis de produção"

section "TROUBLESHOOTING"
cmd "pm2 kill"
desc "Mata daemon PM2 (usar apenas em emergência)"

cmd "pm2 update"
desc "Atualiza daemon PM2"

cmd "pm2 ping"
desc "Testa se daemon PM2 está respondendo"

cmd "pm2 --help"
desc "Ajuda completa do PM2"

echo ""
echo -e "${BLUE}💡 DICA: Use './monitor.sh' para comandos simplificados${NC}"
echo -e "${BLUE}📚 Docs: https://pm2.keymetrics.io/docs/usage/quick-start/${NC}"
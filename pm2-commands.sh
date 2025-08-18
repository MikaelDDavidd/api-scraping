#!/bin/bash

# Comandos PM2 para Produção - Sistema Paralelo de Stickers
# IMPORTANTE: Usar APENAS estes comandos para evitar múltiplas instâncias

echo "🚀 Comandos PM2 para Produção Ubuntu"
echo "===================================="

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
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

warning() {
    echo -e "${RED}⚠️ $1${NC}"
}

# Comandos principais recomendados
section "COMANDOS RECOMENDADOS (usar estes)"
cmd "./pm2-production.sh start"
desc "Iniciar aplicação de produção (RECOMENDADO)"

cmd "./pm2-production.sh stop"
desc "Parar aplicação"

cmd "./pm2-production.sh restart"
desc "Reiniciar aplicação"

cmd "./pm2-production.sh status"
desc "Ver status detalhado"

cmd "./pm2-production.sh logs"
desc "Ver logs em tempo real"

cmd "./pm2-production.sh deploy"
desc "Deploy completo (git pull + restart)"

section "COMANDOS PM2 BÁSICOS"
cmd "pm2 list"
desc "Lista processos rodando"

cmd "pm2 info stickers-parallel-production"
desc "Informações detalhadas da aplicação"

cmd "pm2 restart stickers-parallel-production"
desc "Reiniciar aplicação específica"

cmd "pm2 stop stickers-parallel-production"
desc "Parar aplicação específica"

cmd "pm2 delete stickers-parallel-production"
desc "Remover aplicação"

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

section "LOGS E DEBUG"
cmd "pm2 logs stickers-parallel-production"
desc "Logs da aplicação em tempo real"

cmd "pm2 logs stickers-parallel-production --lines 50"
desc "Últimas 50 linhas dos logs"

cmd "pm2 flush"
desc "Limpar todos os logs"

cmd "tail -f /home/ubuntu/api-scraping/logs/production.log"
desc "Ver log de arquivo diretamente"

cmd "tail -f /home/ubuntu/api-scraping/logs/production-error.log"
desc "Ver apenas erros"

section "CONFIGURAÇÃO E PERSISTÊNCIA"
cmd "pm2 save"
desc "Salvar configuração atual"

cmd "pm2 startup systemd -u ubuntu --hp /home/ubuntu"
desc "Configurar auto-start no boot"

cmd "pm2 resurrect"
desc "Restaurar aplicações salvas"

section "DEPLOY E ATUALIZAÇÃO"
cmd "cd /home/ubuntu/api-scraping && git pull origin main"
desc "Atualizar código do Git"

cmd "npm install --production"
desc "Instalar dependências"

cmd "./pm2-production.sh deploy"
desc "Deploy completo automatizado"

section "TROUBLESHOOTING"
cmd "pm2 kill"
desc "Matar daemon PM2 (EMERGÊNCIA)"

cmd "pm2 ping"
desc "Testar se PM2 está respondendo"

cmd "htop"
desc "Ver uso de CPU/memória do sistema"

cmd "df -h"
desc "Ver espaço em disco"

section "AVISOS IMPORTANTES"
warning "NÃO USAR: pm2 start run_parallel_system.js (cria duplicatas)"
warning "NÃO USAR: npm start (não é para produção)"
warning "NÃO USAR: node run_parallel_system.js (sem PM2)"
warning "SEMPRE usar apenas 1 instância!"

echo ""
echo -e "${BLUE}📁 Figurinhas salvas em: /home/ubuntu/stickers/${NC}"
echo -e "${BLUE}📝 Logs em: /home/ubuntu/api-scraping/logs/${NC}"
echo -e "${GREEN}✅ Use './pm2-production.sh start' para produção${NC}"
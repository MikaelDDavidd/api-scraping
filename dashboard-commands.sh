#!/bin/bash

# Script de comandos rápidos para o Dashboard de Monitoramento
# Execute com: ./dashboard-commands.sh [comando]

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

show_help() {
    echo ""
    echo -e "${BLUE}🚀 Dashboard de Monitoramento - Comandos Rápidos${NC}"
    echo -e "${BLUE}=================================================${NC}"
    echo ""
    echo -e "${GREEN}Comandos disponíveis:${NC}"
    echo ""
    echo -e "${YELLOW}  start${NC}     - Inicia dashboard via PM2"
    echo -e "${YELLOW}  start-demo${NC} - Inicia dashboard em modo demonstração via PM2" 
    echo -e "${YELLOW}  stop${NC}      - Para dashboard PM2"
    echo -e "${YELLOW}  restart${NC}   - Reinicia dashboard PM2"
    echo -e "${YELLOW}  logs${NC}      - Mostra logs do dashboard"
    echo -e "${YELLOW}  status${NC}    - Status do dashboard no PM2"
    echo ""
    echo -e "${YELLOW}  demo${NC}      - Executa dashboard localmente em modo demo"
    echo -e "${YELLOW}  test${NC}      - Testa dashboard localmente"
    echo ""
    echo -e "${YELLOW}  help${NC}      - Mostra esta ajuda"
    echo ""
    echo -e "${GREEN}Exemplos:${NC}"
    echo -e "  ${YELLOW}./dashboard-commands.sh start${NC}     # Inicia via PM2"
    echo -e "  ${YELLOW}./dashboard-commands.sh demo${NC}      # Modo demo local"
    echo -e "  ${YELLOW}./dashboard-commands.sh logs${NC}      # Ver logs"
    echo ""
}

case "$1" in
    "start")
        echo -e "${GREEN}🚀 Iniciando dashboard via PM2...${NC}"
        pm2 start ecosystem.config.js --only stickers-dashboard
        echo -e "${GREEN}✅ Dashboard iniciado!${NC}"
        echo -e "${YELLOW}💡 Use 'pm2 logs stickers-dashboard' para ver logs${NC}"
        ;;
    
    "start-demo")
        echo -e "${GREEN}🚀 Iniciando dashboard em modo demo via PM2...${NC}"
        pm2 start ecosystem.config.js --only stickers-dashboard --env demo
        echo -e "${GREEN}✅ Dashboard demo iniciado!${NC}"
        echo -e "${YELLOW}💡 Use 'pm2 logs stickers-dashboard' para ver logs${NC}"
        ;;
    
    "stop")
        echo -e "${YELLOW}🛑 Parando dashboard...${NC}"
        pm2 stop stickers-dashboard
        echo -e "${GREEN}✅ Dashboard parado!${NC}"
        ;;
    
    "restart")
        echo -e "${YELLOW}🔄 Reiniciando dashboard...${NC}"
        pm2 restart stickers-dashboard
        echo -e "${GREEN}✅ Dashboard reiniciado!${NC}"
        ;;
    
    "logs")
        echo -e "${BLUE}📋 Logs do dashboard (Ctrl+C para sair):${NC}"
        pm2 logs stickers-dashboard
        ;;
    
    "status")
        echo -e "${BLUE}📊 Status do dashboard:${NC}"
        pm2 status stickers-dashboard
        ;;
    
    "demo")
        echo -e "${GREEN}🚀 Executando dashboard em modo demo...${NC}"
        echo -e "${YELLOW}💡 Pressione Ctrl+C ou ESC para sair${NC}"
        echo ""
        node dashboard.js --demo
        ;;
    
    "test")
        echo -e "${GREEN}🧪 Testando dashboard...${NC}"
        echo -e "${YELLOW}💡 Pressione Ctrl+C para parar${NC}"
        echo ""
        node dashboard.js
        ;;
    
    "help"|"--help"|"-h"|"")
        show_help
        ;;
    
    *)
        echo -e "${RED}❌ Comando inválido: $1${NC}"
        echo -e "${YELLOW}💡 Use './dashboard-commands.sh help' para ver comandos disponíveis${NC}"
        exit 1
        ;;
esac
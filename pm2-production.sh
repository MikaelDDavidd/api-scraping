#!/bin/bash

# Script de gerenciamento PM2 para produção Ubuntu
# Uso: ./pm2-production.sh [start|stop|restart|status|logs|deploy]

set -e

# Configurações
APP_NAME="stickers-parallel-production"
PM2_CONFIG="ecosystem.config.js"
LOG_DIR="/home/ubuntu/api-scraping/logs"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para logs coloridos
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Verificar se está rodando no Ubuntu
check_environment() {
    if [[ ! -f "/home/ubuntu/api-scraping/$PM2_CONFIG" ]]; then
        log_error "Este script deve ser executado no servidor Ubuntu em /home/ubuntu/api-scraping/"
        exit 1
    fi
    
    # Criar diretório de logs se não existir
    mkdir -p "$LOG_DIR"
    log_info "Diretório de logs verificado: $LOG_DIR"
}

# Verificar dependências
check_dependencies() {
    if ! command -v pm2 &> /dev/null; then
        log_error "PM2 não está instalado. Instale com: npm install -g pm2"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        log_error "Node.js não está instalado"
        exit 1
    fi
    
    log_info "Dependências verificadas ✓"
}

# Iniciar aplicação
start_app() {
    log_info "Iniciando aplicação de produção..."
    
    # Parar se já estiver rodando
    pm2 delete "$APP_NAME" 2>/dev/null || true
    
    # Iniciar com configuração de produção
    pm2 start "$PM2_CONFIG" --env production
    
    # Salvar configuração
    pm2 save
    
    # Configurar auto-start no boot
    pm2 startup systemd -u ubuntu --hp /home/ubuntu 2>/dev/null || true
    
    log_success "Aplicação iniciada: $APP_NAME"
    show_status
}

# Parar aplicação
stop_app() {
    log_info "Parando aplicação..."
    
    pm2 stop "$APP_NAME" 2>/dev/null || {
        log_warning "Aplicação não estava rodando"
        return 0
    }
    
    pm2 delete "$APP_NAME"
    pm2 save
    
    log_success "Aplicação parada"
}

# Reiniciar aplicação
restart_app() {
    log_info "Reiniciando aplicação..."
    
    pm2 restart "$APP_NAME" 2>/dev/null || {
        log_warning "Aplicação não estava rodando, iniciando..."
        start_app
        return 0
    }
    
    log_success "Aplicação reiniciada"
    show_status
}

# Mostrar status
show_status() {
    log_info "Status da aplicação:"
    echo ""
    pm2 list
    echo ""
    pm2 info "$APP_NAME" 2>/dev/null || log_warning "Aplicação não encontrada"
}

# Mostrar logs
show_logs() {
    log_info "Logs da aplicação (use Ctrl+C para sair):"
    pm2 logs "$APP_NAME"
}

# Deploy completo
deploy_app() {
    log_info "Iniciando deploy completo..."
    
    # Atualizar código (assumindo que já foi feito git pull)
    log_info "Instalando dependências..."
    npm install --production
    
    # Parar aplicação antiga
    stop_app
    
    # Limpar logs antigos (manter últimos 7 dias)
    find "$LOG_DIR" -name "*.log" -mtime +7 -delete 2>/dev/null || true
    log_info "Logs antigos limpos"
    
    # Iniciar nova versão
    start_app
    
    # Verificar se está funcionando
    sleep 10
    if pm2 list | grep -q "$APP_NAME.*online"; then
        log_success "Deploy concluído com sucesso!"
    else
        log_error "Deploy falhou - aplicação não está online"
        show_logs
        exit 1
    fi
}

# Função principal
main() {
    check_environment
    check_dependencies
    
    case "${1:-help}" in
        start)
            start_app
            ;;
        stop)
            stop_app
            ;;
        restart)
            restart_app
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        deploy)
            deploy_app
            ;;
        help|*)
            echo "Uso: $0 [start|stop|restart|status|logs|deploy]"
            echo ""
            echo "Comandos:"
            echo "  start   - Inicia a aplicação de produção"
            echo "  stop    - Para a aplicação"
            echo "  restart - Reinicia a aplicação" 
            echo "  status  - Mostra status atual"
            echo "  logs    - Mostra logs em tempo real"
            echo "  deploy  - Deploy completo (stop + update + start)"
            echo ""
            echo "Aplicação: $APP_NAME"
            echo "Configuração: $PM2_CONFIG"
            echo "Logs: $LOG_DIR"
            ;;
    esac
}

# Executar função principal com todos os argumentos
main "$@"
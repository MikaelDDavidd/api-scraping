#!/bin/bash

# Script de deploy com Docker para VPS
# Execute este script na VPS após fazer upload dos arquivos

set -e

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

info() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')] INFO: $1${NC}"
}

# Verificar se Docker está instalado
check_docker() {
    if ! command -v docker &> /dev/null; then
        log "Docker não encontrado. Instalando Docker..."
        
        # Instalar Docker
        curl -fsSL https://get.docker.com | sh
        
        # Adicionar usuário ao grupo docker
        sudo usermod -aG docker $USER
        
        log "Docker instalado. Por favor, faça logout e login novamente para aplicar as permissões."
        log "Depois execute este script novamente."
        exit 0
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        log "Docker Compose não encontrado. Instalando..."
        
        # Instalar Docker Compose
        sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
        sudo chmod +x /usr/local/bin/docker-compose
        
        log "Docker Compose instalado."
    fi
    
    info "Docker version: $(docker --version)"
    info "Docker Compose version: $(docker-compose --version)"
}

# Verificar arquivo .env
check_env() {
    if [ ! -f ".env" ]; then
        error "Arquivo .env não encontrado!"
        echo "Crie o arquivo .env com as seguintes variáveis:"
        echo ""
        echo "SUPABASE_URL=sua_url_aqui"
        echo "SUPABASE_ANON_KEY=sua_chave_anonima_aqui"
        echo "SUPABASE_SERVICE_KEY=sua_chave_servico_aqui"
        echo "MAX_PACKS_PER_RUN=50"
        echo "DELAY_BETWEEN_REQUESTS=2000"
        echo "MAX_RETRIES=3"
        echo "LOG_LEVEL=info"
        echo ""
        exit 1
    fi
    log "Arquivo .env encontrado ✓"
}

# Criar diretórios necessários
create_directories() {
    log "Criando diretórios necessários..."
    mkdir -p logs data_captured temp
    chmod 755 logs data_captured temp
    log "Diretórios criados ✓"
}

# Build da imagem Docker
build_image() {
    log "Construindo imagem Docker..."
    docker-compose build --no-cache
    log "Imagem construída com sucesso ✓"
}

# Comandos principais
case "$1" in
    start)
        log "Iniciando aplicação..."
        docker-compose up -d
        log "Aplicação iniciada ✓"
        docker-compose ps
        ;;
        
    stop)
        log "Parando aplicação..."
        docker-compose down
        log "Aplicação parada ✓"
        ;;
        
    restart)
        log "Reiniciando aplicação..."
        docker-compose restart
        log "Aplicação reiniciada ✓"
        ;;
        
    logs)
        info "Mostrando logs (Ctrl+C para sair)..."
        docker-compose logs -f --tail=100
        ;;
        
    status)
        info "Status dos containers:"
        docker-compose ps
        echo ""
        info "Uso de recursos:"
        docker stats --no-stream
        ;;
        
    build)
        build_image
        ;;
        
    deploy)
        log "Iniciando deploy completo..."
        check_docker
        check_env
        create_directories
        
        # Parar containers existentes
        if [ $(docker-compose ps -q | wc -l) -gt 0 ]; then
            log "Parando containers existentes..."
            docker-compose down
        fi
        
        # Build e start
        build_image
        
        log "Iniciando aplicação..."
        docker-compose up -d
        
        # Verificar se está rodando
        sleep 5
        if [ $(docker-compose ps | grep "Up" | wc -l) -gt 0 ]; then
            log "✅ Deploy concluído com sucesso!"
            docker-compose ps
        else
            error "❌ Falha ao iniciar containers"
            docker-compose logs --tail=50
            exit 1
        fi
        ;;
        
    test)
        log "Executando teste..."
        docker-compose run --rm stickers-scraper node index.js test
        ;;
        
    stats)
        log "Gerando estatísticas..."
        docker-compose --profile stats up stickers-scraper-stats
        ;;
        
    shell)
        info "Abrindo shell no container..."
        docker-compose exec stickers-scraper sh
        ;;
        
    clean)
        warn "Limpando containers, imagens e volumes..."
        read -p "Tem certeza? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker-compose down -v --rmi all
            log "Limpeza concluída ✓"
        else
            log "Operação cancelada"
        fi
        ;;
        
    *)
        echo "Uso: $0 {deploy|start|stop|restart|logs|status|build|test|stats|shell|clean}"
        echo ""
        echo "Comandos disponíveis:"
        echo "  deploy   - Deploy completo (build + start)"
        echo "  start    - Iniciar containers"
        echo "  stop     - Parar containers"
        echo "  restart  - Reiniciar containers"
        echo "  logs     - Ver logs em tempo real"
        echo "  status   - Status dos containers"
        echo "  build    - Apenas construir imagem"
        echo "  test     - Executar modo teste"
        echo "  stats    - Gerar estatísticas"
        echo "  shell    - Abrir shell no container"
        echo "  clean    - Limpar tudo (containers, imagens, volumes)"
        echo ""
        echo "Exemplos:"
        echo "  $0 deploy    # Deploy inicial"
        echo "  $0 logs      # Ver logs"
        echo "  $0 restart   # Reiniciar aplicação"
        exit 1
        ;;
esac

exit 0
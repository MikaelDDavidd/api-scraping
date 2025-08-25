#!/bin/bash

# SCRIPT PARA PARAR SISTEMA DOCKER
# Para todos os serviços e mostra estatísticas finais

echo "🛑 PARANDO Sistema de Stickers Docker"
echo "====================================="

# Detectar modo
if [ -d "/home/ubuntu" ]; then
    MODE="production"
    echo "🌐 Modo: PRODUÇÃO"
    COMPOSE_FILE="docker-compose.yml"
    COMPOSE_CMD="docker-compose"
else
    MODE="development"
    echo "🔧 Modo: DESENVOLVIMENTO"
    COMPOSE_FILE="docker-compose.dev.yml"
    COMPOSE_CMD="docker-compose -f docker-compose.dev.yml --profile dev"
fi

echo ""
echo "📊 Estatísticas finais antes de parar..."

# Mostrar estatísticas da fila
if [ -f "discovered_packs.json" ]; then
    QUEUE_SIZE=$(jq '.totalPacks // 0' discovered_packs.json 2>/dev/null || echo "0")
    echo "📦 Packs restantes na fila: $QUEUE_SIZE"
fi

# Mostrar estatísticas de processamento
if [ -f "processed_packs.json" ]; then
    PROCESSED=$(jq '.totalProcessedThisSession // 0' processed_packs.json 2>/dev/null || echo "0")
    echo "✅ Total processado nesta sessão: $PROCESSED"
fi

echo ""
echo "🔄 Parando containers..."

# Parar e remover containers
eval "$COMPOSE_CMD down"

echo ""
echo "🧹 Limpeza opcional..."
echo "Deseja remover também as imagens? (isso força rebuild na próxima execução)"
read -p "Remover imagens Docker? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🗑️  Removendo imagens..."
    docker rmi stickers-scraper:latest 2>/dev/null || echo "Imagem não encontrada"
    docker system prune -f
    echo "✅ Limpeza completa"
else
    echo "⏭️  Mantendo imagens para próxima execução"
fi

echo ""
echo "📋 DADOS PRESERVADOS:"
if [ "$MODE" = "production" ]; then
    echo "   📁 Stickers: /home/ubuntu/stickers/"
    echo "   📋 Fila: /home/ubuntu/stickers-queue/"
    echo "   📄 Logs: /home/ubuntu/stickers-logs/"
else
    echo "   📁 Stickers: ./stickers_dev/"
    echo "   📋 Fila e estado: ./"
    echo "   📄 Logs: ./data_captured/"
fi

echo ""
echo "🔄 Para reiniciar o sistema:"
echo "   ./docker-deploy.sh"

echo ""
echo "✅ Sistema parado com sucesso!"
#!/bin/bash

# SCRIPT DE DEPLOY DOCKER
# Automatiza o deploy completo do sistema de stickers

set -e

echo "🐳 DOCKER DEPLOY - Sistema de Stickers"
echo "======================================"

# Verificar se está na VPS ou local
if [ -d "/home/ubuntu" ]; then
    MODE="production"
    echo "🌐 Modo: PRODUÇÃO (VPS)"
else
    MODE="development"
    echo "🔧 Modo: DESENVOLVIMENTO"
fi

# Verificar Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker não encontrado!"
    echo "Instale Docker: https://docs.docker.com/engine/install/"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose não encontrado!"
    echo "Instale Docker Compose: https://docs.docker.com/compose/install/"
    exit 1
fi

# Verificar arquivo .env
if [ ! -f ".env" ]; then
    echo "❌ Arquivo .env não encontrado!"
    echo "Copie .env_simple para .env e configure suas credenciais Supabase"
    exit 1
fi

echo ""
echo "🔍 Verificando credenciais Supabase..."
source .env
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_KEY" ]; then
    echo "❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados no .env"
    exit 1
fi
echo "✅ Credenciais Supabase OK"

echo ""
echo "📁 Preparando diretórios..."

if [ "$MODE" = "production" ]; then
    # Criar diretórios na VPS
    sudo mkdir -p /home/ubuntu/stickers
    sudo mkdir -p /home/ubuntu/stickers-queue  
    sudo mkdir -p /home/ubuntu/stickers-logs
    
    # Dar permissões adequadas
    sudo chown -R $USER:$USER /home/ubuntu/stickers*
    
    echo "✅ Diretórios de produção criados"
else
    # Criar diretórios locais
    mkdir -p ./stickers_dev
    mkdir -p ./data_captured
    
    echo "✅ Diretórios de desenvolvimento criados"
fi

echo ""
echo "🏗️  Construindo imagem Docker..."
docker build -t stickers-scraper:latest .

echo ""
echo "🚀 Iniciando serviços..."

if [ "$MODE" = "production" ]; then
    echo "📦 Subindo stack de produção..."
    echo "   - 1x Discovery Service"
    echo "   - 3x Processor Services"
    echo "   - 1x Web Monitor (porta 3000)"
    
    # Parar serviços existentes
    docker-compose down 2>/dev/null || true
    
    # Subir serviços de produção
    docker-compose up -d
    
    echo ""
    echo "✅ DEPLOY CONCLUÍDO!"
    echo ""
    echo "📊 Monitor Web: http://$(curl -s ifconfig.me):3000"
    echo "🔍 Discovery Service: stickers-discovery"
    echo "🔧 Processor Services: stickers-processor-1, stickers-processor-2, stickers-processor-3"
    echo ""
    echo "📋 Comandos úteis:"
    echo "   docker-compose logs -f discovery     # Logs do discovery"
    echo "   docker-compose logs -f processor-1   # Logs do processor 1"
    echo "   docker-compose ps                    # Status dos containers"
    echo "   docker-compose down                  # Parar todos os serviços"
    
else
    echo "📦 Subindo stack de desenvolvimento..."
    echo "   - 1x Discovery Service"  
    echo "   - 2x Processor Services"
    echo "   - 1x Web Monitor (porta 3001)"
    
    # Parar serviços existentes
    docker-compose -f docker-compose.dev.yml --profile dev down 2>/dev/null || true
    
    # Subir serviços de desenvolvimento
    docker-compose -f docker-compose.dev.yml --profile dev up -d
    
    echo ""
    echo "✅ DEPLOY CONCLUÍDO!"
    echo ""
    echo "📊 Monitor Web: http://localhost:3001"
    echo "📁 Stickers salvos em: ./stickers_dev/"
    echo ""
    echo "📋 Comandos úteis:"
    echo "   docker-compose -f docker-compose.dev.yml --profile dev logs -f"
    echo "   docker-compose -f docker-compose.dev.yml --profile dev ps"
    echo "   docker-compose -f docker-compose.dev.yml --profile dev down"
fi

echo ""
echo "⚠️  IMPORTANTE:"
echo "   - O Discovery Service pode demorar alguns minutos para carregar o cache inicial"
echo "   - Os Processor Services só começam a trabalhar quando há packs na fila"
echo "   - Use o Monitor Web para acompanhar o progresso em tempo real"
echo ""
echo "🎉 Sistema iniciado com sucesso!"
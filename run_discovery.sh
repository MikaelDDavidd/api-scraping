#!/bin/bash

# SCRIPT PARA EXECUTAR DISCOVERY SERVICE
# Executa em 1 instância apenas - busca contínua por packs novos

echo "🔍 Iniciando Discovery Service..."
echo "📋 Este serviço busca continuamente por packs novos"
echo "⚠️  Execute apenas 1 instância deste serviço"
echo ""

# Verificar se já está rodando
if pgrep -f "discovery_service.js" > /dev/null; then
    echo "⚠️  Discovery Service já está rodando!"
    echo "PID: $(pgrep -f 'discovery_service.js')"
    exit 1
fi

# Verificar .env
if [ ! -f ".env" ]; then
    echo "❌ Arquivo .env não encontrado!"
    echo "Copie .env_simple para .env e configure suas credenciais"
    exit 1
fi

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js não encontrado!"
    exit 1
fi

# Criar diretórios necessários
mkdir -p data_captured
mkdir -p stickers_dev

echo "🚀 Iniciando Discovery Service..."
echo "Pressione Ctrl+C para parar"
echo ""

# Executar discovery service
NODE_ENV=${NODE_ENV:-development} node discovery_service.js
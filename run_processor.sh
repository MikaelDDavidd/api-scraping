#!/bin/bash

# SCRIPT PARA EXECUTAR PROCESSOR SERVICE
# Pode executar múltiplas instâncias - processa packs da fila

echo "🔧 Iniciando Processor Service..."
echo "📦 Este serviço processa packs da fila descoberta"
echo "✅ Pode executar múltiplas instâncias simultaneamente"
echo ""

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

# Verificar se existe fila
if [ ! -f "discovered_packs.json" ]; then
    echo "⚠️  Arquivo discovered_packs.json não encontrado"
    echo "Execute primeiro o Discovery Service para popular a fila"
    echo ""
    echo "Para executar Discovery: ./run_discovery.sh"
    echo ""
    read -p "Continuar mesmo assim? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Criar diretórios necessários
mkdir -p data_captured
mkdir -p stickers_dev

# Detectar instância (para logs)
INSTANCE_ID=${1:-$(date +%s)}

echo "🚀 Iniciando Processor Service (Instância: $INSTANCE_ID)"
echo "Pressione Ctrl+C para parar"
echo ""

# Executar processor service
NODE_ENV=${NODE_ENV:-development} node processor_service.js
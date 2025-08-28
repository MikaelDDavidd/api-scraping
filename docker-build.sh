#!/bin/bash

# Script otimizado para build do Docker na VPS

set -e

echo "🚀 Build otimizado do Docker"

# Limpar arquivos desnecessários antes do build
echo "🧹 Limpando arquivos desnecessários..."
rm -rf node_modules
rm -rf exploration_results
rm -rf data_captured
rm -rf logs/*.log
rm -rf temp/*

# Verificar tamanho do contexto
echo "📦 Tamanho do contexto de build:"
du -sh . | cut -f1

# Build com cache e otimizações
echo "🔨 Iniciando build..."
docker compose build --no-cache --progress=plain

echo "✅ Build concluído!"
echo ""
echo "Para iniciar:"
echo "  docker compose up -d"
echo ""
echo "Para ver logs:"
echo "  docker compose logs -f"
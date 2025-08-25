#!/bin/bash

# MONITOR DO SISTEMA DE DESCOBERTA E PROCESSAMENTO
# Mostra estatísticas e status dos serviços

clear
echo "📊 MONITOR - Sistema de Descoberta e Processamento"
echo "=================================================="
echo ""

# Função para formatar números
format_number() {
    echo "$1" | sed ':a;s/\B[0-9]\{3\}\>/,&/;ta'
}

# Verificar se arquivos existem
QUEUE_FILE="discovered_packs.json"
PROCESSED_FILE="processed_packs.json"
STATE_FILE="discovery_state.json"

echo "🔍 STATUS DOS SERVIÇOS"
echo "----------------------"

# Discovery Service
if pgrep -f "discovery_service.js" > /dev/null; then
    DISCOVERY_PID=$(pgrep -f "discovery_service.js")
    echo "✅ Discovery Service: RODANDO (PID: $DISCOVERY_PID)"
else
    echo "❌ Discovery Service: PARADO"
fi

# Processor Services
PROCESSOR_PIDS=$(pgrep -f "processor_service.js")
if [ ! -z "$PROCESSOR_PIDS" ]; then
    PROCESSOR_COUNT=$(echo "$PROCESSOR_PIDS" | wc -l)
    echo "✅ Processor Services: $PROCESSOR_COUNT instância(s) rodando"
    echo "   PIDs: $PROCESSOR_PIDS"
else
    echo "❌ Processor Services: PARADOS"
fi

echo ""
echo "📋 ESTATÍSTICAS DA FILA"
echo "------------------------"

if [ -f "$QUEUE_FILE" ]; then
    QUEUE_SIZE=$(jq '.totalPacks // 0' "$QUEUE_FILE" 2>/dev/null || echo "0")
    LAST_UPDATED=$(jq -r '.lastUpdated // "N/A"' "$QUEUE_FILE" 2>/dev/null || echo "N/A")
    echo "📦 Packs na fila: $(format_number $QUEUE_SIZE)"
    echo "🕒 Última atualização: $LAST_UPDATED"
else
    echo "⚠️  Arquivo de fila não encontrado"
fi

echo ""
echo "🔍 STATUS DA DESCOBERTA"
echo "-----------------------"

if [ -f "$STATE_FILE" ]; then
    CURRENT_KEYWORD=$(jq -r '.currentKeywordIndex // 0' "$STATE_FILE" 2>/dev/null || echo "0")
    CURRENT_PAGE=$(jq -r '.currentPage // 0' "$STATE_FILE" 2>/dev/null || echo "0")
    TOTAL_DISCOVERED=$(jq -r '.totalDiscovered // 0' "$STATE_FILE" 2>/dev/null || echo "0")
    
    echo "🔤 Keyword atual: #$CURRENT_KEYWORD (página $CURRENT_PAGE)"
    echo "📈 Total descoberto: $(format_number $TOTAL_DISCOVERED)"
else
    echo "⚠️  Estado da descoberta não encontrado"
fi

echo ""
echo "📊 ESTATÍSTICAS DE PROCESSAMENTO"
echo "--------------------------------"

if [ -f "$PROCESSED_FILE" ]; then
    TOTAL_PROCESSED=$(jq '.totalProcessedThisSession // 0' "$PROCESSED_FILE" 2>/dev/null || echo "0")
    LAST_PROCESSED=$(jq -r '.lastUpdated // "N/A"' "$PROCESSED_FILE" 2>/dev/null || echo "N/A")
    
    # Contar sucessos e falhas
    SUCCESSES=$(jq '[.processed[] | select(.success == true)] | length' "$PROCESSED_FILE" 2>/dev/null || echo "0")
    FAILURES=$(jq '[.processed[] | select(.success == false)] | length' "$PROCESSED_FILE" 2>/dev/null || echo "0")
    
    echo "✅ Total processado: $(format_number $TOTAL_PROCESSED)"
    echo "🎯 Sucessos: $(format_number $SUCCESSES)"
    echo "❌ Falhas: $(format_number $FAILURES)"
    echo "🕒 Último processamento: $LAST_PROCESSED"
else
    echo "⚠️  Estatísticas de processamento não encontradas"
fi

echo ""
echo "💾 ARMAZENAMENTO"
echo "----------------"

# Verificar diretório de stickers
if [ -d "stickers_dev" ]; then
    PACKS_COUNT=$(ls -1 stickers_dev 2>/dev/null | wc -l)
    DISK_USAGE=$(du -sh stickers_dev 2>/dev/null | cut -f1)
    echo "📁 Packs salvos (DEV): $(format_number $PACKS_COUNT)"
    echo "💿 Espaço usado: $DISK_USAGE"
elif [ -d "/home/ubuntu/stickers" ]; then
    PACKS_COUNT=$(ls -1 /home/ubuntu/stickers 2>/dev/null | wc -l)
    DISK_USAGE=$(du -sh /home/ubuntu/stickers 2>/dev/null | cut -f1)
    echo "📁 Packs salvos (PROD): $(format_number $PACKS_COUNT)"
    echo "💿 Espaço usado: $DISK_USAGE"
else
    echo "⚠️  Diretório de stickers não encontrado"
fi

echo ""
echo "🔄 COMANDOS DISPONÍVEIS"
echo "-----------------------"
echo "./run_discovery.sh    - Iniciar Discovery Service (1 instância)"
echo "./run_processor.sh    - Iniciar Processor Service (múltiplas instâncias)"
echo "./monitor.sh          - Este monitor (atualize com Ctrl+R)"
echo "pkill -f discovery    - Parar Discovery Service"
echo "pkill -f processor    - Parar todos Processors"
echo ""
echo "Pressione qualquer tecla para atualizar ou Ctrl+C para sair"
read -n 1 -s
exec ./monitor.sh
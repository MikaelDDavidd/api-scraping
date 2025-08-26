#!/bin/bash

# Script de Migração de Figurinhas
# Migra figurinhas do diretório antigo para o novo sistema Docker/Git

set -e  # Parar em caso de erro

# Configurações
OLD_DIR="$HOME/stickers"
NEW_PROJECT_DIR="$HOME/stickers_and_memes"
NEW_STICKERS_DIR="$NEW_PROJECT_DIR/api/stickers"
LOG_FILE="$HOME/migration_log_$(date +%Y%m%d_%H%M%S).log"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Verificações iniciais
log "=== INICIANDO MIGRAÇÃO DE FIGURINHAS ==="

if [ ! -d "$OLD_DIR" ]; then
    error "Diretório antigo não encontrado: $OLD_DIR"
    exit 1
fi

if [ ! -d "$NEW_PROJECT_DIR" ]; then
    error "Projeto novo não encontrado: $NEW_PROJECT_DIR"
    exit 1
fi

# Criar diretório de destino se não existir
mkdir -p "$NEW_STICKERS_DIR"

# Estatísticas iniciais
OLD_COUNT=$(ls -1 "$OLD_DIR" | wc -l)
OLD_SIZE=$(du -sh "$OLD_DIR" | cut -f1)

log "Diretórios no sistema antigo: $OLD_COUNT"
log "Tamanho total: $OLD_SIZE"

# Função para migrar um diretório
migrate_sticker_pack() {
    local pack_name="$1"
    local source_path="$OLD_DIR/$pack_name"
    local dest_path="$NEW_STICKERS_DIR/$pack_name"
    
    if [ ! -d "$source_path" ]; then
        warn "Diretório não encontrado: $source_path"
        return 1
    fi
    
    # Verificar se já existe no destino
    if [ -d "$dest_path" ]; then
        warn "Pack $pack_name já existe no destino, pulando..."
        return 0
    fi
    
    # Copiar com preservação de metadados
    if cp -rp "$source_path" "$dest_path"; then
        log "✅ Migrado: $pack_name"
        return 0
    else
        error "❌ Falhou: $pack_name"
        return 1
    fi
}

# Menu de opções
echo ""
echo -e "${BLUE}=== OPÇÕES DE MIGRAÇÃO ===${NC}"
echo "1. Migração completa (todos os packs)"
echo "2. Migração por lotes (100 por vez)"
echo "3. Migração seletiva (escolher packs específicos)"
echo "4. Apenas análise (sem cópia)"
echo ""

read -p "Escolha uma opção (1-4): " choice

case $choice in
    1)
        log "Iniciando migração completa..."
        success_count=0
        failed_count=0
        
        for pack_dir in "$OLD_DIR"/*; do
            if [ -d "$pack_dir" ]; then
                pack_name=$(basename "$pack_dir")
                if migrate_sticker_pack "$pack_name"; then
                    ((success_count++))
                else
                    ((failed_count++))
                fi
            fi
        done
        
        log "=== RESULTADO DA MIGRAÇÃO ==="
        log "Sucessos: $success_count"
        log "Falhas: $failed_count"
        ;;
        
    2)
        log "Iniciando migração por lotes (100 por vez)..."
        batch_size=100
        batch_count=0
        
        packs=($(ls -1 "$OLD_DIR"))
        total_packs=${#packs[@]}
        
        for ((i=0; i<total_packs; i+=batch_size)); do
            ((batch_count++))
            log "=== LOTE $batch_count ==="
            
            end=$((i+batch_size-1))
            if [ $end -ge $total_packs ]; then
                end=$((total_packs-1))
            fi
            
            for ((j=i; j<=end; j++)); do
                migrate_sticker_pack "${packs[$j]}"
            done
            
            read -p "Lote $batch_count concluído. Continuar? (s/n): " continue_choice
            if [[ $continue_choice != "s" ]]; then
                log "Migração interrompida pelo usuário"
                break
            fi
        done
        ;;
        
    3)
        log "Modo de migração seletiva"
        echo "Digite os nomes dos packs (separados por espaço):"
        read -p "> " selected_packs
        
        for pack in $selected_packs; do
            migrate_sticker_pack "$pack"
        done
        ;;
        
    4)
        log "=== ANÁLISE DO SISTEMA ANTIGO ==="
        
        # Top 10 maiores diretórios
        log "Top 10 maiores packs:"
        du -sh "$OLD_DIR"/* | sort -hr | head -10 | tee -a "$LOG_FILE"
        
        # Estatísticas gerais
        log "Estatísticas gerais:"
        echo "Total de diretórios: $(ls -1 "$OLD_DIR" | wc -l)" | tee -a "$LOG_FILE"
        echo "Tamanho total: $(du -sh "$OLD_DIR" | cut -f1)" | tee -a "$LOG_FILE"
        
        # Tipos de arquivos
        log "Análise de tipos de arquivo:"
        find "$OLD_DIR" -type f -name "*.*" | sed 's/.*\.//' | sort | uniq -c | sort -nr | head -10 | tee -a "$LOG_FILE"
        ;;
        
    *)
        error "Opção inválida"
        exit 1
        ;;
esac

# Commit das mudanças (se houver)
if [ -d "$NEW_STICKERS_DIR" ] && [ "$(ls -A "$NEW_STICKERS_DIR" 2>/dev/null)" ]; then
    log "=== COMMIT DAS MUDANÇAS ==="
    
    cd "$NEW_PROJECT_DIR"
    
    # Verificar se há mudanças para commit
    if ! git diff --quiet || ! git diff --cached --quiet; then
        log "Fazendo commit das mudanças..."
        git add .
        git status
        
        read -p "Fazer commit das mudanças? (s/n): " commit_choice
        if [[ $commit_choice == "s" ]]; then
            commit_message="feat: migrate stickers from old system

- Migrated sticker packs from ~/stickers/ to new Docker/Git structure
- Total packs processed: migration details in $LOG_FILE
- Migration completed on $(date)

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
            
            git commit -m "$commit_message"
            log "✅ Commit realizado com sucesso"
        fi
    else
        log "Nenhuma mudança detectada para commit"
    fi
fi

log "=== MIGRAÇÃO FINALIZADA ==="
log "Log completo salvo em: $LOG_FILE"
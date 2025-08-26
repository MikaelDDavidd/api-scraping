1# 📋 Guia Completo: Deploy do Sistema de Stickers na VPS

## 🎯 O que vamos fazer
Vamos configurar seu sistema de stickers na VPS Ubuntu, migrando as figurinhas antigas e colocando tudo para funcionar com Docker.

---

## 📋 Pré-requisitos
- Acesso SSH à VPS Ubuntu
- Git instalado na VPS
- Docker e Docker Compose instalados na VPS
- URL do seu repositório Git

---

## 🚀 PASSO A PASSO COMPLETO

### 1. Conectar na VPS

```bash
# SSH para sua VPS
ssh ubuntu@vm-instance-001

# Verificar se está no diretório correto
pwd
# Deve mostrar: /home/ubuntu
```

### 2. Verificar Dependências

```bash
# Verificar se Git está instalado
git --version

# Verificar se Docker está instalado
docker --version
docker-compose --version

# Se algum não estiver instalado, instale:
# sudo apt update
# sudo apt install git docker.io docker-compose -y
# sudo usermod -aG docker ubuntu
# newgrp docker
```

### 3. Clonar o Projeto

```bash
# Clonar seu repositório (substitua pela URL correta)
git clone https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git api-scraping

# Entrar no diretório do projeto
cd api-scraping

# Verificar se baixou corretamente
ls -la
```

### 4. Criar Script de Configuração

```bash
# Criar o script que vai configurar tudo
cat > setup_production.sh << 'EOF'
#!/bin/bash

echo "=== CONFIGURANDO PROJETO PARA PRODUÇÃO ==="

# Verificar se estamos no diretório correto
if [ ! -f "package.json" ]; then
    echo "❌ ERRO: Execute este script dentro do diretório do projeto"
    exit 1
fi

# 1. Corrigir .gitignore
echo "1. Corrigindo .gitignore..."
if [ -f .gitignore ]; then
    cp .gitignore .gitignore.backup
    # Remove a linha que ignora o diretório stickers
    sed -i '/^stickers\/$/d' .gitignore
    echo "✅ .gitignore corrigido"
fi

# 2. Configurar .env para produção
echo "2. Configurando ambiente de produção..."
if [ -f .env ]; then
    cp .env .env.backup
    sed -i 's/NODE_ENV=development/NODE_ENV=production/' .env
    echo "✅ NODE_ENV configurado para production"
else
    echo "❌ Arquivo .env não encontrado!"
    echo "Criando .env básico..."
    cat > .env << 'ENVEOF'
# Configuração para produção
SUPABASE_URL=https://hmtohytskgvromvpuoom.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtdG9oeXRza2d2cm9tdnB1b29tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MjgxNTcwNywiZXhwIjoyMDY4MzkxNzA3fQ.P1iAJiNKEOWXFv7X1VC3E4RqSCobsR9eAM87g5OqhZY
NODE_ENV=production
ENVEOF
fi

# 3. Criar diretórios necessários
echo "3. Criando estrutura de diretórios..."
mkdir -p stickers
mkdir -p logs
mkdir -p temp
chmod 755 stickers logs temp
echo "✅ Diretórios criados"

# 4. Verificar .dockerignore
echo "4. Verificando .dockerignore..."
if [ ! -f .dockerignore ]; then
    echo "Criando .dockerignore..."
    cat > .dockerignore << 'DOCKEREOF'
node_modules/
*.log
.DS_Store
.git/
.gitignore
README*.md
*.md
*.bak
*.backup
test_*
temp/
.vscode/
.idea/
DOCKEREOF
fi

# Garantir que .env não está no .dockerignore (precisa no container)
sed -i '/^\.env$/d' .dockerignore
echo "✅ .dockerignore configurado"

# 5. Mostrar status
echo ""
echo "=== STATUS DA CONFIGURAÇÃO ==="
echo "📁 Diretório atual: $(pwd)"
echo "📄 Arquivo .env:"
if [ -f .env ]; then
    echo "   ✅ Existe"
    echo "   NODE_ENV: $(grep NODE_ENV .env)"
else
    echo "   ❌ Não existe"
fi
echo "📁 Diretórios:"
echo "   stickers/: $([ -d stickers ] && echo '✅' || echo '❌')"
echo "   logs/: $([ -d logs ] && echo '✅' || echo '❌')"

echo ""
echo "✅ CONFIGURAÇÃO CONCLUÍDA!"
echo ""
echo "Próximos passos:"
echo "1. Execute: ./migrate_stickers.sh"
echo "2. Execute: docker-compose up -d"
EOF

# Dar permissão de execução
chmod +x setup_production.sh
```

### 5. Executar Configuração

```bash
# Executar o script de configuração
./setup_production.sh
```

### 6. Criar Script de Migração das Figurinhas

```bash
# Criar o script de migração
cat > migrate_stickers.sh << 'EOF'
#!/bin/bash

# Configurações
SOURCE_DIR="/home/ubuntu/stickers"
DEST_DIR="/home/ubuntu/api-scraping/stickers"
LOG_FILE="/home/ubuntu/migration_$(date +%Y%m%d_%H%M%S).log"

# Cores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date '+%H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
}

# Verificações iniciais
log "=== MIGRAÇÃO DE FIGURINHAS ==="
log "Origem: $SOURCE_DIR"
log "Destino: $DEST_DIR"

# Verificar se diretório de origem existe
if [ ! -d "$SOURCE_DIR" ]; then
    error "Diretório de figurinhas antigas não encontrado: $SOURCE_DIR"
    echo ""
    echo "Verifique se o caminho está correto. As figurinhas antigas estão em:"
    echo "- /home/ubuntu/stickers ?"
    echo "- /home/stickers ?"
    echo "- Outro local?"
    exit 1
fi

# Verificar se diretório de destino existe
if [ ! -d "$DEST_DIR" ]; then
    error "Diretório destino não encontrado: $DEST_DIR"
    echo "Execute primeiro: ./setup_production.sh"
    exit 1
fi

# Estatísticas
TOTAL_DIRS=$(ls -1 "$SOURCE_DIR" 2>/dev/null | wc -l)
SOURCE_SIZE=$(du -sh "$SOURCE_DIR" 2>/dev/null | cut -f1)

log "Total de packs encontrados: $TOTAL_DIRS"
log "Tamanho total: $SOURCE_SIZE"

if [ "$TOTAL_DIRS" -eq 0 ]; then
    error "Nenhum diretório de figurinhas encontrado!"
    exit 1
fi

echo ""
echo -e "${BLUE}=== OPÇÕES DE MIGRAÇÃO ===${NC}"
echo "1. 🚀 Migração completa (recomendado)"
echo "2. 📦 Migração por lotes (100 por vez)"
echo "3. 🔍 Apenas análise (sem copiar)"
echo "4. 🎯 Migração seletiva (escolher packs)"
echo ""

read -p "Escolha uma opção (1-4): " choice

case $choice in
    1)
        log "Iniciando migração completa..."
        
        # Usar rsync para cópia eficiente com progress
        echo "Copiando todas as figurinhas..."
        echo "Isso pode demorar alguns minutos dependendo do tamanho..."
        echo ""
        
        if rsync -av --progress "$SOURCE_DIR/" "$DEST_DIR/"; then
            log "✅ Migração completa realizada com sucesso!"
        else
            error "❌ Erro durante a migração"
            exit 1
        fi
        ;;
        
    2)
        log "Iniciando migração por lotes..."
        count=0
        batch=0
        success=0
        failed=0
        
        for pack_dir in "$SOURCE_DIR"/*; do
            if [ -d "$pack_dir" ]; then
                pack_name=$(basename "$pack_dir")
                
                if [ $((count % 100)) -eq 0 ]; then
                    ((batch++))
                    log "=== LOTE $batch ==="
                fi
                
                if cp -r "$pack_dir" "$DEST_DIR/" 2>/dev/null; then
                    echo "✅ $pack_name"
                    ((success++))
                else
                    echo "❌ $pack_name"
                    ((failed++))
                fi
                
                ((count++))
                
                # Pausar a cada lote
                if [ $((count % 100)) -eq 0 ]; then
                    echo ""
                    echo "Lote $batch concluído - Sucessos: $success, Falhas: $failed"
                    read -p "Continuar com próximo lote? (s/n): " continue_choice
                    if [[ $continue_choice != "s" ]]; then
                        log "Migração pausada pelo usuário"
                        break
                    fi
                    echo ""
                fi
            fi
        done
        
        log "Migração por lotes finalizada - Total: $count, Sucessos: $success, Falhas: $failed"
        ;;
        
    3)
        log "=== ANÁLISE DO SISTEMA ==="
        
        echo ""
        echo "📊 Estatísticas gerais:"
        echo "   Total de packs: $TOTAL_DIRS"
        echo "   Tamanho total: $SOURCE_SIZE"
        echo ""
        
        echo "📁 Estrutura do diretório origem (primeiros 10):"
        ls -la "$SOURCE_DIR" | head -20
        echo ""
        
        echo "📈 Top 10 maiores packs:"
        du -sh "$SOURCE_DIR"/* 2>/dev/null | sort -hr | head -10
        echo ""
        
        echo "📄 Tipos de arquivo encontrados:"
        find "$SOURCE_DIR" -type f -name "*.*" 2>/dev/null | sed 's/.*\.//' | sort | uniq -c | sort -nr | head -10
        echo ""
        
        echo "💾 Espaço disponível no destino:"
        df -h "$DEST_DIR"
        echo ""
        
        echo "🔍 Exemplo de conteúdo de um pack:"
        first_pack=$(ls "$SOURCE_DIR" | head -1)
        if [ -n "$first_pack" ]; then
            echo "Conteúdo de $first_pack:"
            ls -la "$SOURCE_DIR/$first_pack" | head -5
        fi
        ;;
        
    4)
        echo ""
        echo "Packs disponíveis (primeiros 20):"
        ls "$SOURCE_DIR" | head -20
        echo ""
        echo "Digite os nomes dos packs que deseja migrar (separados por espaço):"
        echo "Exemplo: 00DB51 01N5DN 026TLF"
        read -p "> " selected_packs
        
        success=0
        failed=0
        
        for pack in $selected_packs; do
            if [ -d "$SOURCE_DIR/$pack" ]; then
                if cp -r "$SOURCE_DIR/$pack" "$DEST_DIR/" 2>/dev/null; then
                    log "✅ Migrado: $pack"
                    ((success++))
                else
                    error "❌ Falhou: $pack"
                    ((failed++))
                fi
            else
                warn "Pack não encontrado: $pack"
                ((failed++))
            fi
        done
        
        log "Migração seletiva concluída - Sucessos: $success, Falhas: $failed"
        ;;
        
    *)
        error "Opção inválida"
        exit 1
        ;;
esac

# Verificar resultado final
if [ -d "$DEST_DIR" ] && [ "$(ls -A "$DEST_DIR" 2>/dev/null)" ]; then
    DEST_COUNT=$(ls -1 "$DEST_DIR" 2>/dev/null | wc -l)
    DEST_SIZE=$(du -sh "$DEST_DIR" 2>/dev/null | cut -f1)
    
    echo ""
    log "=== RESULTADO FINAL ==="
    log "📁 Packs migrados: $DEST_COUNT"
    log "📊 Tamanho final: $DEST_SIZE"
    log "📝 Log salvo em: $LOG_FILE"
    
    # Preparar para commit
    if command -v git >/dev/null 2>&1; then
        log "Preparando commit das mudanças..."
        
        cd /home/ubuntu/api-scraping
        
        if git status --porcelain 2>/dev/null | grep -q .; then
            echo ""
            echo "Mudanças detectadas no Git. Deseja fazer commit?"
            git status --porcelain | head -10
            if [ $(git status --porcelain | wc -l) -gt 10 ]; then
                echo "... e mais $(( $(git status --porcelain | wc -l) - 10 )) arquivos"
            fi
            echo ""
            
            read -p "Fazer commit das figurinhas migradas? (s/n): " commit_choice
            if [[ $commit_choice == "s" ]]; then
                git add stickers/
                git commit -m "feat: migrate sticker packs from legacy system

- Migrated $DEST_COUNT sticker packs from $SOURCE_DIR
- Total size: $DEST_SIZE
- Original directory preserved as backup
- Migration completed: $(date '+%Y-%m-%d %H:%M:%S')

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>"
                
                log "✅ Commit realizado com sucesso!"
            else
                log "Commit pulado pelo usuário"
            fi
        else
            log "Nenhuma mudança detectada para commit"
        fi
    fi
else
    error "❌ Nenhuma figurinha foi migrada!"
fi

echo ""
log "=== MIGRAÇÃO FINALIZADA ==="
echo ""
echo "Próximos passos:"
echo "1. Verificar: ls -la stickers/ | head -10"
echo "2. Executar: docker-compose up -d"
EOF

# Dar permissão de execução
chmod +x migrate_stickers.sh
```

### 7. Executar Migração das Figurinhas

```bash
# Executar a migração
./migrate_stickers.sh

# Escolha a opção 3 primeiro para fazer uma análise
# Depois execute novamente e escolha opção 1 ou 2
```

### 8. Verificar se a Migração Funcionou

```bash
# Verificar quantas figurinhas foram migradas
echo "Figurinhas originais: $(ls -1 /home/ubuntu/stickers 2>/dev/null | wc -l)"
echo "Figurinhas migradas: $(ls -1 stickers/ 2>/dev/null | wc -l)"

# Ver alguns exemplos
ls -la stickers/ | head -10
```

### 9. Configurar e Subir o Docker

```bash
# Verificar se o docker-compose.yml existe
ls -la docker-compose.yml

# Ver o conteúdo (verificar se está configurado corretamente)
cat docker-compose.yml

# Subir o ambiente Docker
docker-compose up -d

# Verificar se os containers subiram
docker ps

# Ver logs se necessário
docker-compose logs
```

### 10. Verificar se Está Funcionando

```bash
# Verificar se o sistema está rodando
docker ps

# Testar se as figurinhas estão acessíveis no container
docker exec -it $(docker ps --format "table {{.Names}}" | grep -v NAMES | head -1) ls /app/stickers | head -10

# Verificar logs do aplicativo
docker-compose logs -f --tail=50
```

---

## 🔧 Troubleshooting

### Se der erro "diretório não encontrado":
```bash
# Verificar onde estão as figurinhas antigas
find /home -name "stickers" -type d 2>/dev/null
ls -la /home/ubuntu/
ls -la /home/
```

### Se o Docker não subir:
```bash
# Verificar erros
docker-compose logs

# Verificar se as portas estão livres
sudo netstat -tulpn | grep :3000

# Recriar containers
docker-compose down
docker-compose up -d --build
```

### Se o .env não estiver correto:
```bash
# Verificar conteúdo
cat .env

# Corrigir manualmente se necessário
nano .env
```

---

## 🎉 Resultado Final

Após seguir todos os passos, você terá:

1. ✅ Projeto clonado em `/home/ubuntu/api-scraping/`
2. ✅ Figurinhas migradas de `/home/ubuntu/stickers/` para `/home/ubuntu/api-scraping/stickers/`
3. ✅ Sistema rodando com Docker
4. ✅ Backup preservado no diretório original
5. ✅ Configuração de produção aplicada

O sistema estará disponível e funcionando, com todas as suas figurinhas acessíveis pelo novo sistema Docker/Git!

---

## 📞 Comandos Úteis para Manutenção

```bash
# Ver status dos containers
docker ps

# Ver logs
docker-compose logs -f

# Reiniciar sistema
docker-compose restart

# Parar sistema
docker-compose down

# Atualizar código
git pull
docker-compose up -d --build

# Backup das figurinhas
tar -czf backup_stickers_$(date +%Y%m%d).tar.gz stickers/
```
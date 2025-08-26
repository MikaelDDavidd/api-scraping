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
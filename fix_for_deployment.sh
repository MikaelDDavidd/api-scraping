#!/bin/bash

# Script para corrigir configurações antes do deployment via CLI
# Execute no servidor após git clone

echo "=== CORREÇÕES PRÉ-DEPLOYMENT ==="

cd /home/ubuntu/api-scraping

# 1. Corrigir .gitignore (remover linha que ignora stickers/)
echo "1. Corrigindo .gitignore..."
cp .gitignore .gitignore.backup
sed -i '/^stickers\/$/d' .gitignore
echo "✅ Removida linha 'stickers/' do .gitignore"

# 2. Criar .env.example (template)
echo "2. Criando .env.example..."
cat > .env.example << 'EOF'
# CONFIGURAÇÃO SIMPLES PARA SCRAPER MULTITHREAD
# Copie para .env e configure suas credenciais

# Supabase (obrigatório)
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua-service-key-aqui

# Modo (desenvolvimento ou produção)
# development = salva na pasta local do projeto para teste
# production = salva no diretório /home/ubuntu/stickers da VPS
NODE_ENV=production
EOF

# 3. Configurar .env para produção
echo "3. Configurando .env para produção..."
if [ -f .env ]; then
    cp .env .env.backup
    sed -i 's/NODE_ENV=development/NODE_ENV=production/' .env
    echo "✅ NODE_ENV alterado para production"
else
    echo "⚠️  Arquivo .env não encontrado - criando do exemplo"
    cp .env.example .env
fi

# 4. Verificar/corrigir .dockerignore
echo "4. Verificando .dockerignore..."
if grep -q "^\.env$" .dockerignore; then
    echo "✅ .env já está no .dockerignore"
else
    echo ".env" >> .dockerignore
    echo "✅ Adicionado .env ao .dockerignore"
fi

# 5. Criar estrutura de diretórios necessários
echo "5. Criando estrutura de diretórios..."
mkdir -p stickers
mkdir -p logs
mkdir -p temp
echo "✅ Diretórios criados"

# 6. Verificar permissões
echo "6. Ajustando permissões..."
chmod 755 stickers/
chmod 755 logs/
echo "✅ Permissões ajustadas"

# 7. Mostrar status
echo ""
echo "=== STATUS PÓS-CORREÇÃO ==="
echo "Diretório atual: $(pwd)"
echo "Arquivos .env:"
ls -la .env*
echo ""
echo "Estrutura de diretórios:"
ls -la | grep "^d"
echo ""
echo "Conteúdo do .env:"
cat .env
echo ""
echo "Verificação .gitignore (não deve mostrar 'stickers/'):"
grep -n "stickers" .gitignore || echo "✅ stickers/ não está sendo ignorado"

echo ""
echo "=== PRÓXIMOS PASSOS ==="
echo "1. Execute a migração das figurinhas:"
echo "   ./migrate_stickers.sh"
echo ""
echo "2. Faça commit das configurações:"
echo "   git add ."
echo "   git commit -m 'fix: configure for production deployment'"
echo ""
echo "3. Suba o Docker:"
echo "   docker-compose up -d"
# 🚀 DEPLOY FINAL NA VPS

## Problema Resolvido
O erro `Cannot find module '/app/index_enhanced.js'` foi corrigido. O arquivo está presente no container.

## 🚨 FIX RÁPIDO - Erro de Permissão EACCES

Se o container estiver reiniciando com erro de permissão nos logs:

```bash
# Parar o serviço principal
docker compose stop stickers-scraper

# Fixar permissões (IMPORTANTE: usar UID 1001 do container)
sudo chown -R 1001:1001 logs data_captured .cache
chmod 755 logs data_captured .cache

# Limpar e recriar apenas o serviço principal
docker compose down
docker compose build --no-cache stickers-scraper
docker compose up -d stickers-scraper
```

## 1. Preparação na VPS

```bash
# Criar estrutura de diretórios
sudo mkdir -p /home/ubuntu/stickers
sudo chown ubuntu:ubuntu /home/ubuntu/stickers

# Navegar para o projeto
cd /path/to/api-scraping

# IMPORTANTE: Criar e configurar diretórios locais com permissões corretas
mkdir -p logs data_captured .cache stickers
sudo chown -R 1001:1001 logs data_captured .cache
chmod 755 logs data_captured .cache
```

## 2. Atualizar .env para Produção

```bash
# Editar .env
nano .env

# Configurar para produção:
NODE_ENV=production
USE_LOCAL_STORAGE=true
LOCAL_STORAGE_PATH=/home/ubuntu/stickers
STORAGE_BASE_URL=http://your-domain.com
```

## 3. Deploy com Docker

```bash
# Build da imagem
docker compose build stickers-scraper

# Testar primeiro
docker compose --profile test up stickers-scraper-test

# Se funcionou, rodar em produção
docker compose up -d stickers-scraper
```

## 4. Verificar Status

```bash
# Ver logs
docker compose logs -f stickers-scraper

# Status do container
docker compose ps

# Ver arquivos criados
ls -la /home/ubuntu/stickers/

# Monitor
docker compose --profile monitor up stickers-monitor
```

## 5. Comandos Úteis

```bash
# Parar
docker compose down

# Restart
docker compose restart stickers-scraper

# Executar comando específico
docker compose run --rm stickers-scraper node index_enhanced.js keywords amor brasil

# Backup
tar -czf stickers-backup-$(date +%Y%m%d).tar.gz /home/ubuntu/stickers/
```

## 6. Monitoramento

```bash
# Logs em tempo real
tail -f logs/*.log

# Status sistema
docker stats stickers-scraper

# Espaço em disco
df -h /home/ubuntu/stickers/
du -sh /home/ubuntu/stickers/
```

## 7. Troubleshooting

### Erro de Permissão nos Logs (EACCES)
Se o container ficar reiniciando com erro "permission denied" nos logs:

```bash
# Parar containers
docker compose down

# Fixar permissões dos diretórios locais
sudo chown -R 1001:1001 logs data_captured .cache
chmod 755 logs data_captured .cache

# Limpar volumes antigos se necessário
docker compose down -v
docker system prune -f

# Recriar containers
docker compose build --no-cache stickers-scraper
docker compose up -d stickers-scraper
```

### Erro de Módulo Não Encontrado
Se ainda der erro de módulo não encontrado:

```bash
# Debug no container
docker exec -it stickers-scraper ls -la /app/
docker exec -it stickers-scraper node --version

# Rebuild completo
docker compose down
docker system prune -f
docker compose build --no-cache stickers-scraper
docker compose up -d stickers-scraper
```

## 8. Configuração Nginx (Opcional)

Para servir as imagens publicamente:

```nginx
server {
    listen 80;
    server_name your-domain.com;
    
    location /stickers/ {
        alias /home/ubuntu/stickers/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

## 9. Automação (PM2 Alternative)

```bash
# Criar script de restart
cat > restart-scraper.sh << 'EOF'
#!/bin/bash
docker compose down
docker compose up -d stickers-scraper
EOF

chmod +x restart-scraper.sh

# Cron para restart diário (opcional)
echo "0 4 * * * /path/to/restart-scraper.sh" | crontab -
```

## 🎯 Comandos Principais de Deploy

```bash
# 1. Build e Deploy Completo
docker compose build stickers-scraper && docker compose up -d stickers-scraper

# 2. Ver se está funcionando
docker compose logs -f --tail=50 stickers-scraper

# 3. Teste específico
docker compose run --rm stickers-scraper node index_enhanced.js test

# 4. Monitor
docker compose --profile monitor up -d stickers-monitor
```

✅ **O projeto está pronto para rodar na VPS!**
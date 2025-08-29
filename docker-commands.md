# 🐳 COMANDOS DOCKER

## Build e Deploy

### Construir imagem
```bash
docker-compose build
```

### Executar em produção
```bash
# Scraping completo
docker-compose up -d stickers-scraper

# Ver logs
docker-compose logs -f stickers-scraper
```

### Executar em modo teste
```bash
# Rodar teste
docker-compose --profile test up stickers-scraper-test

# Ver logs do teste
docker-compose --profile test logs -f stickers-scraper-test
```

### Monitorar estatísticas
```bash
# Monitor em tempo real
docker-compose --profile monitor up stickers-monitor

# Ver monitor
docker-compose --profile monitor logs -f stickers-monitor
```

## Comandos Específicos

### Executar comandos personalizados
```bash
# Keywords específicas
docker-compose run --rm stickers-scraper node index_enhanced.js keywords amor brasil

# Ver estatísticas
docker-compose run --rm stickers-scraper node index_enhanced.js stats

# Monitor one-shot
docker-compose run --rm stickers-scraper node monitor.js
```

## Volumes e Dados

### Verificar volumes
```bash
docker volume ls
docker volume inspect api-scraping_scraper_temp
```

### Backup de dados
```bash
# Backup logs
docker cp stickers-scraper:/app/logs ./backup-logs

# Backup cache
docker cp stickers-scraper:/app/.cache ./backup-cache
```

## Limpeza

### Parar todos os serviços
```bash
docker-compose down
```

### Limpar tudo (cuidado!)
```bash
docker-compose down -v
docker system prune -f
```

### Remover apenas volumes temporários
```bash
docker volume rm api-scraping_scraper_temp
```

## Debugging

### Executar shell no container
```bash
docker-compose exec stickers-scraper sh
```

### Ver logs em tempo real
```bash
docker-compose logs -f --tail=100 stickers-scraper
```

### Verificar recursos
```bash
docker stats stickers-scraper
```

## Variáveis de Ambiente

O container usa as seguintes variáveis principais:
- `NODE_ENV`: production/development
- `USE_LOCAL_STORAGE`: true
- `LOCAL_STORAGE_PATH`: /home/ubuntu/stickers (produção)
- `SUPABASE_URL`: URL do Supabase
- `SUPABASE_SERVICE_KEY`: Chave de serviço
# 🚀 Guia de Deploy com Docker Hub

## 📦 Opção 1: Deploy via Docker Hub (Recomendado)

### No seu computador local:

```bash
# 1. Fazer login no Docker Hub
docker login

# 2. Build da imagem com tag
docker build -t SEU_USUARIO/stickers-scraper:latest .

# 3. Push para Docker Hub
docker push SEU_USUARIO/stickers-scraper:latest
```

### Na VPS:

```bash
# 1. Clone apenas os arquivos de configuração
git clone https://github.com/SEU_USUARIO/stickers-scraper.git
cd stickers-scraper

# 2. Crie o arquivo .env
nano .env
# Cole suas variáveis de ambiente

# 3. Crie docker-compose.prod.yml
nano docker-compose.prod.yml
```

Conteúdo do `docker-compose.prod.yml`:
```yaml
version: '3.8'

services:
  stickers-scraper:
    image: SEU_USUARIO/stickers-scraper:latest
    container_name: stickers-scraper
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - TZ=America/Recife
    volumes:
      - ./logs:/app/logs
      - ./data_captured:/app/data_captured
      - scraper_temp:/app/temp
    deploy:
      resources:
        limits:
          memory: 1G
          cpus: '1.0'
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "5"

volumes:
  scraper_temp:
    driver: local
```

```bash
# 4. Iniciar o container
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

# 5. Ver logs
docker-compose -f docker-compose.prod.yml logs -f
```

## 🔄 Opção 2: Deploy via GitHub Actions (CI/CD Automático)

### Configure GitHub Secrets:
No seu repositório GitHub, vá em Settings → Secrets → Actions e adicione:
- `DOCKERHUB_USERNAME`: Seu usuário do Docker Hub
- `DOCKERHUB_TOKEN`: Token de acesso do Docker Hub
- `VPS_HOST`: IP da sua VPS
- `VPS_USER`: Usuário SSH (ex: ubuntu)
- `VPS_SSH_KEY`: Chave SSH privada

### GitHub Actions será criado automaticamente quando você fizer push

## 🎯 Opção 3: Deploy Direto via Git (Mais Simples)

### Na VPS:

```bash
# 1. Clone o repositório completo
git clone https://github.com/SEU_USUARIO/stickers-scraper.git
cd stickers-scraper

# 2. Crie o arquivo .env
nano .env
# Cole suas variáveis:
# SUPABASE_URL=https://seu-projeto.supabase.co
# SUPABASE_ANON_KEY=sua_chave
# SUPABASE_SERVICE_KEY=sua_chave
# MAX_PACKS_PER_RUN=50
# DELAY_BETWEEN_REQUESTS=2000

# 3. Build e run com Docker Compose
docker-compose build
docker-compose up -d

# 4. Ver logs
docker-compose logs -f
```

## 📝 Comandos Úteis

```bash
# Status
docker-compose ps

# Logs
docker-compose logs -f stickers-scraper

# Restart
docker-compose restart

# Stop
docker-compose down

# Update (pull nova versão)
git pull
docker-compose build
docker-compose up -d

# Limpar tudo
docker-compose down -v --rmi all
```

## 🔐 Arquivo .env Exemplo

```env
# Supabase
SUPABASE_URL=https://hmtohytskgvromvpuoom.supabase.co
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_KEY=eyJhbGc...

# Configurações
MAX_PACKS_PER_RUN=50
DELAY_BETWEEN_REQUESTS=2000
MAX_RETRIES=3
LOG_LEVEL=info
NODE_ENV=production
```

## 🚨 Troubleshooting

### Container não inicia?
```bash
# Ver logs detalhados
docker-compose logs --tail=100

# Verificar recursos
docker system df
df -h

# Limpar cache Docker
docker system prune -a
```

### Erro de permissão?
```bash
# Criar diretórios com permissão correta
mkdir -p logs data_captured
chmod 755 logs data_captured
```

### Memory issues?
```bash
# Verificar uso de memória
docker stats

# Ajustar limite no docker-compose.yml
# Mudar de 1G para 2G se necessário
```

## 🎯 Deploy Rápido (Copy & Paste)

```bash
# Na VPS, execute tudo de uma vez:
git clone https://github.com/SEU_USUARIO/stickers-scraper.git && \
cd stickers-scraper && \
nano .env && \
docker-compose build && \
docker-compose up -d && \
docker-compose logs -f
```
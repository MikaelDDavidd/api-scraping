# 🐳 Sistema de Stickers com Docker

Deploy automatizado do sistema de descoberta e processamento de stickers usando Docker.

## 🏗️ Arquitetura Docker

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   DISCOVERY         │    │   SHARED VOLUMES    │    │   PROCESSORS        │
│   (1 container)     │    │                     │    │   (3 containers)    │
│                     │    │ /stickers          │    │                     │
│ stickers-discovery  │◄───┤ /queue             │───►│ stickers-processor-* │
│                     │    │ /logs              │    │                     │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
                                     │
                           ┌─────────────────────┐
                           │   WEB MONITOR       │
                           │   (1 container)     │
                           │                     │
                           │ stickers-monitor    │
                           │ Port: 3000          │
                           └─────────────────────┘
```

## 🚀 Deploy Rápido

### 1. Preparação
```bash
# Clonar/copiar arquivos
# Configurar .env
cp .env_simple .env
# Editar .env com credenciais Supabase

# Dar permissões
chmod +x *.sh
```

### 2. Deploy Automático
```bash
# Deploy completo (deteta automaticamente dev/prod)
./docker-deploy.sh

# Ou manualmente:
# Produção (VPS)
docker-compose up -d

# Desenvolvimento (local)
docker-compose -f docker-compose.dev.yml --profile dev up -d
```

### 3. Monitoramento
```bash
# Abrir browser
http://localhost:3000    # Produção
http://localhost:3001    # Desenvolvimento
```

## 📦 Containers

### Discovery Container
- **Nome**: `stickers-discovery`
- **Função**: Busca contínua por packs novos
- **Comando**: `node discovery_service.js`
- **Instâncias**: 1 apenas

### Processor Containers  
- **Nomes**: `stickers-processor-1`, `stickers-processor-2`, `stickers-processor-3`
- **Função**: Processamento paralelo de packs
- **Comando**: `node processor_service.js`
- **Instâncias**: 3 (prod) / 2 (dev)

### Monitor Container
- **Nome**: `stickers-monitor`
- **Função**: Dashboard web de monitoramento  
- **Comando**: `node monitor_web.js`
- **Porta**: 3000 (prod) / 3001 (dev)

## 💾 Volumes e Persistência

### Produção (`docker-compose.yml`)
```yaml
volumes:
  stickers_data: /home/ubuntu/stickers      # Stickers salvos
  queue_data: /home/ubuntu/stickers-queue   # Fila compartilhada  
  logs_data: /home/ubuntu/stickers-logs     # Logs do sistema
```

### Desenvolvimento (`docker-compose.dev.yml`)
```yaml
volumes:
  ./stickers_dev:/app/stickers              # Stickers locais
  ./:/app/queue                             # Fila local
  ./data_captured:/app/data_captured        # Logs locais
```

## 🔧 Comandos Úteis

### Gestão de Containers
```bash
# Ver status
docker-compose ps

# Ver logs
docker-compose logs -f discovery
docker-compose logs -f processor-1
docker-compose logs -f monitor

# Parar sistema  
./docker-stop.sh
# ou
docker-compose down

# Restart
docker-compose restart discovery
docker-compose restart processor-1
```

### Scaling (Adicionar mais processors)
```bash
# Adicionar mais processors
docker-compose up -d --scale processor-1=2 processor-2 processor-3

# Ou editar docker-compose.yml e adicionar processor-4, processor-5, etc.
```

### Debug
```bash
# Entrar no container
docker exec -it stickers-discovery bash
docker exec -it stickers-processor-1 bash

# Ver arquivos de estado
docker exec stickers-discovery cat discovered_packs.json | jq '.totalPacks'
docker exec stickers-discovery cat discovery_state.json | jq

# Verificar recursos
docker stats
```

## 🌐 Modos de Execução

### Desenvolvimento
- **Detecção**: Automática se não existe `/home/ubuntu/`
- **Stickers**: Salvos em `./stickers_dev/`  
- **Workers**: 2 por processor
- **Storage**: Apenas local (não Supabase Storage)
- **Porta Monitor**: 3001

### Produção  
- **Detecção**: Automática se existe `/home/ubuntu/`
- **Stickers**: Salvos em `/home/ubuntu/stickers/`
- **Workers**: 4 por processor  
- **Storage**: Supabase completo + local
- **Porta Monitor**: 3000

## 📊 Monitoramento

### Dashboard Web
- **URL**: `http://IP:3000` (prod) ou `http://localhost:3001` (dev)
- **Features**:
  - Status dos serviços em tempo real
  - Tamanho da fila
  - Progresso da descoberta  
  - Estatísticas de processamento
  - Contadores de sucesso/erro
  - Auto-refresh a cada 30s

### API Endpoints
```bash
GET /api/stats      # Todas as estatísticas
GET /api/queue      # Status da fila  
GET /health         # Healthcheck
```

### Logs
```bash
# Logs em tempo real
docker-compose logs -f

# Logs específicos
docker-compose logs discovery
docker-compose logs processor-1

# Logs com timestamps
docker-compose logs -t -f
```

## 🔄 Atualizações

```bash
# Rebuild após mudanças no código
docker-compose down
docker build -t stickers-scraper:latest .
docker-compose up -d

# Ou usar o deploy script (faz rebuild automático)
./docker-deploy.sh
```

## 🚨 Troubleshooting

### Container não inicia
```bash
# Ver logs de erro
docker-compose logs discovery
docker-compose logs processor-1

# Verificar .env
cat .env

# Verificar permissões (produção)
ls -la /home/ubuntu/stickers*
```

### Sem packs sendo descobertos
```bash
# Verificar discovery logs
docker-compose logs -f discovery

# Verificar fila
docker exec stickers-discovery cat discovered_packs.json | jq '.totalPacks'

# Testar conectividade Supabase
docker exec stickers-discovery node -e "
const { createClient } = require('@supabase/supabase-js');
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
client.from('packs').select('id').limit(1).then(r => console.log('Supabase OK:', r.data?.length || 0));
"
```

### Processors não consomem fila
```bash
# Verificar se fila existe
docker exec stickers-processor-1 ls -la discovered_packs.json

# Verificar logs do processor
docker-compose logs -f processor-1

# Verificar se discovery está rodando
docker-compose ps discovery
```

### Monitor não carrega
```bash
# Verificar porta
docker-compose ps monitor
curl http://localhost:3000/health

# Ver logs do monitor  
docker-compose logs monitor
```

## ⚡ Performance

### Recursos Recomendados
- **Mínimo**: 1GB RAM, 1 CPU, 10GB disco
- **Recomendado**: 2GB RAM, 2 CPUs, 50GB disco  
- **Ideal**: 4GB RAM, 4 CPUs, 100GB disco

### Otimizações
- Ajustar `resources` limits no docker-compose.yml
- Usar SSD para melhor I/O
- Monitorar uso de CPU/memória com `docker stats`
- Escalar processors conforme necessário

## 🔐 Segurança

- Containers rodam com usuário não-root
- Volumes com permissões adequadas
- Variáveis sensíveis apenas via environment
- Rede isolada para containers
- Healthchecks para monitoramento
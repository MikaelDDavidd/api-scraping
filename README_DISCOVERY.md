# 🔍 Sistema de Descoberta Contínua + Processamento Paralelo

Sistema **distribuído** para descoberta contínua e processamento paralelo de stickers do Sticker.ly.

## 🏗️ Arquitetura

```
┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
│   DISCOVERY         │    │   FILA COMPARTILHADA│    │   PROCESSORS        │
│   (1 instância)     │───▶│  discovered_packs.json│◄───│ (N instâncias)      │
│                     │    │                     │    │                     │
│ • Busca recomendados│    │ • IDs novos         │    │ • Consome fila      │
│ • Keywords BR       │    │ • Metadata          │    │ • Download/conversão│
│ • Paginação         │    │ • Thread-safe       │    │ • Upload Supabase   │
│ • Filtro duplicados │    │                     │    │ • Multithread       │
└─────────────────────┘    └─────────────────────┘    └─────────────────────┘
```

## 📂 Componentes

### 1. **Discovery Service** (`discovery_service.js`)
- **1 instância apenas**
- Busca contínua por packs novos
- 40+ keywords brasileiras
- Paginação automática
- Filtra duplicados via Supabase
- Salva IDs novos na fila

### 2. **Processor Service** (`processor_service.js`)  
- **Múltiplas instâncias simultâneas**
- Consome fila de packs descobertos
- Multithread (2-4 workers por instância)
- Download, conversão WebP, upload
- Thread-safe entre instâncias

### 3. **Fila Compartilhada** (`discovered_packs.json`)
- Arquivo JSON thread-safe
- Metadados dos packs descobertos
- Consumo atômico por instâncias
- Persistente entre reinicializações

## 🚀 Como Usar

### Instalação
```bash
npm install axios @supabase/supabase-js sharp fs-extra dotenv jq

# Configurar ambiente
cp .env_simple .env
# Editar .env com credenciais Supabase

# Dar permissões aos scripts
chmod +x *.sh
```

### Execução

**1. Iniciar Discovery (apenas 1 instância):**
```bash
./run_discovery.sh
```

**2. Iniciar Processors (quantos quiser):**
```bash
./run_processor.sh          # Instância 1
./run_processor.sh &        # Instância 2 (background)
./run_processor.sh &        # Instância 3 (background)
```

**3. Monitorar sistema:**
```bash
./monitor.sh
```

## 📊 Monitoramento

O `monitor.sh` mostra:
- ✅ Status dos serviços (PIDs)
- 📦 Tamanho da fila 
- 🔍 Progresso da descoberta
- 📊 Estatísticas de processamento
- 💾 Espaço usado

## 🔄 Fluxo de Funcionamento

### Discovery Service:
1. Carrega 3K+ packs existentes do Supabase (paginado)
2. Busca packs recomendados a cada 30min
3. Busca por keywords brasileiras com paginação
4. Filtra apenas packs novos (não existentes)
5. Adiciona IDs novos à fila `discovered_packs.json`
6. Repete eternamente

### Processor Services:
1. Verificam fila a cada 5 segundos
2. Consomem lotes de packs da fila
3. Processam com 2-4 workers paralelos cada
4. Download → Conversão WebP → Tray → Upload Supabase
5. Removem packs processados da fila
6. Logam estatísticas em `processed_packs.json`

## 🎯 Vantagens

**🔄 Descoberta Contínua:**
- Nunca para de buscar
- 40+ keywords brasileiras
- Paginação completa (50 páginas/keyword)
- Recomendados a cada 30min

**⚡ Processamento Distribuído:**
- Múltiplas instâncias simultâneas
- Cada instância = 2-4 workers
- Total: até 20+ workers simultâneos
- Thread-safe entre instâncias

**🎯 Zero Duplicados:**
- Verificação prévia no Supabase
- Cache inteligente
- Filtragem antes do processamento

**📊 Monitoramento Completo:**
- Status em tempo real
- Estatísticas detalhadas
- Logs de erro e sucesso

## 🌍 Modos

**Desenvolvimento:**
- `NODE_ENV=development`
- Salva em `./stickers_dev/`
- Não faz upload para Supabase Storage
- 2 workers por instância

**Produção:**
- `NODE_ENV=production`
- Salva em `/home/ubuntu/stickers/`
- Upload completo Supabase
- 4 workers por instância

## 🔧 Comandos Úteis

```bash
# Ver processos rodando
ps aux | grep -E "(discovery|processor)"

# Parar todos os serviços
pkill -f discovery_service
pkill -f processor_service

# Ver fila em tempo real
watch -n 2 "jq '.totalPacks' discovered_packs.json"

# Ver logs de uma instância
tail -f processor.log

# Estatísticas rápidas
jq '.totalDiscovered' discovery_state.json
jq '.totalProcessedThisSession' processed_packs.json
```

## 📈 Escalabilidade

**VPS pequena (1GB RAM):**
- 1 Discovery + 2 Processors = ~6 workers

**VPS média (2GB RAM):**  
- 1 Discovery + 4 Processors = ~16 workers

**VPS grande (4GB RAM):**
- 1 Discovery + 8 Processors = ~32 workers

## 🚨 Importante

1. **Apenas 1 Discovery Service** - evita duplicação de busca
2. **Múltiplos Processors OK** - são thread-safe
3. **Monitorar espaço em disco** - packs ocupam muito espaço
4. **Verificar logs** - para identificar erros da API
5. **Backup da fila** - `discovered_packs.json` é crítico
# 🚀 Plano de Paralelização - Scraper de Stickers

## 📊 Análise do Hardware

### Recursos Disponíveis
| Recurso     | Capacidade | Utilização Atual | Potencial |
|-------------|------------|------------------|-----------|
| **CPU**     | 1 OCPU (2 threads) | ~30-40% | ✅ **80% otimizado** |
| **RAM**     | 1 GB | ~400-500 MB | ⚠️ **Crítico** (limite: 800 MB) |
| **Rede**    | 0.48 Gbps | ~50-100 Mbps | ✅ **Subutilizada** |
| **Disco**   | 50 GB Block | ~10 GB | ✅ **Abundante** |

### Gargalos Identificados
1. **I/O Wait**: Requests de rede (50-70% do tempo)
2. **Processamento**: Conversão de imagens (20-30% do tempo)  
3. **Memória**: Limitada mas gerenciável com buffering

---

## 🏗️ Arquitetura Proposta: Producer-Consumer Pipeline

### Visão Geral
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   🔍 PRODUCER   │───▶│   📦 QUEUE      │───▶│   ⚡ CONSUMER   │
│   (Discovery)   │    │   (Buffer)      │    │   (Processing)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

---

## 🎯 Estratégia de 3 Workers

### Worker 1: 🔍 **Discovery & Fetch** (Thread Principal)
**Responsabilidade**: Descobrir e baixar stickers
- Buscar packs na API (recomendados + keywords)
- Filtrar duplicados rapidamente (cache em memória)
- Classificar automaticamente: **LEVE** vs **PESADO**
- Baixar imagens e adicionar à fila de processamento

### Worker 2: ⚡ **Light Processing** (Thread Secundária)
**Responsabilidade**: Processar stickers leves
- Stickers estáticos pequenos (< 100KB)
- Conversão simples (redimensionamento básico)
- Upload direto ao Supabase
- Processamento rápido (~1-2s por pack)

### Worker 3: 🔨 **Heavy Processing** (Compartilhado)
**Responsabilidade**: Processar stickers pesados
- Stickers animados ou grandes (> 100KB)
- Conversão complexa (otimização, frames)
- Processamento sequencial quando necessário
- Tempo de processamento variável (~5-15s por pack)

---

## 📋 Classificação Automática de Workload

### 🟢 **LEVE** (Worker 2 - Rápido)
```javascript
Critérios:
- Arquivos estáticos (.webp, .png)
- Tamanho < 100KB por sticker
- Pack com < 10 stickers
- Sem necessidade de otimização agressiva

Processamento:
- Redimensionar para 512x512
- Converter para WebP (qualidade 80)
- Criar tray simples
- Upload direto
```

### 🔴 **PESADO** (Worker 3 - Cuidadoso)
```javascript
Critérios:
- Arquivos animados (.gif)
- Tamanho > 100KB por sticker
- Pack com > 10 stickers
- Necessita otimização agressiva

Processamento:
- Extrair frames de GIFs
- Otimização de tamanho
- Recompressão inteligente
- Validação rigorosa
- Upload com retry
```

---

## 🔄 Fluxo de Execução

### Fase 1: Inicialização
```javascript
// Startup simultâneo
┌─ Worker 1 (Discovery): Carrega cache existente
├─ Worker 2 (Light): Inicializa processador de imagem
└─ Worker 3 (Heavy): Preaquece ferramentas de conversão
```

### Fase 2: Operação Contínua
```javascript
// Loop principal
Worker 1: 
  ├─ Busca packs API → [Queue Discovery]
  ├─ Baixa imagens → Classifica (LEVE/PESADO)
  ├─ LEVE → [Queue Light] 
  └─ PESADO → [Queue Heavy]

Worker 2 (paralelo):
  ├─ Processa [Queue Light] → Upload → Marca como completo
  └─ Se fila vazia → Auxilia Worker 3

Worker 3 (sob demanda):
  ├─ Processa [Queue Heavy] → Upload → Marca como completo  
  └─ Executa quando há items ou Worker 2 disponível
```

---

## 💾 Gestão de Memória (Crítica!)

### Buffer Inteligente
```javascript
Limits por Worker:
- Discovery: 200 MB (cache + downloads)
- Light Processing: 150 MB (processamento básico)  
- Heavy Processing: 300 MB (quando ativo)
- Buffer Global: 100 MB (overhead + queues)

Total Target: ~750 MB (75% da RAM disponível)
```

### Estratégias de Otimização
1. **Stream Processing**: Não carregar pack completo na memória
2. **Cache LRU**: Remover duplicados antigos automaticamente
3. **Garbage Collection**: Forçar limpeza entre packs pesados
4. **Back-pressure**: Pausar discovery se filas muito cheias

---

## 📊 Filas de Processamento

### Queue Light (Rápida)
```javascript
{
  maxSize: 50 packs,
  priority: HIGH,
  timeout: 30s por pack,
  retries: 2
}
```

### Queue Heavy (Controlada)  
```javascript
{
  maxSize: 10 packs,
  priority: NORMAL,
  timeout: 120s por pack,
  retries: 3
}
```

### Queue Discovery (Buffer)
```javascript
{
  maxSize: 100 pack IDs,
  priority: URGENT,
  dedupe: true
}
```

---

## ⚡ Implementação Técnica

### Tecnologias
- **Node.js Worker Threads**: Para paralelização real
- **EventEmitter**: Comunicação entre workers
- **Bull Queue**: Gestão de filas persistentes (opcional)
- **Cluster Module**: Fallback se Worker Threads não funcionarem

### Arquivos Principais
```
/workers/
  ├─ discoveryWorker.js    # Worker 1 - API calls
  ├─ lightProcessor.js     # Worker 2 - Stickers leves  
  ├─ heavyProcessor.js     # Worker 3 - Stickers pesados
  ├─ queueManager.js       # Gestão centralizada de filas
  └─ resourceMonitor.js    # Monitor de RAM/CPU
  
/queues/
  ├─ lightQueue.js         # Fila de processamento leve
  ├─ heavyQueue.js         # Fila de processamento pesado
  └─ discoveryQueue.js     # Fila de descoberta
```

---

## 📈 Métricas Esperadas

### Performance Teórica
| Métrica | Atual | Com Paralelização | Melhoria |
|---------|-------|-------------------|----------|
| **Packs/hora** | ~20-30 | ~60-80 | **+150%** |
| **Uso CPU** | 30-40% | 75-85% | **+100%** |  
| **Uso RAM** | 400MB | 750MB | +87% |
| **Downtime** | 5-10% | <2% | **-80%** |

### Benefícios
- ✅ **Discovery contínua**: Nunca para de buscar novos packs
- ✅ **Paralelização real**: Workers independentes
- ✅ **Priorização**: Stickers leves processados rapidamente
- ✅ **Resiliência**: Falha de um worker não para os outros
- ✅ **Utilização otimizada**: Aproveita threads + rede + I/O

---

## 🎛️ Configuração Proposta

### Environment Variables
```bash
# Paralelização
ENABLE_PARALLEL_PROCESSING=true
MAX_LIGHT_WORKERS=1
MAX_HEAVY_WORKERS=1  
DISCOVERY_WORKER_ENABLED=true

# Filas
LIGHT_QUEUE_SIZE=50
HEAVY_QUEUE_SIZE=10
DISCOVERY_QUEUE_SIZE=100

# Recursos
MAX_MEMORY_MB=750
CPU_USAGE_TARGET=80
ENABLE_RESOURCE_MONITORING=true

# Thresholds
LIGHT_PACK_MAX_SIZE_KB=100
LIGHT_PACK_MAX_STICKERS=10
HEAVY_PROCESSING_TIMEOUT_MS=120000
```

---

## 🚀 Fases de Implementação

### Fase 1: Base (1-2 dias)
- [ ] Criar estrutura de workers
- [ ] Implementar sistema de filas básico
- [ ] Migrar discovery para worker dedicado

### Fase 2: Paralelização (2-3 dias)  
- [ ] Implementar light processor worker
- [ ] Criar classificador automático LEVE/PESADO
- [ ] Conectar discovery → light processing

### Fase 3: Heavy Processing (1-2 dias)
- [ ] Implementar heavy processor
- [ ] Sistema de fallback light → heavy
- [ ] Balanceamento dinâmico de carga

### Fase 4: Otimização (1 dia)
- [ ] Monitor de recursos em tempo real
- [ ] Auto-throttling baseado em RAM
- [ ] Métricas e dashboards

---

## ⚠️ Riscos e Mitigações

### Risco: Esgotamento de RAM
**Mitigação**: Monitor contínuo + auto-throttling + GC forçado

### Risco: Deadlock entre workers  
**Mitigação**: Timeouts agressivos + circuit breakers

### Risco: Overhead de comunicação
**Mitigação**: Queues eficientes + batching quando possível

### Risco: Complexidade de debug
**Mitigação**: Logging estruturado + worker IDs + métricas

---

## 🎯 ROI Esperado

**Hardware**: Gratuito (Oracle Always Free)
**Desenvolvimento**: ~5-8 dias  
**Melhoria**: 150% mais packs processados
**Redução downtime**: 80% menos paradas manuais

**Conclusão**: ✅ **VIÁVEL e RECOMENDADO** para seu hardware!

---

*Plano criado em: ${new Date().toLocaleString('pt-BR')}*
*Hardware analisado: VM.Standard.E2.1.Micro (1 OCPU, 1GB RAM)*
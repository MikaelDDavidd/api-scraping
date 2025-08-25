# 🚀 Simple Stickers Scraper Multithread

Versão simplificada e multithread da API original de stickers.

## 📋 Características

- ✅ **Multithread**: Múltiplos workers processando packs simultaneamente
- ✅ **API Original**: Baseado na lógica exata da API original 
- ✅ **Verificação Paginada**: Carrega packs existentes do Supabase para evitar duplicados
- ✅ **Modo Dev/Prod**: Salva local em dev, na VPS em produção
- ✅ **Auto-limpeza**: Remove logs antigos automaticamente
- ✅ **Supabase + Local**: Salva no banco + arquivos locais

## 🏗️ Instalação

```bash
# 1. Instalar dependências
npm run install-deps

# 2. Configurar ambiente
cp .env_simple .env
# Editar .env com suas credenciais

# 3. Executar
npm run dev    # Modo desenvolvimento
npm start      # Modo produção
```

## 🔧 Configuração

### Arquivo .env
```bash
SUPABASE_URL=sua_url_aqui
SUPABASE_SERVICE_KEY=sua_chave_aqui
NODE_ENV=development  # ou production
```

### Modos de Execução

**Desenvolvimento (`npm run dev`):**
- Salva figurinhas em `./stickers_dev/`
- Apenas 2 workers simultâneos  
- Não faz upload para Supabase Storage
- Para testes locais

**Produção (`npm start`):**
- Salva figurinhas em `/home/ubuntu/stickers/`
- 4 workers simultâneos
- Upload completo para Supabase
- Para usar na VPS

## 📁 Estrutura de Arquivos

```
projeto/
├── simple_scraper.js      # Scraper principal
├── pack_worker.js         # Worker de processamento
├── data_captured/         # Logs temporários (auto-limpeza)
├── stickers_dev/         # Figurinhas em modo dev
└── .env                  # Configurações
```

## 🔄 Como Funciona

1. **Busca**: Consulta API do Stickerly para packs recomendados
2. **Filtragem**: Verifica no Supabase quais packs já existem (paginado)
3. **Processamento**: Workers em paralelo baixam e processam packs novos
4. **Salvamento**: 
   - Banco: Metadados no Supabase
   - Arquivos: Local (dev) ou VPS (prod)
5. **Limpeza**: Remove logs antigos automaticamente

## 📊 Workers

- **Worker Principal**: Coordena busca e distribuição de trabalho
- **Pack Workers**: Processam packs individuais (download, conversão, upload)
- **Auto-scaling**: Ajusta número de workers por modo (2 dev, 4 prod)

## 🧹 Limpeza Automática

- Mantém máximo 100 arquivos de log
- Limpa a cada 30 minutos
- Remove sempre os mais antigos primeiro

## ⚠️ Pré-requisitos

- Node.js 16+
- Acesso ao Supabase configurado
- Espaço em disco para figurinhas
- Em produção: pasta `/home/ubuntu/stickers/` deve existir

## 🐛 Troubleshooting

**"Erro ao carregar packs existentes"**
- Verificar credenciais Supabase
- Verificar conexão internet

**"Worker erro"**
- Verificar espaço em disco
- Verificar permissões de escrita

**"Nenhum pack novo"**
- Normal, significa que todos os packs já existem
- API pode estar retornando os mesmos packs

## 📈 Performance

- **Workers simultâneos**: 2 (dev) / 4 (prod)
- **Cache inteligente**: Evita reprocessamento
- **Timeouts otimizados**: 30s download, 60s processamento
- **Memory safe**: Limpa arquivos temporários automaticamente

## 🎯 Diferenças da API Original

**Mantido igual:**
- Lógica de processamento de stickers
- Conversão PNG → WebP  
- Criação de tray
- Estrutura do banco

**Melhorado:**
- ✅ Multithread (workers paralelos)
- ✅ Verificação de duplicados antes do processamento
- ✅ Auto-limpeza de logs
- ✅ Modo dev/prod
- ✅ Tratamento de erro robusto
# 🎯 Stickers Scraper

Sistema completo de scraping de stickers do sticker.ly para Supabase, desenvolvido para o app Stickers & Memes.

## 📋 Características

- **Scraping Inteligente**: Busca packs recomendados e por palavras-chave
- **Compatibilidade WhatsApp**: Processamento que atende 100% dos requisitos do WhatsApp
- **Processamento de Imagens**: Converte, redimensiona e otimiza automaticamente
- **Upload Automático**: Integração completa com Supabase Storage + Database
- **Sistema de Logs**: Logging detalhado com níveis configuráveis
- **Tratamento de Erros**: Retry automático e tratamento robusto de falhas
- **Multi-idioma**: Suporte a múltiplos locales (pt-BR, en-US, es-ES, fr-FR)
- **Controle de Taxa**: Rate limiting para não sobrecarregar APIs
- **Geração de Emojis**: Sistema inteligente de associação de emojis aos stickers
- **Validação Rigorosa**: Validação completa dos requisitos técnicos do WhatsApp

## 🚀 Instalação

1. **Clone e navegue para o diretório:**
```bash
cd api-scraping
```

2. **Instale as dependências:**
```bash
npm install
```

3. **Configure as variáveis de ambiente:**
```bash
cp .env.example .env
# Edite o arquivo .env com suas configurações
```

4. **Execute o scraper:**
```bash
npm start
```

## ⚙️ Configuração

### Variáveis de Ambiente (.env)

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key  
SUPABASE_SERVICE_KEY=your_supabase_service_key

# Storage Configuration
SUPABASE_BUCKET_NAME=stickers

# Scraping Configuration
MAX_PACKS_PER_RUN=50
DELAY_BETWEEN_REQUESTS=2000
MAX_RETRIES=3

# Logging
LOG_LEVEL=info
```

### Estrutura do Banco de Dados

O sistema utiliza as tabelas existentes do projeto:
- `packs`: Informações dos packs
- `stickers`: Informações individuais dos stickers
- `scraping_state`: Estado do scraping
- `stats`: Estatísticas de uso

## 📖 Uso

### Comandos Básicos

```bash
# Processamento completo (padrão)
node index.js

# Apenas packs recomendados
node index.js recommended

# Busca por keywords específicas
node index.js keywords memes funny amor

# Processamento completo com keywords customizadas
node index.js full trabalho família amigos

# Modo de teste (1 pack por locale)
node index.js test

# Mostrar estatísticas
node index.js stats

# Ajuda
node index.js help
```

### Scripts NPM

```bash
npm start          # Execução normal
npm run dev        # Execução com nodemon (desenvolvimento)
```

## 🏗️ Arquitetura

### Estrutura de Diretórios

```
api-scraping/
├── config/
│   └── config.js           # Configurações centralizadas
├── services/
│   ├── stickerlyClient.js  # Cliente para API do sticker.ly
│   ├── imageProcessor.js   # Processamento de imagens
│   ├── supabaseClient.js   # Cliente Supabase
│   └── packProcessor.js    # Coordenador principal
├── utils/
│   └── logger.js           # Sistema de logging
├── temp/                   # Arquivos temporários
├── logs/                   # Arquivos de log
└── index.js               # Ponto de entrada
```

### Fluxo de Processamento

1. **Descoberta**: Busca packs via API do sticker.ly
2. **Validação**: Verifica se pack já existe no banco
3. **Download**: Baixa todos os stickers do pack
4. **Processamento**: Converte/otimiza imagens
5. **Upload**: Envia para Supabase Storage
6. **Registro**: Salva metadados no banco
7. **Logging**: Registra todas as operações

## ✅ Compatibilidade com WhatsApp

O sistema foi desenvolvido seguindo rigorosamente a documentação oficial do WhatsApp para stickers:

### Requisitos Técnicos Atendidos

#### 🖼️ **Tray (Ícone do Pack)**
- ✅ Formato: PNG obrigatório  
- ✅ Dimensões: Exatamente 96x96 pixels
- ✅ Tamanho: Menor que 50KB
- ✅ Processamento: Conversão automática e otimização

#### 🎨 **Stickers Estáticos**
- ✅ Formato: WebP obrigatório
- ✅ Dimensões: Exatamente 512x512 pixels  
- ✅ Tamanho: Menor que 100KB por arquivo
- ✅ Fundo: Transparente automático
- ✅ Emojis: Pelo menos 1 emoji por sticker

#### 🎭 **Stickers Animados**
- ✅ Formato: WebP animado obrigatório
- ✅ Dimensões: Exatamente 512x512 pixels
- ✅ Tamanho: Menor que 500KB por arquivo
- ✅ Fundo: Transparente automático  
- ✅ Emojis: Pelo menos 1 emoji por sticker

#### 📦 **Pack Requirements**
- ✅ Quantidade: Entre 3 e 30 stickers obrigatório
- ✅ Identificador: Único e válido
- ✅ Nome e Autor: Obrigatórios e válidos
- ✅ Metadados: Completos para export

### Sistema de Emojis Inteligente

O scraper gera automaticamente emojis apropriados baseado no nome dos arquivos:

```javascript
// Exemplos de mapeamento automático
'smile_happy.webp' → ['😊', '😄', '😃']
'cat_love.webp' → ['🐱', '😸', '❤️']  
'fire_cool.webp' → ['🔥', '💥', '⚡']
'brasil_flag.webp' → ['🇧🇷', '💚', '💛']
```

## 🛠️ Serviços

### StickerlyClient
- Comunicação com API do sticker.ly
- Rate limiting e retry automático
- Suporte a múltiplos locales
- Download de arquivos

### ImageProcessor
- Conversão para WebP
- Redimensionamento inteligente
- Criação de thumbnails (tray)
- Validação de imagens
- Otimização de qualidade

### SupabaseClient
- Upload para Storage
- Operações no banco de dados
- Verificação de duplicatas
- Gerenciamento de estatísticas

### PackProcessor
- Coordenação de todo o processo
- Controle de sessão
- Estatísticas em tempo real
- Tratamento de erros

## 📊 Logging e Monitoramento

### Níveis de Log
- `error`: Erros críticos
- `warn`: Avisos importantes
- `info`: Informações gerais
- `debug`: Detalhes técnicos

### Eventos Especiais
- `pack_found`: Pack descoberto
- `pack_processed`: Pack processado (sucesso/falha)
- `sticker_processed`: Sticker individual processado
- `upload_success/error`: Status de uploads
- `scraping_start/end`: Início/fim de sessões

### Arquivos de Log
- Console: Output colorizado para desenvolvimento
- Arquivo: `logs/scraper.log` com rotação automática

## 🔧 Configurações Avançadas

### Limitações de Taxa
```javascript
delayBetweenRequests: 2000,  // 2s entre requests
maxRetries: 3,               // 3 tentativas por request
maxPacksPerRun: 50          // Máximo 50 packs por execução
```

### Processamento de Imagens
```javascript
maxStickerSize: { width: 512, height: 512 },
traySize: { width: 96, height: 96 },
quality: 80,
maxFileSize: 50 * 1024 * 1024  // 50MB
```

### Locales Suportados
- `pt-BR`: Português Brasil
- `en-US`: Inglês EUA
- `es-ES`: Espanhol Espanha
- `fr-FR`: Francês França

## 🐛 Resolução de Problemas

### Problemas Comuns

**Erro de autenticação Supabase:**
- Verifique as chaves no arquivo `.env`
- Confirme se o service key tem permissões adequadas

**Falha no upload:**
- Verifique se o bucket existe no Supabase
- Confirme as políticas de acesso do Storage

**Rate limiting:**
- Aumente `DELAY_BETWEEN_REQUESTS` no `.env`
- Reduza `MAX_PACKS_PER_RUN`

**Imagens corrompidas:**
- O sistema automaticamente pula imagens inválidas
- Verifique os logs para detalhes específicos

### Debug

Para debug detalhado:
```bash
LOG_LEVEL=debug node index.js test
```

## 📈 Estatísticas

O sistema coleta automaticamente:
- Total de packs processados
- Taxa de sucesso/falha
- Tempo de processamento
- Tamanho dos arquivos
- Estatísticas por locale

## 🤝 Integração com App Principal

O scraper foi projetado para funcionar com a estrutura existente:
- Usa as mesmas tabelas do banco
- Mantém compatibilidade com a API atual
- Segue os padrões de nomenclatura estabelecidos

## 🔄 Automação

Para execução automática, configure um cron job:
```bash
# Executa diariamente às 2h da manhã
0 2 * * * cd /path/to/api-scraping && node index.js >> cron.log 2>&1
```

## 📄 Licença

Este projeto faz parte do app Stickers & Memes e segue a mesma licença do projeto principal.
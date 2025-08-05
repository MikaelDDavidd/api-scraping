# 🎯 Setup Completo VPS - Scraper de Stickers

## ✅ Status Atual
- ✅ VPS Oracle Cloud configurada (136.248.96.180)
- ✅ Nginx servindo stickers em `/stickers/`
- ✅ Firewall liberado (porta 80)
- ✅ Código já preparado para storage local

## 🚀 Como Usar

### 1. Deploy na VPS
```bash
# No seu computador local, dentro da pasta api-scraping
./deploy-to-vps.sh
```

### 2. Configurar Credenciais Supabase
```bash
# Na VPS, edite o arquivo .env
ssh ubuntu@136.248.96.180
cd /home/ubuntu/api-scraping
nano .env

# Configure suas credenciais do Supabase:
SUPABASE_URL=sua_url_supabase
SUPABASE_ANON_KEY=sua_chave_anonima
SUPABASE_SERVICE_KEY=sua_chave_service
```

### 3. Iniciar o Scraper
```bash
# Na VPS
cd /home/ubuntu/api-scraping
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Para auto-start no boot
```

## 📊 Monitoramento

### Ver Logs em Tempo Real
```bash
pm2 logs stickers-scraper
pm2 monit  # Monitor visual
```

### Status do Sistema
```bash
pm2 status
pm2 info stickers-scraper
```

## 🎯 Como Funciona

### Storage Híbrido
- **Arquivos (stickers/tray)**: Salvos localmente em `/home/ubuntu/stickers/`
- **Metadados (banco)**: Salvos no Supabase para consultas
- **Acesso público**: Via Nginx em `http://136.248.96.180/stickers/`

### Modo Contínuo VPS
```bash
node index.js continuous  # Roda 24/7 com persistência
```

### Recursos do Modo VPS
- ✅ **Estado persistente**: Retoma de onde parou após reinicialização
- ✅ **Métricas detalhadas**: Logs estruturados no Supabase
- ✅ **Graceful shutdown**: Ctrl+C salva estado antes de parar
- ✅ **Ciclos infinitos**: Processa todos locales/keywords continuamente
- ✅ **Rate limiting**: Respeita limites da API

## 📁 Estrutura de Arquivos na VPS

```
/home/ubuntu/
├── api-scraping/          # Código do scraper
│   ├── index.js           # Script principal
│   ├── .env              # Configurações
│   ├── ecosystem.config.js # Config PM2
│   └── logs/             # Logs do PM2
│
└── stickers/             # Arquivos dos packs
    ├── 00YI0K/
    │   ├── tray.png
    │   ├── sticker1.webp
    │   └── sticker2.webp
    ├── 011QRW/
    └── ...
```

## 🌐 URLs de Acesso

- **Status da API**: http://136.248.96.180/status
- **Stickers**: http://136.248.96.180/stickers/PACK_ID/arquivo.webp
- **Exemplo**: http://136.248.96.180/stickers/00YI0K/tray.png

## 🔧 Comandos Úteis

### Gerenciamento PM2
```bash
pm2 start stickers-scraper      # Iniciar
pm2 stop stickers-scraper       # Parar
pm2 restart stickers-scraper    # Reiniciar
pm2 delete stickers-scraper     # Remover
```

### Testes Rápidos
```bash
# Teste com apenas 1 pack por locale
node index.js test

# Modo otimizado (recomendado)
node index.js optimized

# Ver estatísticas
node index.js stats
```

### Limpeza e Manutenção
```bash
# Ver estatísticas do storage local
node -e "const LocalStorageClient = require('./services/localStorageClient'); new LocalStorageClient().getStorageStats().then(console.log)"

# Limpar arquivos órfãos
node -e "const LocalStorageClient = require('./services/localStorageClient'); new LocalStorageClient().cleanupOrphanFiles().then(console.log)"
```

## ⚠️ Variáveis de Ambiente Importantes

```bash
# Storage local ativado
USE_LOCAL_STORAGE=true
LOCAL_STORAGE_PATH=/home/ubuntu/stickers
STORAGE_BASE_URL=http://136.248.96.180

# Performance para VPS
MAX_PACKS_PER_RUN=100
DELAY_BETWEEN_REQUESTS=1000
MAX_RUNTIME_HOURS=24
```

## 🎉 Resultado Final

Depois de executar o scraper, você terá:

1. **Packs organizados** em `/home/ubuntu/stickers/PACK_ID/`
2. **Metadados no Supabase** para consultas rápidas
3. **Acesso via HTTP** em `http://136.248.96.180/stickers/`
4. **Processo automático** rodando 24/7 via PM2

## 🔄 Atualizações

Para atualizar o código:
```bash
# No computador local
./deploy-to-vps.sh

# Na VPS, reiniciar
pm2 restart stickers-scraper
```

## 📈 Próximos Passos

1. Configure suas credenciais do Supabase
2. Execute o deploy: `./deploy-to-vps.sh`
3. Inicie o scraper: `pm2 start ecosystem.config.js`
4. Monitore: `pm2 logs stickers-scraper`
5. Acesse: http://136.248.96.180/stickers/

🎯 **Pronto! Seu scraper de stickers está funcionando na VPS!**
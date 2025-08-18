# 🚀 Setup de Produção - Sistema Paralelo de Stickers

## ✅ Configuração do PM2 Corrigida

### Problemas Resolvidos:
- ❌ **Múltiplas instâncias de teste**: Removidas configurações de teste do PM2
- ❌ **Caminhos incorretos**: Configurados para `/home/ubuntu/api-scraping`
- ❌ **Instâncias duplicadas**: Apenas 1 instância de produção
- ❌ **Storage mal configurado**: Configurado para `/home/ubuntu/stickers`

## 📋 Comandos Para Produção

### Uso Recomendado (Ubuntu VPS):

```bash
# Navegar para o diretório
cd /home/ubuntu/api-scraping

# Dar permissões (primeira vez)
chmod +x pm2-production.sh
chmod +x pm2-commands.sh

# Iniciar aplicação (RECOMENDADO)
./pm2-production.sh start

# Ver status
./pm2-production.sh status

# Ver logs em tempo real
./pm2-production.sh logs

# Reiniciar aplicação
./pm2-production.sh restart

# Deploy completo (após git pull)
./pm2-production.sh deploy

# Parar aplicação
./pm2-production.sh stop
```

### Ver todos os comandos:
```bash
./pm2-commands.sh
```

## ⚙️ Configuração do Ambiente

### Variáveis de Ambiente (Produção):
```bash
NODE_ENV=production
USE_LOCAL_STORAGE=false
STORAGE_BASE_URL=http://136.248.96.180
STORAGE_PATH=/home/ubuntu/stickers
MAX_MEMORY_MB=800
MAX_CPU_PERCENT=75
DISABLE_AUTO_TESTS=true
PRODUCTION_MODE=true
```

### Estrutura de Diretórios:
```
/home/ubuntu/
├── api-scraping/              # Código da aplicação
│   ├── run_parallel_system.js # Script principal
│   ├── ecosystem.config.js    # Configuração PM2
│   ├── pm2-production.sh      # Script de gerenciamento
│   └── logs/                  # Logs da aplicação
│       ├── production.log
│       ├── production-out.log
│       └── production-error.log
└── stickers/                  # Figurinhas salvas
    ├── PACK001/
    ├── PACK002/
    └── ...
```

## 🔧 Configuração PM2

### Arquivo `ecosystem.config.js`:
- **Nome**: `stickers-parallel-production`
- **Instâncias**: 1 (apenas uma!)
- **Modo**: `fork`
- **Auto-restart**: Sim
- **Max restarts**: 5
- **Memory limit**: 900MB

### Recursos Monitorados:
- Memória: Limite 800MB, restart em 900MB
- CPU: Limite 75%
- Logs: Rotacionados automaticamente
- Auto-start: Configurado para boot do sistema

## 🚨 Comandos PROIBIDOS

### ❌ NÃO usar estes comandos:
```bash
# Estes criam múltiplas instâncias!
pm2 start run_parallel_system.js
npm start
node run_parallel_system.js
pm2 start ecosystem.config.js --instances 2+
```

### ✅ Usar APENAS estes:
```bash
./pm2-production.sh start    # Comando recomendado
pm2 list                     # Ver status
pm2 logs stickers-parallel-production  # Ver logs
```

## 📊 Monitoramento

### Status da aplicação:
```bash
# Status detalhado
./pm2-production.sh status

# PM2 monitor interativo
pm2 monit

# Uso de recursos do sistema
htop
df -h
```

### Logs importantes:
```bash
# Logs da aplicação
tail -f /home/ubuntu/api-scraping/logs/production.log

# Apenas erros
tail -f /home/ubuntu/api-scraping/logs/production-error.log

# Logs PM2
pm2 logs stickers-parallel-production --lines 50
```

## 🔄 Deploy e Atualização

### Deploy completo:
```bash
cd /home/ubuntu/api-scraping
git pull origin main
./pm2-production.sh deploy
```

### O script `deploy` faz:
1. Para a aplicação antiga
2. Instala dependências (`npm install --production`)
3. Limpa logs antigos (>7 dias)
4. Inicia nova versão
5. Verifica se está funcionando

## 🏗️ Configuração Inicial (Primeira vez)

```bash
# 1. Instalar dependências
cd /home/ubuntu/api-scraping
npm install --production

# 2. Dar permissões aos scripts
chmod +x pm2-production.sh
chmod +x pm2-commands.sh

# 3. Configurar auto-start no boot
pm2 startup systemd -u ubuntu --hp /home/ubuntu

# 4. Iniciar aplicação
./pm2-production.sh start

# 5. Salvar configuração
pm2 save
```

## 🔍 Verificações

### Verificar se está funcionando:
```bash
# Status da aplicação
pm2 list

# Deve mostrar: stickers-parallel-production | online

# Verificar logs
pm2 logs stickers-parallel-production --lines 20

# Verificar figurinhas sendo salvas
ls -la /home/ubuntu/stickers/

# Verificar uso de recursos
htop
```

### Dashboard CLI funcionando:
O sistema mostra uma interface bonita no terminal com:
- ✅ Status do sistema
- ✅ Progresso de discovery
- ✅ Filas ativas (discovery, light, heavy)
- ✅ Estatísticas do banco
- ✅ Uso de recursos

## 🚨 Troubleshooting

### Se algo der errado:
```bash
# Parar tudo e recomeçar
./pm2-production.sh stop
./pm2-production.sh start

# Em casos extremos
pm2 kill
./pm2-production.sh start

# Verificar logs de erro
cat /home/ubuntu/api-scraping/logs/production-error.log
```

### Verificar configurações:
```bash
# Ver configuração carregada
pm2 info stickers-parallel-production

# Ver variáveis de ambiente
pm2 env stickers-parallel-production
```

## 📈 Resultados Esperados

Com esta configuração, o sistema deve:
- ✅ Descobrir packs via API sem parar
- ✅ Extrair autores corretamente (não mais "desconhecido")
- ✅ Salvar figurinhas em `/home/ubuntu/stickers/`
- ✅ Processar light e heavy separadamente
- ✅ Manter apenas 1 instância rodando
- ✅ Mostrar dashboard CLI bonito
- ✅ Auto-restart em caso de erro
- ✅ Logs organizados e rotativos
# Setup VPS Oracle Cloud - Stickers Scraper com PM2

Este guia detalha como configurar o scraper para rodar 24/7 na VPS Oracle Cloud usando PM2.

## 📋 Pré-requisitos

### Na VPS Oracle Cloud:
- Ubuntu 20.04+ (recomendado)
- 2GB+ RAM 
- 20GB+ espaço em disco
- Conexão com internet estável

### No Supabase:
- Projeto criado
- Tabelas criadas (ver schemas SQL)
- Bucket de storage configurado
- Service Key obtida

## 🚀 Instalação

### 1. Upload dos arquivos
```bash
# Fazer upload de todos os arquivos da pasta api-scraping para /home/ubuntu/stickers-scraper/api-scraping/
scp -r api-scraping ubuntu@SEU_IP_VPS:/home/ubuntu/stickers-scraper/
```

### 2. Configurar .env
```bash
# Na VPS, criar arquivo .env
cd /home/ubuntu/stickers-scraper/api-scraping
nano .env
```

Conteúdo do `.env`:
```env
# Supabase Configuration
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_ANON_KEY=sua_chave_anonima_aqui
SUPABASE_SERVICE_KEY=sua_chave_servico_aqui

# Scraping Settings (otimizado para VPS)
MAX_PACKS_PER_RUN=100
DELAY_BETWEEN_REQUESTS=3000
MAX_RETRIES=5
LOG_LEVEL=info

# Storage
SUPABASE_BUCKET_NAME=stickers

# Performance (ajustar conforme VPS)
MAX_CONCURRENT_UPLOADS=5
IMAGE_QUALITY=85
```

### 3. Executar deploy
```bash
cd /home/ubuntu/stickers-scraper/api-scraping
chmod +x deploy-vps.sh
./deploy-vps.sh
```

## 🔧 Gerenciamento com PM2

### Scripts de monitoramento PM2:
```bash
# Deploy completo (recomendado para primeira execução)
./monitor.sh deploy

# Ver status de todos os processos
./monitor.sh status

# Iniciar apenas aplicação principal
./monitor.sh start

# Parar aplicação principal
./monitor.sh stop

# Reiniciar aplicação principal
./monitor.sh restart

# Recarregar sem downtime
./monitor.sh reload

# Ver logs em tempo real
./monitor.sh logs

# Executar teste
./monitor.sh test

# Gerar estatísticas
./monitor.sh stats

# Monitor interativo
./monitor.sh monit

# Salvar configuração atual
./monitor.sh save
```

### Comandos PM2 diretos:
```bash
# Status de todos os processos
pm2 status

# Monitor interativo
pm2 monit

# Logs em tempo real
pm2 logs

# Logs apenas da aplicação principal
pm2 logs stickers-scraper-vps

# Informações detalhadas
pm2 show stickers-scraper-vps

# Reiniciar todas as aplicações
pm2 restart all

# Salvar configuração para auto-start
pm2 save

# Ver comandos úteis
./pm2-commands.sh
```

## 📊 Monitoramento

### 1. Via Supabase (Recomendado)

**Tabela session_metrics:**
- Sessões ativas/finalizadas
- Duração total de execução
- Packs processados por sessão

**Tabela scraping_logs:**
- Eventos detalhados
- Progresso por locale/keyword
- Timestamps de cada ação

**Tabela error_logs:**
- Erros categorizados
- Stack traces para debug
- Contexto dos erros

**Tabela performance_insights:**
- Tempos de processamento
- Performance da API
- Métricas otimização

### 2. Via PM2 e Logs do Sistema
```bash
# Monitor PM2 interativo (melhor opção)
pm2 monit

# Logs de todas as aplicações
pm2 logs

# Logs apenas da aplicação principal
pm2 logs stickers-scraper-vps --lines 100

# Logs com timestamp
pm2 logs --timestamp

# Logs em formato JSON
pm2 logs --json

# Arquivos de log diretos
tail -f logs/pm2-combined.log
tail -f logs/pm2-error.log
```

### 3. Monitoramento de Recursos
```bash
# CPU e memória
htop

# Espaço em disco
df -h

# Processos Node.js
ps aux | grep node

# Conexões de rede
netstat -tlnp | grep node
```

## 🔄 Estado Persistente

### Como funciona:
- Estado salvo automaticamente no Supabase
- Retoma de onde parou após reinicialização
- Controle de ciclos e progresso

### Comandos úteis:
```bash
# Ver estado atual via PM2
pm2 show stickers-scraper-vps

# Ver estado atual (via banco)
# Query no Supabase: SELECT * FROM scraping_persistent_state;

# Reset manual do estado (se necessário)
node -e "
const PersistentStateManager = require('./services/persistentStateManager');
const mgr = new PersistentStateManager();
mgr.resetState().then(() => console.log('Estado resetado'));
"

# Restart completo com limpeza
./monitor.sh delete
./monitor.sh deploy
```

## 🛠️ Troubleshooting

### Aplicação não inicia:
```bash
# Verificar status PM2
pm2 status

# Ver logs de erro
pm2 logs --err

# Verificar configuração
node -e "require('./config/config').validateConfig()"

# Verificar dependências
npm install

# Teste manual
node index.js test

# Restart do daemon PM2 (último recurso)
pm2 kill
pm2 resurrect
```

### Alta utilização de recursos:
```bash
# Reduzir configurações no .env:
MAX_PACKS_PER_RUN=25
DELAY_BETWEEN_REQUESTS=5000
MAX_CONCURRENT_UPLOADS=2
```

### Erros de rede/Supabase:
```bash
# Verificar conectividade
curl -I https://seu-projeto.supabase.co

# Testar chaves
node -e "
const { createClient } = require('@supabase/supabase-js');
const client = createClient('URL', 'SERVICE_KEY');
client.from('packs').select('count').then(console.log);
"
```

### Logs não aparecem:
```bash
# Limpar logs PM2
pm2 flush

# Recarregar logs
pm2 reloadLogs

# Verificar permissões
sudo chown ubuntu:ubuntu /home/ubuntu/stickers-scraper/api-scraping/logs/

# Recriar diretório
mkdir -p logs temp

# Verificar configuração de logs no ecosystem
pm2 show stickers-scraper-vps
```

## 📈 Otimizações de Performance

### 1. Para VPS com pouca RAM:
```env
MAX_PACKS_PER_RUN=25
MAX_CONCURRENT_UPLOADS=2
IMAGE_QUALITY=75
```

### 2. Para VPS com boa conexão:
```env
MAX_PACKS_PER_RUN=200
DELAY_BETWEEN_REQUESTS=1000
MAX_CONCURRENT_UPLOADS=10
```

### 3. Para máxima eficiência:
```bash
# Parar aplicação atual
pm2 stop stickers-scraper-vps

# Iniciar em modo turbo (temporário)
pm2 start index.js --name "stickers-turbo" -- turbo

# Ou editar ecosystem.config.js e alterar args para 'turbo'
```

## 🔐 Segurança

### Firewall:
```bash
# Permitir apenas SSH e HTTPS
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow out 443/tcp
```

### Atualizações automáticas:
```bash
# Instalar unattended-upgrades
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
```

### Backup das configurações:
```bash
# Backup automático do .env
cp .env .env.backup.$(date +%Y%m%d)
```

## 📞 Suporte

### Métricas em tempo real:
- Acesse as tabelas do Supabase
- Use Grafana/Metabase para dashboards
- Configure alertas por email

### Debug avançado:
```bash
# Parar aplicação atual
pm2 stop stickers-scraper-vps

# Executar com debug máximo via PM2
pm2 start index.js --name "debug-scraper" --log-date-format "YYYY-MM-DD HH:mm:ss Z" -- vps
LOG_LEVEL=debug pm2 restart debug-scraper

# Profiling de memória
pm2 start index.js --name "profile-scraper" --node-args="--inspect" -- vps

# Ver logs de debug
pm2 logs debug-scraper
```

## 🎯 Vantagens do PM2

### ✅ **Principais Benefícios:**
- **Zero Downtime**: Recarregamento sem interrupção
- **Auto-restart**: Reinicia automaticamente em caso de falha
- **Monitoramento**: Interface rica de monitoramento
- **Log Management**: Rotação automática de logs
- **Cluster Mode**: Suporte a múltiplas instâncias (se necessário)
- **Startup Scripts**: Auto-start após reboot
- **Memory Management**: Restart automático por limite de memória

### 🔧 **Recursos Específicos:**
- **Graceful Shutdown**: Para aplicações com estado persistente
- **Watch Mode**: Reiniciar ao detectar mudanças de arquivo
- **Cron Jobs**: Executar tarefas agendadas
- **Process File**: Configuração centralizada no ecosystem.config.js

Este setup com PM2 garante execução estável 24/7 com monitoramento avançado e recuperação automática de falhas.
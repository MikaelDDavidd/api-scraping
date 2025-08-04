# Setup VPS Oracle Cloud - Stickers Scraper

Este guia detalha como configurar o scraper para rodar 24/7 na VPS Oracle Cloud.

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

## 🔧 Gerenciamento do Serviço

### Scripts de monitoramento:
```bash
# Ver status
./monitor.sh status

# Iniciar serviço
./monitor.sh start

# Parar serviço  
./monitor.sh stop

# Reiniciar serviço
./monitor.sh restart

# Ver logs em tempo real
./monitor.sh logs

# Executar teste
./monitor.sh test
```

### Comandos systemd diretos:
```bash
# Status detalhado
sudo systemctl status stickers-scraper.service

# Logs
sudo journalctl -u stickers-scraper.service -f

# Restart
sudo systemctl restart stickers-scraper.service

# Habilitar auto-start
sudo systemctl enable stickers-scraper.service

# Desabilitar auto-start
sudo systemctl disable stickers-scraper.service
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

### 2. Via Logs do Sistema
```bash
# Logs gerais
tail -f /var/log/syslog | grep stickers-scraper

# Logs específicos do serviço
sudo journalctl -u stickers-scraper.service -f --since "1 hour ago"

# Logs por data
sudo journalctl -u stickers-scraper.service --since "2024-08-04 00:00:00"
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
# Ver estado atual (via banco)
# Query no Supabase: SELECT * FROM scraping_persistent_state;

# Reset manual do estado (se necessário)
node -e "
const PersistentStateManager = require('./services/persistentStateManager');
const mgr = new PersistentStateManager();
mgr.resetState().then(() => console.log('Estado resetado'));
"
```

## 🛠️ Troubleshooting

### Serviço não inicia:
```bash
# Verificar configuração
node -e "require('./config/config').validateConfig()"

# Verificar dependências
npm install

# Teste manual
node index.js test
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
# Verificar permissões
sudo chown ubuntu:ubuntu /home/ubuntu/stickers-scraper/api-scraping/logs/

# Recriar diretório
mkdir -p logs temp
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
# Usar modo otimizado
node index.js turbo
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
# Executar com debug máximo
LOG_LEVEL=debug node index.js vps

# Profiling de memória
node --inspect index.js vps
```

Este setup garante execução estável 24/7 com monitoramento completo e recuperação automática de falhas.
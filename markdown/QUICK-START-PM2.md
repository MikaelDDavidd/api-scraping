# 🚀 Quick Start - PM2

Guia rápido para colocar o Stickers Scraper rodando na VPS com PM2.

## ⚡ Instalação Rápida (5 minutos)

### 1. Upload e Deploy
```bash
# Na VPS
cd /home/ubuntu/stickers-scraper/api-scraping

# Executar deploy automático
./deploy-vps.sh
```

### 2. Iniciar Aplicação
```bash
# Deploy completo (primeira vez)
./monitor.sh deploy

# Verificar status
./monitor.sh status
```

### 3. Verificar Funcionamento
```bash
# Ver logs em tempo real
./monitor.sh logs

# Monitor interativo
./monitor.sh monit
```

## 📋 Comandos Essenciais

| Comando | Descrição |
|---------|-----------|
| `./monitor.sh deploy` | Deploy completo (stop, delete, start, save) |
| `./monitor.sh status` | Status de todos os processos |
| `./monitor.sh logs` | Logs em tempo real |
| `./monitor.sh monit` | Monitor interativo |
| `./monitor.sh restart` | Reiniciar aplicação |
| `./monitor.sh stop` | Parar aplicação |

## 🎯 Principais Aplicações

### stickers-scraper-vps
- **Função**: Aplicação principal (scraping contínuo 24/7)
- **Comando**: `pm2 logs stickers-scraper-vps`
- **Auto-restart**: ✅ Sim
- **Limite memória**: 1GB

### stickers-scraper-test  
- **Função**: Executar testes rápidos
- **Comando**: `./monitor.sh test`
- **Auto-restart**: ❌ Não

### stickers-scraper-stats
- **Função**: Gerar relatórios de estatísticas  
- **Comando**: `./monitor.sh stats`
- **Auto-restart**: ❌ Não

## 🔍 Monitoramento Básico

### Status Rápido
```bash
pm2 status
```

### Logs da Aplicação Principal
```bash
pm2 logs stickers-scraper-vps --lines 50
```

### Monitor Visual (Recomendado)
```bash
pm2 monit
```
- Use setas para navegar
- `q` para sair

## ⚙️ Configurações no .env

```env
# Essenciais
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_KEY=sua_chave_service_aqui

# Performance VPS
MAX_PACKS_PER_RUN=100
DELAY_BETWEEN_REQUESTS=3000
MAX_RETRIES=5
LOG_LEVEL=info
```

## 🚨 Troubleshooting Rápido

### Aplicação não está rodando?
```bash
./monitor.sh status
./monitor.sh deploy
```

### Muitos erros nos logs?
```bash
# Ver apenas erros
pm2 logs --err

# Restart limpo
pm2 restart stickers-scraper-vps
```

### Alta utilização de RAM?
```bash
# Ver consumo atual
pm2 monit

# Restart por limite de memória (automático)
# Configurado para 1GB no ecosystem.config.js
```

### Logs não aparecem?
```bash
pm2 flush      # Limpar logs
pm2 reloadLogs # Recarregar
```

## 📊 Indicadores de Sucesso

### ✅ Funcionando Corretamente:
- `pm2 status` mostra "online" 
- Logs mostram "🎯 Processando: pt-BR + memes"
- CPU entre 10-30% no `pm2 monit`
- Memória abaixo de 800MB

### ❌ Problemas:
- Status "errored" ou "stopped"
- Muitos restarts (> 5)
- Erro de conexão Supabase nos logs
- Uso de memória > 1GB

## 🔄 Manutenção Diária

### Verificação Matinal (2 min)
```bash
pm2 status              # Status geral
pm2 logs --lines 20     # Últimos logs
```

### Limpeza Semanal (5 min)
```bash
pm2 flush               # Limpar logs antigos
pm2 reset all           # Reset estatísticas
```

## 💡 Dicas Pro

1. **Use o monitor visual**: `pm2 monit` é sua melhor ferramenta
2. **Salve sempre**: `pm2 save` após mudanças importantes
3. **Logs estruturados**: Verifique tabelas do Supabase para insights
4. **Zero downtime**: Use `pm2 reload` em vez de `restart`
5. **Auto-start**: Configurado automaticamente pelo deploy

## 🆘 Em Caso de Emergência

```bash
# Parar tudo
pm2 stop all

# Matar daemon PM2 (último recurso)
pm2 kill

# Restaurar do zero
pm2 resurrect
# ou
./monitor.sh deploy
```

---

**💬 Precisa de ajuda?** Execute `./pm2-commands.sh` para lista completa de comandos.
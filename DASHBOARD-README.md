# 🚀 Dashboard de Monitoramento em Tempo Real

Sistema de monitoramento visual em tempo real para o Stickers Scraper com interface organizada em molduras fixas.

## ✨ Características

- **Interface sem rolagem** - Todas as informações visíveis simultaneamente
- **Atualização em tempo real** - Dados atualizados a cada segundo
- **Seções organizadas** - Informações separadas por categoria
- **Integração completa** - Conecta com workers, filas e sistema de descoberta

## 📊 Seções do Dashboard

### 1. **Keywords Ativas** 🔍
- Mostra keywords em execução
- Status e tempo de execução
- Locale de cada busca

### 2. **Sistema** 💻
- Uptime do processo
- Uso de memória
- Informações do Node.js

### 3. **Descoberta** 🎯
- Packs descobertos vs processados
- Taxa de progresso
- Barra de progresso visual

### 4. **Filas** 📋
- Overview das filas leves e pesadas
- Pendentes, processando e completos
- Estatísticas em tempo real

### 5. **Packs Leves** ⚡
- Processamento atual de packs leves
- Nome, quantidade de figurinhas, tempo

### 6. **Packs Pesados** 🔨
- Processamento atual de packs pesados
- Informações detalhadas em tempo real

### 7. **Logs Gerais** 📝
- Stream de eventos do sistema
- Logs categorizados por nível
- Auto-scroll para eventos recentes

## 🚀 Como Usar

### Comandos Rápidos

```bash
# Script de comandos simplificados
./dashboard-commands.sh start      # Inicia via PM2
./dashboard-commands.sh demo       # Modo demonstração local
./dashboard-commands.sh logs       # Ver logs
./dashboard-commands.sh stop       # Parar dashboard
./dashboard-commands.sh help       # Ajuda completa
```

### Execução Direta

```bash
# Modo demonstração (para testar)
node dashboard.js --demo

# Modo normal (conecta com sistema real)
node dashboard.js
```

### Via PM2

```bash
# Iniciar dashboard
pm2 start ecosystem.config.js --only stickers-dashboard

# Modo demonstração via PM2
pm2 start ecosystem.config.js --only stickers-dashboard --env demo

# Ver logs
pm2 logs stickers-dashboard

# Parar
pm2 stop stickers-dashboard
```

## ⌨️ Controles

- **ESC** ou **q** - Sair do dashboard
- **Ctrl+C** - Sair do dashboard
- **Auto-refresh** - Atualização automática a cada segundo

## 🔧 Configuração

### Variáveis de Ambiente

```bash
# Modo normal
NODE_ENV=production
DASHBOARD_MODE=normal

# Modo demonstração
NODE_ENV=development
DASHBOARD_MODE=demo
```

### Dependências

```bash
# Instalar dependência necessária
npm install blessed
```

## 📁 Arquivos Relacionados

- `dashboard.js` - Script principal do dashboard
- `utils/dashboardLogger.js` - Interface de logging visual
- `utils/dashboardManager.js` - Gerenciador e integração com sistema
- `ecosystem.config.js` - Configuração PM2 atualizada
- `dashboard-commands.sh` - Script de comandos rápidos

## 🔗 Integrações

### Workers
- **LightProcessor** - Reporta início/fim de processamento
- **HeavyProcessor** - Reporta início/fim de processamento
- **QueueManager** - Atualiza estatísticas das filas

### Sistema
- **Logger tradicional** - Mantém logs em arquivo
- **Estado persistente** - Monitora arquivos de estado
- **Métricas em tempo real** - Coleta automática de dados

## 🎯 Modo Demonstração

O modo demo simula dados realistas para testar a interface:

```bash
./dashboard-commands.sh demo
```

**Recursos do modo demo:**
- Simula descoberta de packs
- Processos de packs leves e pesados
- Keywords ativas rotativas
- Logs realistas
- Estatísticas de filas dinâmicas

## 🐛 Troubleshooting

### Dashboard não inicia
```bash
# Verificar dependências
npm install blessed

# Testar modo demo
node dashboard.js --demo
```

### Dados não aparecem
```bash
# Verificar se sistema principal está rodando
pm2 status

# Verificar logs
pm2 logs stickers-dashboard
```

### Interface quebrada
```bash
# Limpar terminal e reiniciar
clear
./dashboard-commands.sh restart
```

## 📚 Exemplos de Uso

### Desenvolvimento
```bash
# Testar dashboard durante desenvolvimento
./dashboard-commands.sh demo
```

### Produção
```bash
# Iniciar dashboard em produção
./dashboard-commands.sh start

# Monitorar logs
./dashboard-commands.sh logs
```

### Debugging
```bash
# Executar localmente para debug
node dashboard.js

# Ver status no PM2
./dashboard-commands.sh status
```

## 🎨 Personalização

O dashboard pode ser personalizado editando:

- `utils/dashboardLogger.js` - Layout e cores
- `utils/dashboardManager.js` - Lógica de dados
- `dashboard.js` - Modo de execução

---

**💡 Dica:** Use o dashboard junto com o sistema principal para ter visibilidade completa do processamento em tempo real!
# 🚀 Guia Completo: Deploy da API de Stickers via Portainer

Este guia mostra como fazer o deploy completo do sistema de stickers usando o Portainer na Oracle Cloud VPS.

## 📋 Pré-requisitos

- ✅ VPS Oracle Cloud configurada
- ✅ Docker instalado
- ✅ Portainer instalado e rodando em `http://IP:9000`
- ✅ Código da API no servidor

## 📂 1. Preparação dos Arquivos

### 1.1 Fazer Upload do Código
```bash
# Opção A: Git clone na VPS
cd /home/ubuntu/
git clone SEU_REPOSITORIO
cd seu-repositorio/

# Opção B: SCP/Upload manual
# Fazer upload da pasta via SCP ou FileZilla para /home/ubuntu/stickers-api/
```

### 1.2 Configurar Environment
```bash
# Navegar para pasta do projeto
cd /home/ubuntu/stickers-api/

# Copiar e configurar .env
cp .env_simple .env
nano .env

# Conteúdo do .env:
SUPABASE_URL=https://sua-url.supabase.co
SUPABASE_SERVICE_KEY=sua_service_key_aqui
NODE_ENV=production
```

### 1.3 Criar Diretórios de Produção
```bash
# Criar diretórios necessários
sudo mkdir -p /home/ubuntu/stickers
sudo mkdir -p /home/ubuntu/stickers-queue  
sudo mkdir -p /home/ubuntu/stickers-logs

# Dar permissões adequadas
sudo chown -R $USER:$USER /home/ubuntu/stickers*
chmod 755 /home/ubuntu/stickers*
```

## 🐳 2. Deploy via Portainer

### 2.1 Acessar Portainer
1. Abrir navegador: `http://SEU_IP_VPS:9000`
2. Login com suas credenciais
3. Selecionar **"local"** environment

### 2.2 Criar Stack

#### Método 1: Via Docker Compose (Recomendado)

1. **Menu lateral** → **Stacks**
2. **"Add stack"** 
3. **Nome da Stack**: `stickers-system`

4. **Composer**: Colar o seguinte docker-compose.yml:

```yaml
version: '3.8'

services:
  # DISCOVERY SERVICE - 1 instância apenas
  discovery:
    image: node:18-slim
    container_name: stickers-discovery
    working_dir: /app
    command: >
      sh -c "
        apt-get update && 
        apt-get install -y libvips python3 make g++ && 
        npm install && 
        node discovery_service.js
      "
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
    volumes:
      - /home/ubuntu/stickers-api:/app
      - /home/ubuntu/stickers:/app/stickers
      - /home/ubuntu/stickers-queue:/app/queue
      - /home/ubuntu/stickers-logs:/app/logs
    restart: unless-stopped
    networks:
      - stickers-net

  # PROCESSOR SERVICE 1
  processor-1:
    image: node:18-slim
    container_name: stickers-processor-1
    working_dir: /app
    command: >
      sh -c "
        apt-get update && 
        apt-get install -y libvips python3 make g++ && 
        npm install && 
        node processor_service.js
      "
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
    volumes:
      - /home/ubuntu/stickers-api:/app
      - /home/ubuntu/stickers:/app/stickers
      - /home/ubuntu/stickers-queue:/app/queue
      - /home/ubuntu/stickers-logs:/app/logs
    depends_on:
      - discovery
    restart: unless-stopped
    networks:
      - stickers-net

  # PROCESSOR SERVICE 2
  processor-2:
    image: node:18-slim
    container_name: stickers-processor-2
    working_dir: /app
    command: >
      sh -c "
        apt-get update && 
        apt-get install -y libvips python3 make g++ && 
        npm install && 
        node processor_service.js
      "
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
    volumes:
      - /home/ubuntu/stickers-api:/app
      - /home/ubuntu/stickers:/app/stickers
      - /home/ubuntu/stickers-queue:/app/queue
      - /home/ubuntu/stickers-logs:/app/logs
    depends_on:
      - discovery
    restart: unless-stopped
    networks:
      - stickers-net

  # PROCESSOR SERVICE 3
  processor-3:
    image: node:18-slim
    container_name: stickers-processor-3
    working_dir: /app
    command: >
      sh -c "
        apt-get update && 
        apt-get install -y libvips python3 make g++ && 
        npm install && 
        node processor_service.js
      "
    environment:
      - NODE_ENV=production
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
    volumes:
      - /home/ubuntu/stickers-api:/app
      - /home/ubuntu/stickers:/app/stickers
      - /home/ubuntu/stickers-queue:/app/queue
      - /home/ubuntu/stickers-logs:/app/logs
    depends_on:
      - discovery
    restart: unless-stopped
    networks:
      - stickers-net

  # MONITOR WEB
  monitor:
    image: node:18-slim
    container_name: stickers-monitor
    working_dir: /app
    command: >
      sh -c "
        npm install && 
        node monitor_web.js
      "
    environment:
      - NODE_ENV=production
      - PORT=3000
    volumes:
      - /home/ubuntu/stickers-api:/app
      - /home/ubuntu/stickers:/app/stickers:ro
      - /home/ubuntu/stickers-queue:/app/queue:ro
      - /home/ubuntu/stickers-logs:/app/logs:ro
    ports:
      - "3000:3000"
    depends_on:
      - discovery
    restart: unless-stopped
    networks:
      - stickers-net

networks:
  stickers-net:
    driver: bridge
```

5. **Environment variables** (rolar para baixo):
   - Nome: `SUPABASE_URL` | Valor: `https://sua-url.supabase.co`
   - Nome: `SUPABASE_SERVICE_KEY` | Valor: `sua_service_key`

6. **Deploy the stack**

### 2.3 Verificar Deploy

1. **Containers** → Ver se todos estão **"running"** (verde)
2. Se algum container estiver com erro (vermelho):
   - Clicar no container
   - **"Logs"** para ver o erro
   - **"Recreate"** para tentar novamente

## 📊 3. Monitoramento

### 3.1 Via Portainer
- **Containers** → Clicar em qualquer container → **"Stats"** para ver CPU/RAM
- **Containers** → Clicar em container → **"Logs"** para ver o que está acontecendo
- **Containers** → **"Console"** para terminal interativo

### 3.2 Via Monitor Web
- Abrir: `http://SEU_IP_VPS:3000`
- Dashboard mostra:
  - Status dos serviços
  - Tamanho da fila
  - Packs processados
  - Estatísticas em tempo real

### 3.3 Logs Importantes
```bash
# Via Portainer ou SSH
# Discovery Service - deve mostrar:
📋 Carregando packs existentes...
🔍 Verificando packs recomendados...
📦 X/Y novos packs encontrados

# Processor Services - devem mostrar:
🔧 Processando pack: XXXXX
✅ Worker X: PACKID (Y stickers)
```

## 🔧 4. Operações Comuns

### 4.1 Restart de Serviços
1. **Containers**
2. Clicar no container desejado
3. **"Restart"**

### 4.2 Ver Fila de Processamento
1. **Containers** → `stickers-discovery`
2. **"Console"** → Connect
3. `cat discovered_packs.json | head -20`

### 4.3 Verificar Stickers Salvos
1. **Containers** → qualquer processor
2. **"Console"** → Connect  
3. `ls /app/stickers | head -10`

### 4.4 Escalar Processors
1. **Stacks** → `stickers-system`
2. **"Editor"** 
3. Duplicar seção `processor-3` e renomear para `processor-4`
4. **"Update the stack"**

## 🚨 5. Troubleshooting

### Problema: Container não inicia
**Sintoma**: Container fica vermelho/stopped

**Solução**:
1. Clicar no container → **"Logs"**
2. Ver erro específico
3. Problemas comuns:
   - **"npm: not found"**: Aguardar instalação das dependências
   - **"Permission denied"**: Verificar permissões dos diretórios
   - **"SUPABASE_URL undefined"**: Verificar environment variables

### Problema: Não encontra packs novos
**Sintoma**: Fila sempre vazia

**Solução**:
1. **Discovery logs** deve mostrar carregamento do cache
2. Aguardar ~5 minutos para carregar 3K+ packs existentes
3. Se não carregar: verificar credenciais Supabase

### Problema: Processors não processam
**Sintoma**: Fila tem packs mas processors inativos

**Solução**:
1. Verificar se fila está acessível: containers compartilham volume `/queue`
2. Restart dos processors
3. Verificar logs para erros de download/upload

### Problema: Monitor não carrega
**Sintoma**: `http://IP:3000` não abre

**Solução**:
1. Verificar se porta 3000 está liberada no firewall Oracle Cloud
2. Container `stickers-monitor` deve estar "running"
3. Logs do monitor para ver erros

## 🔐 6. Firewall Oracle Cloud

Para acessar o monitor web externamente:

1. **Oracle Cloud Console**
2. **Networking** → **Virtual Cloud Networks**
3. Selecionar sua VCN
4. **Security Lists** → **Default Security List**
5. **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0`
   - Destination Port Range: `3000`
   - Protocol: TCP

## 📈 7. Monitoramento de Performance

### Via Portainer:
- **Home** → Ver uso geral de recursos
- **Containers** → Stats individuais de cada container

### Comandos úteis (Console):
```bash
# Ver tamanho da fila
cat discovered_packs.json | jq '.totalPacks'

# Ver packs processados
cat processed_packs.json | jq '.totalProcessedThisSession'

# Ver espaço usado
du -sh /app/stickers

# Ver memória dos processos
top
```

## 🎯 8. Otimizações para Oracle Free Tier

### 8.1 Reduzir Uso de Memória
- Rodar apenas 2 processors se RAM baixa
- Monitorar via Portainer Stats

### 8.2 Gerenciar Espaço em Disco
- Configurar auto-limpeza de logs antigos
- Monitorar crescimento da pasta `/stickers`

### 8.3 Auto-restart
- Todos containers têm `restart: unless-stopped`
- Sobrevivem a reboots da VPS

## ✅ 9. Checklist de Success

- [ ] Todos os 5 containers estão "running" (verde)
- [ ] Discovery carregou cache (ver logs)
- [ ] Monitor web abre em `http://IP:3000`
- [ ] Fila tem packs para processar
- [ ] Processors estão baixando stickers
- [ ] Pasta `/home/ubuntu/stickers` tem diretórios de packs
- [ ] Supabase tem novos registros na tabela `packs`

## 🚀 Deploy Completo!

Agora você tem o sistema de stickers rodando 24/7 na Oracle Cloud, gerenciado pelo Portainer, com monitoramento web e processamento distribuído!

Para parar: **Stacks** → `stickers-system` → **"Stop this stack"**
Para remover: **Stacks** → `stickers-system` → **"Delete this stack"**
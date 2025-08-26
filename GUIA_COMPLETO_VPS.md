1# 📋 Guia Completo: Deploy do Sistema de Stickers na VPS

## 🎯 O que vamos fazer
Vamos configurar seu sistema de stickers na VPS Ubuntu, migrando as figurinhas antigas e colocando tudo para funcionar com Docker.

---

## 📋 Pré-requisitos
- Acesso SSH à VPS Ubuntu
- Git instalado na VPS
- Docker e Docker Compose instalados na VPS
- URL do seu repositório Git

---

## 🚀 PASSO A PASSO COMPLETO

### 1. Conectar na VPS

```bash
# SSH para sua VPS
ssh ubuntu@vm-instance-001

# Verificar se está no diretório correto
pwd
# Deve mostrar: /home/ubuntu
```

### 2. Verificar Dependências

```bash
# Verificar se Git está instalado
git --version

# Verificar se Docker está instalado
docker --version
docker-compose --version

# Se algum não estiver instalado, instale:
# sudo apt update
# sudo apt install git docker.io docker-compose -y
# sudo usermod -aG docker ubuntu
# newgrp docker
```

### 3. Clonar o Projeto

```bash
# Clonar seu repositório (substitua pela URL correta)
git clone https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git api-scraping

# Entrar no diretório do projeto
cd api-scraping

# Verificar se baixou corretamente
ls -la
```

### 4. Executar Script de Configuração

```bash
# Executar o script de configuração (já criado na raiz do projeto)
./setup_production.sh
```

### 5. Executar Migração das Figurinhas

```bash
# Executar a migração (já criado na raiz do projeto)
./migrate_stickers.sh

# Escolha a opção 3 primeiro para fazer uma análise
# Depois execute novamente e escolha opção 1 ou 2
```

### 6. Verificar se a Migração Funcionou

```bash
# Verificar quantas figurinhas foram migradas
echo "Figurinhas originais: $(ls -1 /home/ubuntu/stickers 2>/dev/null | wc -l)"
echo "Figurinhas migradas: $(ls -1 stickers/ 2>/dev/null | wc -l)"

# Ver alguns exemplos
ls -la stickers/ | head -10
```

### 7. Configurar e Subir o Docker

```bash
# Verificar se o docker-compose.yml existe
ls -la docker-compose.yml

# Ver o conteúdo (verificar se está configurado corretamente)
cat docker-compose.yml

# Subir o ambiente Docker
docker-compose up -d

# Verificar se os containers subiram
docker ps

# Ver logs se necessário
docker-compose logs
```

### 8. Verificar se Está Funcionando

```bash
# Verificar se o sistema está rodando
docker ps

# Testar se as figurinhas estão acessíveis no container
docker exec -it $(docker ps --format "table {{.Names}}" | grep -v NAMES | head -1) ls /app/stickers | head -10

# Verificar logs do aplicativo
docker-compose logs -f --tail=50
```

---

## 🔧 Troubleshooting

### Se der erro "diretório não encontrado":
```bash
# Verificar onde estão as figurinhas antigas
find /home -name "stickers" -type d 2>/dev/null
ls -la /home/ubuntu/
ls -la /home/
```

### Se o Docker não subir:
```bash
# Verificar erros
docker-compose logs

# Verificar se as portas estão livres
sudo netstat -tulpn | grep :3000

# Recriar containers
docker-compose down
docker-compose up -d --build
```

### Se o .env não estiver correto:
```bash
# Verificar conteúdo
cat .env

# Corrigir manualmente se necessário
nano .env
```

---

## 🎉 Resultado Final

Após seguir todos os passos, você terá:

1. ✅ Projeto clonado em `/home/ubuntu/api-scraping/`
2. ✅ Figurinhas migradas de `/home/ubuntu/stickers/` para `/home/ubuntu/api-scraping/stickers/`
3. ✅ Sistema rodando com Docker
4. ✅ Backup preservado no diretório original
5. ✅ Configuração de produção aplicada

O sistema estará disponível e funcionando, com todas as suas figurinhas acessíveis pelo novo sistema Docker/Git!

---

## 📞 Comandos Úteis para Manutenção

```bash
# Ver status dos containers
docker ps

# Ver logs
docker-compose logs -f

# Reiniciar sistema
docker-compose restart

# Parar sistema
docker-compose down

# Atualizar código
git pull
docker-compose up -d --build

# Backup das figurinhas
tar -czf backup_stickers_$(date +%Y%m%d).tar.gz stickers/
```
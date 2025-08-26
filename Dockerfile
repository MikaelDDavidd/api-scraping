# Multi-stage build para otimizar tamanho da imagem
FROM node:18-slim AS base

# Instalar dependências do sistema para Sharp
RUN apt-get update && apt-get install -y \
    libvips-dev \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar dependências
RUN npm install --only=production

# Stage final
FROM node:18-slim AS final

# Instalar runtime dependencies
RUN apt-get update && apt-get install -y \
    libvips \
    webp \
    jq \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Criar usuário não-root
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Copiar node_modules do stage base
COPY --from=base /app/node_modules ./node_modules

# Copiar código da aplicação
COPY . .

# Criar diretórios necessários e dar permissões
RUN mkdir -p stickers logs && \
    chmod +x *.sh && \
    chown -R appuser:appuser /app

# Volumes para persistência
VOLUME ["/app/stickers", "/app/logs"]

# Trocar para usuário não-root
USER appuser

# Variáveis de ambiente padrão
ENV NODE_ENV=production
ENV LOG_LEVEL=info

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Expor porta para healthcheck (se necessário)
EXPOSE 3000

# Script de entrada padrão
CMD ["node", "index.js"]
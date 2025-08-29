# Build stage
FROM node:18-alpine AS builder

# Install build dependencies for Sharp and native modules
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    libc-dev \
    vips-dev \
    fftw-dev \
    build-base \
    libwebp-dev \
    libjpeg-turbo-dev \
    libpng-dev \
    giflib-dev

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev
RUN npm ci

# Copy application code
COPY . .

# Production stage
FROM node:18-alpine

# Install runtime dependencies for image processing
RUN apk add --no-cache \
    # Sharp dependencies
    vips \
    vips-tools \
    fftw \
    libjpeg-turbo \
    libpng \
    libwebp \
    libwebp-tools \
    giflib \
    librsvg \
    # WebP tools (necessário para cwebp e webpmux)
    libwebp-tools \
    # Process manager
    tini \
    # System tools
    curl \
    bash

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code from builder
COPY --from=builder /app/services ./services
COPY --from=builder /app/utils ./utils
COPY --from=builder /app/config ./config
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/*.js ./
COPY --from=builder /app/*.md ./

# Create necessary directories with proper permissions
RUN mkdir -p logs temp data_captured .cache stickers && \
    chmod 755 logs temp data_captured .cache stickers

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Change ownership of directories to nodejs user
RUN chown -R nodejs:nodejs /app

# Verify WebP tools are installed
RUN cwebp -version && webpmux -version

USER nodejs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "process.exit(0)"

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default command (fallback para index.js se enhanced não existir)
CMD ["node", "index.js"]
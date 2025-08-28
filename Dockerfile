# Build stage
FROM node:18-alpine AS builder

# Install build dependencies for Sharp
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    gcc \
    libc-dev \
    vips-dev \
    fftw-dev \
    build-base

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies including dev
RUN npm ci

# Copy application code
COPY . .

# Production stage
FROM node:18-alpine

# Install runtime dependencies for Sharp and image processing
RUN apk add --no-cache \
    vips \
    vips-tools \
    fftw \
    libjpeg-turbo \
    libpng \
    libwebp \
    giflib \
    librsvg \
    tini

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY --from=builder /app .

# Create necessary directories
RUN mkdir -p logs temp data_captured

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Use tini for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Default command
CMD ["node", "index.js"]
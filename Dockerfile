# --- Build Stage ---
FROM node:20-slim AS builder

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

# Install dependencies for build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

# --- Runtime Stage ---
FROM node:20-slim

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
ENV PATH="/root/.local/bin:${PATH}"

# Install Sberbank2Excel tool as root (it will be in /root/.local/bin)
# Then we'll make it accessible to the node user
RUN uv tool install git+https://github.com/Ev2geny/Sberbank2Excel.git

# Copy built application and production dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R node:node /app

# Add uv tools to the global path so 'node' user can find sberbank2Excel
ENV PATH="/root/.local/bin:${PATH}"
# Allow node user to execute tools from root's local bin
RUN chmod -R +x /root/.local/bin

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV ACTUAL_GROUP_NAME="Импорт из Сбера"

# EXPOSE is documenting the default port. 
# It can't be dynamic based on ENV, but you can change the actual port via -e PORT=xxx
EXPOSE 3000

# Switch to non-root user
USER node

# Start the server
CMD ["node", "dist/server.js"]

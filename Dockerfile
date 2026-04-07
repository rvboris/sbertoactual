# --- Build Stage ---
FROM node:24-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

# Install dependencies for build
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm run build

# --- Runtime Stage ---
FROM node:24-alpine

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

# Install system dependencies
RUN apk add --no-cache build-base python3

# Create data directory and set permissions
RUN mkdir -p /app/data && chown -R node:node /app

# Switch to non-root user early
USER node

# Copy built application and production dependencies
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/package.json /app/pnpm-lock.yaml ./

# Re-install production dependencies to ensure native modules (like better-sqlite3) 
# are compiled for this specific Alpine/Node environment
RUN pnpm install --prod --frozen-lockfile

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV ACTUAL_GROUP_NAME="Импорт из Сбера"

EXPOSE 3000

# Start the server
CMD ["node", "dist/server.js"]

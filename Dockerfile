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
FROM nikolaik/python-nodejs:python3.14-nodejs24-alpine

WORKDIR /app

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.30.1 --activate

# Install system dependencies (apk for Alpine)
RUN apk add --no-cache git curl

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Create data directory and set permissions
# In nikolaik images, 'pn' is the standard non-root user
RUN mkdir -p /app/data && chown -R pn:pn /app

# Switch to non-root user early to install tools in their home
USER pn
ENV PATH="/home/pn/.local/bin:${PATH}"

# Install Sberbank2Excel tool as the 'pn' user
RUN uv tool install git+https://github.com/Ev2geny/Sberbank2Excel.git

# Copy built application and production dependencies
COPY --from=builder --chown=pn:pn /app/dist ./dist
COPY --from=builder --chown=pn:pn /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV ACTUAL_GROUP_NAME="Импорт из Сбера"

EXPOSE 3000

# Start the server
CMD ["node", "dist/server.js"]

# Stage 1: Build & Verification
FROM node:20-bookworm-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    git \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Install Foundry toolchain
RUN curl -L https://foundry.paradigm.xyz | bash
ENV PATH="/root/.foundry/bin:${PATH}"
RUN foundryup

# Copy project definition and install contracts
COPY foundry.toml ./
COPY lib/ ./lib/
COPY src/ ./src/
COPY test/ ./test/
COPY script/ ./script/

# Verify compile
RUN forge build

# Build off-chain engine
COPY bot/package*.json ./bot/
COPY bot/tsconfig.json ./bot/
WORKDIR /app/bot
RUN npm ci

COPY bot/src/ ./src/
COPY bot/config/ ./config/
RUN npm run build

# Stage 2: Minimal Production Runtime
FROM node:20-bookworm-slim AS runner

WORKDIR /app/bot

ENV NODE_ENV=production

# Copy built distribution and dependencies
COPY --from=builder /app/bot/dist ./dist
COPY --from=builder /app/bot/node_modules ./node_modules
COPY --from=builder /app/bot/package.json ./package.json
COPY --from=builder /app/bot/config ./dist/config
COPY bot/ecosystem.config.cjs ./

# Security: Non-root execution
RUN groupadd -r arbilux && useradd -r -g arbilux arbilux
RUN mkdir -p logs && chown -R arbilux:arbilux /app
USER arbilux

EXPOSE 8080

CMD ["node", "dist/src/index.js"]

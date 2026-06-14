FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build


FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# MCP server 默认使用 stdio 传输，由调用方（backend）以子进程方式启动并通过 stdin/stdout 通信
ENTRYPOINT ["node", "dist/index.js"]

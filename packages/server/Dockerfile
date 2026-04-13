# 构建阶段
FROM node:24-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/plugin-sdk/package.json packages/plugin-sdk/
COPY packages/plugins/plugin-pc/package.json packages/plugins/plugin-pc/

RUN npm ci --ignore-scripts

COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/plugin-sdk/ packages/plugin-sdk/
COPY packages/plugins/plugin-pc/ packages/plugins/plugin-pc/

RUN npm run build -w packages/shared
RUN npm run build -w packages/plugin-sdk
RUN npx prisma generate --schema=packages/server/prisma/schema.prisma
RUN npm run build -w packages/server
RUN npm run build -w packages/plugins/plugin-pc

# 生产阶段
FROM node:24-bookworm-slim AS production

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/plugin-sdk/package.json packages/plugin-sdk/
COPY packages/plugins/plugin-pc/package.json packages/plugins/plugin-pc/

RUN npm ci --omit=dev --ignore-scripts

COPY --from=builder /app/packages/shared/dist packages/shared/dist
COPY --from=builder /app/packages/server/dist packages/server/dist
COPY --from=builder /app/packages/server/prisma packages/server/prisma
COPY --from=builder /app/packages/plugin-sdk/dist packages/plugin-sdk/dist
COPY --from=builder /app/packages/plugins/plugin-pc/dist packages/plugins/plugin-pc/dist
COPY --from=builder /app/node_modules/.prisma node_modules/.prisma

EXPOSE 23330 23331

# 运行迁移然后启动服务器
CMD ["sh", "-c", "cd packages/server && npx prisma migrate deploy && node dist/main.js"]

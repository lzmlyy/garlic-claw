# 构建阶段
FROM node:24-bookworm-slim AS builder

WORKDIR /app

COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/web/package.json packages/web/
COPY package.json package-lock.json ./

RUN npm ci --ignore-scripts -w packages/web

COPY packages/shared/ packages/shared/
COPY packages/web/ packages/web/

RUN npm run build -w packages/shared
RUN npm run build -w packages/web

# 生产阶段
FROM nginx:alpine

COPY --from=builder /app/packages/web/dist /usr/share/nginx/html
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

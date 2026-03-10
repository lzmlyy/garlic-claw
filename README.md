# 🦞 Garlic Claw

具备设备控制和自动化功能的 AI 秘书系统。

> 蒜蓉龙虾，软工作业，打算复刻一个openclaw类似的东西

## 技术栈

- **后端**: NestJS 11 + Prisma (SQLite) + AI SDK v6 (Qwen)
- **前端**: Vue 3 + Vite + Pinia + vue-router
- **插件**: WebSocket 协议 + Plugin SDK
- **部署**: Docker + docker-compose

## 项目结构

```
packages/
  shared/       — 共享类型定义
  server/       — NestJS 后端 (端口 23330 HTTP / 23331 WS)
  web/          — Vue 3 前端
  plugin-sdk/   — 插件开发 SDK
  plugins/
    plugin-pc/  — PC 设备插件示例
```

## 快速开始

```bash
# 安装依赖
npm install

# 复制环境变量
cp .env.example .env
# 编辑 .env 填入 AI API Key 等配置

# 初始化数据库
cd packages/server && npx prisma migrate dev && cd ../..

# 构建所有包
npm run build:shared
npm run build:server
npm run build:web

# 启动服务
cd packages/server && node dist/main.js
# 另一个终端启动前端开发服务器
npm run dev:web
```

## Docker 部署

```bash
docker compose up --build
```

服务启动后：

- 前端: http://localhost
- API: http://localhost:23330/api
- Swagger 文档: http://localhost:23330/api/docs
- WebSocket 插件: ws://localhost:23331

## 功能模块

| 模块   | 说明                                              |
| ------ | ------------------------------------------------- |
| 认证   | JWT + 刷新令牌，角色权限 (super_admin/admin/user) |
| 对话   | AI 多轮对话，SSE 流式输出，工具调用               |
| 插件   | WebSocket 设备连接，AI 工具自动注册               |
| 记忆   | 长期记忆存储，AI 自动记住用户偏好                 |
| 自动化 | 定时任务，设备命令编排，执行日志                  |

## API 概览

所有 API 以 `/api` 为前缀，认证接口除外均需 Bearer Token。

- `POST /api/auth/register` — 注册
- `POST /api/auth/login` — 登录
- `POST /api/auth/refresh` — 刷新令牌
- `GET /api/chat/conversations` — 会话列表
- `POST /api/chat/conversations/:id/messages` — 发送消息 (SSE)
- `GET /api/plugins` — 插件列表
- `GET /api/memories` — 记忆列表
- `POST /api/automations` — 创建自动化
- `PATCH /api/automations/:id/toggle` — 启用/停用

完整文档见 Swagger: `http://localhost:23330/api/docs`

## 插件开发

参见 [插件开发指南](docs/plugin-guide.md)

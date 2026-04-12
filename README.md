# Garlic Claw

Garlic Claw 是一个带设备控制、自动化和多提供商聊天能力的 AI 助手项目。

当前仓库已经收敛到一套真实运行路径：

- 后端：NestJS 11 + Prisma + AI SDK v6
- 前端：Vue 3 + Vite + Pinia
- 插件：WebSocket + `@garlic-claw/plugin-sdk`
  - SDK 入口已拆成：
    - `@garlic-claw/plugin-sdk/client`
    - `@garlic-claw/plugin-sdk/host`
    - `@garlic-claw/plugin-sdk/authoring`
  - 根入口仍保留兼容导出，但新代码优先使用子路径入口
- AI provider：
  - core 协议族：
    - `openai` -> `@ai-sdk/openai`
    - `anthropic` -> `@ai-sdk/anthropic`
    - `gemini` -> `@ai-sdk/google`
  - 供应商 preset：
    - `groq`
    - `xai`
    - `mistral`
    - `cohere`
    - `cerebras`
    - `deepinfra`
    - `togetherai`
    - `perplexity`
    - `gateway`
    - `vercel`
    - `openrouter`
    - 这些 preset 运行时会收敛到三种协议族，而不是继续各自绑定独立 SDK
  - 协议接入只保留三种协议族：`openai` / `anthropic` / `gemini`

## 文档

- 插件作者文档：[`docs/插件开发指南.md`](docs/插件开发指南.md)
- 扩展内核契约：[`docs/扩展内核契约说明.md`](docs/扩展内核契约说明.md)
- 扩展内核维护文档：[`docs/扩展内核维护说明.md`](docs/扩展内核维护说明.md)
- 后端模型调用说明：[`docs/后端模型调用接口说明.md`](docs/后端模型调用接口说明.md)

## 项目结构

```text
packages/
  server/       NestJS 后端，HTTP 端口 23330，插件 WS 端口 23331
  web/          Vue 3 前端，开发端口 23333
  shared/       前后端共享类型
  plugin-sdk/   插件 SDK
  plugins/      示例插件
config/
  ai-settings.example.json   AI provider / model / vision fallback 示例配置
tools/
  一键启停脚本.py            开发模式主入口
  start-dev.bat              兼容旧入口
  stop-dev.bat               兼容旧入口
```

## 配置方式

### 1. 环境变量：只负责运行时和管理员

复制根目录环境变量模板：

```bash
cp .env.example .env
```

当前 `.env` 只保留这些内容：

- 运行端口
- SQLite 数据库地址
- JWT 配置
- 启动期 bootstrap 管理员账号
- 运行时管理员覆盖

不再通过环境变量配置 AI provider。

### 2. AI 配置：统一放在 `config/ai-settings.json`

复制 AI 配置模板：

```bash
cp config/ai-settings.example.json config/ai-settings.json
```

这个文件负责：

- provider 列表
- provider 接入模式：`catalog`（目录模板）/ `protocol`（协议接入）
- catalog 项或协议接入协议族
- provider 的 `apiKey` / `baseUrl`
- 默认模型
- provider 预设模型列表
- `visionFallback` 配置
- `hostModelRouting` 配置

## 快速开始

### 安装依赖

```bash
npm install
```

### 初始化数据库

```bash
cd packages/server
npx prisma generate
npx prisma migrate deploy
cd ../..
```

### 开发模式一键启停

开发脚本默认会先做一次引导构建，再进入开发态 watch：

- `shared` / `plugin-sdk` / `server` 先做 bootstrap build
- 后端再进入 `tsc --watch + node --watch`
- 前端进入 `vite` dev server

这是开发模式，不是生产模式。

启动前后端：

```bash
python tools/一键启停脚本.py
```

关闭前后端：

```bash
python tools/一键启停脚本.py --stop
```

查看状态：

```bash
python tools/一键启停脚本.py --status
```

前台尾随日志并用 `Ctrl+C` 停止：

```bash
python tools/一键启停脚本.py --tail-logs
```

默认地址：

- 前端：`http://127.0.0.1:23333`
- 后端 API：`http://127.0.0.1:23330/api`
- Swagger：`http://127.0.0.1:23330/api/docs`
- 插件 WebSocket：`ws://127.0.0.1:23331`

### 启动期管理员账号

如果 `.env` 中配置了：

```env
BOOTSTRAP_ADMIN_USERNAME=admin
BOOTSTRAP_ADMIN_PASSWORD=admin123
```

服务启动时如果数据库里没有这个账号，会自动创建。

## Provider 系统说明

### Catalog Provider

catalog provider 现在分成两层：

- core 协议族
  - `openai` -> `@ai-sdk/openai`
  - `anthropic` -> `@ai-sdk/anthropic`
  - `gemini` -> `@ai-sdk/google`
- 供应商 preset
  - `groq`
  - `xai`
  - `mistral`
  - `cohere`
  - `cerebras`
  - `deepinfra`
  - `togetherai`
  - `perplexity`
  - `gateway`
  - `vercel`
  - `openrouter`

其中 preset 主要提供默认 `baseUrl`、默认模型和协议族归属；运行时会统一收敛到 `openai / anthropic / gemini` 三种协议族 SDK，而不是继续为每家 preset 维持独立 SDK 依赖。

### 协议接入

协议接入只支持三种协议族：

- `openai`
- `anthropic`
- `gemini`

适合：

- 第三方中转站
- 自建兼容网关
- 厂商兼容 OpenAI / Anthropic / Gemini 协议族接口

其中 `openai` 协议接入会显式走 `/v1/chat/completions`，不会误落到 Responses API。

### Vision Fallback

当聊天模型不支持图片输入时：

1. 会先检查当前会话里是否已有同图转述缓存
2. 命中缓存则直接复用
3. 未命中时，如果启用了 `visionFallback`，则调用转述模型生成描述
4. 转述失败时，后端直接把原始错误返回给前端

## 类型检查与构建

项目使用 SWC 开发编译，提交前必须显式跑 lint 和类型检查。

```bash
npm run lint
npm run typecheck

cd packages/server && npm test -- --runInBand
cd packages/server && npm run build
cd packages/web && npm run build
```

如果只想检查单个包：

```bash
npm run typecheck -w packages/server
npm run typecheck -w packages/web
npm run lint -w packages/server
```

## 主要能力

- 多 provider / 多模型聊天
- SSE 流式输出
- 消息级编辑 / 删除 / 停止 / 重试
- 图片上传、前端压缩、视觉转述与缓存
- 记忆查询与删除
- 插件列表 / 在线状态 / 删除
- 自动化创建、开关、执行、日志

## 文档

- [插件开发指南](docs/插件开发指南.md)
- [后端模型调用接口说明](docs/后端模型调用接口说明.md)

Swagger 适合查完整接口定义：

- `http://127.0.0.1:23330/api/docs`

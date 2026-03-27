# Garlic Claw

Garlic Claw 是一个带设备控制、自动化和多提供商聊天能力的 AI 助手项目。

当前仓库已经收敛到一套真实运行路径：

- 后端：NestJS 11 + Prisma + AI SDK v6
- 前端：Vue 3 + Vite + Pinia
- 插件：WebSocket + `@garlic-claw/plugin-sdk`
- AI provider：
  - 官方 provider 目录当前包括：
    - `openai` -> `@ai-sdk/openai`
    - `anthropic` -> `@ai-sdk/anthropic`
    - `gemini` -> `@ai-sdk/google`
    - `groq` -> `@ai-sdk/groq`
    - `xai` -> `@ai-sdk/xai`
    - `mistral` -> `@ai-sdk/mistral`
    - `cohere` -> `@ai-sdk/cohere`
    - `cerebras` -> `@ai-sdk/cerebras`
    - `deepinfra` -> `@ai-sdk/deepinfra`
    - `togetherai` -> `@ai-sdk/togetherai`
    - `perplexity` -> `@ai-sdk/perplexity`
    - `gateway` -> `@ai-sdk/gateway`
    - `vercel` -> `@ai-sdk/vercel`
    - `openrouter` -> `@openrouter/ai-sdk-provider`
  - 兼容 provider 只保留三种请求格式：`openai` / `anthropic` / `gemini`

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
other/
  start-dev.bat              开发模式一键启动
  stop-dev.bat               开发模式一键关闭
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
- provider 模式：`official` / `compatible`
- 官方 driver 或兼容 driver
- provider 的 `apiKey` / `baseUrl`
- 默认模型
- provider 预设模型列表
- `visionFallback` 配置

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

启动前后端：

```bash
cmd /c other\start-dev.bat
```

关闭前后端：

```bash
cmd /c other\stop-dev.bat
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

### 官方 provider

官方 provider 直接走对应官方 SDK，适合：

- 直接使用官方 API Key
- 直接使用官方 `baseUrl`
- 通过管理 API 或前端配置模型能力
- 当前官方 provider 目录：
  - `openai` -> `@ai-sdk/openai`
  - `anthropic` -> `@ai-sdk/anthropic`
  - `gemini` -> `@ai-sdk/google`
  - `groq` -> `@ai-sdk/groq`
  - `xai` -> `@ai-sdk/xai`
  - `mistral` -> `@ai-sdk/mistral`
  - `cohere` -> `@ai-sdk/cohere`
  - `cerebras` -> `@ai-sdk/cerebras`
  - `deepinfra` -> `@ai-sdk/deepinfra`
  - `togetherai` -> `@ai-sdk/togetherai`
  - `perplexity` -> `@ai-sdk/perplexity`
  - `gateway` -> `@ai-sdk/gateway`
  - `vercel` -> `@ai-sdk/vercel`
  - `openrouter` -> `@openrouter/ai-sdk-provider`

### 兼容 provider

兼容 provider 只支持三种 driver：

- `openai`
- `anthropic`
- `gemini`

适合：

- 第三方中转站
- 自建兼容网关
- 厂商兼容 OpenAI / Anthropic / Gemini 请求格式

其中 `openai` 兼容模式会显式走 `/v1/chat/completions`，不会误落到 Responses API。

### Vision Fallback

当聊天模型不支持图片输入时：

1. 会先检查当前会话里是否已有同图转述缓存
2. 命中缓存则直接复用
3. 未命中时，如果启用了 `visionFallback`，则调用转述模型生成描述
4. 转述失败时，后端直接把原始错误返回给前端

## 类型检查与构建

项目使用 SWC 开发编译，提交前必须手动跑类型检查。

```bash
cd packages/shared && npm run build
cd packages/plugin-sdk && npm run build
cd packages/server && npx tsc --noEmit
cd packages/server && npm test -- --runInBand
cd packages/server && npm run build
cd packages/web && npx vue-tsc --noEmit
cd packages/web && npm run build
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

# Garlic Claw

Garlic Claw 是一个带设备控制、自动化和多提供商聊天能力的 AI 助手项目。

本 README 面向使用者和本地操作者，优先回答：

- 这是什么项目
- 怎么启动 / 停止 / 配置
- 主要入口和后续该看哪份文档

当前仓库已经收敛到一套真实运行路径：

- 后端：NestJS 11 + Prisma + AI SDK v6
- 前端：Vue 3 + Vite + Pinia
- 插件：WebSocket + `@garlic-claw/plugin-sdk`
  - SDK 入口已拆成：
    - `@garlic-claw/plugin-sdk/client`
    - `@garlic-claw/plugin-sdk/host`
    - `@garlic-claw/plugin-sdk/authoring`
  - 新代码直接使用这三个子路径入口，不再示例根入口

```ts
import { PluginClient } from '@garlic-claw/plugin-sdk/client';
import { createPluginHostFacade } from '@garlic-claw/plugin-sdk/host';
import { createPluginAuthorTransportExecutor } from '@garlic-claw/plugin-sdk/authoring';
```
- AI provider：
  - core 协议族：
    - `openai` -> `@ai-sdk/openai`
    - `anthropic` -> `@ai-sdk/anthropic`
    - `gemini` -> `@ai-sdk/google`
  - 协议接入只保留三种协议族：`openai` / `anthropic` / `gemini`

## 文档导航

使用者入口：

- 当前页 `README.md`

开发者入口：

- 文档索引：[`docs/README.md`](docs/README.md)
- 插件开发指南：[`docs/插件开发指南.md`](docs/插件开发指南.md)
- 后端模型调用说明：[`docs/后端模型调用接口说明.md`](docs/后端模型调用接口说明.md)

维护者入口：

- 扩展内核契约：[`docs/扩展内核契约说明.md`](docs/扩展内核契约说明.md)
- 扩展内核维护说明：[`docs/扩展内核维护说明.md`](docs/扩展内核维护说明.md)

## 项目结构

```text
start.bat         Windows 启动包装入口
start.sh          Linux / WSL 启动包装入口
packages/
  server/       NestJS 后端，HTTP 端口 23330，插件 WS 端口 23331
  web/          Vue 3 前端，开发端口 23333
  shared/       前后端共享类型
  plugin-sdk/   插件 SDK
  plugins/      示例插件
config/
  ai-settings.example.json   AI provider / model / vision fallback 示例配置
tools/
  start_launcher.py          ASCII 启动 shim，统一转到中文主脚本
  一键启停脚本.py            开发/生产/脚本测试统一主入口
  scripts/
    dev_runtime.py           开发态编排
    docker_runtime.py        Docker / 生产模式编排
    process_runtime.py       底层进程宿主能力
    test_runtime_scripts.py  脚本回归测试
```

## 配置方式

### 1. 环境变量：只负责运行时、单密钥登录和远程插件

复制根目录环境变量模板：

```bash
cp .env.example .env
```

当前 `.env` 只保留这些内容：

- 运行端口
- SQLite 数据库地址
- 单密钥登录配置
- JWT 签名密钥
- 远程插件接入覆盖（可选）

不再通过环境变量配置 AI provider。
如果 MCP 或自定义 provider 需要从环境变量读取密钥，再按需自行追加到 `.env`。

当前登录相关环境变量是：

- `GARLIC_CLAW_LOGIN_SECRET`
  - Web 登录页输入的共享密钥
  - 未配置时，后端登录接口不会正常工作
- `GARLIC_CLAW_AUTH_TTL`
  - 浏览器登录态有效期
  - 默认值为 `30d`
- `JWT_SECRET`
  - 后端签发登录态与远程插件 token 的签名密钥

### 2. AI 配置：示例模板在 `config/`，运行时路径由环境变量决定

默认情况下，server 会读取：

```text
packages/server/tmp/ai-settings.server.json
```

如果设置了 `GARLIC_CLAW_AI_SETTINGS_PATH`，则会改读该路径。

项目里保留的模板文件在：

```text
config/ai-settings.example.json
```

如果你想把 provider 配置固定到仓库根目录，可以先复制模板：

```bash
cp config/ai-settings.example.json config/ai-settings.json
```

然后在环境中显式设置：

```bash
GARLIC_CLAW_AI_SETTINGS_PATH=config/ai-settings.json
```

AI 配置文件负责：

- provider 列表
- provider 接入模式：`catalog`（目录模板）/ `protocol`（协议接入）
- catalog 项或协议接入协议族
- provider 的 `apiKey` / `baseUrl`
- 默认模型
- provider 模型列表
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

Windows：

```powershell
.\start.bat restart
```

Linux / WSL：

```bash
bash ./start.sh restart
```

直接调用 Python 主入口也可以：

```bash
python tools/一键启停脚本.py restart
```

关闭前后端：

Windows：

```powershell
.\start.bat stop
```

Linux / WSL：

```bash
bash ./start.sh stop
```

直接调用 Python 主入口：

```bash
python tools/一键启停脚本.py --stop
```

查看状态：

Windows：

```powershell
.\start.bat status
```

Linux / WSL：

```bash
bash ./start.sh status
```

直接调用 Python 主入口：

```bash
python tools/一键启停脚本.py --status
```

前台尾随日志并用 `Ctrl+C` 停止：

```bash
python tools/一键启停脚本.py --tail-logs
```

运行脚本回归测试：

```bash
python tools/一键启停脚本.py --test
```

或：

```bash
python tools/一键启停脚本.py test
```

说明：

- `start.bat` 会先设置 UTF-8，再转到 `tools/start_launcher.py`
- `start.sh` 也会统一转到 `tools/start_launcher.py`
- `tools/start_launcher.py` 再加载真正的中文主脚本 `tools/一键启停脚本.py`
- 如果从 PowerShell 调 WSL 跑测试或长输出，优先把 stdout/stderr 写入 UTF-8 文件后再读，避免乱码和截断

默认地址：

- 前端：`http://127.0.0.1:23333`
- 后端 API：`http://127.0.0.1:23330/api`
- Swagger：`http://127.0.0.1:23330/api/docs`
- 插件 WebSocket：`ws://127.0.0.1:23331`

### 登录方式

当前版本只保留单用户共享密钥登录：

- 打开登录页
- 输入 `GARLIC_CLAW_LOGIN_SECRET`
- 登录成功后，浏览器会在 `GARLIC_CLAW_AUTH_TTL` 期限内保留登录态

## Provider 系统说明

### Catalog Provider

catalog provider 现在只保留三种核心目录模板：

- `openai` -> `@ai-sdk/openai`
- `anthropic` -> `@ai-sdk/anthropic`
- `gemini` -> `@ai-sdk/google`

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

## 开发者补充验证

下面这些命令主要给开发者和维护者使用；普通使用者不需要每次手动跑全套检查。

项目使用 SWC 开发编译，提交前仍需显式跑 lint 和类型检查。

```bash
npm run lint
npm run typecheck:server
npm run test:server
npm run build:server
npm run smoke:server
cd packages/web && npm run build
```

如果要补做与当前运行链更接近的验证，至少再跑：

```bash
node packages/server/scripts/http-smoke.mjs --proxy-origin http://127.0.0.1:23333
```

如果只想检查单个包：

```bash
npm run typecheck -w packages/server
npm run typecheck -w packages/web
npm run build -w packages/server
npm run test -w packages/server -- --runInBand
```

## 主要能力

- 多 provider / 多模型聊天
- SSE 流式输出
- 消息级编辑 / 删除 / 停止 / 重试
- 图片上传、前端压缩、视觉转述与缓存
- 记忆查询与删除
- 插件列表 / 在线状态 / 删除
- 自动化创建、开关、执行、日志

Swagger 适合查完整接口定义：

- `http://127.0.0.1:23330/api/docs`

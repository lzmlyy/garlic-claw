# Garlic Claw TODO

> 本文件只保留当前仍有效的项目级真相。
> 已完成流水只写摘要；细节过程留在 `task_plan.md / progress.md / findings.md`。

## 已完成摘要

### N8-N10 摘要

- `packages/shared` 已收口为 type-only，共享契约已对齐。
- `packages/server/src` 已压到 `8494`，Windows 与 WSL 内部目录的 fresh 构建、测试、后端 smoke、前端浏览器 smoke、独立 judge 都已通过。
- 测试目录已统一收口到 `tests/`，浏览器 smoke 已补齐登录、聊天、provider、plugins、tools/mcp、automation 的真实主链路覆盖与副作用清理。
- 文档分层、跨平台约束、WSL 内部测试约束、无绝对路径约束已同步到 `AGENTS.md`。

## 当前阶段：N11 [已完成]

### 目标

- 移除当前用户名 / 密码 / 注册 / dev-login / refresh / 用户资料 / 角色 / 用户管理整套登录体系。
- 改成单用户共享密钥登录：
  - 登录页只输入一个密钥
  - 密钥来自环境变量
  - 浏览器登录态默认保留 `30d`
  - 保留时长可由环境变量配置
- 不再区分普通用户、管理员、超级管理员。
- 一并移除 API Key 体系。
- 保留插件系统、远程插件 bootstrap 与现有插件扩展能力，不把认证改动扩散成插件协议改造。

### 当前设计边界

- 当前产品定位已收敛为单用户、自托管控制台，不再保留多用户模型。
- 登录态目标是“输入一次密钥后，在配置的有效期内重新打开浏览器无需再次输入”。
- 前端认证状态应收口为“是否已登录”，不再维护 `user / role / isAdmin / isSuperAdmin`。
- 后端鉴权应收口为“是否已通过单密钥登录”，不再保留基于角色的鉴权分层。
- `users/me`、用户列表、改角色、删用户、注册、dev-login、refresh、API Key 管理页与对应 HTTP 边界都应删除。

### 阶段计划

- [x] 盘点并删除前后端所有对用户实体、角色判断、API Key 的真实依赖点。
- [x] 设计并落地单密钥登录边界：
  - 服务端读取登录密钥环境变量
  - 服务端读取登录态 TTL 环境变量，默认 `30d`
  - 登录成功后发放持久登录态
- [x] 收口前端登录与路由守卫：
  - 登录页改为单输入框
  - 删除注册页与用户资料恢复链路
  - 所有管理页统一改为“只要求已登录”
- [x] 删除服务端多用户与角色相关边界：
  - `auth`
  - `user`
  - `api-key`
  - 依赖 `RolesGuard / CurrentUser('role') / users/me` 的 HTTP 控制器与测试
- [x] fresh 跑受影响构建、测试、后端 smoke、前端浏览器 smoke，并在 Windows 与 WSL 内部目录都完成验证。
- [x] 发独立 judge，确认这轮不是“把用户系统换壳留下”，而是真正删掉旧认证模型。

### 验收标准

- 前端只保留单密钥登录入口；浏览器关闭后在 TTL 内重新打开仍可直接进入系统。
- 仓库内不再存在面向 Web 登录主链路的：
  - 用户注册
  - 用户角色
  - `users/me`
  - API Key 管理
- 插件系统、远程插件 bootstrap、聊天主链路、现有 smoke 主流程保持可运行。
- 提交前必须 fresh 跑完受影响测试与 smoke，并拿到独立 judge `PASS`。

### 最新验收结果

- Windows fresh 通过：
  - `packages/server`: `npm test -- --runInBand`、`npm run build`
  - `packages/web`: `npm run test:run`、`npm run build`
  - root: `npm run smoke:web-ui`、`npm run smoke:server`、`npm run lint`
  - Python: `python -m unittest tools.scripts.test_runtime_scripts`、`python -m ruff check tools/scripts/dev_runtime.py tools/scripts/test_runtime_scripts.py`、`python -m mypy tools/scripts/dev_runtime.py tools/scripts/test_runtime_scripts.py`
- WSL 内部目录 `/home/test/garlic-claw-wsl-internal` fresh 通过：
  - `python3 -m unittest tools.scripts.test_runtime_scripts`
  - `npm run smoke:server`
  - 输出文件：`other/test-logs/2026-04-17-n11/wsl-env.log`、`wsl-runtime-tests.log`、`wsl-smoke-server.log`
- 独立 judge 已给出 `PASS`
  - 结论来源：agent `019d99c4-d7b8-77a0-adec-af2a03b381bd`
- 运行态清理已复核：
  - 旧测试残留的 `packages/server/tmp` provider / conversation / skill 数据已清掉
  - 额外执行 `python tools/start_launcher.py restart` 后复核，`openai` provider 不会被启动流程自动写回

## 固定约束

- 不允许引入绝对路径。
- WSL 测试必须在 WSL 内部目录执行；如当前环境本身就在 Linux / WSL 内部目录则忽略迁移动作。
- 提交前 / 修改完成后必须实际跑所有受影响冒烟测试，直到通过才能继续。
- 测试新增的持久副作用必须清理，不提交 provider、会话记录、聊天记录等测试残留。
- 不接受保留多用户兼容壳、角色兼容壳或 API Key 过渡壳。

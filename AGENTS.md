# Garlic Claw 代码规范

## 使用 skill

- 记得使用 planning with file 做规划

## TODO 与计划

- 开始复杂任务、重构、架构调整或长期路线讨论前，先读取 `TODO.md`
- 长期方向变更要同步更新 `TODO.md`；过程记录放在 `task_plan.md / progress.md / findings.md`
- 未完成计划不能删除，只能追加状态、标记为 `已完成 / 已取消 / 已废弃 / 已被新计划替代`
- 会话恢复信息可追加到 `tmp/session-persistence.md`，该文件不提交 git

## 文档分层

- `AGENTS.md` 只写给 Codex / agent / 多工具协作流程看的约束，不写面向普通使用者的说明
- `README.md` 只放使用者最先需要看到的内容：
  - 项目是什么
  - 如何启动 / 停止 / 配置 / 访问
  - 主要功能入口与文档导航
- 面向开发者的实现说明、接口细节、扩展接入方式放 `docs/`
- 面向维护者的重构边界、owner、内核契约放 `docs/扩展内核*.md`
- 不要把 agent 约束写进 `README.md`
- 不要把使用者快速开始写进 `AGENTS.md`
- 如果发现某条信息的第一受众已经变了，要在同一轮里把它挪回正确文档

## 重构总目标

- 重构任务默认以 `TODO.md` 顶部“规范化目标”为最高标准
- 核心目标是持续压低 `packages/server/src` 生产代码，直到 `<= 10000`
- 不做兼容层，不保留历史过渡壳，不接受把同等复杂度换名留在 `core`
- `core` 只保留稳定 contract 与最少宿主能力；作者侧语法糖、生态兼容、adapter glue 优先放到 `SDK / adapter`
- 每一刀优先删重复控制流、中间 owner 与特判路径；只换位置或换名字不算完成

## 执行约束

- 用户要求“不要停下 / 做完再说”时，中途不要阶段性总结；除非真实阻塞或范围内确实已无可做
- 汇报前先核对 `TODO.md` 当前阶段是否真的完成；未完成不能说成完成
- 当前阶段未在 `TODO.md` 标成 `[已完成]` 且验收未新鲜通过前，不进入下一阶段
- 准备把阶段改成 `[已完成]` 时，必须先做独立 judge 复核：
  - judge 必须是独立小 agent，不能自判
  - judge 不能只看命令通过，要按阶段目标逐条挑刺
  - judge 要优先识别“语义 owner 没迁走，只是换壳”的假完成
  - 只有 judge 明确给出 `PASS` 且验收命令新鲜通过，才能标记 `[已完成]`

## 检查与提交

- Python 使用 `mypy` 和 `ruff`
- Node 使用 `lint` 和 `typecheck`
- 提交前先检查，不提交半成品
- 提交 git 只是保存阶段进度；如果当前计划未完成，提交后必须继续推进直到完成

## 命名与注释

- 命名统一风格并明确边界与职责，不要使用模糊的 `helper`
- 公共 API / 服务方法用 JSDoc，关键逻辑用 `//`，标记统一用 `TODO / FIXME / NOTE`
- 所有注释与回复都使用中文

## AI Provider 适配

- 特定厂商的 AI provider / API 适配文件，文件顶部必须保留对应官方 API 文档链接
- 该链接属于维护锚点，后续重构、格式化或清理时不能删除
- 如依赖多个官方文档，优先贴主入口，再补最关键子页面
- 新增或修改适配时，先确认链接仍然指向官方文档

## 前后端约束

- Vue 组件使用 `<script setup lang="ts">`，顺序为：导入 → props → emits → 响应式状态 → 方法；文件顺序为：script → template → style(scoped)
- NestJS 按功能模块分目录；`controller` 只处理 HTTP，`service` 负责业务，`dto` 定义结构与校验，`guard` 只做权限验证
- DTO 使用 `class-validator`
- 依赖方向保持 `Controller → Service → Prisma`，单向依赖，禁止循环依赖
- 模块通过 `exports` 暴露公共 API，其他模块通过 `imports` 引入

## 项目结构

```text
packages/: server(NestJS) | web(Vue) | shared | plugin-sdk | plugins
```

- 包名统一为 `@garlic-claw/{server,web,shared,plugin-sdk}`
- 文件过长时优先拆分；如必须保留不拆分，需在文件头说明原因

## 错误处理与测试

- NestJS 使用内置异常；Prisma 错误用 `try-catch` 转换为对应 HTTP 异常
- 单元测试命名为 `*.spec.ts`，E2E 测试命名为 `*.e2e-spec.ts`
- 在 WSL 下执行测试、脚本或长输出命令时，不直接依赖终端串流输出；统一把 stdout/stderr 以 UTF-8 写入文件，再从文件读取和核对
- 如果需要从 PowerShell 调用 WSL，也按同一规则处理：先重定向到文件，再读取 UTF-8 文件内容，不直接根据控制台输出下结论
- WSL 测试完成后，回复里应基于输出文件给出结论；必要时同时保留失败命令与输出文件路径，方便复查

## 进程管理

- 绝对禁止杀掉所有 `node` 进程；只能按受管 PID 或端口处理
- 服务端口：
  - 前端 `23333`
  - 后端 `23330`
- 优先使用脚本入口：

```powershell
python tools\一键启停脚本.py --stop
python tools\一键启停脚本.py --kill-managed-ports
python tools\一键启停脚本.py --kill-port 23330 --kill-port 23333
```

- 明确禁止：

```powershell
Stop-Process -Name node -Force
taskkill /F /IM node.exe
```

- `一键启停脚本.py` 可用于一键启动/停止前后端

## 其他约定

- 如需安装库，直接安装
- 提交信息示例：`新增: ...`、`修复: ...`、`文档: ...`

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
- 修改完成代码后、继续后续工作前，必须实际执行项目约定的全部冒烟测试；不能只看静态检查或局部单测
- 提交前必须再次实际跑完全部冒烟测试，直到全部通过后才能继续；只要有一项失败，就先修复，不能跳过
- 提交前先检查，不提交半成品
- 提交 git 只是保存阶段进度；如果当前计划未完成，提交后必须继续推进直到完成

## 命名与注释

- 命名统一风格并明确边界与职责，不要使用模糊的 `helper`
- 禁止新增任何 `helper / helpers` 命名、目录或抽象层；需要复用时，必须用明确领域语义命名，并挂到真实 owner 下
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
- 各包与工具的测试入口、测试夹具、测试 mock、测试 helper 一律放在各自的 `tests/` 目录下分门别类；不要把测试文件继续放在 `src/`、`test/` 或业务文件旁边
- 上述规则同样适用于 `tools/` 下的 fixture 工作区；示例仓库里的测试文件也必须放在各自 `tests/` 目录，不要因为是 fixture 就继续留在 `src/`
- 浏览器 smoke / E2E / 集成测试如果会创建 provider、conversation、automation、plugin 配置、聊天记录或其他持久数据，必须在 `finally` 中清理；即使断言失败也不能残留测试副作用
- 在 WSL 下执行测试、脚本或长输出命令时，不直接依赖终端串流输出；统一把 stdout/stderr 以 UTF-8 写入文件，再从文件读取和核对
- 在 WSL 下执行测试、脚本或冒烟前，若工作目录位于 `/mnt/*` 挂载路径，先把当前工作树同步到 WSL 内部文件系统后再执行；如果当前目录本来就在 Linux / WSL 内部文件系统，则忽略这一步
- 如果需要从 PowerShell 调用 WSL，也按同一规则处理：先重定向到文件，再读取 UTF-8 文件内容，不直接根据控制台输出下结论
- WSL 测试完成后，回复里应基于输出文件给出结论；必要时同时保留失败命令与输出文件路径，方便复查

## 跨平台结论

- 当前已验证可工作的 fresh 冒烟基线：
  - Windows：root `npm run smoke:server`
  - WSL：先同步到 WSL 内部目录，再执行 `other/test-logs/2026-04-17-smoke/wsl-internal-smoke.sh`
- 当前已验证 WSL 默认 Node 需对齐到 `v24.9.0`；不能只在项目内临时切版本，必须保证 WSL shell 默认 `node` 就是该版本
- WSL 必须使用其内部自行安装的 `node / npm / npx / 全局工具`；不要挂载或复用 Windows 侧 Node 安装、`global_bin` 或 `/.local/bin` 映射
- 跨平台验证尽量减少跨系统交互；能在各自系统内闭环完成的安装、测试、冒烟，就不要混用另一侧运行时
- 当前机器上，WSL 使用 `networkingMode=nat` 比 `mirrored` 稳定；如无新的强证据，不要擅自切回 `mirrored`
- WSL 内部安装依赖时，优先直连 registry；只有直连不可用且宿主代理确实可达时，才回退代理
- 程序代码、脚本逻辑、仓库配置里都不允许硬编码绝对路径；跨平台 smoke 使用的 SQLite 路径也应保持相对 `file:` 写法
- `packages/server/scripts/http-smoke.mjs` 当前已验证需要：
  - 先确保 `packages/server/tmp` 存在
  - 启动阶段等待上限单独放宽，避免 Windows 冷启动误判

## WSL 网络判定

- 若 WSL 内出现以下任一现象，不要继续根据失败测试下结论，先判定为环境故障：
  - `ip route` 为空
  - `/etc/resolv.conf` 缺失
  - `CreateInstance/CreateVm/ConfigureNetworking/0x8007054f`
  - 代理或 registry 请求直接报 `ECONNREFUSED` / `Could not resolve host`
- 遇到上述情况时，先做：
  - `wsl --shutdown`
  - 重新进入 WSL 后检查 `ip route`、`/etc/resolv.conf`、registry 连通性
  - 只有网络恢复后，才能重新执行 WSL 内部目录测试并采信结果

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

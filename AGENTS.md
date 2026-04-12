# Garlic Claw 代码规范

## 使用 skill

记得使用 planning with file 做规划

## TODO 管理

- 开始复杂任务、重构、架构调整或长期路线讨论前，先读取 `TODO.md`
- 做这类工作时，除 `task_plan.md / progress.md / findings.md` 外，还要把长期方向同步到 `TODO.md`
- 如果某次改动已经推进、完成、废弃或重排了 `TODO.md` 中的事项，必须在同一轮里更新 `TODO.md`，并记得勾选已完成的内容。
- `TODO.md` 是项目级长期路线，不属于 skill 中间产物；是否提交按用户要求决定，但内容必须保持可读和可持续维护

## 重构目标约束

- 重构任务默认以 `TODO.md` 顶部“规范化目标”为最高执行标准
- 核心目标不是局部整理，而是让 `packages/server/src` 生产代码持续下降，直到压到 `<= 10000`
- 不接受把同等复杂度继续留在 `core helper / facade / service`
- 不做兼容层，不为历史结构保留过渡壳
- `core` 只保留稳定 contract 和最少量宿主能力；作者侧语法糖、生态兼容和 adapter glue 优先放到 `SDK / adapter`
- 每一刀都要优先删重复控制流、删中间 owner、删特判路径；只让文件换位置或换名字不算重构完成

## 执行方式约束

- 如果用户明确要求“不要汇报 / 不要停下 / 一直做直到做无可做 / 做完再说”，则中途禁止阶段性总结、邀功式回报或把一个局部完成点当作停下来的理由
- 汇报前必须先检查 `TODO.md` 要求的阶段是否已经完成；如果对应阶段还没完成，就继续推进，不允许把未完成阶段说成完成
- 当前阶段没有在 `TODO.md` 顶部标成 `[已完成]` 并且没有按该阶段验收命令实际通过前，不允许进入下一个阶段；必须先完成当前阶段，再继续下一个阶段
- 当某个阶段准备从未完成改成 `[已完成]` 时，必须额外走一次“刁钻 judge”复核流程：
  - judge 必须是独立小 agent，不能由当前执行 agent 自判
  - judge 不能只看验收命令是否通过，还要按 `TODO.md` 该阶段的目标文本逐条挑刺
  - judge 要优先找“语义 owner 其实没迁走、只是换名字/换壳”的假完成
  - 只有 judge 明确给出 `PASS`，并且阶段验收命令也新鲜通过，才允许把该阶段标成 `[已完成]`
  - 如果 judge 给出 `FAIL`，必须先继续施工并修到 judge 通过，不能跳到下一阶段
- 这类场景下，只允许在两种情况下打断：
  - 遇到真实阻塞，必须用户决策
  - 当前要求范围内已经确实做到无可做，并且已经完成必要验证
- 即使某一小段改动已经通过定向验证，也不能因此停下；必须继续推进同一轮计划中的后续可做事项

## 检查

```bash
# 根目录统一检查
npm run typecheck

# 或按包单独检查
npm run typecheck -w packages/server
npm run typecheck -w packages/web
```

- Node 使用 lint 和 typecheck
- 修改后要通过上述检查来防止编辑错误

## 命名

- 命名记得统一风格，并明确边界和职责，不要模糊地叫 `helper`

## 导入顺序

1. 外部库 → 2. 内部模块(`@/`) → 3. `import type` → 4. 相对路径，各组间空行。优先命名导出。

## 注释

- 公共API/服务方法用 JSDoc（含 @param/@returns/@throws）
- 关键逻辑用 `//`，标记用 TODO/FIXME/NOTE

## AI Provider 适配维护

- 对特定厂商的 AI provider / API 适配文件，必须在文件最上方注释里贴上对应厂商官方 API 文档链接
- 这个官方文档链接注释属于维护锚点，后续重构、格式化或清理时都**不能删除**
- 如果一个适配同时依赖多个官方文档，优先贴主入口文档，再补充最关键的子页面链接
- 新增或修改厂商适配时，先检查这个链接是否仍然存在、是否仍然指向官方文档

## Vue 组件

- `<script setup lang="ts">` 组合式API
- 顺序：导入 → props → emits → 响应式状态 → 方法
- 模板顺序：script → template → style(scoped)

## NestJS 后端

- 按功能模块分文件夹，每个模块含 module/controller/service/dto
- **职责单一**：controller 只处理HTTP请求调用service，service 负责业务逻辑和数据操作，dto 只定义数据结构和验证，guard 只做权限验证
- DTO 用 class-validator 验证
- 依赖方向：Controller → Service → Prisma，单向依赖，用DI注入，禁止循环依赖
- 模块通过 exports 暴露公共API，其他模块通过 imports 引入

## 项目结构（Monorepo）

```
packages/: server(NestJS) | web(Vue) | shared | plugin-sdk | plugins
```

包名：`@garlic-claw/{server,web,shared,plugin-sdk}`

## 文件控制

- 如果文件太长记得拆分，如果要保留不拆分的内容记得在文件头部写清楚原因

### 未完成计划持久化约束

- 之前未做完的计划**不能删除**，只能追加新阶段、补充状态，或显式标记为：
  - `已完成`
  - `已取消`
  - `已废弃`
  - `已被新计划替代`
- 如果某个旧计划不再继续，也必须保留原记录，并写清楚停止原因或替代关系，不能直接移除
- 允许把额外的会话恢复信息、未完成事项快照、下一步候选动作写入：
  - `tmp/session-persistence.md`
- `tmp/session-persistence.md` 只用于本地持久化和跨会话恢复，不提交 git
- 后续如果需要记录当前在做什么、还有哪些未完成项，优先追加到这个文件，而不是删除旧条目重写
- 如果未完成事项已经沉淀为项目级长期方向，也要同步更新 `TODO.md`，不要只留在本地 planning 文件里

### 提交前检查约束

- 提交git时，记得先检查一遍再提交，不要提交半成品或不完整的工作

### 提交后推进约束

- 提交 git 只是保存阶段性进度，不代表整体任务结束
- 如果当前总计划还有未完成阶段，则提交后必须继续推进，不能把提交点当作停止点
- 提交后也不能停，必须继续推进当前 plan，直到 plan 完成后才可以停下
- 只有当当前计划已完成，且相关验证通过后，才可以把这轮工作视为真正完成

### 示例

- `新增: 添加用户登录功能`
- `修复: 修复登录超时问题`
- `文档: 更新接口说明`

## 代码格式

2空格缩进，单引号优先，多行尾随逗号

## 错误处理

用 NestJS 内置异常（NotFoundException/BadRequestException等），Prisma 错误用 try-catch 转换为对应HTTP异常

## 测试

单元测试 `*.spec.ts`，E2E `*.e2e-spec.ts`

## 进程管理（重要）

**⚠️ 绝对禁止杀掉所有 nodejs 进程！**

这会导致：

- 正在运行的开发服务器被杀掉
- Agent 自己的进程也会被杀掉（因为 Agent 也是 nodejs）
- 用户的其他 nodejs 应用被误杀

### 正确做法

只杀特定端口的进程：

```powershell
# 只杀后端服务 (端口 23330)
Stop-Process -Id (Get-NetTCPConnection -LocalPort 23330 -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue

# 只杀前端服务 (端口 23333)
Stop-Process -Id (Get-NetTCPConnection -LocalPort 23333 -ErrorAction SilentlyContinue).OwningProcess -Force -ErrorAction SilentlyContinue
```

### 错误做法

```powershell
# ❌ 禁止！会杀掉所有 nodejs 进程
Stop-Process -Name node -Force

# ❌ 禁止！会杀掉所有 nodejs 进程
taskkill /F /IM node.exe
```

### 服务端口

- 前端服务：`23333`
- 后端服务：`23330`

### 一键启动脚本

`一键启停脚本.py` 可以一键启动/停止前后端。

## 约定

- 所有注释一律使用中文，回复也使用中文

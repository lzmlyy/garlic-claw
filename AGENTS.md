# Garlic Claw 代码规范

## 使用 skill

记得使用 planning with file 做规划

## TODO 管理

- 开始复杂任务、重构、架构调整或长期路线讨论前，先读取 `TODO.md`
- 做这类工作时，除 `task_plan.md / progress.md / findings.md` 外，还要把长期方向同步到 `TODO.md`
- 如果某次改动已经推进、完成、废弃或重排了 `TODO.md` 中的事项，必须在同一轮里更新 `TODO.md`
- `TODO.md` 是项目级长期路线，不属于 skill 中间产物；是否提交按用户要求决定，但内容必须保持可读和可持续维护

## 类型检查（重要）

**⚠️ 本项目使用 SWC 编译，SWC 不进行类型检查！**

在提交代码前，**必须手动运行类型检查命令**：

```bash
# 检查服务器端代码
cd packages/server && npx tsc --noEmit

# 检查 web 端代码
cd packages/web && npx vue-tsc --noEmit
```

### 为什么需要手动检查？

- `npm run dev:server` 使用 SWC 编译，速度极快但不检查类型
- 类型错误不会阻止编译成功，只在运行时暴露
- IDE 可能会显示类型错误，但构建过程不会失败

### 常见类型错误

1. **缺少类型定义**

   ```
   error TS2307: Cannot find module 'xxx' or its corresponding type declarations.
   ```

   解决：安装类型定义包 `@types/xxx`

2. **隐式 any 类型**
   ```
   error TS7006: Parameter 'x' implicitly has an 'any' type.
   ```
   解决：添加显式类型注解

## 命名

- 变量/函数：camelCase，布尔值用 is/has/should 前缀
- 类/接口/类型：PascalCase，接口不加 `I` 前缀
- 枚举：PascalCase，成员 UPPER_SNAKE_CASE
- 全局常量：UPPER_SNAKE_CASE
- 组件文件：PascalCase（`UserProfile.vue`）
- 服务/工具/类型文件：kebab-case（`auth.service.ts`）

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

- TypeScript 文件：默认建议控制在 350 行以内；单函数建议 ≤50 行。超过后先检查职责是否混杂、分支是否堆叠、测试是否明显变难，再决定拆分（utils/constants/types）
- Vue 组件：Template + Script 默认建议控制在 350 行以内（Style 部分不计入）；接近或超过时，优先检查是否已经混入多块职责、过多状态或可独立复用的子区域
- 350 行是建议线，不是机械硬规则；350~500 行属于允许范围，但必须先确认职责仍然单一、结构仍然清晰、拆分不会引入更差的可读性或更碎的跳转成本
- 超过 500 行视为强提醒；如果继续保留单文件，必须有明确理由，且要在代码里用简短注释写清楚“当前不拆分的原因”
- 这个“不拆分原因”注释应尽量放在文件头部或主导出附近，说明为什么当前保持单文件更合适，例如：
  - 该文件虽然较长，但仍是单一职责
  - 拆分后会把强耦合流程打散，反而更难维护
  - 当前主要是配置/映射/模板展开，拆分收益很低
- 这类注释必须具体，禁止写成空话，例如“暂时不拆”“以后再说”
- 例外：生成文件、常量表、schema、类型映射等文件可按实际情况处理，但不能把“例外”当成逃避整理的理由
- 拆分原则：以职责单一、可读性、可测试性为先，避免为了压行数而过度工程化；大项目优先放宽机械拆分，不放宽对混杂职责的容忍度
- other/ 下面的文件只是本地辅助开发使用，不提交 git 也就是不对外的

## Git Commit

格式：`<类型>: <描述>`

### 类型列表

新增 / 修复 / 文档 / 重构 / 杂项 / 格式 / 性能 / 测试 / 集成 / 构建 / 回退

### Skill 产物约束

- 由 skill 产生的中间文档只用于本地协作与会话恢复，不提交 git
- 这类文件包括但不限于：
  - `task_plan.md`
  - `progress.md`
  - `findings.md`
  - `docs/superpowers/**`
- 这些文件必须保持被 git 忽略
- **禁止**为了提交这些中间产物使用 `git add -f`
- 只有用户明确要求提交某个 skill 产物时，才可以单独确认后处理

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

- 只有在当前工作已经实现完成，且相关测试、类型检查、构建或必要功能验证都已经实际跑过并通过后，才允许提交 git
- 准备提交前，必须再检查一遍是否存在不该提交的内容，包括但不限于：
  - 中间产物
  - 本地临时文件
  - 调试输出
  - skill 产生的文档或会话恢复文件
- 这类不该提交的内容必须先排除、删除或确认已被 git 忽略，再进行提交
- 如果本次工作尚未完成，或者验证还没通过，则只继续本地修改，不提交 git

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

- 后端服务：`23330`
- 前端服务：`23333`

### 一键启动脚本

`一键启停脚本.py` 可以一键启动/停止前后端。

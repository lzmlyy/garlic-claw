# Garlic Claw 代码规范

## 使用 skill

记得使用 planning with file 做规划

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

- TypeScript 文件：建议控制在 300 行以内；单函数建议 ≤50 行。超过后先检查职责是否混杂、分支是否堆叠、测试是否明显变难，再决定拆分（utils/constants/types）
- Vue 组件：Template + Script 建议控制在 300 行以内（Style 部分不计入）；接近或超过时，优先检查是否已经混入多块职责、过多状态或可独立复用的子区域
- 300 行是建议线，不是机械硬规则；350~400 行视为强提醒，若继续保留单文件，需要能说明其职责仍然单一、结构仍然清晰
- 例外：生成文件、常量表、schema、类型映射等文件可按实际情况处理，但不能把“例外”当成逃避整理的理由
- 拆分原则：以职责单一、可读性、可测试性为先，避免为了压行数而过度工程化
- other/ 下面的文件只是本地辅助开发使用，不提交 git 也就是不对外的

## Git Commit

格式：`<type>: <subject>`（当前不使用 scope）
type: feat/fix/docs/style/refactor/test/chore

- `subject` 必须使用中文，简洁描述本次改动，不要写英文提交说明

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

`1.一键启动脚本.py` 可以一键启动/停止前后端。

# Garlic Claw TODO

> 最高优先级要求：
> 后续主路线不再是“继续抛光几个热点文件”，而是完整重写计划。
> 目标是在不改变对外接口、现有协议语义和目标功能的前提下，把 Garlic Claw 改成长期可维护、可持续演进的结构。
>
> 已完成事项不再保留在本文件。
> 详细过程、阶段记录和验证流水账只保留在 `task_plan.md / progress.md / findings.md`。

## 当前基线

- 当前统计口径：
  - `packages/server/src` 只统计生产代码
  - 不含 `*.spec.ts`
  - 不含 `*.e2e-spec.ts`
- 当前最新实时口径：
  - `packages/server = 24780`
  - `packages/web = 18166`
  - `packages/shared = 7976`
  - `packages/plugin-sdk = 5233`
  - `packages/server/src/plugin = 10067`
  - `packages/server/src/ai = 4750`
  - `packages/server/src/chat = 2865`
- 当前最厚的结构热点：
  - `packages/plugin-sdk/src/index.ts = 2778`
  - `packages/shared/src/types/plugin.ts = 712`
  - `packages/shared/src/plugin-runtime-hook-result.ts = 687`
  - `packages/plugin-sdk/src/host/index.ts = 561`
  - `packages/web/src/views/SkillsView.vue = 549`
  - `packages/server/src/chat/chat-message-mutation.service.ts = 547`
  - `packages/web/src/composables/use-plugin-management.ts = 542`
  - `packages/server/src/plugin/plugin-chat-runtime.facade.ts = 528`
- 当前最厚的测试热点：
  - `packages/server/src/chat/chat-message.model-flow.spec.ts = 1403`
  - `packages/server/src/plugin/plugin.gateway.spec.ts = 1399`
  - `packages/server/src/plugin/builtin/builtin-plugin.transport.spec.ts = 1381`
  - `packages/server/src/plugin/plugin-host.service.spec.ts = 1314`
  - `packages/server/src/plugin/plugin-runtime.host-api.spec.ts = 986`

## 计划依据（已核对的实际代码）

- 后端入口与模块边界：
  - `packages/server/src/app.module.ts`
  - `packages/server/src/plugin/plugin.module.ts`
  - `packages/server/src/chat/chat.module.ts`
  - `packages/server/src/ai/ai.module.ts`
  - `packages/server/src/tool/tool.module.ts`
  - `packages/server/src/skill/skill.module.ts`
- 后端核心 owner 与聚合点：
  - `packages/server/src/plugin/plugin-runtime.service.ts`
  - `packages/server/src/plugin/plugin.gateway.ts`
  - `packages/server/src/plugin/plugin-runtime-orchestrator.service.ts`
  - `packages/server/src/tool/tool-registry.service.ts`
  - `packages/server/src/mcp/mcp.service.ts`
  - `packages/server/src/chat/chat-message.service.ts`
  - `packages/server/src/ai/ai-provider.service.ts`
- 共享契约与 SDK：
  - `packages/shared/src/types/plugin.ts`
  - `packages/shared/src/index.ts`
  - `packages/plugin-sdk/src/index.ts`
  - `packages/plugins/plugin-pc/src/index.ts`
- 前端壳层、状态与 API：
  - `packages/web/src/router/index.ts`
  - `packages/web/src/views/AppLayout.vue`
  - `packages/web/src/stores/chat.ts`
  - `packages/web/src/composables/use-chat-view.ts`
  - `packages/web/src/composables/use-plugin-management.ts`
  - `packages/web/src/api/base.ts`
  - `packages/web/src/api/plugins.ts`

## 历史路线状态

- [已被新计划替代] 2026-04-04 之前的局部抛光路线：
  - `chat-message-mutation.service.ts`
  - `chat-message-generation.service.ts`
  - `chat-task.service.ts`
  - `plugin.gateway.ts`
  - `plugin.controller.ts`
  - `plugin-runtime.service.ts`
  - `plugin-runtime-host.facade.ts`
  - `plugin-runtime-transport.facade.ts`
- 替代原因：
  - 当前维护成本已经横跨 `server / shared / plugin-sdk / web`
  - 继续只做文件级减法，会把复杂度从一个包转移到另一个包
  - 后续执行必须改为“总纲 + 施工版”，不能继续停留在局部压行

## 固定约束

- 对外保持不变：
  - HTTP API 路径、DTO 语义、返回语义
  - 插件 WebSocket 协议语义
  - 现有 `plugin / MCP / skill` 作者格式兼容
  - 用户可见能力和目标功能
- 不接受：
  - 新增兼容层维持旧结构
  - 把 `server` 复杂度平移到 `shared / plugin-sdk / web`
  - 新增泛化 `helper / helpers`
  - 把同等复杂度换个名字继续留在 `core`
- 默认原则：
  - `plugin / MCP / skill` 的统一只发生在 runtime contract
  - kernel 一等原语只保留 `action call` 与 `event subscription`
  - builtin 只做参考实现，不保留长期特权
  - 新能力优先进入 `SDK / adapter / plugin-side facade`

## 项目最终目标

- [ ] `packages/server/src <= 10000`
- [ ] `core` 只保留：
  - runtime contract
  - extension governance
  - host capability
  - minimal state primitives
  - runtime dispatch / orchestration
- [ ] `packages/shared` 不再存在“一个文件承载整套扩展协议”的总线文件
- [ ] `packages/plugin-sdk` 不再存在单文件超大入口
- [x] `packages/web` 不再由单一 shell 绑定聊天与后台管理
- [x] `PluginModule <-> ToolModule` 双向循环依赖消失
- [x] 巨型系统真相源测试被拆成：
  - contract tests
  - domain tests
  - adapter tests
  - 少量端到端集成测试

## 完成判定

- 同时满足下面条件才算完成：
  - `packages/server/src <= 10000`
  - `plugin / MCP / skill / builtin` 作者侧复杂度主要位于 `SDK / adapter`
  - Host API、hook family、runtime exported surface 已变成少量稳定 contract
  - `shared / plugin-sdk / web` 没有因为迁移无序回涨
  - 不再依赖历史 owner、临时 facade、兼容壳维持主流程

## 当前状态说明

- `阶段 -1 ~ 8` 那组施工版计划已经全部完成并归档。
- 那组计划完成的是：
  - contract freeze
  - `shared / plugin-sdk / server(plugin/tool/chat/ai) / web` 这一轮重写
  - 测试体系拆分、旧结构清退和阶段性最终验收
- 2026-04-07：`packages/web/src/features/plugins/composables/use-plugin-management.ts` 已拆为 `usePluginList / usePluginConfig / usePluginEvents / usePluginStorage / usePluginCrons + plugin-management.module.ts`，插件管理页的前端热点职责已从单文件聚合中迁出。
- 2026-04-08：`plugin-management.module.ts` 进一步拆分为 `usePluginState / usePluginApi / usePluginActions / usePluginSocket`，`usePluginManagement` 继续作为 facade 导出，保持原有调用方式与对外 API 不变。
- 2026-04-08：后端新增全局响应拦截器与异常过滤器统一包装，HTTP 接口响应收敛为 `{ code, message, data }`，且对已符合结构的响应不重复包装。
- [x] 2026-04-09：Phase 2（后端响应体系统一）已完成：补强全局拦截器/异常过滤器语义一致性，校验插件路由动态状态码与 `code` 对齐，确认 SSE 事件流隔离不走 envelope，并完成注册接口与 ValidationPipe 定向验证。
- [x] 2026-04-09：Step 4（server 侧重构）已完成：`chat-message-mutation` 拆分 domain + mutation orchestrator，`plugin-chat-runtime` 改为接口注入并拆分 before-model/response/broadcast orchestrator，`plugin.gateway` 拆分 connection context aggregate + transport + lifecycle/request orchestrator，保持对外 API 与测试行为一致。
- 2026-04-07：`packages/web/src/features/skills/views/SkillsView.vue` 已拆分为 `SkillsList / SkillCard / SkillDetailPanel / SkillActiveStateToggle / SkillConversationBinding`，页面文件已压到 200 行以内并保持现有行为。
- 2026-04-07：新增 `packages/web/src/components/GenericListView.vue`，收敛搜索/过滤/分页/行点击与可扩展单元格插槽，支撑 Commands / Tools / SubagentTasks 统一列表形态复用。
- 这不等于“整体重构完成”。
- 详细过程、阶段记录和验收流水账只保留在：
  - `task_plan.md`
  - `progress.md`
  - `findings.md`

## 为什么整体重构仍未完成

- 顶层最终目标还没有全部满足：
  - `packages/server/src = 24780`，距离 `<= 10000` 还很远
  - `packages/shared` 仍有总线型大文件：
    - `packages/shared/src/types/plugin.ts = 712`
    - `packages/shared/src/plugin-runtime-hook-result.ts = 687`
  - `packages/plugin-sdk` 仍有超大入口：
    - `packages/plugin-sdk/src/index.ts = 2778`
    - `packages/plugin-sdk/src/host/index.ts = 561`
  - `core` 还没有完全压到“只保留 runtime contract / governance / host capability / minimal state primitives / orchestration”的最终形态
- 所以现在的真实状态是：
  - 上一轮施工计划已经完成
  - 顶部长期重构目标仍未完成

## 下一轮待规划入口

- [ ] 继续压 `packages/server/src` 生产代码，直到进入 `<= 10000` 的目标区间
- [ ] 继续拆 `packages/shared` 的总线型大文件
- [ ] 继续拆 `packages/plugin-sdk` 的超大入口与宿主入口
- [ ] 继续清理 `core` 中仍然偏厚的 owner / facade / orchestration 聚合点
- [ ] 基于当前热点重新定义下一轮分阶段计划，而不是复用已经完成的 `阶段 -1 ~ 8`
- [ ] 将所有uuid改成uuid7

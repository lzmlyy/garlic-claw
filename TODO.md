# Garlic Claw TODO

> 本文件只保留当前仍有效的项目级真相。
> 已完成流水只写摘要；细节过程留在 `task_plan.md / progress.md / findings.md`。

## 已完成摘要

### N8 摘要

- `packages/shared` 已重新收口为 type-only。
- `server / plugin-sdk / web` 的共享契约已重新对齐。
- 前后端构建、类型检查、测试、后端 smoke、代理态全链路联调、`tools/refactor` 与 `tools/scripts` 的 Windows / WSL 验证都做过一轮 fresh 通过。
- 已完成一组明确 owner 拆分，清掉若干混放职责：
  - `skill-package-tools.ts`
  - `conversation-message-planning.service.ts`
  - `automation-execution.service.ts`
  - `mcp-config-store.service.ts`
  - `runtime-host-subagent-task-store.service.ts`
  - `plugin-read-model.ts`
- root `lint` 历史 warning 已清零，文档分层也已同步到当前真相。

## 当前阶段：N9 [已完成]

### 最新状态（2026-04-17）

- `packages/server/src = 9986`
- `packages/shared = 2292`
- `packages/plugin-sdk = 2481`

### 本阶段已完成

- 已清理一组可证明无效或低价值的中转 / 残留：
  - `McpService.sourceEnabledReader`
  - `AutomationService.restoreCronJobs/readSchedulerInput/runAnyUserAutomation`
  - `CronEntry.automationId`
  - `RuntimeHostSubagentRunnerService` 的单点 after-run 变更函数
  - `ToolRegistryService.setSourceEnabled()` 的局部闭包中转
- 已把两条 mutate-only hook 主线统一到公共 helper：
  - `AutomationExecutionService`
  - `RuntimeHostSubagentRunnerService`
- 已继续清理一组 conversation/runtime 里的低价值包装：
  - `RuntimeHostConversationRecordService.finishConversationSession`
  - `buildConversationSessionKey/deleteConversationSession`
  - `writeConversationSkillState()` 的自回读
  - `ConversationMessagePlanningService.createConversationResultContext/buildAssistantHookPayload`
  - `RuntimeHostService` 对 `finishPluginConversationSession` 的单点中转调用
- 已继续清理一组执行/runtime/plugin 管线里的低价值包装：
  - `AutomationService.schedulerInput`
  - `RuntimeHostSubagentRunnerService.applySubagentBeforeRunMutation/buildHookPayload`
  - `RuntimeHostPluginDispatchService.readPluginTransport/createBuiltinTransport`
  - `RuntimePluginGovernanceService.listConnectedPlugins/createAcceptedPluginActionResult`
  - `PluginPersistenceService.findRecord/readRecord`
  - `RuntimeHostUserContextService.serializeActivePersona`
- 已清掉一批只用于排障的启动 trace 临时代码，不再保留 `GC_STARTUP_TRACE` 分支。
- 已补强 `packages/server/scripts/http-smoke.mjs` 的 fresh 环境稳定性：
  - 自动创建 `packages/server/tmp`
  - 启动阶段等待上限单独放宽，避免 Windows 冷启动误判
- 2026-04-17 fresh 验证已通过：
  - `packages/server`: `npx tsc --noEmit`
  - `packages/server`: `npm test -- --runInBand automation.service.spec.ts mcp.service.spec.ts runtime-host-subagent-runner.service.spec.ts tool-registry.service.spec.ts`
  - `packages/server`: `npm test -- --runInBand runtime-host-conversation-record.service.spec.ts runtime-host-conversation-message.service.spec.ts conversation-message-lifecycle.service.spec.ts runtime-host.service.spec.ts`
  - `packages/server`: `npm run build`
  - `packages/server`: `npm test -- --runInBand`
  - `packages/server`: `npm run smoke:http`
  - root: `npm run lint`
  - root: `git diff --check`
  - root: `node tools/refactor/cli.js refactor-metrics`
  - Windows: `npm run smoke:server`
  - WSL 内部目录：`other/test-logs/2026-04-17-smoke/wsl-internal-smoke.log`

### 下一步

- [x] 已把 `packages/server/src` 压回 `<= 10000`。
- [x] 独立 judge 复核 `PASS`；本阶段维持完成态。
  - 最新一轮复核已确认：MCP enabled 语义、plugin dispatch transport 收口、conversation record 私有投影方法、`http-smoke.mjs` 相对 SQLite URL 都已回到可接受状态

## 当前阶段：N10 [已完成]

### 目标（2026-04-17）

- 当前基线：`packages/server/src = 9986`
- 阶段终点：`packages/server/src <= 8500`
- 原则：
  - 只做真实减法，不做纯格式整理
  - 对外行为不变
  - 不把复杂度转移到 `shared / plugin-sdk / web / tools`

### 阶段计划

- [x] N10-A：`9986 -> <= 9600`
  - 聚焦 `runtime/host` 与 `conversation`
  - 目标文件：
    - `runtime-host-conversation-record.service.ts`
    - `runtime-host-subagent-runner.service.ts`
    - `conversation-message-planning.service.ts`
  - 验收：
    - `node tools/refactor/cli.js refactor-metrics`
    - `npm test -- --runInBand runtime-host-conversation-record.service.spec.ts runtime-host-conversation-message.service.spec.ts conversation-message-lifecycle.service.spec.ts runtime-host.service.spec.ts`
  - 结果：
    - 当前 `packages/server/src = 9556`
    - `runtime-host-conversation-record.service.ts: 314 -> 263`
    - `runtime-host-subagent-runner.service.ts: 290`
    - `conversation-message-planning.service.ts: 291 -> 261`
- [x] N10-B：`<= 9600 -> <= 9200`
  - 聚焦 `execution`
  - 目标文件：
    - `mcp.service.ts`
    - `automation.service.ts`
    - `automation-execution.service.ts`
    - `tool-registry.service.ts`
  - 验收：
    - `node tools/refactor/cli.js refactor-metrics`
    - `npm test -- --runInBand automation.service.spec.ts mcp.service.spec.ts runtime-host-subagent-runner.service.spec.ts tool-registry.service.spec.ts`
  - 结果：
    - 当前 `packages/server/src = 9167`
    - `mcp.service.ts: 278 -> 251`
    - `automation.service.ts: 260 -> 248`
    - `runtime-host-subagent-runner.service.ts: 262 -> 247`
    - `plugin-bootstrap.service.ts: 270 -> 198`
    - `runtime-host-conversation-record.service.ts: 263 -> 240`
  - 当前阶段验收已 fresh 通过：
    - `packages/server`: `npx tsc --noEmit`
    - `packages/server`: `npm test -- --runInBand automation.service.spec.ts mcp.service.spec.ts tool-registry.service.spec.ts runtime-host.service.spec.ts plugin-remote-bootstrap.service.spec.ts runtime-host-subagent-runner.service.spec.ts conversation-message-lifecycle.service.spec.ts`
- [x] N10-C：`<= 9200 -> <= 8850`
  - 聚焦 `plugin / runtime gateway / adapters`
  - 目标文件：
    - `plugin-persistence.service.ts`
    - `runtime-host-plugin-dispatch.service.ts`
    - `runtime-plugin-governance.service.ts`
    - `adapters/http/plugin/plugin.controller.ts`
  - 验收：
    - `node tools/refactor/cli.js refactor-metrics`
    - `npm test -- --runInBand plugin-persistence.service.spec.ts plugin.controller.spec.ts runtime-host.service.spec.ts`
  - 结果：
    - 当前 `packages/server/src = 8783`
    - `plugin-persistence.service.ts: 233 -> 196`
    - `runtime-host-plugin-dispatch.service.ts: 107 -> 103`
    - `runtime-plugin-governance.service.ts: 71 -> 62`
    - `plugin.controller.ts: 157 -> 132`
    - `conversation-message-planning.service.ts: 239 -> 207`
    - `automation.service.ts: 248 -> 209`
    - `runtime-host-subagent-runner.service.ts: 247 -> 221`
  - 当前阶段验收已 fresh 通过：
    - `packages/server`: `npx tsc --noEmit`
    - `packages/server`: `npm test -- --runInBand plugin-persistence.service.spec.ts plugin.controller.spec.ts runtime-host.service.spec.ts`
- [x] N10-D：`<= 8783 -> <= 8500`
  - 聚焦剩余高热点与尾部重复控制流
  - 目标文件：
    - `runtime-host-conversation-record.service.ts`
    - `runtime-host-subagent-runner.service.ts`
    - `runtime-host-conversation-message.service.ts`
    - `runtime-gateway-connection-lifecycle.service.ts`
    - `ai-management.service.ts`
    - `conversation-message-lifecycle.service.ts`
    - `conversation-task.service.ts`
    - 其他为达到 `<= 8500` 必须处理且可证明等价的 server 文件
  - 验收：
    - `node tools/refactor/cli.js refactor-metrics`
    - `npm test -- --runInBand`
    - `npm run build`
    - `npm run smoke:http`
    - `npm run smoke:server`
    - WSL 内部目录 `other/test-logs/2026-04-17-smoke/wsl-internal-smoke.sh`
    - 独立 judge `PASS`
  - 当前结果：
    - 当前 `packages/server/src = 8494`
    - 最新 fresh 通过：
      - `packages/server`: `npx tsc --noEmit`
      - `packages/server`: `npm test -- --runInBand`
      - `packages/server`: `npm run build`
      - `packages/server`: `npm run smoke:http`
      - root: `npm run smoke:server`
      - root: `npm run lint`
      - root: `git diff --check`
      - root: `node tools/refactor/cli.js refactor-metrics`
      - WSL 内部目录：`other/test-logs/2026-04-17-smoke/wsl-internal-smoke.log`
      - WSL 内部目录环境记录：`other/test-logs/2026-04-17-smoke/wsl-internal-env.log`
    - 独立 judge：`PASS`
      - 结论来源：agent `019d99c4-d7b8-77a0-adec-af2a03b381bd`
      - 最新复核确认 `mcp.service.ts` 的 `reloadServersFromConfig()/reloadServer()/applyServerConfig()` 已恢复旧语义；未发现新的阻断项

### 本阶段执行要求

- [x] 每完成一个子阶段，都要把行数与变更点回写到 `task_plan.md / progress.md / findings.md`
- [x] 达到 `<= 8500` 后，必须 fresh 跑完 Windows 与 WSL 冒烟，再发独立 judge
- [x] 只有 `<= 8500`、测试 fresh 通过、judge `PASS` 三者同时成立，才允许提交与推送

## 固定约束

- 对外行为保持不变：
  - HTTP API 路径、DTO 语义、返回语义
  - 插件 WebSocket 协议语义
  - plugin / MCP / skill 作者侧格式兼容
- 不接受新增 `helper / helpers / facade / compatibility` 壳。
- `packages/shared` 只允许前后端共享 type；不放运行时逻辑。
- 不接受把复杂度平移到 `shared / plugin-sdk / web / tools`。
- 继续删旧路径时，要同步删 gate / boundary map 死路径。

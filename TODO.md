# Garlic Claw TODO

> 校正 2026-04-01：
> 之前把“contract 已固化 / 局部 primitive 已落地”误记成“顶层长期目标已完成”，这个状态不准确。
> 下面这些顶层条目恢复为长期目标；具体已经落地的内容继续以阶段记录和进展记录为准。

## 北极星

- [ ] 把 Garlic Claw 收敛成 `内核像 C 一样简单, SDK 像 C++ 有丰富的语法糖`
- [ ] 本体只做稳定边界，不继续做功能堆叠
- [ ] 作者侧格式兼容现有 plugin / MCP / skill 生态
- [ ] 运行时统一到同一个 extension kernel contract
- [ ] 官方 builtin 优先做参考实现，而不是长期特权实现

## Kernel 边界

- [ ] 将本体一等责任收敛到：
  - `auth / user`
  - `conversation / message / chat`
  - `ai invocation facade`
  - `extension runtime`
  - `permission / governance`
  - `minimal persistence primitives`
- [ ] 新能力默认先判断能否落在 `plugin / MCP / skill / tool`，只有明确不能时才进入 core
- [ ] 持续删除 builtin / plugin / skill / MCP 的核心特判路径

## 统一扩展模型

- [ ] 保持 `plugin` 作为宿主原生扩展协议
- [ ] 保持 `MCP` 作为外部能力/资源协议，通过 adapter 接入 kernel
- [ ] 保持 `skill` 兼容现有生态，不强制改写为原生 plugin 包格式
- [ ] 明确“统一发生在 runtime contract，不发生在 authoring format”

## Skill 角色

- [ ] 将 `skill` 定义为双面层
- [ ] 对 AI：`prompt / policy / constraint / context assembly`
- [ ] 对 runtime：`workflow / orchestration / task template`
- [ ] 依赖解析默认走 `capability contract`
- [ ] 允许具体扩展名作为覆盖项，而不是默认绑定方式
- [ ] 避免把 `skill` 做成第三套厚 runtime

## 扩展联动协议

- [ ] kernel 一等原语只保留：
  - `action call`
  - `event subscription`
- [ ] `resource` 建在 `action / event` 之上，而不是独立长成第三套核心协议
- [ ] `workflow delegation` 建在 `action / event` 之上，而不是进入 kernel 成为并列原语
- [ ] 默认私有，只有显式导出后才允许被调用或订阅
- [ ] capability 发现与 skill 解析默认只能看到 exported 面
- [ ] 禁止扩展之间裸对象直连
- [ ] 允许 runtime 内部对合法 kernel 调用做本地 fast-path，但不能暴露成开发者可依赖语义

## 状态与持久化

- [ ] kernel 默认只提供少量通用状态原语
- [x] 保留 `private scoped KV`
- [ ] 保留 `exported resource snapshot`
- [x] 保留 `conversation / user scoped state`
- [x] 保留 `append-only event log`
- [x] 默认不再为扩展继续新增核心专用 Prisma schema

## 减法优先级

- [ ] 第一阶段：收薄 `plugin host core`
- [x] 第二阶段：定义并固化统一 `extension kernel contract`
- [ ] 第三阶段：给 `MCP / skill` 做 adapter / bridge，而不是硬改其生态格式
- [ ] 第四阶段：把更多 builtin 迁成普通扩展消费者
- [ ] 第五阶段：删除不再必要的核心特判、专用持久化面和历史兼容层
- 进展记录：
  - 已新增：
    - `docs/扩展内核契约说明.md`
    正式把以下内容固化成可维护 contract：
    - `plugin / MCP / skill` 的 authoring/runtime 分层
    - `action call / event subscription` 两类 kernel 原语
    - builtin 仅作为参考实现
    - fast-path 只能是实现优化，不能外溢成作者语义
  - `storage.*` / `state.*` 已补齐：
    - `plugin`
    - `conversation`
    - `user`
    三种 scoped primitive，继续沿用现有 `PluginStorage` 与 runtime state，不新增 schema
  - `packages/server/src/plugin/plugin-scoped-state.helpers.ts` 已新增：
    - 统一 scoped state/storage key 解析
    - plugin scope 列表默认不泄漏 scoped key
  - `packages/plugin-sdk/src/index.ts` / `packages/server/src/plugin/builtin/builtin-plugin.transport.ts` 已补：
    - scoped `storage.*`
    - scoped `state.*`
    - `state.list`
    - `state.delete`
    让作者侧糖衣继续建立在统一 Host API 之上
  - 已新增：
    - `packages/server/src/plugin/builtin/builtin-plugin-host-params.helpers.ts`
    - `packages/server/src/plugin/builtin/builtin-plugin-host-facade.helpers.ts`
    继续把 builtin transport 里的 Host API 参数构造、JSON normalize 和 host facade 装配样板从主文件中拆出
  - 已新增：
    - `packages/server/src/plugin/builtin/builtin-plugin.types.ts`
    把 builtin transport 里的 authoring/host facade 类型面从主文件中拆出
  - 已新增：
    - `packages/server/src/plugin/builtin/builtin-plugin-host-params.helpers.spec.ts`
    - `packages/server/src/plugin/builtin/builtin-plugin-host-facade.helpers.spec.ts`
    直接给 builtin host helper 补参数构造与 facade 路由回归
  - `builtin-plugin.transport.ts` 已不再直接承载：
    - `message.send` / `conversation.session.*` 参数构造
    - `cron.*` / `automation.*` Host API 参数构造
    - `storage.*` / `state.*` scoped params 组装
    - `llm.generate` / `subagent.run` / `subagent.task.start` 参数构造
    - Host facade 大对象装配
    - host facade / execution / definition 类型面
  - `builtin-plugin.transport.ts` 主文件行数已从 `1069` 继续降到 `246`
  - `plugin-host.service.ts` / `plugin-runtime.service.ts` 已共享 `plugin-llm-payload.helpers.ts`，删除两处重复的 LLM message / part 解析逻辑
  - `plugin-host.service.ts` 已继续外提到：
    - `plugin-host.helpers.ts`
    - `plugin-json-value.helpers.ts`
    主类行数已从 1000+ 继续降到 900 以下
  - `plugin-runtime.service.ts` 已新增 `plugin-runtime-input.helpers.ts`，把 timeout / host param / message target / subagent request 读取继续移出主类
  - `plugin-runtime.service.ts` 已新增 `plugin-runtime-clone.helpers.ts`，把 hook payload / session / subagent / assistant output 的 clone/normalize 纯函数继续移出主类
  - `plugin-runtime.service.ts` 的 `readSubagentRequest(...)` 已收口为单次取值，不再对同一参数重复校验多次
  - `plugin-runtime.service.ts` 已新增：
    - `plugin-runtime-validation.helpers.ts`
    - `plugin-runtime-hook-filter.helpers.ts`
    - `plugin-runtime-hook-result.helpers.ts`
    - `plugin-runtime-hook-mutation.helpers.ts`
    继续把基础校验、hook result 归一化和 hook mutation 应用移出主类
  - `plugin-runtime.service.ts` 已新增：
    - `plugin-runtime-session.helpers.ts`
    继续把 conversation session record 创建、续期、归属校验、摘要投影与消息记录移出主类
  - `plugin-runtime-session.helpers.ts` 已继续补齐：
    - `getDispatchableConversationSessionRecord(...)`
    继续把活动 session 的 owner record 启用校验和 hook 可调度校验从主类移走
  - `plugin-runtime.service.ts` 已新增：
    - `plugin-runtime-record.helpers.ts`
    继续把并发上限解析、runtime pressure 快照和治理动作归一化移出主类
  - `plugin-runtime.service.ts` 已新增：
    - `plugin-runtime-subagent.helpers.ts`
    继续把 subagent result 组装、resolved request 投影和 tool-set request 组装移出主类
  - `plugin-runtime.service.ts` 已新增：
    - `plugin-runtime-manifest.helpers.ts`
    继续把 lifecycle/self manifest 投影和 route/hook/tool 查找移出主类
  - `plugin-runtime-hook-mutation.helpers.ts` 已新增：
    - `applyChatBeforeModelHookResult(...)`
    - `applyMessageReceivedHookResult(...)`
    继续把前置 Hook 的 `pass / mutate / short-circuit` 结果消费从主类移出
  - `plugin-runtime.service.ts` 已新增：
    - `plugin-runtime-timeout.helpers.ts`
    继续把统一 timeout 包装移出主类
  - `plugin-runtime.service.ts` 已新增：
  - `plugin-runtime-module.helpers.ts`
    继续把 Automation / ChatMessage / SubagentTask / ToolRegistry 的 lazy resolver 样板移出主类
  - `plugin-runtime.service.ts` 已新增：
    - `plugin-runtime-hook-runner.helpers.ts`
    继续把 mutate/pass 与 short-circuit Hook 链的公共遍历、JSON 载荷序列化和单插件失败 continue 样板移出主类
  - `plugin-runtime.service.ts` 已把 `tool / route / hook` 的 timeout、并发槽和 failure 记录样板收口到：
    - `runTimedPluginInvocation(...)`
    继续减少 transport 执行路径里的重复错误处理
  - `plugin-runtime-session.helpers.ts` 已继续补齐：
    - `createConversationSessionMessageReceivedPayload(...)`
    - `syncConversationSessionMessageReceivedPayload(...)`
    继续把 session message:received payload 的克隆、history 记录和 active session info 刷新移出主类
  - `plugin-runtime-session.helpers.ts` 已继续补齐：
    - `prepareDispatchableConversationSessionMessageReceivedHook(...)`
    继续把 owner session 的查找、启用校验和 payload 准备收口为单个 helper
  - `plugin-runtime.service.ts` 已新增：
    - `plugin-runtime-failure.helpers.ts`
    继续把 failure 记录与 `plugin:error` 派发样板移出主类
  - `plugin-runtime.service.ts` 已新增：
    - `plugin-runtime-dispatch.helpers.ts`
    继续把 runtime record 查找、scope 启用断言和 hook dispatch record 筛选/排序移出主类
  - `plugin-runtime-dispatch.helpers.ts` 已继续补齐：
    - `invokeDispatchableHooks(...)`
    继续把跨插件 Hook 广播时的排序、JSON 载荷复用和单插件失败容错移出主类
  - `plugin-runtime-session.helpers.ts` 已继续补齐：
    - runtime-facing start/get/keep/finish/list/info bridge
    继续把会话 API 包装和 active session info 投影从主类移走
  - `plugin-runtime-subagent.helpers.ts` 已继续补齐：
    - resolved short-circuit result 投影
    继续把 subagent 短路结果组装从主类移走
  - `plugin-runtime-subagent.helpers.ts` 已继续补齐：
    - `collectSubagentRunResult(...)`
    继续把 subagent fullStream 的文本/tool call/tool result 采集与 finishReason 收口从主类移走
  - `plugin-runtime-subagent.helpers.ts` 已继续补齐：
    - `assertSubagentRequestInputSupported(...)`
    - `buildSubagentStreamPreparedInput(...)`
    - `buildResolvedSubagentAfterRunPayload(...)`
    继续把 subagent 输入能力校验、streamPrepared 参数组装和 after-run payload 组装移出主类
  - `plugin-runtime.service.ts` 主文件行数已从 `4287` 继续降到 `2714`
  - `plugin-runtime.service.ts` 主文件行数已从 `2714` 继续降到 `2562`
  - `plugin-runtime.service.ts` 主文件行数已从 `2562` 继续降到 `2518`
  - `plugin-runtime.service.ts` 主文件行数已从 `2518` 继续降到 `2397`
  - `plugin-runtime.service.ts` 主文件行数已从 `2397` 继续降到 `2371`
  - `plugin-runtime.service.ts` 主文件行数已从 `2371` 继续降到 `2348`
  - `plugin-runtime.service.ts` 主文件行数已从 `2348` 继续降到 `2204`
  - `plugin-runtime.service.ts` 主文件行数已从 `2168` 继续降到 `2123`
  - `plugin-runtime.service.ts` 主文件行数已从 `2123` 继续降到 `2117`
  - `plugin-runtime.service.ts` 主文件行数已从 `2117` 继续降到 `2083`
  - `plugin-runtime.service.ts` 主文件行数已从 `2250` 继续降到 `2241`
  - `plugin-runtime.service.ts` 主文件行数已从 `2241` 继续降到 `2237`
  - `plugin-runtime.service.ts` 主文件行数已从 `2237` 继续降到 `2228`
  - `plugin-runtime.service.ts` 主文件行数已从 `2228` 继续降到 `2224`
  - `plugin-runtime.service.ts` 主文件行数已从 `2224` 继续降到 `2219`
  - `plugin-runtime.service.ts` 主文件行数已从 `2219` 继续降到 `2113`
  - `plugin-runtime.service.ts` 主文件行数已从 `2113` 继续降到 `2061`
  - `plugin-runtime.service.ts` 主文件行数已从 `2061` 继续降到 `2060`
  - `plugin-host.service.ts` 已把生成参数读取、utility role 选择和结构化 LLM message 读取并入 `plugin-host.helpers.ts`
  - `plugin-host.service.ts` 已把当前 provider 摘要、provider model 摘要和 host generate result 投影并入 `plugin-host.helpers.ts`
  - `plugin-host.helpers.ts` 已继续补齐：
    - provider summary 查找 / not-found 归一化
    继续把 `provider.get` 的查找薄壳移出主类
  - 已新增：
    - `packages/server/src/plugin/plugin-host-params.helpers.ts`
    - `packages/server/src/plugin/plugin-host-provider.helpers.ts`
    - `packages/server/src/plugin/plugin-host-record.helpers.ts`
    把 `plugin-host.helpers.ts` 里的参数读取、provider/generate 组装和 record summary 规则按域拆分
  - `plugin-host.service.ts` 主文件行数已从 `852` 继续降到 `725`
  - `plugin-host.service.ts` 主文件行数已从 `725` 继续降到 `696`
  - `plugin-host.service.ts` 主文件行数已从 `696` 继续降到 `689`
  - `plugin-host.service.ts` 已把 conversation / memory / user / message 摘要映射收成纯函数，便于后续继续外提薄壳
  - `plugin-host.helpers.ts` 已继续补齐：
    - `requireHostConversationRecord(...)`
    - `requireHostUserSummary(...)`
    - `buildConversationMessageSummaries(...)`
    继续把会话归属校验、用户缺失校验和消息摘要列表构建移出主类
  - `plugin-host.helpers.ts` 已继续补齐：
    - `buildHostGenerateExecutionInput(...)`
    - `buildHostGenerateTextResult(...)`
    继续把统一 LLM generate 执行参数组装和 `llm.generate-text` 结果投影移出主类
  - `plugin-host.helpers.ts` 主文件行数已从 `507` 继续降到 `3`
  - `plugin-host.service.ts` 主文件行数已从 `737` 继续降到 `733`
  - `plugin-host.service.ts` 主文件行数已从 `733` 继续降到 `723`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-orchestrator.service.ts`
    先把 plugin 持久化注册、governance 刷新、heartbeat 与 loaded/unloaded 生命周期编排从 runtime kernel 中拆出
  - `BuiltinPluginLoader` / `PluginGateway` / `PluginController` / `PluginAdminService` 已改为优先依赖 orchestrator，而不是直接把宿主编排压在 `PluginRuntimeService` 上
  - `PluginRuntimeService.registerPlugin / refreshPluginGovernance / unregisterPlugin` 已收窄为 kernel record/cache 操作，不再直接承担：
    - `pluginService.registerPlugin`
    - `pluginService.getGovernanceSnapshot`
    - `pluginService.setOffline`
    - `pluginService.heartbeat`
    - `cronService.onPluginRegistered`
    - `cronService.onPluginUnregistered`
    - `plugin:loaded / plugin:unloaded` 生命周期编排
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-orchestrator.service.spec.ts`
    把原先依赖持久化与 cron 副作用的 runtime lifecycle 断言迁到 orchestrator spec
  - `plugin-runtime.service.ts` 主文件行数已从 `1949` 继续降到 `1907`
  - 已新增：
    - `packages/server/src/plugin/plugin-host-state.facade.ts`
    - `packages/server/src/plugin/plugin-host-ai.facade.ts`
    - `packages/server/src/plugin/plugin-host-conversation.facade.ts`
    继续把 Host API 的宿主查询、状态/KV 与 AI 调用桥接从主类里拆出
  - `PluginHostService` 已改为主要承担 Host API 分发表，不再直接持有：
    - conversation / kb / persona / memory / user 查询桥接
    - storage / state / log / config 桥接
    - provider / llm.generate / llm.generate-text 桥接
  - `plugin-host.service.ts` 主文件行数已从 `826` 继续降到 `403`
  - `plugin-host.service.ts` 主文件行数已从 `403` 继续降到 `126`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-host.facade.ts`
    把 `PluginRuntimeService.callHost(...)` 中的宿主编排入口继续拆到 facade
  - `PluginRuntimeService.callHost(...)` 已不再直接承载：
    - `plugin.self.get`
    - `automation.*`
    - `cron.*`
    - `message.target.current.get`
    - `message.send`
    - `conversation.session.*`
    - `subagent.task.*`
  - `plugin-runtime.service.ts` 主文件行数已从 `1907` 继续降到 `1606`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-governance.facade.ts`
    把运行时治理面里的 query / health-check / action 入口继续外提
  - `PluginRuntimeService` 已改为通过 governance facade 承接：
    - `listTools`
    - `listPlugins`
    - `getRuntimePressure`
    - `listConversationSessions`
    - `finishConversationSessionForGovernance`
    - `runPluginAction`
    - `checkPluginHealth`
    - `listRoutes`
    - `listSupportedActions`
  - `plugin-runtime.service.ts` 主文件行数已从 `1606` 继续降到 `1520`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-subagent.facade.ts`
    把 `executeSubagentRequest(...)` 和 tool registry 懒解析从 runtime 主类里继续拆出
  - `PluginRuntimeService.executeSubagentRequest(...)` 现在只保留 facade 委派，不再直接承载：
    - before-run / after-run hook 之间的 subagent 执行装配
    - model resolve / prepared stream 调用
    - tool set 构建
    - fullStream 结果采集
  - `plugin-runtime.service.ts` 主文件行数已从 `1520` 继续降到 `1432`
  - `PluginRuntimeSubagentFacade` 已继续承接：
    - `runSubagentBeforeRunHooks(...)`
    - `runSubagentAfterRunHooks(...)`
    让 subagent 专用 hook 控制流也不再留在 runtime 主类里
  - `plugin-runtime.service.ts` 主文件行数已从 `1432` 继续降到 `1411`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-broadcast.facade.ts`
    把纯广播型 hook 调度从 runtime 主类中继续拆出
  - `PluginRuntimeService` 已改为通过 broadcast facade 承接：
    - `chat:waiting-model`
    - `conversation:created`
    - `message:deleted`
    - `response:after-send`
    - `plugin:loaded`
    - `plugin:unloaded`
    - `plugin:error`
    这一组广播型 hook 的统一分发
  - `plugin-runtime.service.ts` 主文件行数已从 `1411` 继续降到 `1402`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-operation-hooks.facade.ts`
    把 automation/tool/response 的专用 mutate 与 short-circuit hook 控制流继续拆出
  - `PluginRuntimeService` 已改为通过 operation hooks facade 承接：
    - `automation:before-run`
    - `automation:after-run`
    - `tool:before-call`
    - `tool:after-call`
    - `response:before-send`
  - `plugin-runtime.service.ts` 主文件行数已从 `1402` 继续降到 `1344`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-message-hooks.facade.ts`
    把 chat/message 里纯 mutate 的 hook 路径继续拆出
  - `PluginRuntimeService` 已改为通过 message hooks facade 承接：
    - `chat:after-model`
    - `message:created`
    - `message:updated`
  - `plugin-runtime.service.ts` 主文件行数已从 `1344` 继续降到 `1315`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-inbound-hooks.facade.ts`
    把输入侧 short-circuit / mutate hook 控制流继续拆出
  - `PluginRuntimeService` 已改为通过 inbound hooks facade 承接：
    - `chat:before-model`
    - `message:received`
    - active conversation session 的 owner 优先路由
  - `plugin-runtime.service.ts` 主文件行数已从 `1315` 继续降到 `1184`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-transport.facade.ts`
    把 transport 执行与统一超时/失败治理继续拆出
  - `PluginRuntimeService` 已改为通过 transport facade 承接：
    - `executeTool`
    - `invokeRoute`
    - `invokePluginHook`
    - 统一 timeout / overloaded / failure dispatch 路径
  - `plugin-runtime.service.ts` 主文件行数已从 `1184` 继续降到 `982`
  - `PluginRuntimeHostFacade` 已继续承接：
    - Host API 权限映射校验
    - `subagent.run`
    - `plugin.self.get`
    让 `PluginRuntimeService.callHost(...)` 继续收口为纯委派入口
  - `plugin-runtime.service.ts` 主文件行数已从 `982` 继续降到 `902`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-automation.facade.ts`
    - `packages/server/src/plugin/plugin-runtime-automation.facade.spec.ts`
    把 `PluginRuntimeHostFacade` 里的 `automation/cron` 宿主编排与 lazy `AutomationService` 解析移出
  - `PluginRuntimeHostFacade` 已改为通过 `PluginRuntimeAutomationFacade` 委派：
    - `automation.create`
    - `automation.list`
    - `automation.event.emit`
    - `automation.toggle`
    - `automation.run`
    - `cron.register`
    - `cron.list`
    - `cron.delete`
  - `plugin-runtime-host.facade.ts` 主文件行数已从 `406` 继续降到 `335`
  - `PluginRuntimeService` 已删除不再使用的直持依赖与死入口：
    - `PluginService`
    - `PluginHostService`
    - `AiModelExecutionService`
    - `getHostService()`
    让 runtime 主类只保留仍实际参与分发的 facade 依赖
  - `plugin-runtime.service.ts` 主文件行数已从 `902` 继续降到 `888`
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime.types.ts`
    把 transport contract 与运行时执行结果类型从主类中拆出
  - `PluginRuntimeService` 已不再直接承载：
    - `PluginTransport`
    - `PluginRuntimeRecord`
    - chat/message/tool/automation 的执行结果类型定义
  - `plugin-runtime.service.ts` 主文件行数已从 `888` 继续降到 `721`
  - 已扩展：
    - `packages/server/src/plugin/plugin-runtime-record.helpers.ts`
    继续把 runtime record 默认治理快照、governance refresh 与会话清理样板从主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-runtime-record.helpers.spec.ts`
    直接给 runtime record helper 补默认 record、治理刷新和 unregister 会话清理回归
  - `PluginRuntimeService` 已不再直接承载：
    - register 时的默认 governance/record 组装
    - governance refresh 后的 disabled session 收口
    - unregister 时的 owner session 清理
  - `plugin-runtime.service.ts` 主文件行数已从 `763` 继续降到 `746`
  - `PluginRuntimeService` 已继续收口：
    - broadcast hook 的统一分发表样板
    - subagent hook 的 JSON payload adapter 样板
  - `plugin-runtime.service.ts` 主文件行数已从 `746` 继续降到 `738`
  - 已新增：
    - `packages/server/src/plugin/plugin-event.helpers.ts`
    继续把插件事件/健康快照相关的纯规则和查询组装从持久化主类中拆出
  - `PluginService` 已不再直接承载：
    - event query option normalize
    - event cursor resolve
    - event where 组装
    - event create
    - health snapshot / event level 归一化
  - `plugin.service.ts` 主文件行数已从 `1059` 继续降到 `916`
  - 已新增：
    - `packages/server/src/plugin/plugin-persistence.helpers.ts`
    继续把配置解析/校验、scope 解析/校验和持久化 JSON 回退规则从持久化主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-persistence.helpers.spec.ts`
    直接给持久化 helper 补纯规则回归，避免规则层再次回流到服务主类
  - `PluginService` 已不再直接承载：
    - resolved config 默认值合并
    - config schema 类型校验
    - scope JSON 解析与归一化
    - storage / event metadata JSON 回退解析
  - `plugin.service.ts` 主文件行数已从 `916` 继续降到 `734`
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-transport.helpers.ts`
    继续把远程 transport 的请求跟踪、超时、结果回填和协议发送从网关主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-transport.helpers.spec.ts`
    直接给 gateway transport helper 补请求队列与上下文跟踪回归
  - `PluginGateway` 已不再直接承载：
    - send/sendProtocolError 样板
    - pending request resolve/reject 样板
    - request timeout 读取
    - transport request 发起样板
  - `plugin.gateway.ts` 主文件行数已从 `1269` 继续降到 `1205`
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-context.helpers.ts`
    继续把远程 manifest 归一化、Host API 授权上下文匹配与 clone 规则从网关主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-context.helpers.spec.ts`
    直接给 gateway context helper 补 manifest/host-context 纯规则回归
  - `PluginGateway` 已不再直接承载：
    - resolveManifest
    - resolveHostCallContext
    - findApprovedRequestContext
    - authorized context compare / clone
  - `plugin.gateway.ts` 主文件行数已从 `1205` 继续降到 `1113`
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-payload.helpers.ts`
    继续把 websocket message/payload reader、Host API method 白名单和 route/context 纯解析规则从网关主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-payload.helpers.spec.ts`
    直接给 gateway payload helper 补协议 reader 与 JSON-safe 规则回归
  - `PluginGateway` 已不再直接承载：
    - websocket envelope reader
    - auth/register/data/error/route/host payload reader
    - plugin call context reader
    - Host API method / connection-scoped 白名单判断
    - route response 归一化与上下文提取
  - `plugin.gateway.ts` 主文件行数已从 `1113` 继续降到 `799`
  - 已新增：
    - `packages/server/src/plugin/plugin-subagent-task.helpers.ts`
    继续把后台 subagent task 的 persisted snapshot 解析、summary/detail 序列化与 message.send 返回值校验从服务主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-subagent-task.types.ts`
    - `packages/server/src/plugin/plugin-subagent-task-value.helpers.ts`
    - `packages/server/src/plugin/plugin-subagent-task-request.helpers.ts`
    - `packages/server/src/plugin/plugin-subagent-task-result.helpers.ts`
    - `packages/server/src/plugin/plugin-subagent-task-summary.helpers.ts`
    继续把 subagent task helper 里的值解析、request/context 读取、run result 读取和 summary/detail 规则按域拆分
  - 已新增：
    - `packages/server/src/plugin/plugin-subagent-task.helpers.spec.ts`
    直接给 subagent task helper 补快照回退、preview 生成和 message.send reader 回归
  - `PluginSubagentTaskService` 已不再直接承载：
    - persisted request/context/result/writeBackTarget 解析
    - task summary/detail 序列化
    - request/result preview 规则
    - JSON clone 样板
  - `plugin-subagent-task.service.ts` 主文件行数已从 `668` 继续降到 `223`
  - `plugin-subagent-task.helpers.ts` 主文件行数已从 `460` 继续降到 `9`
  - 已新增：
    - `packages/server/src/plugin/plugin-cron-scheduler.service.ts`
    把 `PluginCronService` 里的调度、cron tick 执行和成功/失败回写移出
  - 已新增：
    - `packages/server/src/plugin/plugin-cron.helpers.ts`
    继续把 cron job 记录归一化、summary 序列化和 data/interval 纯解析规则从服务主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-cron.helpers.spec.ts`
    直接给 cron helper 补记录归一化、data JSON 回退和 interval/source 解析回归
  - `PluginCronService` 已不再直接承载：
    - cron job record normalize
    - cron summary serialize
    - 定时调度与 `jobs` map 生命周期
    - `cron:tick` 执行与成功/失败回写
    - cron data/source/interval 纯解析规则
  - `plugin-cron.service.ts` 主文件行数已从 `548` 继续降到 `425`
  - `plugin-cron.service.ts` 主文件行数已从 `425` 继续降到 `245`
  - 已新增：
    - `packages/server/src/plugin/plugin-governance.helpers.ts`
    继续把持久化 manifest 读取和 governance snapshot 构建从持久化主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-governance.helpers.spec.ts`
    直接给 governance helper 补 manifest fallback 与 snapshot 组装回归
  - `PluginService` 已不再直接承载：
    - persisted manifest 读取
    - governance snapshot 构建
  - `plugin.service.ts` 主文件行数已从 `734` 继续降到 `709`
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-runtime.helpers.ts`
    继续把远程 transport 构造、health-check 和 heartbeat sweep 规则从网关主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-runtime.helpers.spec.ts`
    直接给 gateway runtime helper 补 transport 请求、health-check 和 stale 连接 sweep 回归
  - `PluginGateway` 已不再直接承载：
    - remote transport 构造
    - websocket ping health-check
    - heartbeat stale sweep 规则
  - `plugin.gateway.ts` 主文件行数已从 `799` 继续降到 `730`
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-dispatch.helpers.ts`
    继续把 hook/route/command 结果回填与错误拒绝样板从网关主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-dispatch.helpers.spec.ts`
    直接给 gateway dispatch helper 补 pending request resolve/reject 样板回归
  - `PluginGateway` 已不再直接承载：
    - hook result/error resolve-reject 样板
    - route result/error resolve-reject 样板
    - command result/error resolve-reject 样板
  - `plugin.gateway.ts` 主文件行数已从 `730` 继续降到 `667`
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-lifecycle.helpers.ts`
    继续把 websocket auth/register/disconnect 生命周期样板从网关主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-lifecycle.helpers.spec.ts`
    直接给 gateway lifecycle helper 补连接状态写回、旧连接替换与断连清理回归
  - `PluginGateway` 已不再直接承载：
    - auth token 校验后的连接状态写回
    - register manifest + transport 装配后的统一 ack
    - disconnect 时的 pending request 清理、active/old connection 判定与 unregister 调度
  - `plugin.gateway.ts` 主文件行数已从 `667` 继续降到 `641`
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-host.helpers.ts`
    继续把远程 Host API bridge 的 requestId/payload/context/result-error 样板从网关主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-host.helpers.spec.ts`
    直接给 gateway host helper 补 approved context、connection-scoped fallback 与回包规则回归
  - `PluginGateway` 已不再直接承载：
    - Host requestId 读取与缺失日志
    - Host payload 校验失败时的统一 error 返回
    - approved context 匹配与 connection-scoped fallback
    - runtime `callHost(...)` 成功/失败回包
  - `plugin.gateway.ts` 主文件行数已从 `641` 继续降到 `593`
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-connection.helpers.ts`
    继续把 websocket 连接建档、鉴权超时与 socket handler 装配样板从网关主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-connection.helpers.spec.ts`
    直接给 gateway connection helper 补默认 record、鉴权超时与 socket handler 装配回归
  - `PluginGateway` 已不再直接承载：
    - 新连接默认 record 初始化
    - auth timeout 到期后的统一 AUTH_FAIL 回包
    - message/close/error socket handler 装配
  - `plugin.gateway.ts` 主文件行数已从 `593` 继续降到 `582`
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-inbound.helpers.ts`
    继续把原始 websocket message 的 parse/protocol error/handler failure 样板从网关主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-inbound.helpers.spec.ts`
    直接给 gateway inbound helper 补 parse_error、protocol_error 与下游 failure 包装回归
  - `PluginGateway` 已不再直接承载：
    - 原始 JSON parse 与 parse_error 返回
    - protocol envelope 校验失败时的统一 protocol_error 返回
    - 下游 handler 抛错时的 warn + protocol_error 返回
  - `plugin.gateway.ts` 主文件行数已从 `582` 继续降到 `556`
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-router.helpers.ts`
    继续把 plugin/command 分支里的 register/result/error/route router 样板从网关主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-gateway-router.helpers.spec.ts`
    直接给 gateway router helper 补 register protocol_error、route result 与 command error 路由回归
  - `PluginGateway` 已不再直接承载：
    - register payload 校验与 protocol_error 返回
    - hook/route/command result-error 到 shared pending-request helper 的路由
    - host call / register 分支委派的统一入口
  - `plugin.gateway.ts` 主文件行数已从 `556` 继续降到 `470`
  - 已扩展：
    - `packages/server/src/plugin/plugin-gateway-router.helpers.ts`
    继续把 websocket 顶层 envelope 的 auth guard、auth payload reader 与 heartbeat ping 路由从网关主类中拆出
  - `PluginGateway` 已不再直接承载：
    - 未认证消息的统一 AUTH_FAIL 返回
    - auth envelope 的 payload 读取与 protocol_error 返回
    - heartbeat ping 的顶层路由样板
  - 已删除 `McpService` 中未被宿主消费的城市坐标预加载与查询死代码：
    - `packages/server/src/mcp/mcp.service.ts`
    - `packages/server/src/mcp/mcp-path.util.ts`
    - `tools/test-city-coordinates.ts`
    让 MCP core 回到“server runtime + tool snapshot + callTool”这一条主职责
  - 已新增：
    - `packages/server/src/tool/tool-registry.helpers.ts`
    继续把工具层的 ID/callName/description/source-key 归一化样板从 `ToolRegistryService` 主类中拆出
  - `tool-registry.helpers.ts` 已继续补齐：
    - `buildToolOverview(...)`
    继续把 source/tool 总览投影、计数统计和 fallback source row 样板从 `ToolRegistryService` 主类中拆出
  - 已新增：
    - `packages/server/src/tool/tool-registry.helpers.spec.ts`
    直接给工具层 helper 补 toolId/callName/description/summary 回归
  - 已新增：
    - `packages/server/src/tool/tool-registry-execution.helpers.ts`
    继续把工具层的 toolset 生成、hook payload 组装、schema 转 zod 和执行包装样板从 `ToolRegistryService` 主类中拆出
  - 已新增：
    - `packages/server/src/tool/tool-registry-execution.helpers.spec.ts`
    直接给工具执行 helper 补 hook 包装与空结果回归
  - `ToolRegistryService` 已不再直接承载：
    - source overview 投影
    - tool overview 投影
    - enabled/total 计数统计
    - 缺少 source descriptor 时的 fallback source row 组装
    - toolset 生成与 schema 转 zod
    - `tool:before-call / tool:after-call` payload 组装与执行包装
  - `tool-registry.service.ts` 主文件行数已从 `487` 继续降到 `226`
  - 已新增：
    - `packages/server/src/plugin/plugin-manifest-normalize.helpers.ts`
    继续把 persisted manifest 的 fallback/normalize/parser 纯规则从 `plugin-manifest.persistence.ts` 主文件中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-manifest-normalize.helpers.spec.ts`
    直接给 manifest normalize helper 补 persisted metadata fallback 与 malformed 输入回归
  - `plugin-manifest.persistence.ts` 已不再直接承载：
    - manifest candidate normalize
    - permission/tool/hook/route/command/cron/config 的纯解析规则
  - `plugin-manifest.persistence.ts` 主文件行数已从 `464` 继续降到 `43`
  - 已新增：
    - `packages/server/src/plugin/plugin-record-view.helpers.ts`
    继续把 persisted manifest 驱动的 config snapshot/resolved config/self info 视图样板从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-record-view.helpers.spec.ts`
    直接给 plugin record view helper 补 config defaults 与 self info 投影回归
  - `PluginService` 已不再直接承载：
    - config snapshot 组装
    - resolved config 投影
    - plugin self info 投影
  - `plugin.service.ts` 主文件行数已从 `709` 继续降到 `690`
  - 已新增：
    - `packages/server/src/plugin/plugin-health.helpers.ts`
    继续把 success/failure 健康状态更新规则从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-health.helpers.spec.ts`
    直接给 plugin health helper 补 offline 保持、degraded/error 升级与 success reset 回归
  - `PluginService` 已不再直接承载：
    - success 时的健康状态更新样板
    - failure 时的 degraded/error/offline 判定
    - failureCount / consecutiveFailures / lastError 写回规则
  - `plugin.service.ts` 主文件行数已从 `690` 继续降到 `685`
  - 已扩展：
    - `packages/server/src/plugin/plugin-event.helpers.ts`
    继续把事件分页结果的 metadata/level/items/nextCursor 视图样板从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-event.helpers.spec.ts`
    直接给 plugin event helper 补 metadata fallback、分页截断与 nextCursor 回归
  - `PluginService` 已不再直接承载：
    - event list 的 metadata 解析与 level 归一化
    - limit 截断后的 items 投影
    - nextCursor 计算
  - `plugin.service.ts` 主文件行数已从 `685` 继续降到 `672`
  - 已新增：
    - `packages/server/src/plugin/plugin-register.helpers.ts`
    继续把 plugin register 的 upsert payload/event 选择样板从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-register.helpers.spec.ts`
    直接给 plugin register helper 补 upsert data 与 register/lifecycle 事件选择回归
  - `PluginService` 已不再直接承载：
    - register/upsert 的 create/update payload 组装
    - register 与 lifecycle:online 事件类型选择
  - `plugin.service.ts` 主文件行数已从 `672` 继续降到 `648`
  - 已新增：
    - `packages/server/src/plugin/plugin-storage.helpers.ts`
    继续把 plugin storage 的 key/upsert/list/value 样板从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-storage.helpers.spec.ts`
    直接给 plugin storage helper 补 composite key、upsert payload 与 value/list 投影回归
  - `PluginService` 已不再直接承载：
    - storage composite key / list where 组装
    - storage upsert payload 组装
    - persisted storage value 解析与 entry list 投影
  - `plugin.service.ts` 主文件行数已从 `648` 继续降到 `636`
  - 已新增：
    - `packages/server/src/plugin/plugin-config-write.helpers.ts`
    继续把 plugin config update 的 schema 校验/normalize/持久化 snapshot 样板从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-config-write.helpers.spec.ts`
    直接给 plugin config write helper 补 schema 缺失拒绝与 persisted snapshot 回归
  - `PluginService` 已不再直接承载：
    - persisted manifest 驱动的 schema 读取
    - config values 校验与 normalize
    - persisted config JSON 与返回 snapshot 组装
  - `plugin.service.ts` 主文件行数已从 `636` 继续降到 `624`
  - 已新增：
    - `packages/server/src/plugin/plugin-lifecycle.helpers.ts`
    继续把 online/offline/heartbeat 的状态写回与 lifecycle 事件样板从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-lifecycle.helpers.spec.ts`
    直接给 plugin lifecycle helper 补 online/offline/heartbeat mutation 与 lifecycle event 选择回归
  - `PluginService` 已不再直接承载：
    - online/offline 状态写回数据组装
    - heartbeat 时间戳写回
    - lifecycle online/offline 事件选择
  - 该切片后主文件体量一度到 `631`，后续继续减法后已降到 `614`
  - 已新增：
    - `packages/server/src/plugin/plugin-scope-write.helpers.ts`
    继续把 plugin scope update 的校验/normalize/持久化样板从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-scope-write.helpers.spec.ts`
    直接给 plugin scope write helper 补 protected builtin 拦截与 normalized updateData 回归
  - `PluginService` 已不再直接承载：
    - scope 校验
    - protected builtin 禁用拦截
    - normalized scope 与持久化 updateData 组装
  - `plugin.service.ts` 主文件行数已从 `631` 继续降到 `614`
  - 已扩展：
    - `packages/server/src/plugin/plugin-event.helpers.ts`
    继续把 event findMany 的 query 组装样板从 `PluginService` 主类中拆出
  - `PluginService` 已不再直接承载：
    - event findMany 的 where/orderBy/take 组装
    - cursor-aware 查询参数组合
  - `plugin.service.ts` 主文件行数已从 `614` 继续降到 `608`
  - 已扩展：
    - `packages/server/src/plugin/plugin-health.helpers.ts`
    继续把 success/failure 的 event level、persistEvent 策略与 health-check bridge 输入从 `PluginService` 主类中拆出
  - `PluginService` 已不再直接承载：
    - success/failure 的事件级别与可选持久化策略组装
    - `health:ok` / `health:error` 的桥接输入映射
  - `plugin.service.ts` 主文件行数已从 `646` 继续降到 `643`
  - 已新增维护文档：
    - `docs/扩展内核维护说明.md`
    并在 `README.md` / `docs/插件开发指南.md` 增加入口

## 当前减法切片

- [x] AI provider runtime 只保留 `openai / anthropic / gemini` 三个协议族
- [x] provider catalog 只保留“目录模板 + 协议映射”职责，不回退到按厂商 SDK 扩张
- [x] 继续删除 AI 模块内部残留的 `official / format` 历史命名与空壳 helper 字段
- 进展记录：
  - 已新增：
    - `packages/server/src/chat/chat-message-plugin-target.service.ts`
    - `packages/server/src/chat/chat-message-plugin-target.service.spec.ts`
    把聊天消息里“插件消息目标解析 + message.send 写回链路”从 `ChatMessageService` 主类中拆出
  - 已新增：
    - `packages/server/src/chat/chat-message-completion.service.ts`
    - `packages/server/src/chat/chat-message-completion.service.spec.ts`
    把短路 assistant 完成态写回、response hook 后处理和 vision fallback metadata 写回从 `ChatMessageService` 主类中拆出
  - 已新增：
    - `packages/server/src/chat/chat-message-mutation.service.ts`
    - `packages/server/src/chat/chat-message-mutation.service.spec.ts`
    把消息编辑、删除、对应的 `message:*` hook 和持久化写回从 `ChatMessageService` 主类中拆出
  - 已新增：
    - `packages/server/src/chat/chat-message-generation.service.ts`
    - `packages/server/src/chat/chat-message-generation.service.spec.ts`
    把消息生成、重试与停止从 `ChatMessageService` 主类中拆出
  - 已新增：
    - `packages/server/src/chat/chat-message-common.helpers.ts`
    - `packages/server/src/chat/chat-message-common.helpers.spec.ts`
    把聊天共享的 lifecycle context、会话更新时间、归属消息查找和 LLM 启用校验收口到公共 helper
  - 已新增：
    - `packages/server/src/chat/chat-task-persistence.service.ts`
    - `packages/server/src/chat/chat-task-persistence.service.spec.ts`
    把聊天后台任务的消息状态持久化、完成态快照构造与补丁写回从 `ChatTaskService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-storage.service.ts`
    - `packages/server/src/plugin/plugin-storage.service.spec.ts`
    把插件存储的 CRUD、坏 JSON 回退与 logger 告警从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-event-write.service.ts`
    - `packages/server/src/plugin/plugin-event-write.service.spec.ts`
    把插件事件写入、成功/失败健康状态更新和 health-check 写回从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-lifecycle-write.service.ts`
    - `packages/server/src/plugin/plugin-lifecycle-write.service.spec.ts`
    把插件注册、上线/下线、心跳和删除从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-read.service.ts`
    - `packages/server/src/plugin/plugin-read.service.spec.ts`
    把插件治理快照、列表查询、配置/作用域/健康/事件等只读入口从 `PluginService` 主类中拆出
  - 已新增：
    - `packages/server/src/plugin/plugin-governance-write.service.ts`
    - `packages/server/src/plugin/plugin-governance-write.service.spec.ts`
    把插件配置写入与作用域写入从 `PluginService` 主类中拆出
  - `ChatMessageService` 已改为通过 `ChatMessagePluginTargetService` 委派：
    - `message.target.current.get`
    - `message.send`
    以及对应的 conversation 可见性校验、目标解析与 assistant 消息写回
  - `ChatMessageService` 已改为通过 `ChatMessageCompletionService` 委派：
    - 短路 assistant 回复的完成态写回
    - `response:before-send / response:after-send` 后处理
    - 当前 user/assistant 与重试 assistant 的 vision fallback metadata 写回
  - `ChatMessageService` 已改为通过 `ChatMessageMutationService` 委派：
    - 消息编辑
    - 消息删除
    - 对应的 `message:updated / message:deleted` hook 与持久化写回
  - `ChatMessageService` 已改为通过 `ChatMessageGenerationService` 委派：
    - `startMessageGeneration`
    - `retryMessageGeneration`
    - `stopMessageGeneration`
  - `chat-message.service.ts` 主文件行数已从 `1030` 继续降到 `65`
  - `chat-message-generation.service.ts` 主文件行数已从 `503` 继续降到 `463`
  - `ChatTaskService` 已改为通过 `ChatTaskPersistenceService` 委派：
    - `persistMessageState`
    - `buildCompletedTaskResult`
    - `persistCompletedResult`
    - `hasCompletedResultPatch`
  - `chat-task.service.ts` 主文件行数已从 `443` 继续降到 `379`
  - `PluginService` 已改为通过 `PluginStorageService` 委派：
    - `storage.get`
    - `storage.set`
    - `storage.delete`
    - `storage.list`
  - `PluginService` 已改为通过 `PluginEventWriteService` 委派：
    - `event.record`
    - `health.success`
    - `health.failure`
    - `health.check`
  - `PluginService` 已改为通过 `PluginLifecycleWriteService` 委派：
    - `register`
    - `online`
    - `offline`
    - `heartbeat`
    - `delete`
  - `PluginService` 已改为通过 `PluginReadService` 委派：
    - `governance snapshot`
    - `findAll / findOnline / findByName`
    - `config / resolved config / self info / scope / health / events`
  - `PluginService` 已改为通过 `PluginGovernanceWriteService` 委派：
    - `updatePluginConfig`
    - `updatePluginScope`
  - `plugin.service.ts` 主文件行数已从 `605` 继续降到 `342`
  - 已删除多厂商 SDK runtime / stub 残留，当前 runtime 与 type stub 都已收敛到三种协议族
  - 已把 provider catalog 收口为 `core + preset + protocol`，preset 不再绑定独立 SDK
  - 已删除一批 AI 模块薄壳：
    - `official-provider-catalog.ts`
    - `getProviderCatalogItem(...)`
    - `toManagedProviderSummary(...)`
    - `resolveProviderDiscoveryProtocol(...)`
    - `ProviderModelFactoryPreference`
  - 已把 custom provider 最后一处 `format` 字段收口为 `protocol`
  - 已把 external mode contract 从 `official / compatible` 收口为 `catalog / protocol`
  - 已把 `CompatibleProviderDriver` / `isCompatibleProviderDriver(...)` / `protocolCompatibleDrivers` 这批历史命名收口为协议族命名
  - README、后端调用说明和前端 provider settings 已统一改用“目录模板 / 协议接入”
  - `config-manager.loader.ts` 已把旧字面量收口为 migration 常量，并补了“读取旧值后落盘为新值”的回归
  - 当前运行时契约、shared types、前端文案与文档都已不再暴露旧字面量

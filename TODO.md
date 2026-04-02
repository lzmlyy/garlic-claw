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
  - 已新增维护文档：
    - `docs/扩展内核维护说明.md`
    并在 `README.md` / `docs/插件开发指南.md` 增加入口

## 当前减法切片

- [x] AI provider runtime 只保留 `openai / anthropic / gemini` 三个协议族
- [x] provider catalog 只保留“目录模板 + 协议映射”职责，不回退到按厂商 SDK 扩张
- [x] 继续删除 AI 模块内部残留的 `official / format` 历史命名与空壳 helper 字段
- 进展记录：
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

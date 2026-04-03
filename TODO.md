# Garlic Claw TODO

> 校正 2026-04-01：
> 之前把“contract 已固化 / 局部 primitive 已落地”误记成“顶层长期目标已完成”，这个状态不准确。
> 下面这些顶层条目恢复为长期目标；具体已经落地的内容继续以阶段记录和进展记录为准。
>
> 2026-04-02 起：
> `TODO.md` 只保留长期目标、当前切片和压缩后的里程碑摘要；
> 详细阶段流水账留在本地规划文件，不再继续堆回项目级 TODO。

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

## 在线接入与治理

- [x] 支持在线添加 `MCP server`，不依赖服务重启
- [x] 支持在线添加 `remote plugin`，不依赖服务重启
- [x] `MCP / plugin / skill` 都支持统一的在线启用 / 停用
- [x] 启用 / 停用进入统一 governance / runtime contract，不再各自维护私有开关语义
- 状态校正 2026-04-03：
  - 当前 `MCP` 已接入统一 `tools/sources/:kind/:id/enabled` 开关：
    - 在线停用会触发 runtime disconnect
    - 在线启用会触发 runtime reconnect
    - startup / reload 会持续尊重已保存的治理状态
  - 当前 `plugin` 已接入统一 `tools/sources/:kind/:id/enabled` 开关：
    - 会同步回写现有 `plugin scope.defaultEnabled`
    - 会保留已有 conversation 级覆盖，不重置局部治理
  - 当前 `plugin` 的 `/plugins/:name/scopes` 已只保留 conversation 级覆盖：
    - 不再把私有 `defaultEnabled` 当作全局启停真相源
    - 全局启用 / 停用只留在 `tools/sources/plugin/:id/enabled`
  - 当前 `skill` 已接入统一 `tools/sources/skill/active-packages/enabled` 开关：
    - 会同步影响 skill package tool access
    - 会同步影响 prompt 里的 skill package tool guidance 与 allowedToolNames
  - 当前单个 `skill` 的 `/skills/:id/governance` 已只保留 `trustLevel`
  - 单个 `skill` 不再维护私有 `enabled` 持久化位
  - 因此 `skill` 侧剩余的启用 / 停用语义已只留在 `tools/sources/skill/active-packages/enabled`
  - 当前 `MCP` 已支持 `POST /mcp/servers` / `PUT /mcp/servers/:name` / `DELETE /mcp/servers/:name`：
    - 配置写入后会只对目标 server 做定向 apply/remove
    - 不再为了新增/修改/删除一个 server 全量断开其它 MCP 连接
  - 当前 `plugin` 已支持 `POST /plugins/remote/bootstrap`：
    - 在线创建/刷新 remote placeholder record
    - 在线签发绑定 `pluginName + deviceType` 的专用接入令牌
    - 新接入流程不再依赖复用管理员 JWT
  - 当前 gateway 仍兼容管理员 JWT，只作为旧远程插件的过渡兼容
  - 所以现在已满足“统一在线启用/停用 + MCP/remote plugin 在线添加”
  - 当前剩余的私有治理主要是 conversation 级局部覆盖，不再是全局启停双轨

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

## 减法判定

- [ ] 后续减法以 `core` 生产代码总量下降为硬指标，不再只以主文件变薄作为完成条件
- [ ] 不接受只把同等复杂度从大文件拆成更多 `core helper / facade / service`
- [ ] 作者体验、协议糖和适配复杂度优先外移到 `SDK / adapter / plugin-side facade`
- [ ] 只有在 `core` 更薄、边界更稳、且总代码更少时，才算这轮减法成立
- 状态校正 2026-04-02：
  - 当前这轮连续重构把一批大文件压薄了，但按新口径并不达标
  - 相对 `2920bea^` 到当前 `bb7d37a`，`packages/server/src` 非测试生产代码是净增 `1328` 行
  - 其中 `plugin + chat core` 非测试生产代码净增 `1493` 行
  - `packages/plugin-sdk/src` 在这段范围内没有承接对应复杂度外移
  - 结论：这批改动目前只能算 `core` 内部结构重排，不算真正减法完成

## 减法优先级

- [ ] 第一阶段：收薄 `plugin host core`
- [x] 第二阶段：定义并固化统一 `extension kernel contract`
- [ ] 第三阶段：给 `MCP / skill` 做 adapter / bridge，而不是硬改其生态格式
- [ ] 第四阶段：把更多 builtin 迁成普通扩展消费者
- [ ] 第五阶段：删除不再必要的核心特判、专用持久化面和历史兼容层
- 进展摘要：
  - `extension kernel contract` 已固化到 `docs/扩展内核契约说明.md`
  - 已补齐 `plugin / conversation / user` scoped `storage.*`、`state.*`、`state.list`、`state.delete`
  - builtin / host / runtime / gateway / manifest / tool registry / plugin service 已完成多轮结构拆分，但按“`core` 总量必须下降”的新口径，这批结果还不算减法达标
  - 已删除一批无人消费死入口、核心特判和历史兼容命名，并补齐 `docs/扩展内核维护说明.md`

## 当前减法切片

- [x] AI provider runtime 只保留 `openai / anthropic / gemini` 三个协议族
- [x] provider catalog 只保留“目录模板 + 协议映射”职责，不回退到按厂商 SDK 扩张
- [x] 继续删除 AI 模块内部残留的 `official / format` 历史命名与空壳 helper 字段
- 进展摘要：
  - 聊天链路已按职责拆成 `plugin-target / completion / mutation / generation / response-hooks / task-persistence` 等聚焦 service
  - 插件治理与持久化链路已按职责拆成 `storage / event-write / lifecycle-write / read / governance-write` 等聚焦 service
  - AI provider runtime 已收敛到 `openai / anthropic / gemini` 三个协议族，`official / compatible / format` 等历史命名已基本清空
  - `builtin` 作者侧的 Host facade / param builder / host type 已开始从 `server` 外移到 `plugin-sdk` 共用导出
  - builtin 示例插件与 loader 已不再从 `builtin-plugin.transport.ts` 读取 definition type，参考实现继续降低对 transport 实现文件的编译期耦合
  - builtin Hook payload reader 与 `chat:before-model` 结果 helper 已进一步外移到 `plugin-sdk`
  - builtin 示例插件已不再从 `builtin-plugin.transport.ts` 读取作者侧 helper，`builtin-hook-payload.helpers.ts` 已删除
  - `builtin-plugin.transport.ts` 现在已直接复用 SDK facade 与通用作者 transport executor；server 侧两份薄壳 helper 与对应重复 spec 已删除
  - builtin 插件里重复的最近用户消息提取、可选文本清洗、逗号分隔工具名解析，已进一步外移到 `plugin-sdk`
  - builtin 插件里重复的 `JsonValue -> object` 读取器，也已进一步外移到 `plugin-sdk`
  - builtin 工具插件里重复的字符串/对象参数读取器，也已进一步外移到 `plugin-sdk`
  - builtin 插件里重复的会话摘要/消息列表/文本生成结果/记忆检索结果读取器，已进一步外移到 `plugin-sdk`
  - builtin `memory-tools` 的 save 结果 ID reader 与 `tool-audit` 的 JSON 类型摘要，也已进一步外移到 `plugin-sdk`
  - builtin 子代理委派里的 prompt 读取、maxSteps 归一化、回写 flag 读取、执行摘要裁剪，已进一步外移到 `plugin-sdk`
  - builtin 自动化工具插件里的 `createAutomation` 参数解析器，已进一步外移到 `plugin-sdk`
  - builtin `provider-router` 里的工具白名单裁剪与顺序比较 helper，已进一步外移到 `plugin-sdk`
  - `chat-message-orchestration.service.ts` 已删掉一份本地工具白名单裁剪 helper，改直接复用 SDK 导出
  - `chat-message-generation.service.ts` 已把 start/retry 里的短路完成、任务启动、错误回写并回统一内部流程，不再保留两段近乎相同的主链控制流
  - `chat-message-completion.service.ts` 已把“双消息 metadata 写回 / 单消息 metadata 写回”并回统一内部持久化入口，不再保留两段近乎相同的 vision fallback 写回流程
  - `chat-task.service.ts` 已把三类流片段的 streaming 写回、两处 stopped 终态和统一 finish/status 发射并回类内共享流程
  - `chat-message-plugin-target.service.ts` 已删掉 `sendPluginMessage(...)` 里重复的会话访问校验，不再为同一个 target conversation 做两次相同权限读取
  - `chat-message-response-hooks.service.ts` 已把 `CompletedChatTaskResult -> hook context/payload` 的三处重复组装并回类内共享入口
  - `chat.controller.ts` 已把 `sendMessage/retryMessage` 两条 SSE 骨架并回统一内部流程，不再保留两段近乎相同的订阅/等待/错误写回控制流
  - `chat.service.ts` 已把三处重复的 conversation owner 校验并回统一内部断言，不再各自手写 `not found / forbidden` 分支
  - `chat-message-session.ts` 已删除本地 `normalizeRole(...)`，改复用现有 `normalizeMessageRole(...)`
  - `chat-message.helpers.ts` 已把两处 `chat-tool` context 组装并回共享本地函数
  - `plugin-subagent-task-request.helpers.ts` 里重复的 `normalizePositiveInteger(...)` 已删回现有 validation helper
  - `builtin-plugin.types.ts` 里无人消费的 builtin 别名层已继续删薄，治理 handler 已改成复用 SDK transport governance type
  - `smoke:http` 暴露的 chat/plugin 循环注入缺口已补齐，当前后端启动烟测重新通过
  - 这说明当前已经不只是 `core` 内部横向拆分，但还需要继续找下一批能外移到 `SDK / adapter` 的重复面

## 当前基线

- `builtin-plugin.transport.ts`: `1069 -> 162`
- `plugin-host.service.ts`: `1000+ -> 126`
- `plugin-runtime.service.ts`: `4287 -> 684`
- `plugin-runtime-input.helpers.ts`: `362 -> 5`
- `plugin-runtime-hook-result.helpers.ts`: `555 -> 4`
- `plugin.gateway.ts`: `1269 -> 364`
- `tool-registry.service.ts`: `487 -> 226`
- `plugin.service.ts`: `1059 -> 342`
- `chat-message.service.ts`: `1030 -> 65`
- `chat.controller.ts`: `266 -> 228`
- `chat.service.ts`: `192 -> 175`
- `chat-message-completion.service.ts`: `180 -> 172`
- `chat-message-generation.service.ts`: `503 -> 436`
- `chat-message.helpers.ts`: `153 -> 152`
- `chat-message-orchestration.service.ts`: `359 -> 234`
- `chat-message-plugin-target.service.ts`: `259 -> 228`
- `chat-message-response-hooks.service.ts`: `154 -> 134`
- `chat-message-session.ts`: `109 -> 92`
- `chat-task.service.ts`: `443 -> 360`
- `config-manager.loader.ts`: `426 -> 392`
- `builtin-plugin-host-facade.helpers.ts`: `255 -> 0`（已删）
- `builtin-plugin-host-params.helpers.ts`: `200 -> 0`（已删）
- `builtin-plugin.types.ts`: `215 -> 31`

## 当前 core 行数快照

- `packages/server/src`: `32545`
- `packages/server/src/plugin`: `17029`
- `packages/server/src/chat`: `3862`
- `packages/server/src/chat/chat.controller.ts`: `228`
- `packages/server/src/chat/chat-message.helpers.ts`: `152`
- `packages/server/src/chat/chat-message-completion.service.ts`: `172`
- `packages/server/src/chat/chat-message-generation.service.ts`: `436`
- `packages/server/src/chat/chat-message-plugin-target.service.ts`: `228`
- `packages/server/src/chat/chat-message-orchestration.service.ts`: `234`
- `packages/server/src/chat/chat-message-response-hooks.service.ts`: `134`
- `packages/server/src/chat/chat-message-session.ts`: `92`
- `packages/server/src/chat/chat.service.ts`: `175`
- `packages/server/src/chat/chat-task.service.ts`: `360`
- `packages/server/src/plugin/builtin/builtin-plugin.transport.ts`: `162`
- `packages/server/src/plugin/builtin/builtin-plugin.types.ts`: `31`
- `packages/server/src/plugin/plugin-subagent-task-request.helpers.ts`: `160`
- `packages/server/src/plugin/plugin-runtime.service.ts`: `684`
- `packages/server/src/plugin/plugin-host.service.ts`: `126`

## 当前下一步

- [x] 本轮已完成 `plugin-runtime-input.helpers.ts` 的按域拆分，并保留 barrel 导出面不变
- [x] 本轮已完成 `plugin-runtime-hook-result.helpers.ts` 的按域拆分，并保留 barrel 导出面不变
- [x] 本轮已让 `MCP` source enabled/disabled 接入统一工具治理运行时，不再只是工具列表过滤
- [x] 本轮已让 `plugin` source enabled/disabled 接入现有 `plugin scope.defaultEnabled`
- [x] 本轮已让 `skill` source enabled/disabled 接入 skill package tool access / prompt guidance / allowedToolNames
- [x] 本轮已补齐 `MCP server` 在线添加：配置写入后定向 apply/remove，不再全量 reload 全部 server
- [x] 本轮已补齐 `remote plugin` 在线添加：专用 bootstrap 令牌 + 在线 placeholder record
- [x] 本轮已让 `/plugins/:name/scopes` 只保留会话级覆盖，不再写私有 `defaultEnabled`
- [x] 本轮已把 builtin Host facade / param builder / host type 的重复作者侧语法糖收口到 `plugin-sdk`
- [x] 本轮已把 builtin 示例插件和 loader 的 definition type import 从 transport 实现文件解耦
- [x] 本轮已把 builtin Hook payload reader / `chat:before-model` 结果 helper 外移到 `plugin-sdk`
- [x] 本轮已删除 server 侧两份 builtin Host helper 薄壳与对应重复 spec，`builtin-plugin.transport.ts` 改为直接复用 SDK facade
- [x] 本轮已让 builtin 示例插件不再 import transport 实现 helper，`builtin-hook-payload.helpers.ts` 已删除
- [x] 本轮已把 builtin `tool / hook / route` 执行壳与治理动作枚举收口到 `plugin-sdk` 的通用作者 transport executor
- [x] 本轮已把 builtin 插件中重复的 message/config 作者侧小工具收口到 `plugin-sdk`
- [x] 本轮已把 builtin 插件中重复的 `readJsonObjectValue(...)` 收口到 `plugin-sdk`
- [x] 本轮已把 builtin 工具插件中重复的字符串/对象参数读取器收口到 `plugin-sdk`
- [x] 本轮已把 builtin 会话/消息/文本生成/记忆结果读取器收口到 `plugin-sdk`
- [x] 本轮已把 builtin 子代理委派里的作者侧值读取与执行摘要 helper 收口到 `plugin-sdk`
- [x] 本轮已把 builtin 自动化工具插件的 `createAutomation` 参数解析器收口到 `plugin-sdk`
- [x] 本轮已把 builtin `provider-router` 的工具白名单 helper 收口到 `plugin-sdk`
- [x] 本轮已把 `plugin-subagent-task-request.helpers.ts` 里的重复 `normalizePositiveInteger(...)` 并回现有 validation helper
- [x] 本轮已删掉 `builtin-plugin.types.ts` 里无人消费的 builtin 别名层，并让治理 handler 直接复用 SDK type
- [x] 本轮已把 `chat-message-completion.service.ts` 的 vision fallback metadata 重复写回并回统一内部持久化入口
- [x] 本轮已把 `chat-task.service.ts` 的 streaming/stopped 重复控制流并回统一内部流程
- [x] 本轮已把 `chat-message-plugin-target.service.ts` 的重复会话访问校验删回单次目标解析
- [x] 本轮已把 `chat-message-response-hooks.service.ts` 的 response hook context/payload 重复组装并回类内共享入口
- [x] 本轮已把 `chat.controller.ts` 的 `sendMessage/retryMessage` SSE 骨架并回统一内部流程
- [x] 本轮已把 `chat.service.ts` 的重复 conversation owner 校验并回统一内部断言
- [x] 本轮已把 `chat-message-session.ts` 的本地角色归一化删回现有 `normalizeMessageRole(...)`
- [x] 本轮已把 `chat-message.helpers.ts` 的两处 `chat-tool` context 组装并回共享本地函数
- [x] 这一次切片已确认满足“core 净减少、复杂度外移到 SDK”：
  - `git diff --numstat` 显示 `packages/server/src/plugin/builtin/*host*` 与 `builtin-plugin.types.ts` 合计净减 `557` 行
  - 同一轮 `packages/plugin-sdk/src/index.ts` 净增 `70` 行，用于承接共用 facade / builder 导出
- [ ] 后续切片先核对是否真的让 `core` 生产代码净减少；只在 `core` 内横向搬运的切片不再优先
- [ ] 优先把作者侧复杂度继续外移到 `SDK / adapter`，而不是继续给 `core` 增加新 helper 层
- [ ] 如继续收口 `plugin` 私有治理，只评估 conversation override 是否还需要独立入口；不再回到双轨全局启停
- [ ] 复盘这轮新增的 `core helper / facade / service`，优先找出可以删回、并回，或迁到 `plugin-sdk / adapter` 的部分
- [ ] 下一候选优先查看哪些能力还能从 `plugin/chat runtime core` 外移到 `plugin-sdk`、builtin facade 或 adapter 层

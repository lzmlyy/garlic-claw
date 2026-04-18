# Garlic Claw TODO

> 本文件只保留当前仍有效的项目级真相。
> 已完成旧流水只保留摘要；本轮实现细节放 `task_plan.md / progress.md / findings.md`。

## 已完成摘要

- `packages/shared` 已收口为 type-only，共享契约已对齐。
- `packages/server/src` 已压到 `8494`，Windows 与 WSL 内部目录的 fresh 构建、测试、后端 smoke、前端浏览器 smoke、独立 judge 都已通过。
- 认证主链已收口为单密钥登录；`users/me / register / dev-login / refresh / role / API Key` 主链路已删除。
- 聊天链路已支持 provider 自定义扩展块，前端默认折叠展示；插件侧已支持显式 `transportMode: 'generate' | 'stream-collect'`。
- 聊天页“会话相关元素统一刷新”已完成，发送 / 重试 / 编辑 / 删除 / 停止生成后的摘要刷新、旧 SSE/旧请求竞态收口、独立 judge 都已通过。
- 文档分层、跨平台约束、无绝对路径约束、测试目录规范已同步到 `AGENTS.md`。
- N12 Persona 重构（AstrBot 方向）已完成，当前 persona 已改为服务端一等资源并使用目录化存储。

## 当前阶段：[已完成] N13 插件配置元数据协议重构（AstrBot 方向）

### 目标

- 把当前插件配置能力从宿主自定义的扁平 `fields[]`，重构为接近 AstrBot 的声明式配置元数据协议。
- 插件“自定义 UI”第一轮不做插件自带前端，而是由宿主统一渲染插件声明的配置元数据。
- 新协议要保留跨前端可消费的纯数据语义，不把当前 Vue 组件实现细节写进共享契约。
- 配置页主语义要尽量贴近 AstrBot：
  - object section
  - `description / hint / obvious_hint`
  - `items`
  - `default`
  - `invisible`
  - `options`
  - `editor_mode / editor_language / editor_theme`
  - `_special`
  - `condition`
  - `collapsed`
- 命名与落点保持当前项目风格统一，不直接照搬 AstrBot 文件名。

### 当前问题

- 当前 `PluginConfigSchema` 只有扁平 `fields[]`，表达不了 AstrBot 风格的 section/object 嵌套结构。
- 当前字段类型只有 `string / number / boolean / object / array`，缺少 `text / int / float / bool / list` 这种更贴近声明式 UI 的宿主语义。
- 当前前端 `PluginConfigForm` 只能按扁平字段渲染输入框，无法表达：
  - 条件显示
  - 醒目 hint
  - 折叠高级项
  - 特殊选择器
  - 编辑器模式
- 当前服务端校验逻辑只按扁平字段做类型判断，无法对 object/items 递归处理。
- 当前插件配置快照仍以“宿主内部字段表单”视角构造，不是“宿主统一消费元数据协议”视角。

### 设计边界

- 第一轮不做插件自带 iframe、微前端或宿主动态执行插件前端模块。
- 第一轮不做任意自定义按钮动作；先把 AstrBot 风格配置元数据协议做完整。
- `_special` 作为宿主扩展控件入口保留，但只实现当前项目已具备稳定 owner 的选择器，不为了“字段名兼容”做空壳。
- 不做兼容层；旧的 `fields[]` 协议不保留双写。
- 不新增 `helper / helpers` 命名、目录或抽象层。

### 实现计划

#### C1. Shared 与 Plugin SDK 契约改造

- 重写 `PluginConfigSchema` 为 object-tree 元数据协议，至少包含：
  - section/object 层
  - item 层
  - 基础字段类型
  - `hint / obvious_hint / invisible / condition / collapsed`
  - `options`
  - `editor_mode / editor_language / editor_theme`
  - `_special`
- 同步更新 `packages/plugin-sdk` 的 manifest 输入类型。

#### C2. Server 快照与校验改造

- `PluginBootstrapService` 读取新的 config 元数据协议，不再只解析 `fields[]`。
- `PluginPersistenceService.validatePluginConfig()` 改为递归校验 object/items。
- `plugin-read-model` 生成配置快照时，按新的元数据协议补全默认值并保留已存值。
- 保持现有 `/plugins/:pluginId/config` HTTP 边界不变，避免扩大 API 面。

#### C3. Web 宿主渲染器改造

- 用新的声明式渲染器替换当前扁平 `PluginConfigForm`。
- 第一轮至少支持：
  - object section
  - text / int / float / bool / string / list
  - options 下拉或多选
  - hint / obvious_hint
  - invisible / condition
  - collapsed
  - editor mode
- `_special` 只接入当前宿主已经稳定存在的数据源选择器。

#### C4. 测试与示例

- 更新 shared/server/web/plugin-sdk 受影响测试与 fixture。
- 给 builtin/测试插件补一份能覆盖 object/items/condition/options/_special 的示例 schema。
- fresh 跑完 build、lint、server smoke，以及受影响的 web 测试；如插件页有真实 UI 变化，再跑 `smoke:web-ui`。

### 验收标准

- 插件配置元数据协议已不再是扁平 `fields[]`。
- 服务端能按新协议生成默认配置快照并做递归校验。
- 前端插件详情页能按新协议渲染配置 UI，而不是只显示一组扁平输入框。
- `hint / obvious_hint / invisible / condition / collapsed / options / editor_mode / _special` 至少在第一轮实现的范围内真实生效。
- 现有插件配置读写接口仍可工作。
- 受影响测试、构建与 smoke fresh 通过。

### 当前验收命令（阶段内持续维护）

- `packages/shared`: `npm run build`
- `packages/plugin-sdk`: 受影响测试
- `packages/server`: 插件配置相关定向 `jest`
- `packages/server`: `npm run build`
- `packages/web`: 插件配置相关定向 `vitest`
- `packages/web`: `npm run build`
- root: `npm run lint`
- root: `npm run smoke:server`
- 如插件页有真实 UI 改动，再补 `npm run smoke:web-ui`

## 固定约束

- 不允许引入绝对路径。
- WSL 测试必须在 WSL 内部目录执行；如当前环境本身就在 Linux / WSL 内部目录则忽略迁移动作。
- 提交前 / 修改完成后必须实际跑所有受影响冒烟测试，直到通过才能继续。
- 测试新增的持久副作用必须清理，不提交 provider、会话记录、聊天记录等测试残留。
- 不接受把 persona 复杂度继续藏在普通插件顺序或隐式 prompt 覆盖里。

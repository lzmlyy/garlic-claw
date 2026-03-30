import type { ActionConfig, AutomationInfo } from './automation';
import type { AiModelCapabilities, AiProviderSummary } from './ai';
import type { ChatMessagePart, ChatMessageStatus } from './chat';
import type { JsonObject, JsonValue } from './json';

/** WebSocket 消息信封 */
export interface WsMessage<T = JsonValue> {
  type: string;
  action: string;
  payload: T;
  requestId?: string;
}

/** 插件运行时类型。 */
export type PluginRuntimeKind = 'builtin' | 'remote';

/** 插件权限。 */
export type PluginPermission =
  | 'automation:read'
  | 'automation:write'
  | 'cron:read'
  | 'cron:write'
  | 'conversation:read'
  | 'conversation:write'
  | 'config:read'
  | 'kb:read'
  | 'llm:generate'
  | 'log:write'
  | 'memory:read'
  | 'memory:write'
  | 'persona:read'
  | 'persona:write'
  | 'provider:read'
  | 'storage:read'
  | 'storage:write'
  | 'subagent:run'
  | 'state:read'
  | 'state:write'
  | 'user:read';

/** 插件 Hook 名称。 */
export type PluginHookName =
  | 'message:received'
  | 'chat:before-model'
  | 'chat:waiting-model'
  | 'chat:after-model'
  | 'conversation:created'
  | 'message:created'
  | 'message:updated'
  | 'message:deleted'
  | 'automation:before-run'
  | 'automation:after-run'
  | 'subagent:before-run'
  | 'subagent:after-run'
  | 'tool:before-call'
  | 'tool:after-call'
  | 'response:before-send'
  | 'response:after-send'
  | 'plugin:loaded'
  | 'plugin:unloaded'
  | 'plugin:error'
  | 'cron:tick';

/** `message:received` 可声明的消息类型过滤。 */
export type PluginMessageKind = 'text' | 'image' | 'mixed';

/** 正则过滤描述。 */
export interface PluginRegexFilterDescriptor {
  pattern: string;
  flags?: string;
}

/** `message:received` 的最小声明式过滤条件。 */
export interface PluginHookMessageFilter {
  commands?: string[];
  regex?: string | PluginRegexFilterDescriptor;
  messageKinds?: PluginMessageKind[];
}

/** Hook 过滤描述。 */
export interface PluginHookFilterDescriptor {
  message?: PluginHookMessageFilter;
}

/** 插件调用来源。 */
export type PluginInvocationSource =
  | 'chat-tool'
  | 'chat-hook'
  | 'cron'
  | 'automation'
  | 'http-route'
  | 'subagent'
  | 'plugin';

// ---- WebSocket 消息类型 (type 字段) ----
export const WS_TYPE = {
  AUTH: 'auth',
  PLUGIN: 'plugin',
  COMMAND: 'command',
  HEARTBEAT: 'heartbeat',
  ERROR: 'error',
} as const;

// ---- WebSocket 动作 (action 字段) ----
export const WS_ACTION = {
  // 认证
  AUTHENTICATE: 'authenticate',
  AUTH_OK: 'auth_ok',
  AUTH_FAIL: 'auth_fail',
  // 插件生命周期
  REGISTER: 'register',
  REGISTER_OK: 'register_ok',
  UNREGISTER: 'unregister',
  STATUS: 'status',
  // 命令 (AI → 插件)
  EXECUTE: 'execute',
  EXECUTE_RESULT: 'execute_result',
  EXECUTE_ERROR: 'execute_error',
  // Hook (Host → 插件)
  HOOK_INVOKE: 'hook_invoke',
  HOOK_RESULT: 'hook_result',
  HOOK_ERROR: 'hook_error',
  // Route (HTTP → 插件)
  ROUTE_INVOKE: 'route_invoke',
  ROUTE_RESULT: 'route_result',
  ROUTE_ERROR: 'route_error',
  // Host API (插件 → Host)
  HOST_CALL: 'host_call',
  HOST_RESULT: 'host_result',
  HOST_ERROR: 'host_error',
  // 心跳
  PING: 'ping',
  PONG: 'pong',
} as const;

// ---- 负载类型 ----
export interface AuthPayload {
  token: string;
  pluginName: string;
  deviceType: DeviceType;
}

/** 插件 Hook 描述。 */
export interface PluginHookDescriptor {
  name: PluginHookName;
  description?: string;
  priority?: number;
  filter?: PluginHookFilterDescriptor;
}

/** 插件配置字段描述。 */
export interface PluginConfigFieldSchema {
  key: string;
  type: PluginParamSchema['type'];
  description?: string;
  required?: boolean;
  secret?: boolean;
  defaultValue?: JsonValue;
}

/** 插件配置 schema。 */
export interface PluginConfigSchema {
  fields: PluginConfigFieldSchema[];
}

/** 插件配置快照。 */
export interface PluginConfigSnapshot {
  schema: PluginConfigSchema | null;
  values: JsonObject;
}

/** 插件作用域设置。 */
export interface PluginScopeSettings {
  defaultEnabled: boolean;
  conversations: Record<string, boolean>;
}

/** 插件健康状态。 */
export type PluginHealthStatus =
  | 'unknown'
  | 'healthy'
  | 'degraded'
  | 'error'
  | 'offline';

/** 插件事件日志级别。 */
export type PluginEventLevel = 'info' | 'warn' | 'error';

/** 插件治理动作名称。 */
export type PluginActionName = 'reload' | 'reconnect' | 'health-check';

/** 插件运行时压力快照。 */
export interface PluginRuntimePressureSnapshot {
  activeExecutions: number;
  maxConcurrentExecutions: number;
}

/** 插件健康快照。 */
export interface PluginHealthSnapshot {
  status: PluginHealthStatus;
  failureCount: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
  runtimePressure?: PluginRuntimePressureSnapshot;
}

/** 插件事件日志记录。 */
export interface PluginEventRecord {
  id: string;
  type: string;
  level: PluginEventLevel;
  message: string;
  metadata: JsonObject | null;
  createdAt: string;
}

/** 插件事件日志查询条件。 */
export interface PluginEventQuery {
  limit?: number;
  level?: PluginEventLevel;
  type?: string;
  keyword?: string;
  cursor?: string;
}

/** 插件事件日志分页结果。 */
export interface PluginEventListResult {
  items: PluginEventRecord[];
  nextCursor: string | null;
}

/** 插件持久化 KV 条目。 */
export interface PluginStorageEntry {
  key: string;
  value: JsonValue;
}

/** 插件 Route 支持的 HTTP 方法。 */
export type PluginRouteMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE';

/** 插件声明的 cron 来源。 */
export type PluginCronSource = 'manifest' | 'host';

/** 插件声明的 cron 描述。 */
export interface PluginCronDescriptor {
  name: string;
  cron: string;
  description?: string;
  enabled?: boolean;
  data?: JsonValue;
}

/** 插件 cron job 摘要。 */
export interface PluginCronJobSummary {
  id: string;
  pluginId: string;
  name: string;
  cron: string;
  description?: string;
  source: PluginCronSource;
  enabled: boolean;
  data?: JsonValue;
  lastRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 插件声明的 Web Route。 */
export interface PluginRouteDescriptor {
  path: string;
  methods: PluginRouteMethod[];
  description?: string;
}

/** 插件自省信息。 */
export interface PluginSelfInfo {
  id: string;
  name: string;
  runtimeKind: PluginRuntimeKind;
  version?: string;
  description?: string;
  permissions: PluginPermission[];
  crons?: PluginCronDescriptor[];
  hooks?: PluginHookDescriptor[];
  routes?: PluginRouteDescriptor[];
  supportedActions?: PluginActionName[];
}

/** 插件治理动作执行结果。 */
export interface PluginActionResult {
  accepted: boolean;
  action: PluginActionName;
  pluginId: string;
  message: string;
}

/** 插件清单。 */
export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  runtime: PluginRuntimeKind;
  description?: string;
  permissions: PluginPermission[];
  tools: PluginCapability[];
  crons?: PluginCronDescriptor[];
  hooks?: PluginHookDescriptor[];
  config?: PluginConfigSchema;
  routes?: PluginRouteDescriptor[];
}

export interface RegisterPayload {
  capabilities?: PluginCapability[];
  manifest?: PluginManifest;
}

export interface ExecutePayload {
  capability?: string;
  toolName?: string;
  params: JsonObject;
  context?: PluginCallContext;
}

export interface ExecuteResultPayload {
  data: JsonValue;
}

export interface ExecuteErrorPayload {
  error: string;
}

/** 插件调用上下文。 */
export interface PluginCallContext {
  source: PluginInvocationSource;
  userId?: string;
  conversationId?: string;
  automationId?: string;
  cronJobId?: string;
  activeProviderId?: string;
  activeModelId?: string;
  activePersonaId?: string;
  metadata?: JsonObject;
}

/** 插件可见的人设安全摘要。 */
export interface PluginPersonaSummary {
  id: string;
  name: string;
  prompt: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 插件可见的当前人设上下文摘要。 */
export interface PluginPersonaCurrentInfo {
  source: 'context' | 'conversation' | 'default';
  personaId: string;
  name: string;
  prompt: string;
  description?: string;
  isDefault: boolean;
}

/** 插件可见的知识库条目摘要。 */
export interface PluginKbEntrySummary {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

/** 插件可见的知识库条目详情。 */
export interface PluginKbEntryDetail extends PluginKbEntrySummary {
  content: string;
}

/** 插件可见的当前 provider 上下文摘要。 */
export interface PluginProviderCurrentInfo {
  source: 'context' | 'default';
  providerId: string;
  modelId: string;
}

/** 插件可见的 provider 安全摘要。 */
export type PluginProviderSummary = Pick<
  AiProviderSummary,
  'id' | 'name' | 'mode' | 'driver' | 'defaultModel' | 'available'
>;

/** 插件可见的模型安全摘要。 */
export interface PluginProviderModelSummary {
  id: string;
  providerId: string;
  name: string;
  capabilities: AiModelCapabilities;
  status?: 'alpha' | 'beta' | 'active' | 'deprecated';
}

/** 插件侧统一 LLM 消息。 */
export interface PluginLlmMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ChatMessagePart[];
}

/** 插件侧统一 LLM 生成请求。 */
export interface PluginLlmGenerateParams {
  providerId?: string;
  modelId?: string;
  system?: string;
  messages: PluginLlmMessage[];
  variant?: string;
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
}

/** 插件侧统一 LLM 生成结果。 */
export interface PluginLlmGenerateResult {
  providerId: string;
  modelId: string;
  text: string;
  message: {
    role: 'assistant';
    content: string;
  };
  finishReason?: string | null;
  usage?: JsonValue;
}

/** 插件侧统一 Subagent 运行请求。 */
export interface PluginSubagentRunParams {
  providerId?: string;
  modelId?: string;
  system?: string;
  messages: PluginLlmMessage[];
  toolNames?: string[];
  variant?: string;
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
  maxSteps?: number;
}

/** 子代理工具调用摘要。 */
export interface PluginSubagentToolCall {
  toolCallId: string;
  toolName: string;
  input: JsonValue;
}

/** 子代理工具结果摘要。 */
export interface PluginSubagentToolResult {
  toolCallId: string;
  toolName: string;
  output: JsonValue;
}

/** 插件侧统一 Subagent 运行结果。 */
export interface PluginSubagentRunResult {
  providerId: string;
  modelId: string;
  text: string;
  message: {
    role: 'assistant';
    content: string;
  };
  finishReason?: string | null;
  toolCalls: PluginSubagentToolCall[];
  toolResults: PluginSubagentToolResult[];
}

/** 子代理运行时可改写的请求快照。 */
export interface PluginSubagentRequest {
  providerId?: string;
  modelId?: string;
  system?: string;
  messages: PluginLlmMessage[];
  toolNames?: string[];
  variant?: string;
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
  maxSteps: number;
}

/** 子代理运行前 Hook 的输入。 */
export interface SubagentBeforeRunHookPayload {
  context: PluginCallContext;
  pluginId: string;
  request: PluginSubagentRequest;
}

/** 子代理运行前 Hook 不改写当前请求。 */
export interface SubagentBeforeRunHookPassResult {
  action: 'pass';
}

/** 子代理运行前 Hook 改写当前请求。 */
export interface SubagentBeforeRunHookMutateResult {
  action: 'mutate';
  providerId?: string;
  modelId?: string;
  system?: string | null;
  messages?: PluginLlmMessage[];
  toolNames?: string[] | null;
  variant?: string | null;
  providerOptions?: JsonObject | null;
  headers?: Record<string, string> | null;
  maxOutputTokens?: number | null;
  maxSteps?: number | null;
}

/** 子代理运行前 Hook 直接短路本轮执行。 */
export interface SubagentBeforeRunHookShortCircuitResult {
  action: 'short-circuit';
  text: string;
  providerId?: string;
  modelId?: string;
  finishReason?: string | null;
  toolCalls?: PluginSubagentToolCall[];
  toolResults?: PluginSubagentToolResult[];
}

/** 子代理运行前 Hook 的返回。 */
export type SubagentBeforeRunHookResult =
  | SubagentBeforeRunHookPassResult
  | SubagentBeforeRunHookMutateResult
  | SubagentBeforeRunHookShortCircuitResult;

/** 子代理运行后 Hook 的输入。 */
export interface SubagentAfterRunHookPayload {
  context: PluginCallContext;
  pluginId: string;
  request: PluginSubagentRequest;
  result: PluginSubagentRunResult;
}

/** 子代理运行后 Hook 透传当前结果。 */
export interface SubagentAfterRunHookPassResult {
  action: 'pass';
}

/** 子代理运行后 Hook 改写最终结果。 */
export interface SubagentAfterRunHookMutateResult {
  action: 'mutate';
  text?: string;
  providerId?: string;
  modelId?: string;
  finishReason?: string | null;
  toolCalls?: PluginSubagentToolCall[];
  toolResults?: PluginSubagentToolResult[];
}

/** 子代理运行后 Hook 的返回。 */
export type SubagentAfterRunHookResult =
  | SubagentAfterRunHookPassResult
  | SubagentAfterRunHookMutateResult;

/** 聊天模型前 Hook 可见的工具摘要。 */
export interface PluginAvailableToolSummary {
  name: string;
  callName?: string;
  toolId?: string;
  description: string;
  parameters: Record<string, PluginParamSchema>;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
  sourceKind?: 'plugin' | 'mcp';
  sourceId?: string;
}

/** 聊天模型前 Hook 可改写的请求快照。 */
export interface ChatBeforeModelRequest {
  providerId: string;
  modelId: string;
  systemPrompt: string;
  messages: PluginLlmMessage[];
  availableTools: PluginAvailableToolSummary[];
  variant?: string;
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
  maxOutputTokens?: number;
}

/** 聊天模型前 Hook 的输入。 */
export interface ChatBeforeModelHookPayload {
  context: PluginCallContext;
  request: ChatBeforeModelRequest;
}

/** 收到用户消息后的前置监听载荷。 */
export interface MessageReceivedHookPayload {
  context: PluginCallContext;
  conversationId: string;
  providerId: string;
  modelId: string;
  session?: PluginConversationSessionInfo | null;
  message: PluginMessageHookInfo;
  modelMessages: PluginLlmMessage[];
}

/** 收到用户消息后 Hook 不修改当前载荷。 */
export interface MessageReceivedHookPassResult {
  action: 'pass';
}

/** 收到用户消息后 Hook 改写当前载荷。 */
export interface MessageReceivedHookMutateResult {
  action: 'mutate';
  providerId?: string;
  modelId?: string;
  content?: string | null;
  parts?: ChatMessagePart[] | null;
  modelMessages?: PluginLlmMessage[];
}

/** 收到用户消息后 Hook 直接短路本轮模型调用。 */
export interface MessageReceivedHookShortCircuitResult {
  action: 'short-circuit';
  assistantContent: string;
  assistantParts?: ChatMessagePart[] | null;
  providerId?: string;
  modelId?: string;
  reason?: string;
}

/** 收到用户消息后 Hook 的返回。 */
export type MessageReceivedHookResult =
  | MessageReceivedHookPassResult
  | MessageReceivedHookMutateResult
  | MessageReceivedHookShortCircuitResult;

/** 兼容旧版“只追加系统提示词”的 Hook 返回。 */
export interface LegacyChatBeforeModelHookResult {
  appendSystemPrompt?: string;
}

/** 聊天模型前 Hook 不修改请求。 */
export interface ChatBeforeModelHookPassResult {
  action: 'pass';
}

/** 聊天模型前 Hook 改写请求快照。 */
export interface ChatBeforeModelHookMutateResult {
  action: 'mutate';
  providerId?: string;
  modelId?: string;
  systemPrompt?: string;
  messages?: PluginLlmMessage[];
  toolNames?: string[];
  variant?: string | null;
  providerOptions?: JsonObject | null;
  headers?: Record<string, string> | null;
  maxOutputTokens?: number | null;
}

/** 聊天模型前 Hook 直接短路本轮模型调用。 */
export interface ChatBeforeModelHookShortCircuitResult {
  action: 'short-circuit';
  assistantContent: string;
  assistantParts?: ChatMessagePart[] | null;
  providerId?: string;
  modelId?: string;
  reason?: string;
}

/** 聊天模型前 Hook 的返回。 */
export type ChatBeforeModelHookResult =
  | LegacyChatBeforeModelHookResult
  | ChatBeforeModelHookPassResult
  | ChatBeforeModelHookMutateResult
  | ChatBeforeModelHookShortCircuitResult;

/** 聊天模型后 Hook 的输入。 */
export interface ChatAfterModelHookPayload {
  providerId: string;
  modelId: string;
  assistantMessageId: string;
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: JsonValue;
  }>;
  toolResults: Array<{
    toolCallId: string;
    toolName: string;
    output: JsonValue;
  }>;
}

/** 真正进入模型调用前的 waiting Hook 输入。 */
export interface ChatWaitingModelHookPayload {
  context: PluginCallContext;
  conversationId: string;
  assistantMessageId: string;
  providerId: string;
  modelId: string;
  request: ChatBeforeModelRequest;
}

/** 聊天模型后 Hook 透传当前结果，不做改写。 */
export interface ChatAfterModelHookPassResult {
  action: 'pass';
}

/** 聊天模型后 Hook 改写当前 assistant 最终回复。 */
export interface ChatAfterModelHookMutateResult {
  action: 'mutate';
  assistantContent?: string;
  assistantParts?: ChatMessagePart[] | null;
}

/** 聊天模型后 Hook 的返回。 */
export type ChatAfterModelHookResult =
  | ChatAfterModelHookPassResult
  | ChatAfterModelHookMutateResult;

/** 插件可见的会话创建摘要。 */
export interface PluginConversationHookInfo {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

/** 插件生命周期 Hook 可见的插件摘要。 */
export interface PluginLifecycleHookInfo {
  id: string;
  runtimeKind: PluginRuntimeKind;
  deviceType: string;
  manifest: PluginManifest | null;
}

/** 插件可见的消息快照。 */
export interface PluginMessageHookInfo {
  id?: string;
  role: string;
  content: string | null;
  parts: ChatMessagePart[];
  provider?: string | null;
  model?: string | null;
  status?: ChatMessageStatus;
}

/** 当前宿主支持的单用户消息目标类型。 */
export type PluginMessageTargetType = 'conversation';

/** 插件可引用的消息目标。 */
export interface PluginMessageTargetRef {
  type: PluginMessageTargetType;
  id: string;
}

/** 插件可见的消息目标摘要。 */
export interface PluginMessageTargetInfo extends PluginMessageTargetRef {
  label?: string;
}

/** 插件主动发送一条消息的参数。 */
export interface PluginMessageSendParams {
  target?: PluginMessageTargetRef | null;
  content?: string | null;
  parts?: ChatMessagePart[] | null;
  provider?: string | null;
  model?: string | null;
}

/** 插件主动发送后的消息摘要。 */
export interface PluginMessageSendInfo {
  id: string;
  target: PluginMessageTargetInfo;
  role: 'assistant';
  content: string;
  parts: ChatMessagePart[];
  provider?: string | null;
  model?: string | null;
  status: ChatMessageStatus;
  createdAt: string;
  updatedAt: string;
}

/** 插件启动会话等待态的参数。 */
export interface PluginConversationSessionStartParams {
  timeoutMs: number;
  captureHistory?: boolean;
  metadata?: JsonValue;
}

/** 插件续期当前会话等待态的参数。 */
export interface PluginConversationSessionKeepParams {
  timeoutMs: number;
  resetTimeout?: boolean;
}

/** 插件可见的当前会话等待态摘要。 */
export interface PluginConversationSessionInfo {
  pluginId: string;
  conversationId: string;
  timeoutMs: number;
  startedAt: string;
  expiresAt: string;
  lastMatchedAt: string | null;
  captureHistory: boolean;
  historyMessages: PluginMessageHookInfo[];
  metadata?: JsonValue;
}

/** 会话创建 Hook 的输入。 */
export interface ConversationCreatedHookPayload {
  context: PluginCallContext;
  conversation: PluginConversationHookInfo;
}

/** 插件加载 Hook 的输入。 */
export interface PluginLoadedHookPayload {
  context: PluginCallContext;
  plugin: PluginLifecycleHookInfo;
  loadedAt: string;
}

/** 插件卸载 Hook 的输入。 */
export interface PluginUnloadedHookPayload {
  context: PluginCallContext;
  plugin: PluginLifecycleHookInfo;
  unloadedAt: string;
}

/** 插件失败 Hook 的输入。 */
export interface PluginErrorHookPayload {
  context: PluginCallContext;
  plugin: PluginLifecycleHookInfo;
  error: {
    type: string;
    message: string;
    metadata: JsonObject | null;
  };
  occurredAt: string;
}

/** 消息创建 Hook 的输入。 */
export interface MessageCreatedHookPayload {
  context: PluginCallContext;
  conversationId: string;
  message: PluginMessageHookInfo;
  modelMessages: PluginLlmMessage[];
}

/** 消息更新 Hook 的输入。 */
export interface MessageUpdatedHookPayload {
  context: PluginCallContext;
  conversationId: string;
  messageId: string;
  currentMessage: PluginMessageHookInfo;
  nextMessage: PluginMessageHookInfo;
}

/** 消息删除 Hook 的输入。 */
export interface MessageDeletedHookPayload {
  context: PluginCallContext;
  conversationId: string;
  messageId: string;
  message: PluginMessageHookInfo;
}

/** 消息生命周期 Hook 不做改写。 */
export interface MessageLifecycleHookPassResult {
  action: 'pass';
}

/** 消息创建 Hook 改写消息草稿。 */
export interface MessageCreatedHookMutateResult {
  action: 'mutate';
  content?: string | null;
  parts?: ChatMessagePart[] | null;
  modelMessages?: PluginLlmMessage[];
  provider?: string | null;
  model?: string | null;
  status?: ChatMessageStatus | null;
}

/** 消息更新 Hook 改写待写入的新消息快照。 */
export interface MessageUpdatedHookMutateResult {
  action: 'mutate';
  content?: string | null;
  parts?: ChatMessagePart[] | null;
  provider?: string | null;
  model?: string | null;
  status?: ChatMessageStatus | null;
}

/** 消息创建 Hook 的返回。 */
export type MessageCreatedHookResult =
  | MessageLifecycleHookPassResult
  | MessageCreatedHookMutateResult;

/** 消息更新 Hook 的返回。 */
export type MessageUpdatedHookResult =
  | MessageLifecycleHookPassResult
  | MessageUpdatedHookMutateResult;

/** 自动化运行前 Hook 的输入。 */
export interface AutomationBeforeRunHookPayload {
  context: PluginCallContext;
  automation: AutomationInfo;
  actions: ActionConfig[];
}

/** 自动化运行前 Hook 不改写当前请求。 */
export interface AutomationBeforeRunHookPassResult {
  action: 'pass';
}

/** 自动化运行前 Hook 改写待执行动作列表。 */
export interface AutomationBeforeRunHookMutateResult {
  action: 'mutate';
  actions?: ActionConfig[];
}

/** 自动化运行前 Hook 直接短路本轮执行。 */
export interface AutomationBeforeRunHookShortCircuitResult {
  action: 'short-circuit';
  status: string;
  results: JsonValue[];
}

/** 自动化运行前 Hook 的返回。 */
export type AutomationBeforeRunHookResult =
  | AutomationBeforeRunHookPassResult
  | AutomationBeforeRunHookMutateResult
  | AutomationBeforeRunHookShortCircuitResult;

/** 自动化运行后 Hook 的输入。 */
export interface AutomationAfterRunHookPayload {
  context: PluginCallContext;
  automation: AutomationInfo;
  status: string;
  results: JsonValue[];
}

/** 自动化运行后 Hook 透传当前结果。 */
export interface AutomationAfterRunHookPassResult {
  action: 'pass';
}

/** 自动化运行后 Hook 改写当前执行结果。 */
export interface AutomationAfterRunHookMutateResult {
  action: 'mutate';
  status?: string;
  results?: JsonValue[];
}

/** 自动化运行后 Hook 的返回。 */
export type AutomationAfterRunHookResult =
  | AutomationAfterRunHookPassResult
  | AutomationAfterRunHookMutateResult;

/** 最终回复来源。 */
export type PluginResponseSource = 'model' | 'short-circuit';

/** 工具 Hook 看到的来源类型。 */
export type ToolHookSourceKind = 'plugin' | 'mcp';

/** 工具 Hook 看到的工具来源信息。 */
export interface ToolHookSourceInfo {
  kind: ToolHookSourceKind;
  id: string;
  label: string;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
}

/** 工具 Hook 看到的统一工具信息。 */
export interface ToolHookToolInfo extends PluginCapability {
  toolId: string;
  callName: string;
}

/** 工具调用前 Hook 的输入。 */
export interface ToolBeforeCallHookPayload {
  context: PluginCallContext;
  source: ToolHookSourceInfo;
  tool: ToolHookToolInfo;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
  params: JsonObject;
}

/** 工具调用前 Hook 不改写当前请求。 */
export interface ToolBeforeCallHookPassResult {
  action: 'pass';
}

/** 工具调用前 Hook 改写工具参数。 */
export interface ToolBeforeCallHookMutateResult {
  action: 'mutate';
  params?: JsonObject;
}

/** 工具调用前 Hook 直接短路本轮工具调用。 */
export interface ToolBeforeCallHookShortCircuitResult {
  action: 'short-circuit';
  output: JsonValue;
}

/** 工具调用前 Hook 的返回。 */
export type ToolBeforeCallHookResult =
  | ToolBeforeCallHookPassResult
  | ToolBeforeCallHookMutateResult
  | ToolBeforeCallHookShortCircuitResult;

/** 工具调用后 Hook 的输入。 */
export interface ToolAfterCallHookPayload {
  context: PluginCallContext;
  source: ToolHookSourceInfo;
  tool: ToolHookToolInfo;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
  params: JsonObject;
  output: JsonValue;
}

/** 工具调用后 Hook 透传当前结果。 */
export interface ToolAfterCallHookPassResult {
  action: 'pass';
}

/** 工具调用后 Hook 改写当前工具输出。 */
export interface ToolAfterCallHookMutateResult {
  action: 'mutate';
  output?: JsonValue;
}

/** 工具调用后 Hook 的返回。 */
export type ToolAfterCallHookResult =
  | ToolAfterCallHookPassResult
  | ToolAfterCallHookMutateResult;

/** 最终回复发送前 Hook 的输入。 */
export interface ResponseBeforeSendHookPayload {
  context: PluginCallContext;
  responseSource: PluginResponseSource;
  assistantMessageId: string;
  providerId: string;
  modelId: string;
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    input: JsonValue;
  }>;
  toolResults: Array<{
    toolCallId: string;
    toolName: string;
    output: JsonValue;
  }>;
}

/** 最终回复发送前 Hook 透传当前结果。 */
export interface ResponseBeforeSendHookPassResult {
  action: 'pass';
}

/** 最终回复发送前 Hook 改写最终回复。 */
export interface ResponseBeforeSendHookMutateResult {
  action: 'mutate';
  providerId?: string;
  modelId?: string;
  assistantContent?: string;
  assistantParts?: ChatMessagePart[] | null;
  toolCalls?: Array<{
    toolCallId: string;
    toolName: string;
    input: JsonValue;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    toolName: string;
    output: JsonValue;
  }>;
}

/** 最终回复发送前 Hook 的返回。 */
export type ResponseBeforeSendHookResult =
  | ResponseBeforeSendHookPassResult
  | ResponseBeforeSendHookMutateResult;

/** 最终回复发送后 Hook 的输入。 */
export interface ResponseAfterSendHookPayload
  extends ResponseBeforeSendHookPayload {
  sentAt: string;
}

/** cron 定时触发时的 Hook 输入。 */
export interface PluginCronTickPayload {
  job: PluginCronJobSummary;
  tickedAt: string;
}

/** Hook 调用负载。 */
export interface HookInvokePayload {
  hookName: PluginHookName;
  context: PluginCallContext;
  payload: JsonValue;
}

/** Hook 返回负载。 */
export interface HookResultPayload {
  data: JsonValue;
}

/** 插件 Web Route 请求。 */
export interface PluginRouteRequest {
  path: string;
  method: PluginRouteMethod;
  headers: Record<string, string>;
  query: JsonObject;
  body: JsonValue | null;
}

/** 插件 Web Route 响应。 */
export interface PluginRouteResponse {
  status: number;
  headers?: Record<string, string>;
  body: JsonValue;
}

/** Route 调用负载。 */
export interface RouteInvokePayload {
  request: PluginRouteRequest;
  context: PluginCallContext;
}

/** Route 返回负载。 */
export interface RouteResultPayload {
  data: PluginRouteResponse;
}

/** Host API 方法名。 */
export type PluginHostMethod =
  | 'automation.create'
  | 'automation.event.emit'
  | 'automation.list'
  | 'automation.run'
  | 'automation.toggle'
  | 'config.get'
  | 'cron.delete'
  | 'cron.list'
  | 'cron.register'
  | 'conversation.get'
  | 'conversation.session.finish'
  | 'conversation.session.get'
  | 'conversation.session.keep'
  | 'conversation.session.start'
  | 'conversation.messages.list'
  | 'conversation.title.set'
  | 'kb.get'
  | 'kb.list'
  | 'kb.search'
  | 'llm.generate'
  | 'llm.generate-text'
  | 'log.write'
  | 'message.send'
  | 'message.target.current.get'
  | 'memory.search'
  | 'memory.save'
  | 'persona.activate'
  | 'persona.current.get'
  | 'persona.get'
  | 'persona.list'
  | 'plugin.self.get'
  | 'provider.current.get'
  | 'provider.get'
  | 'provider.list'
  | 'provider.model.get'
  | 'storage.delete'
  | 'storage.get'
  | 'storage.list'
  | 'storage.set'
  | 'subagent.run'
  | 'state.get'
  | 'state.set'
  | 'user.get';

/** Host API 调用负载。 */
export interface HostCallPayload {
  method: PluginHostMethod;
  params: JsonObject;
  context?: PluginCallContext;
}

/** Host API 返回负载。 */
export interface HostResultPayload {
  data: JsonValue;
}

/** 插件能力描述符 */
export interface PluginCapability {
  name: string;
  description: string;
  parameters: Record<string, PluginParamSchema>;
}

/** 插件/设备信息 */
export interface PluginInfo {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  deviceType: string;
  status: string;
  capabilities: PluginCapability[];
  connected: boolean;
  runtimeKind?: PluginRuntimeKind;
  version?: string;
  permissions?: PluginPermission[];
  supportedActions?: PluginActionName[];
  crons?: PluginCronJobSummary[];
  hooks?: PluginHookDescriptor[];
  routes?: PluginRouteDescriptor[];
  manifest?: PluginManifest;
  health?: PluginHealthSnapshot;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PluginParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
}

export enum PluginStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERROR = 'error',
}

export enum DeviceType {
  BUILTIN = 'builtin',
  PC = 'pc',
  MOBILE = 'mobile',
  IOT = 'iot',
  API = 'api',
}

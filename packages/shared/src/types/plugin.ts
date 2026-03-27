import type { ChatMessagePart } from './chat';
import type { AiModelCapabilities, AiProviderSummary } from './ai';
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
  | 'cron:read'
  | 'cron:write'
  | 'conversation:read'
  | 'conversation:write'
  | 'config:read'
  | 'kb:read'
  | 'llm:generate'
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
  | 'chat:before-model'
  | 'chat:after-model'
  | 'cron:tick';

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

/** 插件健康快照。 */
export interface PluginHealthSnapshot {
  status: PluginHealthStatus;
  failureCount: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
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

/** 聊天模型前 Hook 可见的工具摘要。 */
export interface PluginAvailableToolSummary {
  name: string;
  description: string;
  parameters: Record<string, PluginParamSchema>;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
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
  | 'config.get'
  | 'cron.delete'
  | 'cron.list'
  | 'cron.register'
  | 'conversation.get'
  | 'conversation.messages.list'
  | 'conversation.title.set'
  | 'kb.get'
  | 'kb.list'
  | 'kb.search'
  | 'llm.generate'
  | 'llm.generate-text'
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

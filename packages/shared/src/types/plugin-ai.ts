import type { AiModelConfig, AiModelUsage, AiProviderSummary } from './ai';
import type { ChatMessagePart } from './chat';
import type { JsonObject, JsonValue } from './json';
import type {
  PluginConversationSessionInfo,
  PluginMessageHookInfo,
} from './plugin-chat';
import type {
  PluginCallContext,
  PluginParamSchema,
  PluginRuntimeKind,
} from './plugin';

/** 插件侧统一 LLM 消息。 */
export interface PluginLlmMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string | ChatMessagePart[];
}

/** 插件侧显式指定的底层调用传输模式。 */
export type PluginLlmTransportMode = 'generate' | 'stream-collect';

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
  transportMode?: PluginLlmTransportMode;
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
  usage?: AiModelUsage;
}

/** 插件侧统一 LLM 纯文本生成结果。 */
export interface PluginLlmGenerateTextResult {
  providerId: string;
  modelId: string;
  text: string;
  metadata?: JsonValue;
  usage?: AiModelUsage;
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
}

/** 后台子代理任务状态。 */
export type PluginSubagentTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'error';

/** 后台子代理任务回写状态。 */
export type PluginSubagentTaskWriteBackStatus =
  | 'pending'
  | 'sent'
  | 'failed'
  | 'skipped';

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
export type PluginProviderModelSummary = Pick<
  AiModelConfig,
  'id' | 'providerId' | 'name' | 'capabilities' | 'contextLength' | 'status'
>;

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
  sourceKind?: 'plugin' | 'mcp' | 'skill';
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

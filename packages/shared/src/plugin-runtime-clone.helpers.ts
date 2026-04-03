import type {
  AutomationAfterRunHookPayload,
  AutomationBeforeRunHookPayload,
  ChatAfterModelHookPayload,
  ChatBeforeModelRequest,
  MessageCreatedHookPayload,
  MessageReceivedHookPayload,
  MessageUpdatedHookPayload,
  PluginConversationSessionInfo,
  PluginLlmMessage,
  PluginMessageHookInfo,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  PluginSubagentToolCall,
  PluginSubagentToolResult,
  ResponseBeforeSendHookPayload,
  SubagentAfterRunHookPayload,
  SubagentBeforeRunHookPayload,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookPayload,
} from './types/plugin';
import type { ActionConfig } from './types/automation';
import type { ChatMessagePart } from './types/chat';
import type { JsonValue } from './types/json';
import { toJsonValue } from './types/json';

export function cloneChatBeforeModelRequest(
  request: ChatBeforeModelRequest,
): ChatBeforeModelRequest {
  return {
    providerId: request.providerId,
    modelId: request.modelId,
    systemPrompt: request.systemPrompt,
    messages: cloneChatMessages(request.messages),
    availableTools: request.availableTools.map(
      (tool: ChatBeforeModelRequest['availableTools'][number]) => ({
        ...tool,
        parameters: {
          ...tool.parameters,
        },
      }),
    ),
    ...(request.variant ? { variant: request.variant } : {}),
    ...(request.providerOptions ? { providerOptions: { ...request.providerOptions } } : {}),
    ...(request.headers ? { headers: { ...request.headers } } : {}),
    ...(typeof request.maxOutputTokens === 'number'
      ? { maxOutputTokens: request.maxOutputTokens }
      : {}),
  };
}

export function cloneChatAfterModelPayload(
  payload: ChatAfterModelHookPayload,
): ChatAfterModelHookPayload {
  return {
    providerId: payload.providerId,
    modelId: payload.modelId,
    assistantMessageId: payload.assistantMessageId,
    ...cloneAssistantOutputSnapshot(payload),
  };
}

export function cloneMessageReceivedHookPayload(
  payload: MessageReceivedHookPayload,
): MessageReceivedHookPayload {
  return {
    context: {
      ...payload.context,
    },
    conversationId: payload.conversationId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    ...(typeof payload.session !== 'undefined'
      ? { session: payload.session ? cloneConversationSessionInfo(payload.session) : null }
      : {}),
    message: cloneMessageHookInfo(payload.message),
    modelMessages: clonePluginLlmMessages(payload.modelMessages),
  };
}

export function cloneMessageCreatedHookPayload(
  payload: MessageCreatedHookPayload,
): MessageCreatedHookPayload {
  return {
    context: {
      ...payload.context,
    },
    conversationId: payload.conversationId,
    message: cloneMessageHookInfo(payload.message),
    modelMessages: clonePluginLlmMessages(payload.modelMessages),
  };
}

export function cloneMessageUpdatedHookPayload(
  payload: MessageUpdatedHookPayload,
): MessageUpdatedHookPayload {
  return {
    context: {
      ...payload.context,
    },
    conversationId: payload.conversationId,
    messageId: payload.messageId,
    currentMessage: cloneMessageHookInfo(payload.currentMessage),
    nextMessage: cloneMessageHookInfo(payload.nextMessage),
  };
}

export function cloneMessageHookInfo(
  message: PluginMessageHookInfo,
): PluginMessageHookInfo {
  return {
    ...(message.id ? { id: message.id } : {}),
    role: message.role,
    content: message.content,
    parts: cloneChatMessageParts(message.parts),
    ...(typeof message.provider !== 'undefined' ? { provider: message.provider } : {}),
    ...(typeof message.model !== 'undefined' ? { model: message.model } : {}),
    ...(typeof message.status !== 'undefined' ? { status: message.status } : {}),
  };
}

export function cloneConversationSessionInfo(
  session: PluginConversationSessionInfo,
): PluginConversationSessionInfo {
  return {
    pluginId: session.pluginId,
    conversationId: session.conversationId,
    timeoutMs: session.timeoutMs,
    startedAt: session.startedAt,
    expiresAt: session.expiresAt,
    lastMatchedAt: session.lastMatchedAt,
    captureHistory: session.captureHistory,
    historyMessages: session.historyMessages.map((message) => cloneMessageHookInfo(message)),
    ...(typeof session.metadata !== 'undefined'
      ? { metadata: toJsonValue(session.metadata) }
      : {}),
  };
}

export function cloneAutomationBeforeRunPayload(
  payload: AutomationBeforeRunHookPayload,
): AutomationBeforeRunHookPayload {
  return {
    ...cloneAutomationHookPayloadBase(payload),
    actions: cloneAutomationActions(payload.actions),
  };
}

export function cloneAutomationAfterRunPayload(
  payload: AutomationAfterRunHookPayload,
): AutomationAfterRunHookPayload {
  return {
    ...cloneAutomationHookPayloadBase(payload),
    status: payload.status,
    results: cloneJsonValueArray(payload.results),
  };
}

export function cloneToolBeforeCallHookPayload(
  payload: ToolBeforeCallHookPayload,
): ToolBeforeCallHookPayload {
  return {
    ...cloneToolHookPayloadBase(payload),
  };
}

export function cloneToolAfterCallHookPayload(
  payload: ToolAfterCallHookPayload,
): ToolAfterCallHookPayload {
  return {
    ...cloneToolHookPayloadBase(payload),
    output: toJsonValue(payload.output),
  };
}

export function cloneResponseBeforeSendHookPayload(
  payload: ResponseBeforeSendHookPayload,
): ResponseBeforeSendHookPayload {
  return {
    context: {
      ...payload.context,
    },
    responseSource: payload.responseSource,
    assistantMessageId: payload.assistantMessageId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    ...cloneAssistantOutputSnapshot(payload),
  };
}

export function cloneSubagentBeforeRunPayload(
  payload: SubagentBeforeRunHookPayload,
): SubagentBeforeRunHookPayload {
  return {
    ...cloneSubagentHookPayloadBase(payload),
  };
}

export function cloneSubagentAfterRunPayload(
  payload: SubagentAfterRunHookPayload,
): SubagentAfterRunHookPayload {
  return {
    ...cloneSubagentHookPayloadBase(payload),
    result: cloneSubagentRunResult(payload.result),
  };
}

export function cloneSubagentRequest(
  request: PluginSubagentRequest,
): PluginSubagentRequest {
  return {
    ...(request.providerId ? { providerId: request.providerId } : {}),
    ...(request.modelId ? { modelId: request.modelId } : {}),
    ...(typeof request.system === 'string' ? { system: request.system } : {}),
    messages: clonePluginLlmMessages(request.messages),
    ...(request.toolNames ? { toolNames: [...request.toolNames] } : {}),
    ...(typeof request.variant === 'string' ? { variant: request.variant } : {}),
    ...(request.providerOptions ? { providerOptions: { ...request.providerOptions } } : {}),
    ...(request.headers ? { headers: { ...request.headers } } : {}),
    ...(typeof request.maxOutputTokens === 'number'
      ? { maxOutputTokens: request.maxOutputTokens }
      : {}),
    maxSteps: request.maxSteps,
  };
}

export function cloneSubagentRunResult(
  result: PluginSubagentRunResult,
): PluginSubagentRunResult {
  return {
    providerId: result.providerId,
    modelId: result.modelId,
    text: result.text,
    message: {
      role: 'assistant',
      content: result.message.content,
    },
    ...(typeof result.finishReason !== 'undefined'
      ? { finishReason: result.finishReason }
      : {}),
    toolCalls: clonePluginSubagentToolCalls(result.toolCalls),
    toolResults: clonePluginSubagentToolResults(result.toolResults),
  };
}

export function clonePluginSubagentToolCalls(
  toolCalls: PluginSubagentToolCall[],
): PluginSubagentToolCall[] {
  return toolCalls.map((toolCall) => ({
    toolCallId: toolCall.toolCallId,
    toolName: toolCall.toolName,
    input: toJsonValue(toolCall.input),
  }));
}

export function clonePluginSubagentToolResults(
  toolResults: PluginSubagentToolResult[],
): PluginSubagentToolResult[] {
  return toolResults.map((toolResult) => ({
    toolCallId: toolResult.toolCallId,
    toolName: toolResult.toolName,
    output: toJsonValue(toolResult.output),
  }));
}

export function cloneAutomationActions(actions: ActionConfig[]): ActionConfig[] {
  return actions.map((action) => ({
    ...action,
    ...(action.params ? { params: { ...action.params } } : {}),
  }));
}

export function clonePluginLlmMessages(messages: PluginLlmMessage[]) {
  return cloneStructuredMessageArray(messages);
}

export function cloneChatMessages(messages: ChatBeforeModelRequest['messages']) {
  return cloneStructuredMessageArray(messages);
}

export function cloneChatMessageParts(parts: PluginMessageHookInfo['parts']) {
  return cloneShallowArray(parts);
}

export function normalizeAssistantOutput(input: {
  assistantContent: string;
  assistantParts?: ChatMessagePart[] | null;
}): {
  assistantContent: string;
  assistantParts: ChatMessagePart[];
} {
  const assistantParts = input.assistantParts
    ? cloneChatMessageParts(input.assistantParts)
    : [];

  if (assistantParts.length > 0) {
    return {
      assistantContent: assistantParts
        .filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text')
        .map((part) => part.text)
        .join('\n'),
      assistantParts,
    };
  }

  const text = input.assistantContent.trim();
  return {
    assistantContent: text,
    assistantParts: text
      ? [
          {
            type: 'text' as const,
            text,
          },
        ]
      : [],
  };
}

export function cloneJsonValueArray(values: JsonValue[]): JsonValue[] {
  return values.map((value) => toJsonValue(value));
}

function cloneAssistantOutputSnapshot(input: {
  assistantContent: string;
  assistantParts: ChatMessagePart[];
  toolCalls: ReadonlyArray<{
    toolCallId: string;
    toolName: string;
    input: JsonValue;
  }>;
  toolResults: ReadonlyArray<{
    toolCallId: string;
    toolName: string;
    output: JsonValue;
  }>;
}) {
  return {
    assistantContent: input.assistantContent,
    assistantParts: cloneChatMessageParts(input.assistantParts),
    toolCalls: cloneShallowArray(input.toolCalls),
    toolResults: cloneShallowArray(input.toolResults),
  };
}

function cloneAutomationHookPayloadBase(
  payload: AutomationBeforeRunHookPayload | AutomationAfterRunHookPayload,
) {
  return {
    context: {
      ...payload.context,
    },
    automation: {
      ...payload.automation,
      trigger: {
        ...payload.automation.trigger,
      },
      actions: cloneAutomationActions(payload.automation.actions),
      ...(payload.automation.logs
        ? {
            logs: cloneShallowArray(payload.automation.logs),
          }
        : {}),
    },
  };
}

function cloneToolHookPayloadBase(
  payload: ToolBeforeCallHookPayload | ToolAfterCallHookPayload,
) {
  return {
    context: {
      ...payload.context,
    },
    source: {
      ...payload.source,
    },
    ...(payload.pluginId ? { pluginId: payload.pluginId } : {}),
    ...(payload.runtimeKind ? { runtimeKind: payload.runtimeKind } : {}),
    tool: {
      ...payload.tool,
      parameters: {
        ...payload.tool.parameters,
      },
    },
    params: {
      ...payload.params,
    },
  };
}

function cloneSubagentHookPayloadBase(
  payload: SubagentBeforeRunHookPayload | SubagentAfterRunHookPayload,
) {
  return {
    context: {
      ...payload.context,
    },
    pluginId: payload.pluginId,
    request: cloneSubagentRequest(payload.request),
  };
}

function cloneStructuredMessageArray<T extends { content: unknown }>(
  messages: readonly T[],
): T[] {
  return messages.map((message) => ({
    ...message,
    content: Array.isArray(message.content)
      ? cloneShallowArray(message.content)
      : message.content,
  }));
}

export function cloneShallowArray<T extends object>(values: readonly T[]): T[] {
  return values.map((value) => ({
    ...value,
  }));
}

import type {
  AutomationAfterRunHookMutateResult,
  AutomationAfterRunHookPayload,
  AutomationBeforeRunHookMutateResult,
  AutomationBeforeRunHookPayload,
  ChatAfterModelHookMutateResult,
  ChatAfterModelHookPayload,
  ChatBeforeModelHookPassResult,
  ChatBeforeModelHookMutateResult,
  ChatBeforeModelRequest,
  ChatBeforeModelHookShortCircuitResult,
  MessageCreatedHookMutateResult,
  MessageCreatedHookPayload,
  MessageReceivedHookPassResult,
  MessageReceivedHookMutateResult,
  MessageReceivedHookPayload,
  MessageReceivedHookShortCircuitResult,
  MessageUpdatedHookMutateResult,
  MessageUpdatedHookPayload,
  PluginMessageHookInfo,
  ResponseBeforeSendHookMutateResult,
  ResponseBeforeSendHookPayload,
  SubagentAfterRunHookMutateResult,
  SubagentAfterRunHookPayload,
  SubagentBeforeRunHookMutateResult,
  SubagentBeforeRunHookPayload,
  ToolAfterCallHookMutateResult,
  ToolAfterCallHookPayload,
  ToolBeforeCallHookMutateResult,
  ToolBeforeCallHookPayload,
} from './types/plugin';
import type { ChatMessagePart } from './types/chat';
import { isJsonObjectValue, toJsonValue } from './types/json';
import {
  cloneAutomationActions,
  cloneAutomationAfterRunPayload,
  cloneAutomationBeforeRunPayload,
  cloneChatAfterModelPayload,
  cloneChatBeforeModelRequest,
  cloneChatMessageParts,
  cloneChatMessages,
  cloneJsonValueArray,
  cloneMessageCreatedHookPayload,
  cloneMessageReceivedHookPayload,
  cloneMessageUpdatedHookPayload,
  clonePluginLlmMessages,
  clonePluginSubagentToolCalls,
  clonePluginSubagentToolResults,
  cloneResponseBeforeSendHookPayload,
  cloneShallowArray,
  cloneSubagentAfterRunPayload,
  cloneSubagentBeforeRunPayload,
  cloneToolAfterCallHookPayload,
  cloneToolBeforeCallHookPayload,
  normalizeAssistantOutput,
} from './plugin-runtime-clone.helpers';
import { normalizePositiveInteger } from './plugin-runtime-validation';

export function applyChatBeforeModelMutation(
  currentRequest: ChatBeforeModelRequest,
  mutation: ChatBeforeModelHookMutateResult,
): ChatBeforeModelRequest {
  const nextRequest = cloneChatBeforeModelRequest(currentRequest);

  applyCommonModelRequestMutation(nextRequest, mutation, {
    systemPromptField: 'systemPrompt',
  });
  assignClonedArrayField(nextRequest, mutation, 'messages', cloneChatMessages);
  if ('toolNames' in mutation && Array.isArray(mutation.toolNames)) {
    const allowedToolNames = new Set(mutation.toolNames);
    nextRequest.availableTools = nextRequest.availableTools.filter(
      (tool: ChatBeforeModelRequest['availableTools'][number]) =>
        allowedToolNames.has(tool.name),
    );
  }

  return nextRequest;
}

export function applyChatBeforeModelHookResult(input: {
  request: ChatBeforeModelRequest;
  result:
    | ChatBeforeModelHookPassResult
    | ChatBeforeModelHookMutateResult
    | ChatBeforeModelHookShortCircuitResult
    | null;
}) {
  if (!input.result || input.result.action === 'pass') {
    return {
      action: 'continue' as const,
      request: input.request,
    };
  }

  if (input.result.action === 'short-circuit') {
    return {
      action: 'short-circuit' as const,
      request: input.request,
      ...buildShortCircuitAssistantSnapshot({
        assistantContent: input.result.assistantContent,
        assistantParts: input.result.assistantParts,
        providerId: input.result.providerId,
        modelId: input.result.modelId,
        fallbackProviderId: input.request.providerId,
        fallbackModelId: input.request.modelId,
        reason: input.result.reason,
      }),
    };
  }

  return {
    action: 'continue' as const,
    request: applyChatBeforeModelMutation(input.request, input.result),
  };
}

export function applyMessageReceivedMutation(
  currentPayload: MessageReceivedHookPayload,
  mutation: MessageReceivedHookMutateResult,
): MessageReceivedHookPayload {
  const nextPayload = cloneMessageReceivedHookPayload(currentPayload);

  assignStringFields(nextPayload, mutation, ['providerId', 'modelId']);
  if ('content' in mutation || 'parts' in mutation) {
    applyMessageContentMutation(nextPayload.message, mutation);
  }
  assignClonedArrayField(nextPayload, mutation, 'modelMessages', clonePluginLlmMessages);

  return nextPayload;
}

export function applyMessageReceivedHookResult(input: {
  payload: MessageReceivedHookPayload;
  result:
    | MessageReceivedHookPassResult
    | MessageReceivedHookMutateResult
    | MessageReceivedHookShortCircuitResult
    | null;
}) {
  if (!input.result || input.result.action === 'pass') {
    return {
      action: 'continue' as const,
      payload: input.payload,
    };
  }

  if (input.result.action === 'short-circuit') {
    return {
      action: 'short-circuit' as const,
      payload: input.payload,
      ...buildShortCircuitAssistantSnapshot({
        assistantContent: input.result.assistantContent,
        assistantParts: input.result.assistantParts,
        providerId: input.result.providerId,
        modelId: input.result.modelId,
        fallbackProviderId: input.payload.providerId,
        fallbackModelId: input.payload.modelId,
        reason: input.result.reason,
      }),
    };
  }

  return {
    action: 'continue' as const,
    payload: applyMessageReceivedMutation(input.payload, input.result),
  };
}

export function applyChatAfterModelMutation(
  currentPayload: ChatAfterModelHookPayload,
  mutation: ChatAfterModelHookMutateResult,
): ChatAfterModelHookPayload {
  const nextPayload = cloneChatAfterModelPayload(currentPayload);
  applyAssistantOutputMutation(nextPayload, mutation);
  return nextPayload;
}

export function applyMessageCreatedMutation(
  currentPayload: MessageCreatedHookPayload,
  mutation: MessageCreatedHookMutateResult,
): MessageCreatedHookPayload {
  const nextPayload = cloneMessageCreatedHookPayload(currentPayload);

  applyMessageContentMutation(nextPayload.message, mutation);
  assignClonedArrayField(nextPayload, mutation, 'modelMessages', clonePluginLlmMessages);
  applyMessageMetadataMutation(nextPayload.message, mutation);

  return nextPayload;
}

export function applyMessageUpdatedMutation(
  currentPayload: MessageUpdatedHookPayload,
  mutation: MessageUpdatedHookMutateResult,
): MessageUpdatedHookPayload {
  const nextPayload = cloneMessageUpdatedHookPayload(currentPayload);

  applyMessageContentMutation(nextPayload.nextMessage, mutation);
  applyMessageMetadataMutation(nextPayload.nextMessage, mutation);

  return nextPayload;
}

export function applyAutomationBeforeRunMutation(
  currentPayload: AutomationBeforeRunHookPayload,
  mutation: AutomationBeforeRunHookMutateResult,
): AutomationBeforeRunHookPayload {
  const nextPayload = cloneAutomationBeforeRunPayload(currentPayload);

  if ('actions' in mutation && Array.isArray(mutation.actions)) {
    nextPayload.actions = cloneAutomationActions(mutation.actions);
  }

  return nextPayload;
}

export function applyAutomationAfterRunMutation(
  currentPayload: AutomationAfterRunHookPayload,
  mutation: AutomationAfterRunHookMutateResult,
): AutomationAfterRunHookPayload {
  const nextPayload = cloneAutomationAfterRunPayload(currentPayload);

  assignStringFields(nextPayload, mutation, ['status']);
  assignClonedArrayField(nextPayload, mutation, 'results', cloneJsonValueArray);

  return nextPayload;
}

export function applySubagentBeforeRunMutation(
  currentPayload: SubagentBeforeRunHookPayload,
  mutation: SubagentBeforeRunHookMutateResult,
): SubagentBeforeRunHookPayload {
  const nextPayload = cloneSubagentBeforeRunPayload(currentPayload);

  applyCommonModelRequestMutation(nextPayload.request, mutation, {
    systemPromptField: 'system',
  });
  assignClonedArrayField(nextPayload.request, mutation, 'messages', clonePluginLlmMessages);
  if ('toolNames' in mutation) {
    nextPayload.request.toolNames = mutation.toolNames === null
      ? undefined
      : [...(mutation.toolNames ?? [])];
  }
  if ('maxSteps' in mutation && typeof mutation.maxSteps === 'number') {
    nextPayload.request.maxSteps = normalizePositiveInteger(mutation.maxSteps, 1);
  }

  return nextPayload;
}

export function applySubagentAfterRunMutation(
  currentPayload: SubagentAfterRunHookPayload,
  mutation: SubagentAfterRunHookMutateResult,
): SubagentAfterRunHookPayload {
  const nextPayload = cloneSubagentAfterRunPayload(currentPayload);

  assignStringFields(nextPayload.result, mutation, ['providerId', 'modelId']);
  if ('text' in mutation && typeof mutation.text === 'string') {
    nextPayload.result.text = mutation.text;
    nextPayload.result.message = {
      role: 'assistant',
      content: mutation.text,
    };
  }
  if ('finishReason' in mutation) {
    nextPayload.result.finishReason = mutation.finishReason ?? null;
  }
  assignClonedArrayField(nextPayload.result, mutation, 'toolCalls', clonePluginSubagentToolCalls);
  assignClonedArrayField(
    nextPayload.result,
    mutation,
    'toolResults',
    clonePluginSubagentToolResults,
  );

  return nextPayload;
}

export function applyToolBeforeCallMutation(
  currentPayload: ToolBeforeCallHookPayload,
  mutation: ToolBeforeCallHookMutateResult,
): ToolBeforeCallHookPayload {
  const nextPayload = cloneToolBeforeCallHookPayload(currentPayload);

  if ('params' in mutation && typeof mutation.params !== 'undefined' && isJsonObjectValue(mutation.params)) {
    nextPayload.params = {
      ...mutation.params,
    };
  }

  return nextPayload;
}

export function applyToolAfterCallMutation(
  currentPayload: ToolAfterCallHookPayload,
  mutation: ToolAfterCallHookMutateResult,
): ToolAfterCallHookPayload {
  const nextPayload = cloneToolAfterCallHookPayload(currentPayload);

  if ('output' in mutation && typeof mutation.output !== 'undefined') {
    nextPayload.output = toJsonValue(mutation.output);
  }

  return nextPayload;
}

export function applyResponseBeforeSendMutation(
  currentPayload: ResponseBeforeSendHookPayload,
  mutation: ResponseBeforeSendHookMutateResult,
): ResponseBeforeSendHookPayload {
  const nextPayload = cloneResponseBeforeSendHookPayload(currentPayload);

  assignStringFields(nextPayload, mutation, ['providerId', 'modelId']);
  applyAssistantOutputMutation(nextPayload, mutation);
  assignClonedArrayField(nextPayload, mutation, 'toolCalls', cloneObjectLikeArray);
  assignClonedArrayField(nextPayload, mutation, 'toolResults', cloneObjectLikeArray);

  return nextPayload;
}

function buildShortCircuitAssistantSnapshot(input: {
  assistantContent: string;
  assistantParts?: ChatMessagePart[] | null;
  providerId?: string | null;
  modelId?: string | null;
  fallbackProviderId: string;
  fallbackModelId: string;
  reason?: string;
}) {
  const normalizedAssistant = normalizeAssistantOutput({
    assistantContent: input.assistantContent,
    assistantParts: input.assistantParts,
  });

  return {
    assistantContent: normalizedAssistant.assistantContent,
    assistantParts: normalizedAssistant.assistantParts,
    providerId: input.providerId ?? input.fallbackProviderId,
    modelId: input.modelId ?? input.fallbackModelId,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

function applyMessageContentMutation(
  message: Pick<PluginMessageHookInfo, 'content' | 'parts'>,
  mutation: {
    content?: string | null;
    parts?: ChatMessagePart[] | null;
  },
): void {
  if ('content' in mutation) {
    message.content = mutation.content ?? null;
  }
  if ('parts' in mutation) {
    message.parts = mutation.parts === null
      ? []
      : cloneChatMessageParts(mutation.parts ?? []);
  }
}

function applyMessageMetadataMutation(
  message: Pick<PluginMessageHookInfo, 'provider' | 'model' | 'status'>,
  mutation: {
    provider?: string | null;
    model?: string | null;
    status?: PluginMessageHookInfo['status'] | null;
  },
): void {
  if ('provider' in mutation) {
    message.provider = mutation.provider ?? null;
  }
  if ('model' in mutation) {
    message.model = mutation.model ?? null;
  }
  if ('status' in mutation) {
    message.status = mutation.status ?? undefined;
  }
}

function applyAssistantOutputMutation(
  payload: {
    assistantContent: string;
    assistantParts: ChatMessagePart[];
  },
  mutation: {
    assistantContent?: string;
    assistantParts?: ChatMessagePart[] | null;
  },
): void {
  if ('assistantContent' in mutation && typeof mutation.assistantContent === 'string') {
    payload.assistantContent = mutation.assistantContent;
  }
  if ('assistantParts' in mutation) {
    payload.assistantParts = mutation.assistantParts === null
      ? []
      : cloneChatMessageParts(mutation.assistantParts ?? []);
  }
}

function applyCommonModelRequestMutation(
  target: {
    providerId?: string;
    modelId?: string;
    variant?: string;
    providerOptions?: Record<string, unknown>;
    headers?: Record<string, unknown>;
    maxOutputTokens?: number;
    systemPrompt?: string;
    system?: string;
  },
  mutation: object,
  input: {
    systemPromptField: 'systemPrompt' | 'system';
  },
): void {
  assignOptionalFields(target, mutation, ['providerId', 'modelId']);
  assignOptionalFields(target, mutation, [input.systemPromptField, 'variant', 'maxOutputTokens']);
  assignOptionalShallowObjectFields(target, mutation, ['providerOptions', 'headers']);
}

function assignStringFields<TTarget extends object>(
  target: TTarget,
  source: object,
  keys: Array<Extract<keyof TTarget, string>>,
): void {
  const sourceRecord = source as Record<string, unknown>;
  for (const key of keys) {
    const value = sourceRecord[key];
    if (typeof value === 'string') {
      (target as Record<string, unknown>)[key] = value;
    }
  }
}

function assignOptionalFields<TTarget extends object>(
  target: TTarget,
  source: object,
  keys: Array<Extract<keyof TTarget, string>>,
): void {
  const sourceRecord = source as Record<string, unknown>;
  for (const key of keys) {
    if (key in sourceRecord) {
      (target as Record<string, unknown>)[key] = sourceRecord[key] ?? undefined;
    }
  }
}

function assignOptionalShallowObjectFields<TTarget extends object>(
  target: TTarget,
  source: object,
  keys: Array<Extract<keyof TTarget, string>>,
): void {
  const sourceRecord = source as Record<string, unknown>;
  for (const key of keys) {
    if (!(key in sourceRecord)) {
      continue;
    }
    const value = sourceRecord[key];
    (target as Record<string, unknown>)[key] = value && typeof value === 'object'
      ? { ...(value as Record<string, unknown>) }
      : undefined;
  }
}

function assignClonedArrayField<TTarget extends object>(
  target: TTarget,
  source: object,
  key: Extract<keyof TTarget, string>,
  clone: (values: any[]) => unknown[],
): void {
  const value = (source as Record<string, unknown>)[key];
  if (Array.isArray(value)) {
    (target as Record<string, unknown>)[key] = clone(value);
  }
}

function cloneObjectLikeArray<T extends object>(values: T[]): T[] {
  return cloneShallowArray(values);
}

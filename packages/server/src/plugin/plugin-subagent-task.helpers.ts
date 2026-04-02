import type {
  PluginCallContext,
  PluginLlmMessage,
  PluginMessageTargetInfo,
  PluginSubagentRequest,
  PluginSubagentRunResult,
  PluginSubagentTaskDetail,
  PluginSubagentTaskSummary,
} from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';

export interface PersistedPluginSubagentTaskRecord {
  id: string;
  pluginId: string;
  pluginDisplayName: string | null;
  runtimeKind: string;
  userId: string | null;
  conversationId: string | null;
  status: string;
  requestJson: string;
  contextJson: string;
  resultJson: string | null;
  error: string | null;
  providerId: string | null;
  modelId: string | null;
  writeBackTargetJson: string | null;
  writeBackStatus: string;
  writeBackError: string | null;
  writeBackMessageId: string | null;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function readPluginMessageSendSummary(value: JsonValue): {
  id: string;
  target: PluginMessageTargetInfo;
} {
  if (!isJsonObjectValue(value)) {
    throw new Error('message.send 返回值必须是对象');
  }

  if (typeof value.id !== 'string') {
    throw new Error('message.send 返回值缺少合法 id');
  }

  return {
    id: value.id,
    target: readPluginMessageTargetInfoValue(value.target)
      ?? (() => {
        throw new Error('message.send 返回值中的 target 不合法');
      })(),
  };
}

export function serializePluginSubagentTaskSummary(
  record: PersistedPluginSubagentTaskRecord,
): PluginSubagentTaskSummary {
  const request = parseTaskRequest(record.requestJson);
  const result = parseTaskResult(record.resultJson);
  const writeBackTarget = parseWriteBackTarget(record.writeBackTargetJson);

  return {
    id: record.id,
    pluginId: record.pluginId,
    ...(record.pluginDisplayName ? { pluginDisplayName: record.pluginDisplayName } : {}),
    runtimeKind: record.runtimeKind === 'builtin' ? 'builtin' : 'remote',
    status: normalizeTaskStatus(record.status),
    requestPreview: buildRequestPreview(request),
    ...(result ? { resultPreview: buildResultPreview(result) } : {}),
    ...(record.providerId ? { providerId: record.providerId } : {}),
    ...(record.modelId ? { modelId: record.modelId } : {}),
    ...(record.error ? { error: record.error } : {}),
    writeBackStatus: normalizeWriteBackStatus(record.writeBackStatus),
    ...(writeBackTarget ? { writeBackTarget } : {}),
    ...(record.writeBackError ? { writeBackError: record.writeBackError } : {}),
    ...(record.writeBackMessageId ? { writeBackMessageId: record.writeBackMessageId } : {}),
    requestedAt: record.requestedAt.toISOString(),
    startedAt: record.startedAt ? record.startedAt.toISOString() : null,
    finishedAt: record.finishedAt ? record.finishedAt.toISOString() : null,
    ...(record.conversationId ? { conversationId: record.conversationId } : {}),
    ...(record.userId ? { userId: record.userId } : {}),
  };
}

export function serializePluginSubagentTaskDetail(
  record: PersistedPluginSubagentTaskRecord,
): PluginSubagentTaskDetail {
  const request = parseTaskRequest(record.requestJson);
  const context = parseTaskContext(record.contextJson);
  const result = parseTaskResult(record.resultJson);

  return {
    ...serializePluginSubagentTaskSummary(record),
    request,
    context,
    ...(result ? { result } : {}),
  };
}

export function cloneJsonValue<T>(value: T): T {
  return structuredClone(value);
}

function parseTaskRequest(raw: string): PluginSubagentRequest {
  return readPluginSubagentRequest(parseUnknownJson(raw)) ?? {
    messages: [],
    maxSteps: 4,
  };
}

function parseTaskContext(raw: string): PluginCallContext {
  return readPluginCallContextValue(parseUnknownJson(raw)) ?? {
    source: 'plugin',
  };
}

function parseTaskResult(raw: string | null): PluginSubagentRunResult | null {
  if (!raw) {
    return null;
  }

  return readPluginSubagentRunResult(parseUnknownJson(raw));
}

function parseWriteBackTarget(raw: string | null): PluginMessageTargetInfo | null {
  if (!raw) {
    return null;
  }

  return readPluginMessageTargetInfoValue(parseUnknownJson(raw));
}

function parseUnknownJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function readPluginMessageTargetInfoValue(
  value: unknown,
): PluginMessageTargetInfo | null {
  if (!isJsonObjectValue(value) || value.type !== 'conversation' || typeof value.id !== 'string') {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
  };
}

function readPluginSubagentRequest(value: unknown): PluginSubagentRequest | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const messages = readPluginLlmMessages(value.messages);
  if (!messages) {
    return null;
  }

  return {
    ...(typeof value.providerId === 'string' ? { providerId: value.providerId } : {}),
    ...(typeof value.modelId === 'string' ? { modelId: value.modelId } : {}),
    ...(typeof value.system === 'string' ? { system: value.system } : {}),
    messages,
    ...(isStringArray(value.toolNames) ? { toolNames: value.toolNames } : {}),
    ...(typeof value.variant === 'string' ? { variant: value.variant } : {}),
    ...(isJsonObjectValue(value.providerOptions) ? { providerOptions: value.providerOptions } : {}),
    ...(isStringRecord(value.headers) ? { headers: value.headers } : {}),
    ...(typeof value.maxOutputTokens === 'number' && Number.isFinite(value.maxOutputTokens)
      ? { maxOutputTokens: value.maxOutputTokens }
      : {}),
    maxSteps: normalizePositiveInteger(value.maxSteps, 4),
  };
}

function readPluginCallContextValue(value: unknown): PluginCallContext | null {
  if (!isJsonObjectValue(value) || !isPluginInvocationSource(value.source)) {
    return null;
  }

  const context: PluginCallContext = {
    source: value.source,
  };
  const stringKeys = [
    'userId',
    'conversationId',
    'automationId',
    'cronJobId',
    'activeProviderId',
    'activeModelId',
    'activePersonaId',
  ] as const;

  for (const key of stringKeys) {
    if (!(key in value) || value[key] === undefined) {
      continue;
    }
    if (typeof value[key] !== 'string') {
      return null;
    }
    context[key] = value[key];
  }

  if ('metadata' in value && value.metadata !== undefined) {
    if (!isJsonObjectValue(value.metadata)) {
      return null;
    }
    context.metadata = value.metadata;
  }

  return context;
}

function readPluginSubagentRunResult(value: unknown): PluginSubagentRunResult | null {
  if (
    !isJsonObjectValue(value)
    || typeof value.providerId !== 'string'
    || typeof value.modelId !== 'string'
    || typeof value.text !== 'string'
  ) {
    return null;
  }

  const message = readAssistantMessage(value.message);
  const toolCalls = readPluginSubagentToolCalls(value.toolCalls);
  const toolResults = readPluginSubagentToolResults(value.toolResults);
  if (!message || !toolCalls || !toolResults) {
    return null;
  }
  if (
    'finishReason' in value
    && value.finishReason !== undefined
    && value.finishReason !== null
    && typeof value.finishReason !== 'string'
  ) {
    return null;
  }

  return {
    providerId: value.providerId,
    modelId: value.modelId,
    text: value.text,
    message,
    ...(Object.prototype.hasOwnProperty.call(value, 'finishReason')
      ? { finishReason: value.finishReason as string | null | undefined }
      : {}),
    toolCalls,
    toolResults,
  };
}

function readAssistantMessage(
  value: unknown,
): PluginSubagentRunResult['message'] | null {
  if (!isJsonObjectValue(value) || value.role !== 'assistant' || typeof value.content !== 'string') {
    return null;
  }

  return {
    role: 'assistant',
    content: value.content,
  };
}

function readPluginSubagentToolCalls(
  value: unknown,
): PluginSubagentRunResult['toolCalls'] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const toolCalls: PluginSubagentRunResult['toolCalls'] = [];
  for (const entry of value) {
    if (
      !isJsonObjectValue(entry)
      || typeof entry.toolCallId !== 'string'
      || typeof entry.toolName !== 'string'
      || !('input' in entry)
    ) {
      return null;
    }

    toolCalls.push({
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      input: toJsonValue(entry.input),
    });
  }

  return toolCalls;
}

function readPluginSubagentToolResults(
  value: unknown,
): PluginSubagentRunResult['toolResults'] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const toolResults: PluginSubagentRunResult['toolResults'] = [];
  for (const entry of value) {
    if (
      !isJsonObjectValue(entry)
      || typeof entry.toolCallId !== 'string'
      || typeof entry.toolName !== 'string'
      || !('output' in entry)
    ) {
      return null;
    }

    toolResults.push({
      toolCallId: entry.toolCallId,
      toolName: entry.toolName,
      output: toJsonValue(entry.output),
    });
  }

  return toolResults;
}

function readPluginLlmMessages(
  value: unknown,
): PluginSubagentRequest['messages'] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const messages: PluginSubagentRequest['messages'] = [];
  for (const entry of value) {
    if (!isJsonObjectValue(entry) || !isPluginLlmRole(entry.role)) {
      return null;
    }

    const content = readPluginLlmContent(entry.content);
    if (content === null) {
      return null;
    }

    messages.push({
      role: entry.role,
      content,
    });
  }

  return messages;
}

function readPluginLlmContent(
  value: unknown,
): PluginSubagentRequest['messages'][number]['content'] | null {
  if (typeof value === 'string') {
    return value;
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const parts: PluginSubagentRequest['messages'][number]['content'] = [];
  for (const part of value) {
    if (!isJsonObjectValue(part) || typeof part.type !== 'string') {
      return null;
    }
    if (part.type === 'text') {
      if (typeof part.text !== 'string') {
        return null;
      }
      parts.push({
        type: 'text',
        text: part.text,
      });
      continue;
    }
    if (part.type === 'image') {
      if (typeof part.image !== 'string') {
        return null;
      }
      parts.push({
        type: 'image',
        image: part.image,
        ...(typeof part.mimeType === 'string' ? { mimeType: part.mimeType } : {}),
      });
      continue;
    }

    return null;
  }

  return parts;
}

function isJsonObjectValue(value: unknown): value is Record<string, JsonValue> {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => isJsonValue(entry));
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  return typeof value === 'object'
    && value !== null
    && Object.values(value).every((entry) => isJsonValue(entry));
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isJsonObjectValue(value)
    && Object.values(value).every((entry) => typeof entry === 'string');
}

function isPluginLlmRole(
  value: unknown,
): value is PluginLlmMessage['role'] {
  return value === 'user'
    || value === 'assistant'
    || value === 'system'
    || value === 'tool';
}

function isPluginInvocationSource(value: unknown): value is PluginCallContext['source'] {
  return value === 'chat-tool'
    || value === 'chat-hook'
    || value === 'cron'
    || value === 'automation'
    || value === 'http-route'
    || value === 'subagent'
    || value === 'plugin';
}

function normalizePositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function buildRequestPreview(request: PluginSubagentRequest): string {
  const text = request.messages
    .flatMap((message) => extractMessageText(message.content))
    .join(' ')
    .trim();

  if (text) {
    return truncateText(text, 80);
  }
  if (request.messages.some((message) => hasImageContent(message.content))) {
    return '包含图片输入的后台子代理任务';
  }

  return '空后台子代理任务';
}

function buildResultPreview(result: PluginSubagentRunResult): string {
  return truncateText(result.text.trim() || result.message.content.trim(), 80);
}

function extractMessageText(content: PluginSubagentRequest['messages'][number]['content']): string[] {
  if (typeof content === 'string') {
    return content.trim() ? [content.trim()] : [];
  }

  return content
    .filter((part): part is Extract<(typeof content)[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.text.trim())
    .filter(Boolean);
}

function hasImageContent(content: PluginSubagentRequest['messages'][number]['content']): boolean {
  return Array.isArray(content) && content.some((part) => part.type === 'image');
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}...`;
}

function normalizeTaskStatus(status: string): PluginSubagentTaskSummary['status'] {
  if (
    status === 'queued'
    || status === 'running'
    || status === 'completed'
    || status === 'error'
  ) {
    return status;
  }

  return 'error';
}

function normalizeWriteBackStatus(
  status: string,
): PluginSubagentTaskSummary['writeBackStatus'] {
  if (
    status === 'pending'
    || status === 'sent'
    || status === 'failed'
    || status === 'skipped'
  ) {
    return status;
  }

  return 'skipped';
}

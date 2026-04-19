import type { JsonObject, JsonValue, PluginCallContext, PluginLlmMessage } from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';

export const DEFAULT_PERSONA_ID = 'builtin.default-assistant';
export const DEFAULT_PROVIDER_ID = 'builtin.default';
export const DEFAULT_PROVIDER_MODEL_ID = 'builtin.default.general';
export const SCOPED_STORE_PREFIX = '__gc_scope__:';

export type RuntimeHostScope = 'conversation' | 'plugin' | 'user';
export type AssistantCustomBlockEntry =
  | { key: string; kind: 'json'; value: JsonValue }
  | { key: string; kind: 'text'; value: string };

export function cloneJsonValue<T>(value: T): T {
  return structuredClone(value);
}

export function asJsonObject<T extends object>(value: T): JsonObject {
  return cloneJsonValue(value) as unknown as JsonObject;
}

export function asJsonValue<T>(value: T): JsonValue {
  return cloneJsonValue(value) as unknown as JsonValue;
}

export function readJsonObject(value: unknown): JsonObject | null {
  return isJsonObject(value) ? cloneJsonValue(value) : null;
}

export function readJsonValue(value: unknown): JsonValue | null {
  return isJsonValue(value) ? cloneJsonValue(value) : null;
}

export function readKeywords(value: unknown): string[] {
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
    : [];
}

export function readJsonStringRecord(value: unknown, invalidMessage: string): Record<string, string> | null {
  const record = readJsonObject(value);
  if (!record) {return null;}
  if (Object.values(record).some((entry) => typeof entry !== 'string')) {throw new BadRequestException(invalidMessage);}
  return record as Record<string, string>;
}

export function readPluginLlmMessages(
  value: unknown,
  emptyMessage: string,
  createError: (message: string) => Error = (message) => new BadRequestException(message),
): PluginLlmMessage[] {
  if (!Array.isArray(value) || value.length === 0) {throw createError(emptyMessage);}
  return value.map((message, index) => {
    const record = readJsonObject(message);
    if (!record) {throw createError(`messages[${index}] must be an object`);}
    if (!['assistant', 'system', 'tool', 'user'].includes(String(record.role))) {throw createError(`messages[${index}].role is invalid`);}
    if (typeof record.content !== 'string' && !Array.isArray(record.content)) {throw createError(`messages[${index}].content is invalid`);}
    return cloneJsonValue({ content: record.content, role: record.role }) as PluginLlmMessage;
  });
}

export function readAssistantStreamPart(rawPart: unknown):
  | { type: 'text-delta'; text: string }
  | { type: 'tool-call'; input: JsonValue; toolCallId: string; toolName: string }
  | { type: 'tool-result'; output: JsonValue; toolCallId: string; toolName: string }
  | null {
  if (!isRecord(rawPart) || typeof rawPart.type !== 'string') {return null;}
  if (rawPart.type === 'text-delta' && typeof rawPart.text === 'string') {return { text: rawPart.text, type: 'text-delta' };}
  if ((rawPart.type === 'tool-call' || rawPart.type === 'tool-result') && typeof rawPart.toolCallId === 'string' && typeof rawPart.toolName === 'string') {
    return rawPart.type === 'tool-call'
      ? { input: rawPart.input as JsonValue, toolCallId: rawPart.toolCallId, toolName: rawPart.toolName, type: 'tool-call' }
      : { output: rawPart.output as JsonValue, toolCallId: rawPart.toolCallId, toolName: rawPart.toolName, type: 'tool-result' };
  }
  return null;
}

export function readAssistantRawCustomBlocks(
  rawPart: unknown,
): AssistantCustomBlockEntry[] {
  if (!isRecord(rawPart) || rawPart.type !== 'raw' || !isRecord(rawPart.rawValue)) {
    return [];
  }
  const choices = Array.isArray(rawPart.rawValue.choices) ? rawPart.rawValue.choices : [];
  const choice = choices[0];
  if (!isRecord(choice) || !isRecord(choice.delta)) {
    return [];
  }
  return Object.entries(choice.delta).reduce<AssistantCustomBlockEntry[]>((blocks, [key, value]) => {
    if (isKnownAssistantDeltaKey(key)) {
      return blocks;
    }
    if (typeof value === 'string') {
      if (value.length > 0) {
        blocks.push({ key, kind: 'text', value });
      }
      return blocks;
    }
    if (isJsonValue(value)) {
      blocks.push({ key, kind: 'json', value });
    }
    return blocks;
  }, []);
}

export function readAssistantResponseCustomBlocks(
  responseBody: unknown,
): AssistantCustomBlockEntry[] {
  if (!isRecord(responseBody)) {
    return [];
  }
  const choices = Array.isArray(responseBody.choices) ? responseBody.choices : [];
  const choice = choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    return [];
  }
  return Object.entries(choice.message).reduce<AssistantCustomBlockEntry[]>((blocks, [key, value]) => {
    if (isKnownAssistantDeltaKey(key)) {
      return blocks;
    }
    if (typeof value === 'string') {
      if (value.length > 0) {
        blocks.push({ key, kind: 'text', value });
      }
      return blocks;
    }
    if (isJsonValue(value)) {
      blocks.push({ key, kind: 'json', value });
    }
    return blocks;
  }, []);
}

export function readMessageTarget(value: unknown): { id: string; type: 'conversation' } | null {
  if (!isRecord(value)) {return null;}
  if (value.type !== 'conversation') {throw new BadRequestException('message.send target.type currently only supports conversation');}
  if (typeof value.id !== 'string' || value.id.trim().length === 0) {throw new BadRequestException('message.send target.id is required');}
  return { id: value.id.trim(), type: 'conversation' };
}

export function readOptionalBoolean(params: JsonObject, key: string): boolean | null {
  const value = params[key];
  if (value === undefined) {return null;}
  if (typeof value !== 'boolean') {throw new BadRequestException(`${key} must be boolean`);}
  return value;
}

export function readOptionalString(params: JsonObject, key: string): string | null {
  const value = params[key];
  if (typeof value !== 'string') {return null;}
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function readPositiveInteger(params: JsonObject, key: string): number | null {
  const value = params[key];
  if (value === undefined) {return null;}
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {throw new BadRequestException(`${key} must be a positive integer`);}
  return value;
}

export function readRequiredJsonValue(params: JsonObject, key: string): JsonValue {
  const value = readJsonValue(params[key]);
  if (value === null) {throw new BadRequestException(`${key} must be valid JSON data`);}
  return value;
}

export function readRequiredString(params: JsonObject, key: string): string {
  const value = readOptionalString(params, key);
  if (value) {return value;}
  throw new BadRequestException(`${key} is required`);
}

export function readScope(params: JsonObject): RuntimeHostScope {
  const scope = readOptionalString(params, 'scope') ?? 'plugin';
  if (scope === 'conversation' || scope === 'plugin' || scope === 'user') {return scope;}
  throw new BadRequestException('scope must be plugin, conversation or user');
}

export function readScopedKey(params: JsonObject): string {
  const key = readRequiredString(params, 'key');
  if (key.startsWith(SCOPED_STORE_PREFIX)) {throw new BadRequestException(`key cannot start with reserved prefix ${SCOPED_STORE_PREFIX}`);}
  return key;
}

export function requireContextField(context: PluginCallContext, field: 'conversationId' | 'userId'): string {
  const value = context[field];
  if (value) {return value;}
  throw new BadRequestException(`Host API requires ${field} in call context`);
}

function isJsonArray(value: unknown): value is JsonValue[] {
  return Array.isArray(value) && value.every((entry) => isJsonValue(entry));
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((entry) => isJsonValue(entry));
}

function isJsonValue(value: unknown): value is JsonValue {
  return value === null
    || typeof value === 'boolean'
    || typeof value === 'number'
    || typeof value === 'string'
    || isJsonArray(value)
    || isJsonObject(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownAssistantDeltaKey(key: string): boolean {
  return key === 'content'
    || key === 'role'
    || key === 'tool_calls'
    || key === 'function_call'
    || key === 'refusal'
    || key === 'audio';
}

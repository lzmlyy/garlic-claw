import type { ChatMessagePart, JsonValue, MessageReceivedHookPayload, MessageReceivedHookResult } from "@garlic-claw/shared";
import { cloneJsonValue, isChatMessagePartArray, isJsonObjectValue, isPluginLlmMessageArray } from "./plugin-client-payload.helpers";
export type PluginMessageListenerResultInput = MessageReceivedHookResult | PluginMessageContentResult | string | null | undefined;
export interface PluginMessageContentResult { content: string; parts?: ChatMessagePart[] | null; }
const NO_MESSAGE_RESULT = Symbol("NO_MESSAGE_RESULT");

export function normalizeMessageListenerResult(result: PluginMessageListenerResultInput): MessageReceivedHookResult | null {
  const normalized = readNormalizedMessageResult(result);
  if (normalized !== NO_MESSAGE_RESULT) {
    return normalized;
  }
  throw new Error("SDK message handler 必须返回 string、{ content } 或标准 Hook 结果");
}

export function normalizeRawMessageHookResult(result: JsonValue | null | undefined): JsonValue | null {
  const normalized = readNormalizedMessageResult(result);
  if (normalized === null) {
    return { action: "pass" };
  }
  return normalized === NO_MESSAGE_RESULT ? result as JsonValue : normalized as unknown as JsonValue;
}

export function applyMessageReceivedMutation(payload: MessageReceivedHookPayload, mutation: Extract<MessageReceivedHookResult, { action: "mutate" }>): MessageReceivedHookPayload {
  const nextPayload = cloneJsonValue(payload);
  if ("providerId" in mutation && typeof mutation.providerId === "string") {
    nextPayload.providerId = mutation.providerId;
  }
  if ("modelId" in mutation && typeof mutation.modelId === "string") {
    nextPayload.modelId = mutation.modelId;
  }
  if ("content" in mutation) {
    nextPayload.message.content = mutation.content ?? null;
  }
  if ("parts" in mutation) {
    nextPayload.message.parts = mutation.parts ?? [];
  }
  if ("modelMessages" in mutation && Array.isArray(mutation.modelMessages)) {
    nextPayload.modelMessages = cloneJsonValue(mutation.modelMessages);
  }
  return nextPayload;
}

export function buildMessageReceivedMutationResult(original: MessageReceivedHookPayload, current: MessageReceivedHookPayload): MessageReceivedHookResult {
  const mutation: Extract<MessageReceivedHookResult, { action: "mutate" }> = { action: "mutate" };
  let changed = false;
  if (current.providerId !== original.providerId) {
    mutation.providerId = current.providerId;
    changed = true;
  }
  if (current.modelId !== original.modelId) {
    mutation.modelId = current.modelId;
    changed = true;
  }
  if (current.message.content !== original.message.content) {
    mutation.content = current.message.content;
    changed = true;
  }
  if (!isJsonEqual(current.message.parts, original.message.parts)) {
    mutation.parts = cloneJsonValue(current.message.parts);
    changed = true;
  }
  if (!isJsonEqual(current.modelMessages, original.modelMessages)) {
    mutation.modelMessages = cloneJsonValue(current.modelMessages);
    changed = true;
  }
  return changed ? mutation : { action: "pass" };
}

function readNormalizedMessageResult(result: unknown): MessageReceivedHookResult | null | typeof NO_MESSAGE_RESULT {
  if (result === null || result === undefined) {
    return null;
  }
  if (isJsonObjectValue(result) && "action" in result && typeof result.action === "string") {
    return readMessageListenerHookResult(result);
  }
  if (typeof result === "string") {
    return createShortCircuitResult(result);
  }
  if (isJsonObjectValue(result) && "content" in result) {
    return createShortCircuitResult(typeof result.content === "string" ? result.content : "", isChatMessagePartArray(result.parts) ? result.parts : undefined);
  }
  return NO_MESSAGE_RESULT;
}

function readMessageListenerHookResult(value: Record<string, unknown>): MessageReceivedHookResult {
  switch (value.action) {
    case "pass":
      return { action: "pass" };
    case "mutate": {
      const result: MessageReceivedHookResult = {
        action: "mutate",
      };
      assignOptionalStringField(result as unknown as Record<string, unknown>, value, "providerId", "mutate");
      assignOptionalStringField(result as unknown as Record<string, unknown>, value, "modelId", "mutate");
      if ("content" in value) {
        if (value.content !== null && value.content !== undefined && typeof value.content !== "string") {
          throw new Error('Invalid hook action "mutate": content');
        }
        result.content = value.content ?? null;
      }
      if ("parts" in value) {
        if (value.parts !== null && value.parts !== undefined && !isChatMessagePartArray(value.parts)) {
          throw new Error('Invalid hook action "mutate": parts');
        }
        result.parts = value.parts ?? null;
      }
      if ("modelMessages" in value) {
        if (value.modelMessages !== undefined && !isPluginLlmMessageArray(value.modelMessages)) {
          throw new Error('Invalid hook action "mutate": modelMessages');
        }
        if (value.modelMessages !== undefined) {
          result.modelMessages = value.modelMessages;
        }
      }
      return result;
    }
    case "short-circuit": {
      if (typeof value.assistantContent !== "string") {
        throw new Error('Invalid hook action "short-circuit": assistantContent');
      }
      const result = createShortCircuitResult(value.assistantContent);
      assignOptionalStringField(result as unknown as Record<string, unknown>, value, "providerId", "short-circuit");
      assignOptionalStringField(result as unknown as Record<string, unknown>, value, "modelId", "short-circuit");
      assignOptionalStringField(result as unknown as Record<string, unknown>, value, "reason", "short-circuit");
      if ("assistantParts" in value) {
        if (value.assistantParts !== null && value.assistantParts !== undefined && !isChatMessagePartArray(value.assistantParts)) {
          throw new Error('Invalid hook action "short-circuit": assistantParts');
        }
        result.assistantParts = value.assistantParts ?? null;
      }
      return result;
    }
    default:
      throw new Error(`Invalid hook action: ${value.action}`);
  }
}

function assignOptionalStringField(
  target: Record<string, unknown>,
  value: Record<string, unknown>,
  key: "modelId" | "providerId" | "reason",
  action: "mutate" | "short-circuit",
): void {
  if (!(key in value)) {
    return;
  }
  if (value[key] !== undefined && typeof value[key] !== "string") {
    throw new Error(`Invalid hook action "${action}": ${key}`);
  }
  if (typeof value[key] === "string") {
    target[key] = value[key];
  }
}

function isJsonEqual(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function createShortCircuitResult(assistantContent: string, assistantParts?: ChatMessagePart[] | null): Extract<MessageReceivedHookResult, { action: "short-circuit" }> { return { action: "short-circuit", assistantContent, ...(assistantParts !== undefined ? { assistantParts } : {}) }; }

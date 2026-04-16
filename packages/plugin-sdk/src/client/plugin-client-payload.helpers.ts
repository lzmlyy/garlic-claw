import { type AuthPayload, type ExecuteErrorPayload, type ExecutePayload, type ExecuteResultPayload, type HostCallPayload, type HostResultPayload, type HookInvokePayload, type JsonObject, type JsonValue, type MessageReceivedHookPayload, type PluginCallContext, type PluginConversationSessionInfo, type PluginHookName, type PluginMessageHookInfo, type PluginRouteRequest, type RegisterPayload, type RouteInvokePayload, type RouteResultPayload } from "@garlic-claw/shared";
import { CHAT_MESSAGE_STATUS_VALUES, PLUGIN_HOOK_NAME_VALUES, PLUGIN_INVOCATION_SOURCE_VALUES, PLUGIN_ROUTE_METHOD_VALUES } from "./plugin-client.constants";
import { cloneJsonValue, isJsonObjectValue, isJsonValue, isOneOf, isStringRecord } from "../utils/json-value";

export type PluginClientPayload = AuthPayload | RegisterPayload | ExecutePayload | ExecuteResultPayload | ExecuteErrorPayload | HostCallPayload | HostResultPayload | RouteResultPayload | JsonValue;
export { cloneJsonValue, isJsonObjectValue, isJsonValue };

function isChatMessageStatus(value: unknown): boolean {
  return typeof value === "string" && CHAT_MESSAGE_STATUS_VALUES.includes(value as never);
}

export function isChatMessagePartArray(value: unknown): value is NonNullable<PluginMessageHookInfo["parts"]> {
  return (
    Array.isArray(value) &&
    value.every((part) => {
      if (!isJsonObjectValue(part) || typeof part.type !== "string") {
        return false;
      }
      if (part.type === "text") {
        return typeof part.text === "string";
      }
      if (part.type === "image") {
        return typeof part.image === "string" && (!("mimeType" in part) || typeof part.mimeType === "string");
      }
      return false;
    })
  );
}

export function isPluginLlmMessageArray(value: unknown): value is MessageReceivedHookPayload["modelMessages"] {
  return (
    Array.isArray(value) &&
    value.every((message) => {
      if (!isJsonObjectValue(message) || !isOneOf(message.role, ["user", "assistant", "system", "tool"])) {
        return false;
      }
      return typeof message.content === "string" || isChatMessagePartArray(message.content);
    })
  );
}

function isPluginCallContext(value: unknown): value is PluginCallContext {
  if (!isJsonObjectValue(value) || !isOneOf(value.source, PLUGIN_INVOCATION_SOURCE_VALUES)) {
    return false;
  }
  return (!("userId" in value) || typeof value.userId === "string") && (!("conversationId" in value) || typeof value.conversationId === "string") && (!("automationId" in value) || typeof value.automationId === "string") && (!("cronJobId" in value) || typeof value.cronJobId === "string") && (!("activeProviderId" in value) || typeof value.activeProviderId === "string") && (!("activeModelId" in value) || typeof value.activeModelId === "string") && (!("activePersonaId" in value) || typeof value.activePersonaId === "string") && (!("metadata" in value) || isJsonObjectValue(value.metadata));
}

function isPluginMessageHookInfo(value: unknown): value is PluginMessageHookInfo {
  if (!isJsonObjectValue(value) || typeof value.role !== "string" || (value.content !== null && typeof value.content !== "string") || !isChatMessagePartArray(value.parts)) {
    return false;
  }
  return (!("id" in value) || typeof value.id === "string") && (!("provider" in value) || value.provider === null || typeof value.provider === "string") && (!("model" in value) || value.model === null || typeof value.model === "string") && (!("status" in value) || typeof value.status === "undefined" || isChatMessageStatus(value.status));
}

function isPluginConversationSessionInfo(value: unknown): value is PluginConversationSessionInfo {
  if (!isJsonObjectValue(value) || typeof value.pluginId !== "string" || typeof value.conversationId !== "string" || typeof value.timeoutMs !== "number" || typeof value.startedAt !== "string" || typeof value.expiresAt !== "string" || (value.lastMatchedAt !== null && typeof value.lastMatchedAt !== "string") || typeof value.captureHistory !== "boolean" || !Array.isArray(value.historyMessages) || !value.historyMessages.every((message) => isPluginMessageHookInfo(message))) {
    return false;
  }
  return !("metadata" in value) || isJsonValue(value.metadata);
}

function isPluginRouteMethod(value: unknown): value is PluginRouteRequest["method"] {
  return isOneOf(value, PLUGIN_ROUTE_METHOD_VALUES);
}

function isPluginRouteRequest(value: unknown): value is PluginRouteRequest {
  return isJsonObjectValue(value) && typeof value.path === "string" && isPluginRouteMethod(value.method) && isStringRecord(value.headers) && isJsonObjectValue(value.query) && Object.prototype.hasOwnProperty.call(value, "body") && (value.body === null || isJsonValue(value.body));
}

function isPluginHookName(value: unknown): value is PluginHookName {
  return isOneOf(value, PLUGIN_HOOK_NAME_VALUES);
}

function readJsonObjectPayload(payload: PluginClientPayload | JsonValue, label: string): JsonObject {
  if (!isJsonObjectValue(payload)) {
    throw new Error(`Invalid ${label} payload: expected JSON object`);
  }
  return payload;
}

function readRequiredField<T>(payload: JsonObject, label: string, key: string, guard: (value: unknown) => value is T): T {
  const value = payload[key];
  if (!guard(value)) {
    throw new Error(`Invalid ${label} payload: ${key}`);
  }
  return value;
}

function readOptionalField<T>(payload: JsonObject, label: string, key: string, guard: (value: unknown) => value is T): T | undefined {
  const value = payload[key];
  if (typeof value === "undefined") {
    return undefined;
  }
  if (!guard(value)) {
    throw new Error(`Invalid ${label} payload: ${key}`);
  }
  return value;
}

export function readHookInvokePayload(payload: PluginClientPayload): HookInvokePayload {
  const jsonPayload = readJsonObjectPayload(payload, "hook invoke");
  return {
    hookName: readRequiredField(jsonPayload, "hook invoke", "hookName", isPluginHookName),
    context: readRequiredField(jsonPayload, "hook invoke", "context", isPluginCallContext),
    payload: readRequiredField(jsonPayload, "hook invoke", "payload", isJsonValue),
  };
}

export function readExecutePayload(payload: PluginClientPayload): ExecutePayload {
  const jsonPayload = readJsonObjectPayload(payload, "execute");
  const toolName = readOptionalField(jsonPayload, "execute", "toolName", (value): value is string => typeof value === "string");
  const capability = readOptionalField(jsonPayload, "execute", "capability", (value): value is string => typeof value === "string");
  const context = readOptionalField(jsonPayload, "execute", "context", isPluginCallContext);
  return {
    ...(toolName ? { toolName } : {}),
    ...(capability ? { capability } : {}),
    params: readRequiredField(jsonPayload, "execute", "params", isJsonObjectValue),
    ...(context ? { context } : {}),
  };
}

export function readHostResultPayload(payload: PluginClientPayload): HostResultPayload {
  const jsonPayload = readJsonObjectPayload(payload, "host result");
  return {
    data: readRequiredField(jsonPayload, "host result", "data", isJsonValue),
  };
}

export function readRouteInvokePayload(payload: PluginClientPayload): RouteInvokePayload {
  const jsonPayload = readJsonObjectPayload(payload, "route invoke");
  return {
    request: readRequiredField(jsonPayload, "route invoke", "request", isPluginRouteRequest),
    context: readRequiredField(jsonPayload, "route invoke", "context", isPluginCallContext),
  };
}

export function readMessageReceivedHookPayload(payload: JsonValue): MessageReceivedHookPayload {
  const jsonPayload = readJsonObjectPayload(payload, "message:received");
  const session = readOptionalField(jsonPayload, "message:received", "session", (value): value is PluginConversationSessionInfo | null => value === null || isPluginConversationSessionInfo(value));
  return {
    context: readRequiredField(jsonPayload, "message:received", "context", isPluginCallContext),
    conversationId: readRequiredField(jsonPayload, "message:received", "conversationId", (value): value is string => typeof value === "string"),
    providerId: readRequiredField(jsonPayload, "message:received", "providerId", (value): value is string => typeof value === "string"),
    modelId: readRequiredField(jsonPayload, "message:received", "modelId", (value): value is string => typeof value === "string"),
    ...(typeof session !== "undefined" ? { session } : {}),
    message: readRequiredField(jsonPayload, "message:received", "message", isPluginMessageHookInfo),
    modelMessages: readRequiredField(jsonPayload, "message:received", "modelMessages", isPluginLlmMessageArray),
  };
}

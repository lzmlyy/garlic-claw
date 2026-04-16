import type { AutomationAfterRunHookPayload, ChatWaitingModelHookPayload, ConversationCreatedHookPayload, JsonValue, MessageReceivedHookPayload, PluginEventLevel, PluginManifest, PluginMessageHookInfo, ResponseAfterSendHookPayload, ToolAfterCallHookPayload } from "@garlic-claw/shared";
import builtinObserverManifests from "./builtin-observer-manifests.json";

export const AUTOMATION_RECORDER_MANIFEST = builtinObserverManifests.automationRecorder as PluginManifest;
export const MESSAGE_ENTRY_RECORDER_MANIFEST = builtinObserverManifests.messageEntryRecorder as PluginManifest;
export const MESSAGE_LIFECYCLE_RECORDER_MANIFEST = builtinObserverManifests.messageLifecycleRecorder as PluginManifest;
export const RESPONSE_RECORDER_MANIFEST = builtinObserverManifests.responseRecorder as PluginManifest;
export const PLUGIN_GOVERNANCE_RECORDER_MANIFEST = builtinObserverManifests.pluginGovernanceRecorder as PluginManifest;
export const TOOL_AUDIT_MANIFEST = builtinObserverManifests.toolAudit as PluginManifest;

type PluginObservationHost = {
  setStorage(key: string, value: JsonValue): Promise<JsonValue>;
  writeLog(input: { level: PluginEventLevel; type?: string; message: string; metadata?: Record<string, JsonValue> }): Promise<boolean>;
};

export async function persistPluginObservation<TSummary extends Record<string, JsonValue>>(host: PluginObservationHost, storageKey: string, summary: TSummary, level: PluginEventLevel, message: string, type?: string, metadata?: Record<string, JsonValue>): Promise<void> {
  await host.setStorage(storageKey, summary);
  await host.writeLog({
    level,
    ...(type ? { type } : {}),
    message,
    metadata: metadata ?? summary,
  });
}
export function buildAutomationRunSummary(payload: AutomationAfterRunHookPayload) {
  return {
    automationId: payload.automation.id,
    automationName: payload.automation.name,
    status: payload.status,
    triggerType: payload.automation.trigger.type,
    resultCount: payload.results.length,
  };
}
export function buildMessageReceivedSummary(payload: MessageReceivedHookPayload) {
  return {
    conversationId: payload.conversationId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    contentLength: payload.message.content?.length ?? 0,
    partsCount: payload.message.parts.length,
    userId: payload.context.userId ?? null,
  };
}
export function buildWaitingModelSummary(payload: ChatWaitingModelHookPayload) {
  return {
    conversationId: payload.conversationId,
    assistantMessageId: payload.assistantMessageId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    messageCount: payload.request.messages.length,
    toolCount: payload.request.availableTools.length,
    userId: payload.context.userId ?? null,
  };
}
export function buildConversationCreatedSummary(payload: ConversationCreatedHookPayload) {
  return {
    conversationId: payload.conversation.id,
    titleLength: payload.conversation.title.length,
    userId: payload.context.userId ?? null,
  };
}
export function buildMessageLifecycleSummary(eventType: string, conversationId: string, message: Pick<PluginMessageHookInfo, "id" | "role" | "content" | "parts" | "status">, userId: string | null) {
  return {
    eventType,
    conversationId,
    messageId: message.id ?? null,
    role: message.role,
    contentLength: message.content?.length ?? 0,
    partsCount: message.parts.length,
    status: message.status ?? null,
    userId,
  };
}
export function buildResponseSendSummary(payload: ResponseAfterSendHookPayload) {
  return {
    assistantMessageId: payload.assistantMessageId,
    providerId: payload.providerId,
    modelId: payload.modelId,
    responseSource: payload.responseSource,
    contentLength: payload.assistantContent.length,
    toolCallCount: payload.toolCalls.length,
    toolResultCount: payload.toolResults.length,
    sentAt: payload.sentAt,
    userId: payload.context.userId ?? null,
    conversationId: payload.context.conversationId ?? null,
  };
}
export function buildPluginGovernanceSummary(input: { eventType: string; pluginId: string; runtimeKind: string; deviceType: string; occurredAt: string; errorType?: string; errorMessage?: string }) {
  return {
    eventType: input.eventType,
    pluginId: input.pluginId,
    runtimeKind: input.runtimeKind,
    deviceType: input.deviceType,
    errorType: input.errorType ?? null,
    errorMessage: input.errorMessage ?? null,
    occurredAt: input.occurredAt,
  };
}
export function buildPluginGovernanceMessage(summary: ReturnType<typeof buildPluginGovernanceSummary>): string {
  if (summary.eventType === "plugin:error") {
    return `插件 ${summary.pluginId} 发生失败：${summary.errorType ?? "unknown"}`;
  }
  if (summary.eventType === "plugin:unloaded") {
    return `插件 ${summary.pluginId} 已卸载`;
  }
  return `插件 ${summary.pluginId} 已加载`;
}
export function buildToolAuditSummary(payload: ToolAfterCallHookPayload) {
  return {
    sourceKind: payload.source.kind,
    sourceId: payload.source.id,
    pluginId: payload.pluginId ?? null,
    runtimeKind: payload.runtimeKind ?? null,
    toolId: payload.tool.toolId,
    callName: payload.tool.callName,
    toolName: payload.tool.name,
    callSource: payload.context.source,
    paramKeys: Object.keys(payload.params),
    outputKind: describeJsonValueKind(payload.output),
    userId: payload.context.userId ?? null,
    conversationId: payload.context.conversationId ?? null,
  };
}
export function describeJsonValueKind(value: JsonValue): string {
  if (Array.isArray(value)) {
    return "array";
  }
  if (value === null) {
    return "null";
  }
  return typeof value;
}
export function buildToolAuditStorageKey(payload: Pick<ToolAfterCallHookPayload, "source" | "pluginId" | "tool">): string {
  const storageScope = payload.source.kind === "plugin" ? (payload.pluginId ?? payload.source.id) : `${payload.source.kind}.${payload.source.id}`;
  return `tool.${storageScope}.${payload.tool.name}.last-call`;
}

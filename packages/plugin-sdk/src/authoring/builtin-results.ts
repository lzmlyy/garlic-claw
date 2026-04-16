import type { ActionConfig, AutomationEventDispatchInfo, AutomationInfo, JsonObject, JsonValue, PluginSubagentRunParams, PluginSubagentRunResult, PluginSubagentTaskStartParams, PluginSubagentTaskSummary, TriggerConfig } from "@garlic-claw/shared";
import { toHostJsonValue } from "../host";
import { pickOptionalNumberFields, pickOptionalStringFields, readOptionalObjectParam, readOptionalStringParam, readRequiredStringParam, sanitizeOptionalText, parseCommaSeparatedNames, readJsonObjectValue, normalizePositiveInteger } from "./index";
import { PluginSubagentDelegateConfig, SUBAGENT_DELEGATE_DEFAULT_MAX_STEPS } from "./builtin-manifests";
export function readMemorySearchResults(value: JsonValue): Array<{ content?: string; category?: string; createdAt?: string }> {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const object = readJsonObjectValue(entry);
        return object ? [{ ...pickOptionalStringFields(object, ["content", "category", "createdAt"] as const) }] : [];
      })
    : [];
}
export function readMemorySaveResultId(value: JsonValue): string | null {
  const object = readJsonObjectValue(value);
  return object && typeof object.id === "string" ? object.id : null;
}
export function readSubagentDelegateConfig(value: unknown): PluginSubagentDelegateConfig {
  const object = readJsonObjectValue(value);
  return {
    ...pickOptionalStringFields(object, ["targetProviderId", "targetModelId", "allowedToolNames"] as const),
    ...pickOptionalNumberFields(object, ["maxSteps"] as const),
  };
}
export function buildSubagentDelegateRunParams(input: { config: PluginSubagentDelegateConfig; prompt: string }): PluginSubagentRunParams {
  return buildSubagentDelegateBaseParams(input);
}
export function buildSubagentDelegateTaskParams(input: { config: PluginSubagentDelegateConfig; prompt: string; shouldWriteBack: boolean; conversationId?: string | null }): PluginSubagentTaskStartParams {
  const base = buildSubagentDelegateBaseParams(input);
  return { ...base, ...(input.shouldWriteBack && input.conversationId ? { writeBack: { target: { type: "conversation", id: input.conversationId } } } : {}) };
}
export function readPluginCreateAutomationParams(params: JsonObject): {
  name: string;
  trigger: TriggerConfig;
  actions: ActionConfig[];
} {
  const triggerType = readRequiredStringParam(params, "triggerType");
  if (triggerType !== "cron" && triggerType !== "manual" && triggerType !== "event") {
    throw new Error("triggerType 必须是 cron/manual/event");
  }
  return {
    name: readRequiredStringParam(params, "name"),
    trigger: {
      type: triggerType,
      ...(triggerType === "cron"
        ? {
            cron: readRequiredStringParam(params, "cronInterval"),
          }
        : triggerType === "event"
          ? {
              event: readRequiredStringParam(params, "eventName"),
            }
          : {}),
    },
    actions: readPluginAutomationActionsParam(params),
  };
}
export function createAutomationCreatedResult(automation: Pick<AutomationInfo, "id" | "name">): JsonValue {
  return { created: true, id: automation.id, name: automation.name };
}
export function createAutomationListResult(automations: AutomationInfo[]): JsonValue {
  return automations.map((automation) => ({
    id: automation.id,
    name: automation.name,
    trigger: toHostJsonValue(automation.trigger),
    enabled: automation.enabled,
    lastRunAt: automation.lastRunAt,
  }));
}
export function createAutomationEventDispatchResult(result: AutomationEventDispatchInfo): JsonValue { return toHostJsonValue(result); }
export function createAutomationToggleResult(result: { id: string; enabled: boolean } | null): JsonValue {
  return result ?? createErrorResult("未找到自动化");
}
export function createAutomationRunResult(result: { status: string; results: JsonValue[] } | null): JsonValue {
  return result ?? createErrorResult("未找到自动化或已禁用");
}
export function createMemorySaveToolResult(memoryId: string | null): JsonValue {
  return { saved: true, id: memoryId };
}
export function createMemoryRecallToolResult(
  memories: Array<{
    content?: string;
    category?: string;
    createdAt?: string;
  }>,
): JsonValue {
  return {
    count: memories.length,
    memories: memories.map((memory) => ({ content: memory.content ?? "", category: memory.category ?? "general", date: (memory.createdAt ?? "").split("T")[0] ?? "" })),
  };
}
export function createCurrentTimeToolResult(time: string): JsonValue { return { time }; }
export function createSystemInfoToolResult(input: { platform: string; nodeVersion: string; uptime: number; memoryUsage: number }): JsonValue { return input; }
export function createCalculateSuccessResult(expression: string, result: number): JsonValue { return { expression, result }; }
export function createCalculateErrorResult(message: string): JsonValue { return createErrorResult(message); }
export function createRouteInspectorContextResponse(input: {
  plugin: unknown;
  user: unknown;
  conversation: {
    id?: string;
    title?: string;
  } | null;
  messageCount: number;
}): {
  status: number;
  body: JsonValue;
} {
  return { status: 200, body: toHostJsonValue({ plugin: readJsonObjectValue(input.plugin), user: readJsonObjectValue(input.user), conversation: input.conversation, messageCount: input.messageCount }) };
}
export function createSubagentRunSummary(result: PluginSubagentRunResult): JsonValue {
  return toHostJsonValue({
    providerId: result.providerId,
    modelId: result.modelId,
    text: result.text,
    toolCalls: result.toolCalls,
    toolResults: result.toolResults,
    ...(result.finishReason !== undefined ? { finishReason: result.finishReason } : {}),
  });
}
export function createSubagentTaskSummaryResult(result: PluginSubagentTaskSummary): JsonValue { return toHostJsonValue(result); }
function buildSubagentDelegateBaseParams(input: { config: PluginSubagentDelegateConfig; prompt: string }): PluginSubagentRunParams {
  const toolNames = parseCommaSeparatedNames(input.config.allowedToolNames) as string[] | null;
  return {
    ...(sanitizeOptionalText(input.config.targetProviderId) ? { providerId: sanitizeOptionalText(input.config.targetProviderId) } : {}),
    ...(sanitizeOptionalText(input.config.targetModelId) ? { modelId: sanitizeOptionalText(input.config.targetModelId) } : {}),
    messages: [{ role: "user", content: [{ type: "text", text: input.prompt }] }],
    ...(toolNames ? { toolNames } : {}),
    maxSteps: normalizePositiveInteger(input.config.maxSteps, SUBAGENT_DELEGATE_DEFAULT_MAX_STEPS),
  };
}
function readPluginAutomationActionsParam(params: JsonObject): ActionConfig[] {
  const value = params.actions;
  if (!Array.isArray(value)) {
    throw new Error("actions 必须是数组");
  }
  return value.map((action, index) => readPluginAutomationAction(action, `actions[${index}]`));
}
function readPluginAutomationAction(value: JsonValue, label: string): ActionConfig {
  const action = requireJsonObjectValue(value, label);
  const type = readRequiredStringParam(action, "type");
  if (type !== "device_command" && type !== "ai_message") {
    throw new Error(`${label}.type 不合法`);
  }
  if (type === "device_command") {
    return {
      type,
      plugin: readRequiredStringParam(action, "plugin"),
      capability: readRequiredStringParam(action, "capability"),
      params: readOptionalObjectParam(action, "params"),
    };
  }
  return {
    type,
    message: readOptionalStringParam(action, "message") ?? undefined,
    target: readPluginAutomationActionTarget(action, label),
  };
}
function readPluginAutomationActionTarget(params: JsonObject, label: string): ActionConfig["target"] | undefined {
  const value = params.target;
  if (value === undefined || value === null) {
    return undefined;
  }
  const target = requireJsonObjectValue(value, `${label}.target`);
  const type = readRequiredStringParam(target, "type");
  if (type !== "conversation") {
    throw new Error(`${label}.target.type 当前只支持 conversation`);
  }
  return {
    type: "conversation",
    id: readRequiredStringParam(target, "id"),
  };
}
function requireJsonObjectValue(value: JsonValue, label: string): JsonObject {
  const object = readJsonObjectValue(value);
  if (!object) {
    throw new Error(`${label} 必须是对象`);
  }
  return object;
}

function createErrorResult(message: string): JsonValue { return { error: message }; }

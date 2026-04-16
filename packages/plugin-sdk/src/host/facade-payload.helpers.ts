import type { ActionConfig, JsonObject, PluginConversationSessionKeepParams, PluginConversationSessionStartParams, PluginCronDescriptor, PluginLlmGenerateParams, PluginMessageSendParams, PluginSubagentRunParams, PluginSubagentTaskStartParams, TriggerConfig } from "@garlic-claw/shared";

import type { PluginGenerateTextParams, PluginScopedStateOptions } from "./facade";
import { toHostJsonValue } from "./host-json-value.codec";

export function buildPluginMessageSendParams(input: PluginMessageSendParams): JsonObject {
  return {
    ...(input.target ? { target: toHostJsonValue(input.target) } : {}),
    ...(typeof input.content === "string" ? { content: input.content } : {}),
    ...(input.parts ? { parts: toHostJsonValue(input.parts) } : {}),
    ...(typeof input.provider === "string" ? { provider: input.provider } : {}),
    ...(typeof input.model === "string" ? { model: input.model } : {}),
  };
}

export function buildPluginConversationSessionStartParams(input: PluginConversationSessionStartParams): JsonObject {
  return {
    timeoutMs: input.timeoutMs,
    ...(typeof input.captureHistory === "boolean" ? { captureHistory: input.captureHistory } : {}),
    ...(typeof input.metadata !== "undefined" ? { metadata: input.metadata } : {}),
  };
}

export function buildPluginConversationSessionKeepParams(input: PluginConversationSessionKeepParams): JsonObject {
  return {
    timeoutMs: input.timeoutMs,
    ...(typeof input.resetTimeout === "boolean" ? { resetTimeout: input.resetTimeout } : {}),
  };
}

export function buildPluginRegisterCronParams(descriptor: PluginCronDescriptor): JsonObject {
  return {
    name: descriptor.name,
    cron: descriptor.cron,
    ...(descriptor.description ? { description: descriptor.description } : {}),
    ...(typeof descriptor.enabled === "boolean" ? { enabled: descriptor.enabled } : {}),
    ...(typeof descriptor.data !== "undefined" ? { data: descriptor.data } : {}),
  };
}

export function buildPluginCreateAutomationParams(input: { name: string; trigger: TriggerConfig; actions: ActionConfig[] }): JsonObject {
  return {
    name: input.name,
    trigger: toHostJsonValue(input.trigger),
    actions: toHostJsonValue(input.actions),
  };
}

export function buildPluginGenerateParams(input: PluginLlmGenerateParams): JsonObject {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
    ...(typeof input.maxOutputTokens === "number" ? { maxOutputTokens: input.maxOutputTokens } : {}),
  };
}

export function buildPluginRunSubagentParams(input: PluginSubagentRunParams): JsonObject {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.toolNames ? { toolNames: toHostJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: toHostJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === "number" ? { maxOutputTokens: input.maxOutputTokens } : {}),
    ...(typeof input.maxSteps === "number" ? { maxSteps: input.maxSteps } : {}),
  };
}

export function buildPluginStartSubagentTaskParams(input: PluginSubagentTaskStartParams): JsonObject {
  return {
    messages: toHostJsonValue(input.messages),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    ...(input.toolNames ? { toolNames: toHostJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: toHostJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === "number" ? { maxOutputTokens: input.maxOutputTokens } : {}),
    ...(typeof input.maxSteps === "number" ? { maxSteps: input.maxSteps } : {}),
    ...(input.writeBack ? { writeBack: toHostJsonValue(input.writeBack) } : {}),
  };
}

export function buildPluginGenerateTextParams(input: PluginGenerateTextParams): JsonObject {
  return {
    prompt: input.prompt,
    ...(input.system ? { system: input.system } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(typeof input.maxOutputTokens === "number" ? { maxOutputTokens: input.maxOutputTokens } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  };
}

export function toScopedStateParams(options?: PluginScopedStateOptions): JsonObject {
  return options?.scope
    ? {
        scope: options.scope,
      }
    : {};
}

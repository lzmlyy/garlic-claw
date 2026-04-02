import type {
  ActionConfig,
  PluginConversationSessionKeepParams,
  PluginConversationSessionStartParams,
  PluginCronDescriptor,
  PluginLlmGenerateParams,
  PluginMessageSendParams,
  PluginScopedStateScope,
  PluginSubagentRunParams,
  PluginSubagentTaskStartParams,
  TriggerConfig,
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import { toJsonValue } from '../../common/utils/json-value';

export interface BuiltinPluginScopedStateOptions {
  scope?: PluginScopedStateScope;
}

export interface BuiltinPluginGenerateTextParams {
  prompt: string;
  system?: string;
  providerId?: string;
  modelId?: string;
  variant?: string;
  maxOutputTokens?: number;
  providerOptions?: JsonObject;
  headers?: Record<string, string>;
}

export function toHostJsonValue(value: unknown): JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const item of value) {
      if (typeof item === 'undefined') {
        continue;
      }
      result.push(toHostJsonValue(item));
    }
    return result;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isPlainObject(value)) {
    const result: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'undefined') {
        continue;
      }
      result[key] = toHostJsonValue(entry);
    }
    return result;
  }

  return toJsonValue(value);
}

export function toScopedStateParams(
  options?: BuiltinPluginScopedStateOptions,
): JsonObject {
  return options?.scope
    ? {
        scope: options.scope,
      }
    : {};
}

export function buildBuiltinMessageSendParams(
  input: PluginMessageSendParams,
): JsonObject {
  return {
    ...(input.target ? { target: toHostJsonValue(input.target) } : {}),
    ...(typeof input.content === 'string' ? { content: input.content } : {}),
    ...(input.parts ? { parts: toHostJsonValue(input.parts) } : {}),
    ...(typeof input.provider === 'string' ? { provider: input.provider } : {}),
    ...(typeof input.model === 'string' ? { model: input.model } : {}),
  };
}

export function buildBuiltinConversationSessionStartParams(
  input: PluginConversationSessionStartParams,
): JsonObject {
  return {
    timeoutMs: input.timeoutMs,
    ...(typeof input.captureHistory === 'boolean'
      ? { captureHistory: input.captureHistory }
      : {}),
    ...(typeof input.metadata !== 'undefined' ? { metadata: input.metadata } : {}),
  };
}

export function buildBuiltinConversationSessionKeepParams(
  input: PluginConversationSessionKeepParams,
): JsonObject {
  return {
    timeoutMs: input.timeoutMs,
    ...(typeof input.resetTimeout === 'boolean'
      ? { resetTimeout: input.resetTimeout }
      : {}),
  };
}

export function buildBuiltinRegisterCronParams(
  descriptor: PluginCronDescriptor,
): JsonObject {
  return {
    name: descriptor.name,
    cron: descriptor.cron,
    ...(descriptor.description ? { description: descriptor.description } : {}),
    ...(typeof descriptor.enabled === 'boolean' ? { enabled: descriptor.enabled } : {}),
    ...(typeof descriptor.data !== 'undefined' ? { data: descriptor.data } : {}),
  };
}

export function buildBuiltinCreateAutomationParams(input: {
  name: string;
  trigger: TriggerConfig;
  actions: ActionConfig[];
}): JsonObject {
  return {
    name: input.name,
    trigger: toHostJsonValue(input.trigger),
    actions: toHostJsonValue(input.actions),
  };
}

export function buildBuiltinGenerateParams(
  input: PluginLlmGenerateParams,
): JsonObject {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
  };
}

export function buildBuiltinRunSubagentParams(
  input: PluginSubagentRunParams,
): JsonObject {
  return {
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    messages: toHostJsonValue(input.messages),
    ...(input.toolNames ? { toolNames: toHostJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: toHostJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
    ...(typeof input.maxSteps === 'number' ? { maxSteps: input.maxSteps } : {}),
  };
}

export function buildBuiltinStartSubagentTaskParams(
  input: PluginSubagentTaskStartParams,
): JsonObject {
  return {
    messages: toHostJsonValue(input.messages),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.system ? { system: input.system } : {}),
    ...(input.toolNames ? { toolNames: toHostJsonValue(input.toolNames) } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: toHostJsonValue(input.headers) } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
    ...(typeof input.maxSteps === 'number' ? { maxSteps: input.maxSteps } : {}),
    ...(input.writeBack ? { writeBack: toHostJsonValue(input.writeBack) } : {}),
  };
}

export function buildBuiltinGenerateTextParams(
  input: BuiltinPluginGenerateTextParams,
): JsonObject {
  return {
    prompt: input.prompt,
    ...(input.system ? { system: input.system } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    ...(input.modelId ? { modelId: input.modelId } : {}),
    ...(input.variant ? { variant: input.variant } : {}),
    ...(typeof input.maxOutputTokens === 'number'
      ? { maxOutputTokens: input.maxOutputTokens }
      : {}),
    ...(input.providerOptions ? { providerOptions: input.providerOptions } : {}),
    ...(input.headers ? { headers: input.headers } : {}),
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

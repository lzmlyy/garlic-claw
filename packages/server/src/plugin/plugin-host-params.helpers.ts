import type {
  AiUtilityModelRole,
  PluginCallContext,
  PluginEventLevel,
  PluginLlmGenerateParams,
  PluginLlmMessage,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import {
  readOptionalNumberValue,
  readOptionalObjectValue,
  readOptionalStringRecordValue,
  readOptionalStringValue,
} from './plugin-json-value.helpers';
import { readPluginLlmMessages } from './plugin-llm-payload.helpers';

export function requireHostUserId(
  context: PluginCallContext,
  method: string,
): string {
  if (!context.userId) {
    throw new BadRequestException(`${method} 需要 userId 上下文`);
  }

  return context.userId;
}

export function requireHostConversationId(
  context: PluginCallContext,
  method: string,
): string {
  if (!context.conversationId) {
    throw new BadRequestException(`${method} 需要 conversationId 上下文`);
  }

  return context.conversationId;
}

export function readHostString(params: JsonObject, key: string): string | null {
  try {
    return readOptionalStringValue(params[key], key) ?? null;
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

export function requireHostString(params: JsonObject, key: string): string {
  const value = readHostString(params, key);
  if (value === null) {
    throw new BadRequestException(`${key} 必填`);
  }

  return value;
}

export function readHostNumber(params: JsonObject, key: string): number | null {
  try {
    return readOptionalNumberValue(params[key], key) ?? null;
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

export function readHostObject(
  params: JsonObject,
  key: string,
): JsonObject | null {
  try {
    return readOptionalObjectValue(params[key], key) ?? null;
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

export function requireHostJsonValue(
  params: JsonObject,
  key: string,
  method: string,
): JsonValue {
  if (!Object.prototype.hasOwnProperty.call(params, key)) {
    throw new BadRequestException(`${method} 缺少 ${key}`);
  }

  return params[key];
}

export function readHostStringRecord(
  params: JsonObject,
  key: string,
): Record<string, string> | null {
  try {
    return readOptionalStringRecordValue(params[key], key) ?? null;
  } catch (error) {
    throw new BadRequestException(String((error as Error).message));
  }
}

export function readHostEventLevel(
  params: JsonObject,
  key: string,
): PluginEventLevel {
  const value = requireHostString(params, key);
  if (value !== 'info' && value !== 'warn' && value !== 'error') {
    throw new BadRequestException(`${key} 必须是 info/warn/error`);
  }

  return value;
}

export function readHostGenerateParams(
  params: JsonObject,
  messages: PluginLlmGenerateParams['messages'],
): PluginLlmGenerateParams {
  const providerId = readHostString(params, 'providerId') ?? undefined;
  const modelId = readHostString(params, 'modelId') ?? undefined;
  const system = readHostString(params, 'system') ?? undefined;
  const variant = readHostString(params, 'variant') ?? undefined;
  const providerOptions = readHostObject(params, 'providerOptions') ?? undefined;
  const headers = readHostStringRecord(params, 'headers') ?? undefined;
  const maxOutputTokens = readHostNumber(params, 'maxOutputTokens') ?? undefined;

  return {
    ...(providerId ? { providerId } : {}),
    ...(modelId ? { modelId } : {}),
    ...(system ? { system } : {}),
    ...(variant ? { variant } : {}),
    ...(providerOptions ? { providerOptions } : {}),
    ...(headers ? { headers } : {}),
    ...(typeof maxOutputTokens === 'number' ? { maxOutputTokens } : {}),
    messages,
  };
}

export function resolveHostUtilityRoleForGeneration(
  pluginId: string,
  context: PluginCallContext,
  params: Pick<PluginLlmGenerateParams, 'providerId' | 'modelId'>,
): AiUtilityModelRole | undefined {
  if (params.providerId || params.modelId) {
    return undefined;
  }

  if (
    pluginId === 'builtin.conversation-title'
    && context.activeProviderId
    && context.activeModelId
  ) {
    params.providerId = context.activeProviderId;
    params.modelId = context.activeModelId;
    return 'conversationTitle';
  }

  return 'pluginGenerateText';
}

export function readHostLlmMessages(params: JsonObject): PluginLlmMessage[] {
  return readPluginLlmMessages(params.messages, {
    arrayLabel: 'messages',
  });
}

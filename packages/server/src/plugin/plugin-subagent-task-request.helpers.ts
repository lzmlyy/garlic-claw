import type {
  PluginCallContext,
  PluginLlmMessage,
  PluginSubagentRequest,
} from '@garlic-claw/shared';
import { normalizePositiveInteger } from '@garlic-claw/shared';
import {
  isJsonObjectValue,
  isStringArray,
  isStringRecord,
  parseUnknownJson,
} from './plugin-subagent-task-value.helpers';

export function parseTaskRequest(raw: string): PluginSubagentRequest {
  return readPluginSubagentRequest(parseUnknownJson(raw)) ?? {
    messages: [],
    maxSteps: 4,
  };
}

export function parseTaskContext(raw: string): PluginCallContext {
  return readPluginCallContextValue(parseUnknownJson(raw)) ?? {
    source: 'plugin',
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
    maxSteps: normalizePositiveInteger(
      typeof value.maxSteps === 'number' ? value.maxSteps : undefined,
      4,
    ),
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

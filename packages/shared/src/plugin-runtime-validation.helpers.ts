import { isJsonObjectValue } from './types/json';
import type { JsonValue } from './types/json';
import type { PluginHookFilterDescriptor } from './types/plugin';

export { hasImagePart, normalizePositiveInteger } from './plugin-runtime-validation';

export function isStringArray(value: JsonValue | undefined): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

export function isChatMessageStatus(value: JsonValue): boolean {
  return value === 'pending'
    || value === 'streaming'
    || value === 'completed'
    || value === 'stopped'
    || value === 'error';
}

export function isChatMessagePartArray(value: JsonValue): boolean {
  return Array.isArray(value)
    && value.every((part) => {
      if (!isJsonObjectValue(part) || typeof part.type !== 'string') {
        return false;
      }
      if (part.type === 'text') {
        return typeof part.text === 'string';
      }
      if (part.type === 'image') {
        return typeof part.image === 'string'
          && (!('mimeType' in part) || typeof part.mimeType === 'string');
      }
      return false;
    });
}

export function isPluginLlmMessageArray(value: JsonValue | undefined): boolean {
  return Array.isArray(value)
    && value.every((message) => {
      if (
        !isJsonObjectValue(message)
        || typeof message.role !== 'string'
        || !['user', 'assistant', 'system', 'tool'].includes(message.role)
      ) {
        return false;
      }
      if (typeof message.content === 'string') {
        return true;
      }
      return Array.isArray(message.content) && isChatMessagePartArray(message.content);
    });
}

export function isActionConfigArray(value: JsonValue | undefined): boolean {
  return Array.isArray(value)
    && value.every((action) => {
      if (!isJsonObjectValue(action) || typeof action.type !== 'string') {
        return false;
      }
      if (action.type !== 'device_command' && action.type !== 'ai_message') {
        return false;
      }
      if ('plugin' in action && action.plugin !== undefined && typeof action.plugin !== 'string') {
        return false;
      }
      if (
        'capability' in action
        && action.capability !== undefined
        && typeof action.capability !== 'string'
      ) {
        return false;
      }
      if ('params' in action && action.params !== undefined && !isJsonObjectValue(action.params)) {
        return false;
      }
      if ('message' in action && action.message !== undefined && typeof action.message !== 'string') {
        return false;
      }
      if ('target' in action && action.target !== undefined) {
        if (!isJsonObjectValue(action.target)) {
          return false;
        }
        if (action.target.type !== 'conversation') {
          return false;
        }
        if (typeof action.target.id !== 'string') {
          return false;
        }
      }
      return true;
    });
}

export function isPluginSubagentToolCallArray(value: JsonValue | undefined): boolean {
  return Array.isArray(value)
    && value.every((toolCall) =>
      isJsonObjectValue(toolCall)
      && typeof toolCall.toolCallId === 'string'
      && typeof toolCall.toolName === 'string'
      && Object.prototype.hasOwnProperty.call(toolCall, 'input'),
    );
}

export function isPluginSubagentToolResultArray(value: JsonValue | undefined): boolean {
  return Array.isArray(value)
    && value.every((toolResult) =>
      isJsonObjectValue(toolResult)
      && typeof toolResult.toolCallId === 'string'
      && typeof toolResult.toolName === 'string'
      && Object.prototype.hasOwnProperty.call(toolResult, 'output'),
    );
}

export function buildFilterRegex(
  filterRegex: NonNullable<NonNullable<PluginHookFilterDescriptor['message']>['regex']>,
): RegExp {
  if (typeof filterRegex === 'string') {
    return new RegExp(filterRegex);
  }

  return new RegExp(filterRegex.pattern, filterRegex.flags);
}

export function matchesMessageCommand(messageText: string, command: string): boolean {
  const normalizedCommand = command.trim();
  if (!normalizedCommand) {
    return false;
  }

  const normalizedMessage = messageText.trimStart();
  if (!normalizedMessage.startsWith(normalizedCommand)) {
    return false;
  }

  const nextChar = normalizedMessage.charAt(normalizedCommand.length);
  return nextChar === '' || /\s/.test(nextChar);
}

export function normalizeRoutePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

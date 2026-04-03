import type {
  MessageReceivedHookPayload,
  PluginHookDescriptor,
  PluginHookName,
  PluginMessageKind,
} from '@garlic-claw/shared';
import {
  buildFilterRegex,
  matchesMessageCommand,
} from '@garlic-claw/shared';

export function getPluginHookPriority(hook: PluginHookDescriptor): number {
  if (typeof hook.priority !== 'number' || !Number.isFinite(hook.priority)) {
    return 0;
  }

  return Math.trunc(hook.priority);
}

export function getMessageReceivedText(payload: MessageReceivedHookPayload): string {
  if (typeof payload.message.content === 'string') {
    return payload.message.content;
  }

  return payload.message.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

export function detectMessageKind(
  message: MessageReceivedHookPayload['message'],
): PluginMessageKind {
  const hasImage = message.parts.some((part) => part.type === 'image');
  const hasTextPart = message.parts.some((part) => part.type === 'text');
  const hasText = hasTextPart || Boolean(message.content?.trim());

  if (hasImage && hasText) {
    return 'mixed';
  }
  if (hasImage) {
    return 'image';
  }

  return 'text';
}

export function matchesHookFilter(
  hook: PluginHookDescriptor,
  hookName: PluginHookName,
  payload?: unknown,
): boolean {
  if (hookName !== 'message:received' || !hook.filter?.message) {
    return true;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return false;
  }

  const messagePayload = payload as MessageReceivedHookPayload;
  const filter = hook.filter.message;
  const messageText = getMessageReceivedText(messagePayload);
  const messageKind = detectMessageKind(messagePayload.message);

  if (
    Array.isArray(filter.commands)
    && filter.commands.length > 0
    && !filter.commands.some((command) => matchesMessageCommand(messageText, command))
  ) {
    return false;
  }

  if (filter.regex) {
    const regex = buildFilterRegex(filter.regex);
    if (!regex.test(messageText)) {
      return false;
    }
  }

  if (
    Array.isArray(filter.messageKinds)
    && filter.messageKinds.length > 0
    && !filter.messageKinds.includes(messageKind)
  ) {
    return false;
  }

  return true;
}

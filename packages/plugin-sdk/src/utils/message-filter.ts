import type {
  ChatMessagePart,
  MessageReceivedHookPayload,
  PluginHookMessageFilter,
  PluginMessageKind,
} from '@garlic-claw/shared';

/**
 * 归一化消息监听优先级。
 * @param priority 原始优先级
 * @returns 归一化后的整数优先级
 */
export function normalizePriority(priority?: number): number {
  if (typeof priority !== 'number' || !Number.isFinite(priority)) {
    return 0;
  }

  return Math.trunc(priority);
}

/**
 * 计算一个消息过滤器的大致特异性。
 * @param filter 消息过滤器
 * @returns 特异性分值，越大越具体
 */
export function computeFilterSpecificity(filter?: PluginHookMessageFilter): number {
  if (!filter) {
    return 0;
  }

  const commandSpecificity = Math.max(
    0,
    ...(filter.commands ?? []).map((command) =>
      command.trim().replace(/^\//, '').split(/\s+/).filter(Boolean).length),
  );
  const regexSpecificity = filter.regex ? 1 : 0;
  const kindSpecificity = filter.messageKinds?.length ? 1 : 0;
  return commandSpecificity + regexSpecificity + kindSpecificity;
}

/**
 * 判断消息过滤器是否为空。
 * @param filter 消息过滤器
 * @returns 是否为空过滤器
 */
export function isEmptyMessageFilter(filter: PluginHookMessageFilter): boolean {
  return (!filter.commands || filter.commands.length === 0)
    && !filter.regex
    && (!filter.messageKinds || filter.messageKinds.length === 0);
}

/**
 * 判断一个过滤器是否只声明了某一种过滤键。
 * @param filter 消息过滤器
 * @param key 目标过滤键
 * @returns 是否只声明了该过滤键
 */
export function hasOnlyMessageFilterKey(
  filter: PluginHookMessageFilter,
  key: keyof PluginHookMessageFilter,
): boolean {
  const activeKeys = [
    filter.commands?.length ? 'commands' : null,
    filter.regex ? 'regex' : null,
    filter.messageKinds?.length ? 'messageKinds' : null,
  ].filter((item): item is keyof PluginHookMessageFilter => Boolean(item));

  return activeKeys.length === 1 && activeKeys[0] === key;
}

/**
 * 判断当前消息是否命中过滤条件。
 * @param payload 当前消息载荷
 * @param filter 过滤条件
 * @returns 是否命中
 */
export function matchesMessageFilter(
  payload: MessageReceivedHookPayload,
  filter?: PluginHookMessageFilter,
): boolean {
  if (!filter || isEmptyMessageFilter(filter)) {
    return true;
  }

  const messageText = getMessageReceivedText(payload);
  const messageKind = detectMessageKind(payload);

  if (
    filter.commands
    && filter.commands.length > 0
    && !filter.commands.some((command) => matchesMessageCommand(messageText, command))
  ) {
    return false;
  }

  if (filter.regex) {
    const regex = typeof filter.regex === 'string'
      ? new RegExp(filter.regex)
      : new RegExp(filter.regex.pattern, filter.regex.flags);
    if (!regex.test(messageText)) {
      return false;
    }
  }

  if (
    filter.messageKinds
    && filter.messageKinds.length > 0
    && !filter.messageKinds.includes(messageKind)
  ) {
    return false;
  }

  return true;
}

/**
 * 从消息载荷中提取可匹配的纯文本。
 * @param payload 当前消息载荷
 * @returns 归一化后的消息文本
 */
export function getMessageReceivedText(payload: MessageReceivedHookPayload): string {
  if (typeof payload.message.content === 'string') {
    return payload.message.content;
  }

  return payload.message.parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

/**
 * 判断一条消息的模态类型。
 * @param payload 当前消息载荷
 * @returns 当前消息类型
 */
export function detectMessageKind(payload: MessageReceivedHookPayload): PluginMessageKind {
  const hasText = typeof payload.message.content === 'string'
    ? payload.message.content.trim().length > 0
    : payload.message.parts.some((part) => part.type === 'text' && part.text.trim().length > 0);
  const hasImage = payload.message.parts.some((part) => part.type === 'image');

  if (hasText && hasImage) {
    return 'mixed';
  }
  if (hasImage) {
    return 'image';
  }
  return 'text';
}

/**
 * 判断一条消息是否命中了某个命令。
 * @param messageText 当前消息文本
 * @param command 命令路径
 * @returns 是否命中
 */
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


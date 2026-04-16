import type {
  ChatMessagePart,
  MessageReceivedHookPayload,
  PluginHookMessageFilter,
  PluginMessageKind,
} from '@garlic-claw/shared';

export function normalizePriority(priority?: number): number { return typeof priority === 'number' && Number.isFinite(priority) ? Math.trunc(priority) : 0; }

export function computeFilterSpecificity(filter?: PluginHookMessageFilter): number {
  return filter
    ? Math.max(0, ...(filter.commands ?? []).map((command) => command.trim().replace(/^\//, '').split(/\s+/).filter(Boolean).length))
      + (filter.regex ? 1 : 0)
      + (filter.messageKinds?.length ? 1 : 0)
    : 0;
}

export function isEmptyMessageFilter(filter: PluginHookMessageFilter): boolean {
  return !filter.commands?.length && !filter.regex && !filter.messageKinds?.length;
}

export function hasOnlyMessageFilterKey(filter: PluginHookMessageFilter, key: keyof PluginHookMessageFilter): boolean {
  const activeKeys = [filter.commands?.length ? 'commands' : null, filter.regex ? 'regex' : null, filter.messageKinds?.length ? 'messageKinds' : null].filter((item): item is keyof PluginHookMessageFilter => Boolean(item));
  return activeKeys.length === 1 && activeKeys[0] === key;
}

export function mergeExclusiveMessageFilters(filters: PluginHookMessageFilter[]): PluginHookMessageFilter | undefined {
  if (filters.length === 0 || filters.some(isEmptyMessageFilter)) {return undefined;}
  const key = readExclusiveMessageFilterKey(filters);
  if (!key) {return undefined;}
  if (key === 'commands') {return { commands: dedupeStrings(filters.flatMap((filter) => filter.commands ?? [])) };}
  if (key === 'messageKinds') {return { messageKinds: dedupeStrings(filters.flatMap((filter) => filter.messageKinds ?? [])) as PluginHookMessageFilter['messageKinds'] };}
  const regexes = filters.map((filter) => filter.regex).filter((regex): regex is NonNullable<PluginHookMessageFilter['regex']> => Boolean(regex));
  const flags = dedupeStrings(regexes.flatMap((regex) => typeof regex === 'string' ? [] : (regex.flags ?? '').split(''))).join('');
  return { regex: { pattern: regexes.map((regex) => `(?:${typeof regex === 'string' ? regex : regex.pattern})`).join('|'), ...(flags ? { flags } : {}) } };
}

export function matchesMessageFilter(payload: MessageReceivedHookPayload, filter?: PluginHookMessageFilter): boolean {
  if (!filter || isEmptyMessageFilter(filter)) {return true;}
  const messageText = getMessageReceivedText(payload);
  if (filter.commands?.length && !filter.commands.some((command) => matchesMessageCommand(messageText, command))) {return false;}
  if (filter.regex && !(typeof filter.regex === 'string' ? new RegExp(filter.regex) : new RegExp(filter.regex.pattern, filter.regex.flags)).test(messageText)) {return false;}
  return !filter.messageKinds?.length || filter.messageKinds.includes(detectMessageKind(payload));
}

export function getMessageReceivedText(payload: MessageReceivedHookPayload): string {
  return typeof payload.message.content === 'string'
    ? payload.message.content
    : payload.message.parts.filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text').map((part) => part.text).join('\n');
}

export function detectMessageKind(payload: MessageReceivedHookPayload): PluginMessageKind {
  const hasText = typeof payload.message.content === 'string' ? payload.message.content.trim().length > 0 : payload.message.parts.some((part) => part.type === 'text' && part.text.trim().length > 0);
  const hasImage = payload.message.parts.some((part) => part.type === 'image');
  return hasText && hasImage ? 'mixed' : hasImage ? 'image' : 'text';
}

export function matchesMessageCommand(messageText: string, command: string): boolean {
  const normalizedCommand = command.trim();
  if (!normalizedCommand) {return false;}
  const normalizedMessage = messageText.trimStart();
  if (!normalizedMessage.startsWith(normalizedCommand)) {return false;}
  const nextChar = normalizedMessage.charAt(normalizedCommand.length);
  return nextChar === '' || /\s/.test(nextChar);
}

function readExclusiveMessageFilterKey(filters: PluginHookMessageFilter[]): 'commands' | 'messageKinds' | 'regex' | null {
  const [first] = filters;
  const key = first && (hasOnlyMessageFilterKey(first, 'commands') ? 'commands' : hasOnlyMessageFilterKey(first, 'messageKinds') ? 'messageKinds' : hasOnlyMessageFilterKey(first, 'regex') ? 'regex' : null);
  return key && filters.every((filter) => hasOnlyMessageFilterKey(filter, key)) ? key : null;
}

function dedupeStrings(values: string[]): string[] { return [...new Set(values)]; }

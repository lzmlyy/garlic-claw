import type {
  ChatMessageMetadata,
  ChatMessagePart,
  SSEEvent,
} from '@garlic-claw/shared'
import {
  dbMessageToChat,
  stringifyPayload,
} from './chat-store.helpers'
import type { ChatMessage } from './chat-store.types'

/**
 * 一次流式请求在本地的占位上下文。
 */
export interface StreamEventContext {
  requestKind: 'send' | 'retry'
  optimisticUserId?: string
  optimisticAssistantId?: string
  targetMessageId?: string
}

/**
 * 创建临时消息 ID，便于在真正拿到数据库 ID 之前先占位渲染。
 * @param prefix 消息类型前缀
 * @returns 临时消息 ID
 */
export function createTemporaryMessageId(prefix: 'user' | 'assistant') {
  return `temp-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 构造乐观用户消息。
 * @param id 临时消息 ID
 * @param content 文本内容
 * @param parts 结构化 parts
 * @returns 立即可渲染的用户消息
 */
export function buildOptimisticUserMessage(
  id: string,
  content?: string,
  parts?: ChatMessagePart[],
): ChatMessage {
  return {
    id,
    role: 'user',
    content: content ?? '',
    parts,
    status: 'completed',
    error: null,
  }
}

/**
 * 构造乐观 assistant 占位消息。
 * @param id 临时消息 ID
 * @param provider provider ID
 * @param model model ID
 * @returns 立即可渲染的 assistant 消息
 */
export function buildOptimisticAssistantMessage(
  id: string,
  provider: string | null,
  model: string | null,
  metadata?: ChatMessageMetadata,
): ChatMessage {
  return {
    id,
    role: 'assistant',
    content: '',
    toolCalls: [],
    toolResults: [],
    ...(metadata ? { metadata } : {}),
    provider,
    model,
    status: 'pending',
    error: null,
  }
}

/**
 * 将一条消息写回列表；存在则替换，不存在则追加。
 * @param messages 当前消息列表
 * @param message 新消息
 * @param fallbackId 可选的临时消息 ID
 * @returns 更新后的消息列表
 */
export function replaceOrAppendMessage(
  messages: ChatMessage[],
  message: ChatMessage,
  fallbackId?: string,
): ChatMessage[] {
  const matchedIndexes = findMatchedMessageIndexes(
    messages,
    message.id,
    fallbackId,
  )

  if (matchedIndexes.length > 0) {
    return replaceMatchedMessages(messages, matchedIndexes, message)
  }

  return [...messages, message]
}

/**
 * 原地替换一条指定消息。
 * @param messages 当前消息列表
 * @param messageId 目标消息 ID
 * @param message 新消息
 * @returns 更新后的消息列表
 */
export function replaceMessage(
  messages: ChatMessage[],
  messageId: string,
  message: ChatMessage,
): ChatMessage[] {
  const index = findMessageIndex(messages, messageId)
  return index >= 0 ? replaceMessageAt(messages, index, message) : messages
}

/**
 * 从消息列表中删除一条消息。
 * @param messages 当前消息列表
 * @param messageId 要删除的消息 ID
 * @returns 删除后的消息列表
 */
export function removeMessage(messages: ChatMessage[], messageId: string): ChatMessage[] {
  return messages.filter((message) => message.id !== messageId)
}

/**
 * 应用一次 SSE 事件到当前消息列表。
 * @param messages 当前消息列表
 * @param event SSE 事件
 * @param context 本次流式请求的本地上下文
 * @returns 更新后的消息列表
 */
export function applySseEvent(
  messages: ChatMessage[],
  event: SSEEvent,
  context: StreamEventContext,
): ChatMessage[] {
  switch (event.type) {
    case 'message-start':
      return applyMessageStart(messages, event, context)
    case 'status':
      return updateMessageState(messages, event.messageId, (message) => ({
        ...message,
        status: event.status,
        error: event.error ?? (event.status === 'error' ? message.error ?? '请求失败' : null),
      }))
    case 'text-delta':
      return updateMessageState(messages, event.messageId, (message) => ({
        ...message,
        content: `${message.content}${event.text}`,
        status: 'streaming',
      }))
    case 'tool-call':
      return updateMessageState(messages, event.messageId, (message) => ({
        ...message,
        toolCalls: [
          ...(message.toolCalls ?? []),
          {
            toolName: event.toolName,
            input: stringifyPayload(event.input),
          },
        ],
        status: 'streaming',
      }))
    case 'tool-result':
      return updateMessageState(messages, event.messageId, (message) => ({
        ...message,
        toolResults: [
          ...(message.toolResults ?? []),
          {
            toolName: event.toolName,
            output: stringifyPayload(event.output),
          },
        ],
        status: 'streaming',
      }))
    case 'message-patch':
      return updateMessageState(messages, event.messageId, (message) => ({
        ...message,
        content: event.content,
        ...(event.parts ? { parts: event.parts } : {}),
      }))
    case 'message-metadata':
      return updateMessageState(messages, event.messageId, (message) => ({
        ...message,
        metadata: event.metadata,
      }))
    case 'finish':
      return updateMessageState(messages, event.messageId, (message) => ({
        ...message,
        status: event.status,
      }))
    case 'error':
      return context.requestKind === 'send' && context.optimisticAssistantId
        ? applyRequestError(messages, context.optimisticAssistantId, event.error)
        : context.targetMessageId
          ? applyRequestError(messages, context.targetMessageId, event.error)
          : messages
  }
}

/**
 * 把请求级错误写回指定消息。
 * @param messages 当前消息列表
 * @param messageId 目标消息 ID
 * @param error 原始错误
 * @returns 更新后的消息列表
 */
export function applyRequestError(
  messages: ChatMessage[],
  messageId: string,
  error: Error | string | null | undefined,
): ChatMessage[] {
  const errorMessage =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '未知错误'

  return updateMessageState(messages, messageId, (message) => ({
    ...message,
    status: 'error',
    error: errorMessage,
    ...(message.metadata?.visionFallback?.state === 'transcribing'
      ? { metadata: undefined }
      : {}),
  }))
}

/**
 * 判断最后一条消息是否是可重试的 assistant 回复。
 * @param messages 当前消息列表
 * @returns 可重试消息 ID；不存在时返回 null
 */
export function getRetryableMessageId(messages: ChatMessage[]): string | null {
  const lastMessage = messages[messages.length - 1]
  if (
    lastMessage?.role === 'assistant' &&
    lastMessage.id &&
    ['completed', 'stopped', 'error'].includes(lastMessage.status)
  ) {
    return lastMessage.id
  }

  return null
}

function applyMessageStart(
  messages: ChatMessage[],
  event: Extract<SSEEvent, { type: 'message-start' }>,
  context: StreamEventContext,
) {
  let nextMessages = messages

  if (event.userMessage) {
    nextMessages = replaceOrAppendMessage(
      nextMessages,
      dbMessageToChat(event.userMessage),
      context.optimisticUserId,
    )
  }

  return replaceOrAppendMessage(
    nextMessages,
    dbMessageToChat(event.assistantMessage),
    context.requestKind === 'send'
      ? context.optimisticAssistantId
      : context.targetMessageId,
  )
}

function updateMessageState(
  messages: ChatMessage[],
  messageId: string,
  updater: (message: ChatMessage) => ChatMessage,
) {
  const index = findMessageIndex(messages, messageId)
  return index >= 0 ? replaceMessageAt(messages, index, updater(messages[index])) : messages
}

function findMessageIndex(messages: ChatMessage[], messageId: string) {
  return messages.findIndex((message) => message.id === messageId)
}

/**
 * 查找与真实消息 ID 或临时 fallback ID 命中的消息下标。
 * @param messages 当前消息列表
 * @param messageId 真实消息 ID
 * @param fallbackId 临时消息 ID
 * @returns 所有命中的消息下标
 */
function findMatchedMessageIndexes(
  messages: ChatMessage[],
  messageId?: string,
  fallbackId?: string,
) {
  const candidateIds = [messageId, fallbackId].filter(
    (id): id is string => Boolean(id),
  )
  if (candidateIds.length === 0) {
    return []
  }

  return messages.reduce<number[]>((indexes, currentMessage, index) => {
    if (currentMessage.id && candidateIds.includes(currentMessage.id)) {
      indexes.push(index)
    }

    return indexes
  }, [])
}

/**
 * 把同一条消息的真实记录与临时占位记录合并成一条。
 * @param messages 当前消息列表
 * @param matchedIndexes 命中的消息下标
 * @param nextMessage 替换后的最终消息
 * @returns 去重并替换后的消息列表
 */
function replaceMatchedMessages(
  messages: ChatMessage[],
  matchedIndexes: number[],
  nextMessage: ChatMessage,
) {
  const anchorIndex = matchedIndexes[0]
  const matchedSet = new Set(matchedIndexes)
  const remainingMessages = messages.filter((_, index) => !matchedSet.has(index))

  const insertIndex = Math.min(anchorIndex, remainingMessages.length)
  return [
    ...remainingMessages.slice(0, insertIndex),
    nextMessage,
    ...remainingMessages.slice(insertIndex),
  ]
}

function replaceMessageAt(messages: ChatMessage[], index: number, message: ChatMessage) {
  return [
    ...messages.slice(0, index),
    message,
    ...messages.slice(index + 1),
  ]
}

import type {
  Conversation,
  SendMessagePayload,
  UpdateMessagePayload,
} from '@garlic-claw/shared'
import {
  createConversation,
  deleteConversation,
  deleteConversationMessage,
  getConversation,
  listConversations,
  retryMessageSSE,
  sendMessageSSE,
  stopConversationMessage,
  updateConversationMessage,
} from '@/features/chat/api/chat'
import { dbMessageToChat } from '@/features/chat/store/chat-store.helpers'
import type { ChatMessage } from '@/features/chat/store/chat-store.types'

export function loadConversationList(): Promise<Conversation[]> {
  return listConversations()
}

export function createConversationRecord(title?: string): Promise<Conversation> {
  return createConversation(title)
}

export function deleteConversationRecord(conversationId: string) {
  return deleteConversation(conversationId)
}

export async function loadConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const detail = await getConversation(conversationId)
  return detail.messages.map(dbMessageToChat)
}

export function sendConversationMessage(
  conversationId: string,
  payload: SendMessagePayload,
  onEvent: Parameters<typeof sendMessageSSE>[2],
  signal?: AbortSignal,
) {
  return sendMessageSSE(conversationId, payload, onEvent, signal)
}

export function retryConversationMessage(
  conversationId: string,
  messageId: string,
  payload: {
    provider?: string
    model?: string
  },
  onEvent: Parameters<typeof retryMessageSSE>[3],
  signal?: AbortSignal,
) {
  return retryMessageSSE(conversationId, messageId, payload, onEvent, signal)
}

export async function updateConversationMessageRecord(
  conversationId: string,
  messageId: string,
  payload: UpdateMessagePayload,
): Promise<ChatMessage> {
  return dbMessageToChat(
    await updateConversationMessage(conversationId, messageId, payload),
  )
}

export function deleteConversationMessageRecord(conversationId: string, messageId: string) {
  return deleteConversationMessage(conversationId, messageId)
}

export async function stopConversationMessageRecord(
  conversationId: string,
  messageId: string,
): Promise<{ message: string }> {
  return stopConversationMessage(conversationId, messageId)
}

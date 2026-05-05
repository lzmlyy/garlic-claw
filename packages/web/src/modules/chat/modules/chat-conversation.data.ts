import type {
  Conversation,
  ConversationContextWindowPreview,
  ConversationTodoItem,
  RuntimePermissionDecision,
  RuntimePermissionReplyResult,
  RuntimePermissionRequest,
  SendMessagePayload,
  UpdateMessagePayload,
} from '@garlic-claw/shared'
import {
  createConversation,
  deleteConversation,
  deleteConversationMessage,
  getConversation,
  getConversationContextWindow,
  getConversationTodo,
  listConversations,
  listPendingRuntimePermissions,
  replyRuntimePermission,
  retryMessageSSE,
  sendMessageSSE,
  stopConversationMessage,
  streamConversationEventsSSE,
  updateConversationMessage,
} from '@/modules/chat/api/chat'
import { dbMessageToChat } from '@/modules/chat/store/chat-store.helpers'
import type { ChatMessage } from '@/modules/chat/store/chat-store.types'

const loadedConversationRunningState = new Map<string, boolean>()
const loadedConversationKinds = new Map<string, Conversation['kind']>()

export function loadConversationList(): Promise<Conversation[]> {
  return listConversations()
}

export function createConversationRecord(title?: string): Promise<Conversation> {
  return createConversation(title)
}

export function deleteConversationRecord(conversationId: string) {
  loadedConversationRunningState.delete(conversationId)
  loadedConversationKinds.delete(conversationId)
  return deleteConversation(conversationId)
}

export async function loadConversationMessages(conversationId: string): Promise<ChatMessage[]> {
  const detail = await getConversation(conversationId)
  loadedConversationKinds.set(conversationId, detail.kind)
  loadedConversationRunningState.set(
    conversationId,
    Boolean(
      detail.isRunning
      || detail.subagent?.status === 'queued'
      || detail.subagent?.status === 'running',
    ),
  )
  return detail.messages.map(dbMessageToChat)
}

export function readLoadedConversationRunningState(conversationId: string): boolean {
  return loadedConversationRunningState.get(conversationId) ?? false
}

export function readLoadedConversationKind(conversationId: string): Conversation['kind'] {
  return loadedConversationKinds.get(conversationId)
}

export function loadConversationTodoRecord(
  conversationId: string,
): Promise<ConversationTodoItem[]> {
  return getConversationTodo(conversationId)
}

export function loadConversationContextWindowRecord(
  conversationId: string,
  payload: {
    providerId?: string | null
    modelId?: string | null
  },
): Promise<ConversationContextWindowPreview> {
  return getConversationContextWindow(conversationId, {
    ...(payload.providerId ? { providerId: payload.providerId } : {}),
    ...(payload.modelId ? { modelId: payload.modelId } : {}),
  })
}

export function loadPendingRuntimePermissionsRecord(
  conversationId: string,
): Promise<RuntimePermissionRequest[]> {
  return listPendingRuntimePermissions(conversationId)
}

export function replyRuntimePermissionRecord(
  conversationId: string,
  requestId: string,
  decision: RuntimePermissionDecision,
): Promise<RuntimePermissionReplyResult> {
  return replyRuntimePermission(conversationId, requestId, decision)
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

export function streamConversationEvents(
  conversationId: string,
  onEvent: Parameters<typeof streamConversationEventsSSE>[1],
  signal?: AbortSignal,
) {
  return streamConversationEventsSSE(conversationId, onEvent, signal)
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

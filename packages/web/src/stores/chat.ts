import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { ChatMessagePart, Conversation } from '@garlic-claw/shared'
import * as api from '../api'
import { dbMessageToChat, findActiveAssistantMessageId, findLatestAssistantSelection, normalizeSendInput, resolveChatModelSelection } from './chat-store.helpers'
import { applyRequestError, applySseEvent, buildOptimisticAssistantMessage, buildOptimisticUserMessage, createTemporaryMessageId, getRetryableMessageId, removeMessage, replaceMessage, replaceOrAppendMessage } from './chat-store.runtime'
import { startChatRecoveryPolling, stopChatRecoveryPolling } from './chat-store.polling'
import type { ChatMessage, ChatSendInput } from './chat-store.types'

export type { ChatMessage, ChatSendInput } from './chat-store.types'

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const currentConversationId = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const streaming = ref(false)
  const currentStreamingMessageId = ref<string | null>(null)
  const streamController = ref<AbortController | null>(null)
  const recoveryTimer = ref<number | null>(null)
  const selectedProvider = ref<string | null>(null)
  const selectedModel = ref<string | null>(null)

  const retryableMessageId = computed(() => getRetryableMessageId(messages.value))

  async function loadConversations() {
    conversations.value = await api.listConversations()
  }

  async function createConversation(title?: string) {
    const conversation = await api.createConversation(title)
    conversations.value.unshift(conversation)
    return conversation
  }

  async function selectConversation(id: string) {
    disconnectStreamConnection()
    stopRecovery()
    currentConversationId.value = id
    selectedProvider.value = null
    selectedModel.value = null
    loading.value = true
    try {
      await loadConversationDetail(id)
      await ensureModelSelection(messages.value)
      scheduleRecovery()
    } finally {
      loading.value = false
    }
  }

  async function deleteConversation(id: string) {
    if (currentConversationId.value === id) {
      disconnectStreamConnection()
      stopRecovery()
    }

    await api.deleteConversation(id)
    conversations.value = conversations.value.filter((conversation) => conversation.id !== id)
    if (currentConversationId.value === id) {
      currentConversationId.value = null
      messages.value = []
      syncStreamingState()
    }
  }

  function setModelSelection(selection: { provider: string | null; model: string | null }) {
    selectedProvider.value = selection.provider
    selectedModel.value = selection.model
  }

  async function ensureModelSelection(existingMessages: ChatMessage[] = []) {
    if (selectedProvider.value && selectedModel.value) {
      return
    }

    const preferred = findLatestAssistantSelection(existingMessages)
    const resolved = await resolveChatModelSelection(preferred)
    if (!resolved) {
      return
    }

    selectedProvider.value = resolved.providerId
    selectedModel.value = resolved.modelId
  }

  async function sendMessage(input: ChatSendInput) {
    if (!currentConversationId.value || streaming.value) {
      return
    }

    await ensureModelSelection(messages.value)
    const payload = normalizeSendInput({
      ...input,
      provider: input.provider ?? selectedProvider.value,
      model: input.model ?? selectedModel.value,
    })
    if (!payload.content && !payload.parts?.length) {
      return
    }

    selectedProvider.value = payload.provider ?? selectedProvider.value
    selectedModel.value = payload.model ?? selectedModel.value

    const requestConversationId = currentConversationId.value
    const optimisticUserId = createTemporaryMessageId('user')
    const optimisticAssistantId = createTemporaryMessageId('assistant')
    messages.value.push(
      buildOptimisticUserMessage(optimisticUserId, payload.content, payload.parts),
      buildOptimisticAssistantMessage(
        optimisticAssistantId,
        payload.provider ?? null,
        payload.model ?? null,
      ),
    )
    syncStreamingState()

    const controller = new AbortController()
    streamController.value = controller
    stopRecovery()

    try {
      await api.sendMessageSSE(
        requestConversationId,
        payload,
        (event) => {
          if (currentConversationId.value !== requestConversationId) {
            return
          }

          messages.value = applySseEvent(messages.value, event, {
            requestKind: 'send',
            optimisticUserId,
            optimisticAssistantId,
          })
          syncStreamingState()
        },
        controller.signal,
      )
    } catch (error) {
      const requestError = error instanceof Error ? error : new Error(typeof error === 'string' ? error : '未知错误')
      if (requestError?.name !== 'AbortError' && currentConversationId.value === requestConversationId) {
        messages.value = applyRequestError(
          messages.value,
          optimisticAssistantId,
          requestError,
        )
        syncStreamingState()
      }
    } finally {
      if (streamController.value === controller) {
        streamController.value = null
      }

      if (currentConversationId.value === requestConversationId) {
        scheduleRecovery()
      }
    }
  }

  async function retryMessage(messageId: string) {
    if (!currentConversationId.value || streaming.value) {
      return
    }

    const requestConversationId = currentConversationId.value
    const targetIndex = messages.value.findIndex((message) => message.id === messageId)
    if (targetIndex < 0) {
      return
    }

    const previousMessage = messages.value[targetIndex]
    messages.value = replaceMessage(messages.value, messageId, {
      ...previousMessage,
      content: '',
      toolCalls: [],
      toolResults: [],
      provider: selectedProvider.value,
      model: selectedModel.value,
      status: 'pending',
      error: null,
    })
    syncStreamingState()

    const controller = new AbortController()
    streamController.value = controller
    stopRecovery()

    try {
      await api.retryMessageSSE(
        requestConversationId,
        messageId,
        {
          provider: selectedProvider.value ?? undefined,
          model: selectedModel.value ?? undefined,
        },
        (event) => {
          if (currentConversationId.value !== requestConversationId) {
            return
          }

          messages.value = applySseEvent(messages.value, event, {
            requestKind: 'retry',
            targetMessageId: messageId,
          })
          syncStreamingState()
        },
        controller.signal,
      )
    } catch (error) {
      const requestError = error instanceof Error ? error : new Error(typeof error === 'string' ? error : '未知错误')
      if (requestError?.name !== 'AbortError' && currentConversationId.value === requestConversationId) {
        messages.value = applyRequestError(
          messages.value,
          messageId,
          requestError,
        )
        syncStreamingState()
      }
    } finally {
      if (streamController.value === controller) {
        streamController.value = null
      }

      if (currentConversationId.value === requestConversationId) {
        scheduleRecovery()
      }
    }
  }

  async function updateMessage(messageId: string, payload: { content?: string; parts?: ChatMessagePart[] }) {
    if (!currentConversationId.value) {
      return
    }

    const updated = await api.updateConversationMessage(currentConversationId.value, messageId, payload)
    messages.value = replaceOrAppendMessage(
      messages.value,
      dbMessageToChat(updated),
      messageId,
    )
    syncStreamingState()
  }

  async function deleteMessage(messageId: string) {
    if (!currentConversationId.value) {
      return
    }

    await api.deleteConversationMessage(currentConversationId.value, messageId)
    messages.value = removeMessage(messages.value, messageId)
    syncStreamingState()
  }

  async function stopStreaming() {
    if (!currentConversationId.value || !currentStreamingMessageId.value) {
      return
    }

    const message = await api.stopConversationMessage(
      currentConversationId.value,
      currentStreamingMessageId.value,
    )
    messages.value = replaceOrAppendMessage(
      messages.value,
      dbMessageToChat(message),
      currentStreamingMessageId.value,
    )
    syncStreamingState()
    scheduleRecovery()
  }

  async function loadConversationDetail(conversationId: string) {
    const detail = await api.getConversation(conversationId)
    messages.value = detail.messages.map(dbMessageToChat)
    syncStreamingState()
  }

  function syncStreamingState() {
    currentStreamingMessageId.value = findActiveAssistantMessageId(messages.value)
    streaming.value = Boolean(currentStreamingMessageId.value)
  }

  function disconnectStreamConnection() {
    streamController.value?.abort()
    streamController.value = null
  }

  function scheduleRecovery() {
    startChatRecoveryPolling({
      recoveryTimer,
      streamController,
      currentConversationId,
      isStreaming: () => streaming.value,
      loadConversationDetail,
    })
  }

  function stopRecovery() {
    stopChatRecoveryPolling(recoveryTimer)
  }

  return {
    conversations,
    currentConversationId,
    messages,
    loading,
    streaming,
    currentStreamingMessageId,
    retryableMessageId,
    selectedProvider,
    selectedModel,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    setModelSelection,
    ensureModelSelection,
    sendMessage,
    retryMessage,
    updateMessage,
    deleteMessage,
    stopStreaming,
  }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Conversation, Message, SSEEvent } from '../api'
import * as api from '../api'

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'system'
  content: string
  toolCalls?: { toolName: string; input: unknown }[]
  toolResults?: { toolName: string; output: unknown }[]
  streaming?: boolean
}

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([])
  const currentConversationId = ref<string | null>(null)
  const messages = ref<ChatMessage[]>([])
  const loading = ref(false)
  const streaming = ref(false)
  const abortController = ref<AbortController | null>(null)

  async function loadConversations() {
    conversations.value = await api.listConversations()
  }

  async function createConversation(title?: string) {
    const conv = await api.createConversation(title)
    conversations.value.unshift(conv)
    return conv
  }

  async function selectConversation(id: string) {
    currentConversationId.value = id
    loading.value = true
    try {
      const detail = await api.getConversation(id)
      messages.value = detail.messages.map(dbToChat)
    } finally {
      loading.value = false
    }
  }

  async function deleteConversation(id: string) {
    await api.deleteConversation(id)
    conversations.value = conversations.value.filter((c) => c.id !== id)
    if (currentConversationId.value === id) {
      currentConversationId.value = null
      messages.value = []
    }
  }

  async function sendMessage(content: string) {
    if (!currentConversationId.value || streaming.value) return

    // 添加用户消息
    messages.value.push({ role: 'user', content })

    // 添加占位符助手消息
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: '',
      toolCalls: [],
      toolResults: [],
      streaming: true,
    }
    messages.value.push(assistantMsg)

    streaming.value = true
    abortController.value = new AbortController()

    try {
      await api.sendMessageSSE(
        currentConversationId.value,
        content,
        (event: SSEEvent) => {
          switch (event.type) {
            case 'text-delta':
              assistantMsg.content += event.text
              break
            case 'tool-call':
              assistantMsg.toolCalls!.push({
                toolName: event.toolName,
                input: event.input,
              })
              break
            case 'tool-result':
              assistantMsg.toolResults!.push({
                toolName: event.toolName,
                output: event.output,
              })
              break
            case 'finish':
              assistantMsg.streaming = false
              break
            case 'error':
              assistantMsg.content += `\n\n**错误:** ${event.error}`
              assistantMsg.streaming = false
              break
          }
        },
        abortController.value.signal,
      )
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        assistantMsg.content += `\n\n**错误:** ${(e as Error).message}`
      }
    } finally {
      assistantMsg.streaming = false
      streaming.value = false
      abortController.value = null
    }
  }

  function stopStreaming() {
    abortController.value?.abort()
  }

  function dbToChat(m: Message): ChatMessage {
    return {
      id: m.id,
      role: m.role as ChatMessage['role'],
      content: m.content || '',
      toolCalls: m.toolCalls ? JSON.parse(m.toolCalls) : undefined,
      toolResults: m.toolResults ? JSON.parse(m.toolResults) : undefined,
    }
  }

  return {
    conversations,
    currentConversationId,
    messages,
    loading,
    streaming,
    loadConversations,
    createConversation,
    selectConversation,
    deleteConversation,
    sendMessage,
    stopStreaming,
  }
})

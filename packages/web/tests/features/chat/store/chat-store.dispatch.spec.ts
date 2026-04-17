import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/features/chat/store/chat-store.types'
import {
  dispatchSendMessage,
  syncChatStreamingState,
} from '@/features/chat/modules/chat-stream.module'
import * as chatConversationData from '@/features/chat/modules/chat-conversation.data'

vi.mock('@/features/chat/modules/chat-conversation.data', () => ({
  sendConversationMessage: vi.fn(),
  retryConversationMessage: vi.fn(),
  loadConversationMessages: vi.fn(),
}))

function createState(messages: ChatMessage[] = []) {
  const state = {
    currentConversationId: ref<string | null>('conversation-1'),
    messages: ref<ChatMessage[]>(messages),
    selectedProvider: ref<string | null>('demo-provider'),
    selectedModel: ref<string | null>('demo-model'),
    streamController: ref<AbortController | null>(null),
    recoveryTimer: ref<number | null>(null),
    currentStreamingMessageId: ref<string | null>(null),
    streaming: ref(false),
  }

  syncChatStreamingState(state)
  return state
}

describe('dispatchSendMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('writes request failures back onto the optimistic assistant placeholder', async () => {
    vi.mocked(chatConversationData.sendConversationMessage).mockRejectedValue(new Error('network down'))
    const state = createState()

    await dispatchSendMessage(state, {
      content: 'hello',
    })

    expect(chatConversationData.sendConversationMessage).toHaveBeenCalledWith(
      'conversation-1',
      {
        content: 'hello',
        provider: 'demo-provider',
        model: 'demo-model',
      },
      expect.any(Function),
      expect.any(AbortSignal),
    )
    expect(state.messages.value).toHaveLength(2)
    expect(state.messages.value[0]).toEqual(
      expect.objectContaining({
        role: 'user',
        content: 'hello',
        status: 'completed',
      }),
    )
    expect(state.messages.value[1]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        status: 'error',
        error: 'network down',
      }),
    )
    expect(state.streamController.value).toBeNull()
    expect(state.streaming.value).toBe(false)
  })
})

import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/features/chat/store/chat-store.types'
import {
  abortChatStream,
  discardPendingMessageUpdates,
  dispatchSendMessage,
  dispatchRetryMessage,
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
    vi.useRealTimers()
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

  it('refreshes summary during streaming and refreshes full state after stream completion', async () => {
    vi.mocked(chatConversationData.sendConversationMessage).mockImplementation(
      async (_conversationId, _payload, onEvent) => {
        onEvent({
          type: 'message-start',
          assistantMessage: {
            id: 'assistant-1',
            role: 'assistant',
            content: '',
            status: 'pending',
          },
        })
      },
    )
    const state = createState()
    const refreshConversationSummary = vi.fn().mockResolvedValue(undefined)
    const refreshConversationState = vi.fn().mockResolvedValue(undefined)

    await dispatchSendMessage(
      state,
      {
        content: 'hello',
      },
      {
        refreshConversationSummary,
        refreshConversationState,
      },
    )

    expect(refreshConversationSummary).toHaveBeenCalledTimes(1)
    expect(refreshConversationState).toHaveBeenCalledTimes(1)
  })

  it('swallows summary refresh failures during streaming and still completes final refresh', async () => {
    vi.mocked(chatConversationData.retryConversationMessage).mockImplementation(
      async (_conversationId, _messageId, _payload, onEvent) => {
        onEvent({
          type: 'message-start',
          assistantMessage: {
            id: 'assistant-1',
            role: 'assistant',
            content: '',
            status: 'pending',
          },
        })
      },
    )
    const state = createState([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'old',
        status: 'completed',
      },
    ])
    const refreshConversationSummary = vi.fn().mockRejectedValue(new Error('summary failed'))
    const refreshConversationState = vi.fn().mockResolvedValue(undefined)

    await expect(
      dispatchRetryMessage(
        state,
        'assistant-1',
        {
          refreshConversationSummary,
          refreshConversationState,
        },
      ),
    ).resolves.toBeUndefined()

    expect(refreshConversationSummary).toHaveBeenCalledTimes(1)
    expect(refreshConversationState).toHaveBeenCalledTimes(1)
  })

  it('does not fail a successful send when the final conversation refresh fails', async () => {
    vi.mocked(chatConversationData.sendConversationMessage).mockImplementation(
      async (_conversationId, _payload, onEvent) => {
        onEvent({
          type: 'message-start',
          assistantMessage: {
            id: 'assistant-1',
            role: 'assistant',
            content: '',
            status: 'pending',
          },
        })
      },
    )
    const state = createState()
    const refreshConversationSummary = vi.fn().mockResolvedValue(undefined)
    const refreshConversationState = vi.fn().mockRejectedValue(new Error('detail failed'))

    await expect(
      dispatchSendMessage(
        state,
        {
          content: 'hello',
        },
        {
          refreshConversationSummary,
          refreshConversationState,
        },
      ),
    ).resolves.toBeUndefined()

    expect(refreshConversationSummary).toHaveBeenCalledTimes(1)
    expect(refreshConversationState).toHaveBeenCalledTimes(1)
  })

  it('still refreshes the original conversation state after switching away during send', async () => {
    const state = createState()
    vi.mocked(chatConversationData.sendConversationMessage).mockImplementation(
      async () => {
        state.currentConversationId.value = 'conversation-2'
      },
    )
    const refreshConversationSummary = vi.fn().mockResolvedValue(undefined)
    const refreshConversationState = vi.fn().mockResolvedValue(undefined)

    await dispatchSendMessage(
      state,
      {
        content: 'hello',
      },
      {
        refreshConversationSummary,
        refreshConversationState,
      },
    )

    expect(refreshConversationSummary).toHaveBeenCalledTimes(0)
    expect(refreshConversationState).toHaveBeenCalledTimes(1)
  })

  it('still refreshes the original conversation state after switching away during retry', async () => {
    const state = createState([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'old',
        status: 'completed',
      },
    ])
    vi.mocked(chatConversationData.retryConversationMessage).mockImplementation(
      async () => {
        state.currentConversationId.value = 'conversation-2'
      },
    )
    const refreshConversationSummary = vi.fn().mockResolvedValue(undefined)
    const refreshConversationState = vi.fn().mockResolvedValue(undefined)

    await dispatchRetryMessage(
      state,
      'assistant-1',
      {
        refreshConversationSummary,
        refreshConversationState,
      },
    )

    expect(refreshConversationSummary).toHaveBeenCalledTimes(0)
    expect(refreshConversationState).toHaveBeenCalledTimes(1)
  })

  it('does not flush an old pending SSE batch into the newly selected conversation after switching away', async () => {
    vi.useFakeTimers()
    const state = createState()
    vi.mocked(chatConversationData.sendConversationMessage).mockImplementation(
      async (_conversationId, _payload, onEvent) => {
        onEvent({
          type: 'message-start',
          assistantMessage: {
            id: 'assistant-1',
            role: 'assistant',
            content: 'old conversation message',
            partsJson: null,
            toolCalls: null,
            toolResults: null,
            provider: null,
            model: null,
            status: 'streaming',
            error: null,
            createdAt: '2026-04-18T12:00:00.000Z',
            updatedAt: '2026-04-18T12:00:00.000Z',
          },
        })

        state.currentConversationId.value = 'conversation-2'
        state.messages.value = [
          {
            id: 'assistant-new',
            role: 'assistant',
            content: 'new conversation message',
            status: 'completed',
          },
        ]
        abortChatStream(state)
        discardPendingMessageUpdates(state)
      },
    )

    await dispatchSendMessage(state, {
      content: 'hello',
    })
    await vi.runAllTimersAsync()

    expect(state.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-new',
        content: 'new conversation message',
      }),
    ])
  })
})

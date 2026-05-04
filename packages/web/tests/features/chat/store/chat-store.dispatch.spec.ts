import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatMessage } from '@/modules/chat/store/chat-store.types'
import { BusinessError } from '@/shared/utils/error'
import {
  attachConversationStream,
  abortChatStream,
  discardPendingMessageUpdates,
  dispatchSendMessage,
  dispatchRetryMessage,
  syncChatStreamingState,
} from '@/modules/chat/modules/chat-stream.module'
import * as chatConversationData from '@/modules/chat/modules/chat-conversation.data'

vi.mock('@/modules/chat/modules/chat-conversation.data', () => ({
  sendConversationMessage: vi.fn(),
  retryConversationMessage: vi.fn(),
  loadConversationMessages: vi.fn(),
  streamConversationEvents: vi.fn(),
}))

function createState(messages: ChatMessage[] = []) {
  const state = {
    currentConversationId: ref<string | null>('conversation-1'),
    contextWindowPreview: ref(null),
    messages: ref<ChatMessage[]>(messages),
    pendingRuntimePermissions: ref([]),
    todoItems: ref([]),
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

  it('does not mark the optimistic assistant as failed when the local stream observer aborts', async () => {
    vi.mocked(chatConversationData.sendConversationMessage).mockRejectedValue(
      new BusinessError('请求已取消', {
        code: 'ABORTED',
      }),
    )
    const state = createState()

    await dispatchSendMessage(state, {
      content: 'hello',
    })

    expect(state.messages.value).toHaveLength(2)
    expect(state.messages.value[1]).toEqual(
      expect.objectContaining({
        role: 'assistant',
        status: 'pending',
        error: null,
      }),
    )
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
    expect(refreshConversationState).toHaveBeenCalledWith({
      permissionStateChanged: false,
      summaryRefreshed: true,
    })
  })

  it('requests an immediate conversation snapshot refresh when auto-compaction continuation starts', async () => {
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
        onEvent({
          type: 'message-start',
          userMessage: {
            id: 'user-continue-1',
            role: 'user',
            content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
            partsJson: JSON.stringify([
              {
                type: 'text',
                text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
              },
            ]),
            toolCalls: null,
            toolResults: null,
            metadataJson: JSON.stringify({
              annotations: [
                {
                  data: {
                    role: 'continue',
                    synthetic: true,
                    trigger: 'after-response',
                  },
                  owner: 'conversation.context-governance',
                  type: 'context-compaction',
                  version: '1',
                },
              ],
            }),
            provider: null,
            model: null,
            status: 'completed',
            error: null,
            createdAt: '2026-05-03T14:00:00.000Z',
            updatedAt: '2026-05-03T14:00:00.000Z',
          },
          assistantMessage: {
            id: 'assistant-2',
            role: 'assistant',
            content: '',
            partsJson: null,
            toolCalls: null,
            toolResults: null,
            metadataJson: null,
            provider: 'demo-provider',
            model: 'demo-model',
            status: 'pending',
            error: null,
            createdAt: '2026-05-03T14:00:01.000Z',
            updatedAt: '2026-05-03T14:00:01.000Z',
          },
        } as unknown as Parameters<typeof onEvent>[0])
      },
    )
    const state = createState()
    const refreshConversationSnapshot = vi.fn().mockResolvedValue(undefined)

    const params = {
      refreshConversationSnapshot,
    } as Parameters<typeof dispatchSendMessage>[2]

    await dispatchSendMessage(
      state,
      {
        content: 'hello',
      },
      params,
    )

    expect(refreshConversationSnapshot).toHaveBeenCalledTimes(1)
  })

  it('refreshes the auto-compaction snapshot before the stream resolves so the summary can appear immediately', async () => {
    let resolveStream: (() => void) | null = null
    let refreshHappenedBeforeStreamResolved = false
    let streamResolved = false
    vi.mocked(chatConversationData.sendConversationMessage).mockImplementation(
      async (_conversationId, _payload, onEvent) => new Promise<void>((resolve) => {
        onEvent({
          type: 'message-start',
          assistantMessage: {
            id: 'assistant-1',
            role: 'assistant',
            content: '',
            status: 'pending',
          },
        })
        onEvent({
          type: 'message-start',
          userMessage: {
            id: 'user-continue-1',
            role: 'user',
            content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
            partsJson: JSON.stringify([
              {
                type: 'text',
                text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
              },
            ]),
            toolCalls: null,
            toolResults: null,
            metadataJson: JSON.stringify({
              annotations: [
                {
                  data: {
                    role: 'continue',
                    synthetic: true,
                    trigger: 'after-response',
                  },
                  owner: 'conversation.context-governance',
                  type: 'context-compaction',
                  version: '1',
                },
              ],
            }),
            provider: null,
            model: null,
            status: 'completed',
            error: null,
            createdAt: '2026-05-03T14:00:00.000Z',
            updatedAt: '2026-05-03T14:00:00.000Z',
          },
          assistantMessage: {
            id: 'assistant-2',
            role: 'assistant',
            content: '',
            partsJson: null,
            toolCalls: null,
            toolResults: null,
            metadataJson: null,
            provider: 'demo-provider',
            model: 'demo-model',
            status: 'pending',
            error: null,
            createdAt: '2026-05-03T14:00:01.000Z',
            updatedAt: '2026-05-03T14:00:01.000Z',
          },
        } as unknown as Parameters<typeof onEvent>[0])
        resolveStream = () => {
          streamResolved = true
          resolve()
        }
      }),
    )
    const state = createState()
    const refreshConversationSnapshot = vi.fn().mockImplementation(async () => {
      refreshHappenedBeforeStreamResolved = !streamResolved
    })

    const sendTask = dispatchSendMessage(
      state,
      {
        content: 'hello',
      },
      {
        refreshConversationSnapshot,
      },
    )

    await Promise.resolve()

    expect(refreshConversationSnapshot).toHaveBeenCalledTimes(1)
    expect(refreshHappenedBeforeStreamResolved).toBe(true)

    resolveStream?.()
    await sendTask
  })

  it('requests an immediate conversation snapshot refresh when retry enters auto-compaction continuation', async () => {
    vi.mocked(chatConversationData.retryConversationMessage).mockImplementation(
      async (_conversationId, _messageId, _payload, onEvent) => {
        onEvent({
          type: 'message-start',
          userMessage: {
            id: 'user-continue-1',
            role: 'user',
            content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
            partsJson: JSON.stringify([
              {
                type: 'text',
                text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
              },
            ]),
            toolCalls: null,
            toolResults: null,
            metadataJson: JSON.stringify({
              annotations: [
                {
                  data: {
                    role: 'continue',
                    synthetic: true,
                    trigger: 'after-response',
                  },
                  owner: 'conversation.context-governance',
                  type: 'context-compaction',
                  version: '1',
                },
              ],
            }),
            provider: null,
            model: null,
            status: 'completed',
            error: null,
            createdAt: '2026-05-03T14:00:00.000Z',
            updatedAt: '2026-05-03T14:00:00.000Z',
          },
          assistantMessage: {
            id: 'assistant-2',
            role: 'assistant',
            content: '',
            partsJson: null,
            toolCalls: null,
            toolResults: null,
            metadataJson: null,
            provider: 'demo-provider',
            model: 'demo-model',
            status: 'pending',
            error: null,
            createdAt: '2026-05-03T14:00:01.000Z',
            updatedAt: '2026-05-03T14:00:01.000Z',
          },
        } as unknown as Parameters<typeof onEvent>[0])
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
    const refreshConversationSnapshot = vi.fn().mockResolvedValue(undefined)

    const params = {
      refreshConversationSnapshot,
    } as Parameters<typeof dispatchRetryMessage>[2]

    await dispatchRetryMessage(
      state,
      'assistant-1',
      params,
    )

    expect(refreshConversationSnapshot).toHaveBeenCalledTimes(1)
  })

  it('refreshes the retry auto-compaction snapshot before the stream resolves so the summary can appear immediately', async () => {
    let resolveStream: (() => void) | null = null
    let refreshHappenedBeforeStreamResolved = false
    let streamResolved = false
    vi.mocked(chatConversationData.retryConversationMessage).mockImplementation(
      async (_conversationId, _messageId, _payload, onEvent) => new Promise<void>((resolve) => {
        onEvent({
          type: 'message-start',
          userMessage: {
            id: 'user-continue-1',
            role: 'user',
            content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
            partsJson: JSON.stringify([
              {
                type: 'text',
                text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
              },
            ]),
            toolCalls: null,
            toolResults: null,
            metadataJson: JSON.stringify({
              annotations: [
                {
                  data: {
                    role: 'continue',
                    synthetic: true,
                    trigger: 'after-response',
                  },
                  owner: 'conversation.context-governance',
                  type: 'context-compaction',
                  version: '1',
                },
              ],
            }),
            provider: null,
            model: null,
            status: 'completed',
            error: null,
            createdAt: '2026-05-03T14:00:00.000Z',
            updatedAt: '2026-05-03T14:00:00.000Z',
          },
          assistantMessage: {
            id: 'assistant-2',
            role: 'assistant',
            content: '',
            partsJson: null,
            toolCalls: null,
            toolResults: null,
            metadataJson: null,
            provider: 'demo-provider',
            model: 'demo-model',
            status: 'pending',
            error: null,
            createdAt: '2026-05-03T14:00:01.000Z',
            updatedAt: '2026-05-03T14:00:01.000Z',
          },
        } as unknown as Parameters<typeof onEvent>[0])
        resolveStream = () => {
          streamResolved = true
          resolve()
        }
      }),
    )
    const state = createState([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'old',
        status: 'completed',
      },
    ])
    const refreshConversationSnapshot = vi.fn().mockImplementation(async () => {
      refreshHappenedBeforeStreamResolved = !streamResolved
    })

    const retryTask = dispatchRetryMessage(
      state,
      'assistant-1',
      {
        refreshConversationSnapshot,
      },
    )

    await Promise.resolve()

    expect(refreshConversationSnapshot).toHaveBeenCalledTimes(1)
    expect(refreshHappenedBeforeStreamResolved).toBe(true)

    resolveStream?.()
    await retryTask
  })

  it('applies message-start immediately so display command messages do not wait for stream completion', async () => {
    let capturedState: ReturnType<typeof createState> | null = null
    vi.mocked(chatConversationData.sendConversationMessage).mockImplementation(
      async (_conversationId, _payload, onEvent) => {
        onEvent({
          type: 'message-start',
          userMessage: {
            id: 'user-display-1',
            role: 'display',
            content: '/compact',
            partsJson: JSON.stringify([{ text: '/compact', type: 'text' }]),
            toolCalls: null,
            toolResults: null,
            metadataJson: JSON.stringify({
              annotations: [
                {
                  data: { variant: 'command' },
                  owner: 'conversation.display-message',
                  type: 'display-message',
                  version: '1',
                },
              ],
            }),
            provider: null,
            model: null,
            status: 'completed',
            error: null,
            createdAt: '2026-04-30T08:00:00.000Z',
            updatedAt: '2026-04-30T08:00:00.000Z',
          },
          assistantMessage: {
            id: 'assistant-display-1',
            role: 'display',
            content: '',
            partsJson: null,
            toolCalls: null,
            toolResults: null,
            metadataJson: JSON.stringify({
              annotations: [
                {
                  data: { variant: 'result' },
                  owner: 'conversation.display-message',
                  type: 'display-message',
                  version: '1',
                },
              ],
            }),
            provider: 'system',
            model: 'context-compaction-command',
            status: 'pending',
            error: null,
            createdAt: '2026-04-30T08:00:00.000Z',
            updatedAt: '2026-04-30T08:00:00.000Z',
          },
        })
        capturedState = state
      },
    )
    const state = createState()

    await dispatchSendMessage(state, {
      content: '/compact',
      optimisticAssistantRole: 'display',
      optimisticUserRole: 'display',
    })

    expect(capturedState?.messages.value).toEqual([
      expect.objectContaining({
        id: 'user-display-1',
        role: 'display',
        content: '/compact',
      }),
      expect.objectContaining({
        id: 'assistant-display-1',
        role: 'display',
        status: 'pending',
      }),
    ])
    expect(capturedState?.streaming.value).toBe(true)
  })

  it('applies tool events immediately while the stream is still open', async () => {
    vi.useFakeTimers()
    let resolveStream: (() => void) | null = null
    vi.mocked(chatConversationData.sendConversationMessage).mockImplementation(
      async (_conversationId, _payload, onEvent) => new Promise<void>((resolve) => {
        onEvent({
          type: 'message-start',
          assistantMessage: {
            id: 'assistant-1',
            role: 'assistant',
            content: '',
            partsJson: null,
            toolCalls: null,
            toolResults: null,
            metadataJson: null,
            provider: 'demo-provider',
            model: 'demo-model',
            status: 'pending',
            error: null,
            createdAt: '2026-05-04T12:00:00.000Z',
            updatedAt: '2026-05-04T12:00:00.000Z',
          },
        })
        onEvent({
          type: 'tool-call',
          messageId: 'assistant-1',
          toolCallId: 'tool-call-1',
          toolName: 'write',
          input: {
            content: 'hello',
            filePath: 'docs/output.txt',
          },
        })
        onEvent({
          type: 'tool-result',
          messageId: 'assistant-1',
          toolCallId: 'tool-call-1',
          toolName: 'write',
          output: {
            path: 'docs/output.txt',
            status: 'created',
          },
        })
        onEvent({
          type: 'finish',
          messageId: 'assistant-1',
          status: 'completed',
        })
        resolveStream = resolve
      }),
    )
    const state = createState()

    const sendTask = dispatchSendMessage(state, {
      content: 'hello',
    })
    await Promise.resolve()

    expect(state.messages.value).toEqual([
      expect.objectContaining({
        role: 'user',
        content: 'hello',
      }),
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        status: 'completed',
        toolCalls: [
          expect.objectContaining({
            toolCallId: 'tool-call-1',
            toolName: 'write',
          }),
        ],
        toolResults: [
          expect.objectContaining({
            toolCallId: 'tool-call-1',
            toolName: 'write',
          }),
        ],
      }),
    ])

    resolveStream?.()
    await sendTask
  })

  it('applies attached tool events immediately while an existing conversation stream is still open', async () => {
    vi.useFakeTimers()
    let resolveStream: (() => void) | null = null
    vi.mocked(chatConversationData.streamConversationEvents).mockImplementation(
      async (_conversationId, onEvent) => new Promise<void>((resolve) => {
        onEvent({
          type: 'tool-call',
          messageId: 'assistant-1',
          toolCallId: 'tool-call-1',
          toolName: 'read',
          input: {
            filePath: 'docs/plan.md',
          },
        })
        onEvent({
          type: 'tool-result',
          messageId: 'assistant-1',
          toolCallId: 'tool-call-1',
          toolName: 'read',
          output: {
            content: '阶段计划',
          },
        })
        onEvent({
          type: 'finish',
          messageId: 'assistant-1',
          status: 'completed',
        })
        resolveStream = resolve
      }),
    )
    const state = createState([
      {
        id: 'user-1',
        role: 'user',
        content: '继续执行',
        status: 'completed',
      },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        status: 'streaming',
        toolCalls: [],
        toolResults: [],
      },
    ])
    state.currentStreamingMessageId.value = 'assistant-1'
    state.streaming.value = true

    const attachTask = attachConversationStream(state, 'conversation-1')
    await Promise.resolve()

    expect(state.messages.value).toEqual([
      expect.objectContaining({
        id: 'user-1',
        role: 'user',
      }),
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        status: 'completed',
        toolCalls: [
          expect.objectContaining({
            toolCallId: 'tool-call-1',
            toolName: 'read',
          }),
        ],
        toolResults: [
          expect.objectContaining({
            toolCallId: 'tool-call-1',
            toolName: 'read',
          }),
        ],
      }),
    ])

    resolveStream?.()
    await attachTask
  })

  it('reloads conversation detail once after an attached stream ends during an idle continuation gap', async () => {
    let resolveStream: (() => void) | null = null
    vi.mocked(chatConversationData.streamConversationEvents).mockImplementation(
      async (_conversationId, onEvent) => new Promise<void>((resolve) => {
        onEvent({
          type: 'finish',
          messageId: 'assistant-1',
          status: 'completed',
        })
        resolveStream = resolve
      }),
    )
    const state = createState([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '首轮完成',
        status: 'streaming',
      },
    ])
    state.currentStreamingMessageId.value = 'assistant-1'
    state.streaming.value = true
    const loadConversationDetail = vi.fn().mockResolvedValue(undefined)

    const attachTask = attachConversationStream(state, 'conversation-1', {
      loadConversationDetail,
    })
    resolveStream?.()
    await attachTask

    expect(loadConversationDetail).toHaveBeenCalledWith('conversation-1')
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
    expect(refreshConversationState).toHaveBeenCalledWith({
      permissionStateChanged: false,
      summaryRefreshed: true,
    })
  })

  it('does not mark the retried assistant as failed when the local stream observer aborts', async () => {
    vi.mocked(chatConversationData.retryConversationMessage).mockRejectedValue(
      new BusinessError('请求已取消', {
        code: 'ABORTED',
      }),
    )
    const state = createState([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'old',
        status: 'completed',
      },
    ])

    await dispatchRetryMessage(state, 'assistant-1')

    expect(state.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        status: 'pending',
        error: null,
      }),
    ])
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
    expect(refreshConversationState).toHaveBeenCalledWith({
      permissionStateChanged: false,
      summaryRefreshed: true,
    })
  })

  it('does not wait for the final conversation refresh before resolving send', async () => {
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
    let resolveRefresh: (() => void) | null = null
    const refreshConversationState = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve
        }),
    )

    const completed = await Promise.race([
      dispatchSendMessage(
        state,
        {
          content: 'hello',
        },
        {
          refreshConversationState,
        },
      ).then(() => true),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 0)
      }),
    ])

    expect(completed).toBe(true)
    expect(refreshConversationState).toHaveBeenCalledTimes(1)
    resolveRefresh?.()
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
    expect(refreshConversationState).toHaveBeenCalledWith({
      permissionStateChanged: false,
      summaryRefreshed: false,
    })
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
    expect(refreshConversationState).toHaveBeenCalledWith({
      permissionStateChanged: false,
      summaryRefreshed: false,
    })
  })

  it('does not wait for the final conversation refresh before resolving retry', async () => {
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
    let resolveRefresh: (() => void) | null = null
    const refreshConversationState = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve
        }),
    )

    const completed = await Promise.race([
      dispatchRetryMessage(
        state,
        'assistant-1',
        {
          refreshConversationState,
        },
      ).then(() => true),
      new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 0)
      }),
    ])

    expect(completed).toBe(true)
    expect(refreshConversationState).toHaveBeenCalledTimes(1)
    resolveRefresh?.()
  })

  it('marks permission refresh as changed when the stream emitted permission events', async () => {
    vi.mocked(chatConversationData.sendConversationMessage).mockImplementation(
      async (_conversationId, _payload, onEvent) => {
        onEvent({
          type: 'permission-request',
          messageId: 'assistant-1',
          request: {
            id: 'permission-1',
            conversationId: 'conversation-1',
            backendKind: 'just-bash',
            toolName: 'bash',
            operations: ['command.execute'],
            createdAt: '2026-04-20T09:00:00.000Z',
            summary: '执行 pwd',
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

    expect(state.pendingRuntimePermissions.value).toEqual([
      expect.objectContaining({
        id: 'permission-1',
        toolName: 'bash',
      }),
    ])
    expect(refreshConversationSummary).toHaveBeenCalledTimes(0)
    expect(refreshConversationState).toHaveBeenCalledWith({
      permissionStateChanged: true,
      summaryRefreshed: false,
    })
  })

  it('applies todo-updated events directly to the current todo panel without forcing summary refresh', async () => {
    vi.mocked(chatConversationData.sendConversationMessage).mockImplementation(
      async (_conversationId, _payload, onEvent) => {
        onEvent({
          type: 'todo-updated',
          conversationId: 'conversation-1',
          todos: [
            {
              content: '同步 todo 面板',
              priority: 'high',
              status: 'in_progress',
            },
          ],
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

    expect(state.todoItems.value).toEqual([
      {
        content: '同步 todo 面板',
        priority: 'high',
        status: 'in_progress',
      },
    ])
    expect(refreshConversationSummary).not.toHaveBeenCalled()
    expect(refreshConversationState).toHaveBeenCalledWith({
      permissionStateChanged: false,
      summaryRefreshed: false,
    })
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

  it('kicks off an immediate detail recovery when send ends but the local stream is still marked active', async () => {
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
    const loadConversationDetail = vi.fn().mockResolvedValue(undefined)
    const refreshConversationState = vi.fn().mockResolvedValue(undefined)

    await dispatchSendMessage(
      state,
      {
        content: 'hello',
      },
      {
        loadConversationDetail,
        refreshConversationState,
      },
    )

    expect(refreshConversationState).toHaveBeenCalledTimes(1)
    expect(state.streaming.value).toBe(true)
    expect(loadConversationDetail).toHaveBeenCalledTimes(1)
    expect(loadConversationDetail).toHaveBeenCalledWith('conversation-1')
  })

  it('kicks off an immediate detail recovery when retry ends but the local stream is still marked active', async () => {
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
    const loadConversationDetail = vi.fn().mockResolvedValue(undefined)
    const refreshConversationState = vi.fn().mockResolvedValue(undefined)

    await dispatchRetryMessage(
      state,
      'assistant-1',
      {
        loadConversationDetail,
        refreshConversationState,
      },
    )

    expect(refreshConversationState).toHaveBeenCalledTimes(1)
    expect(state.streaming.value).toBe(true)
    expect(loadConversationDetail).toHaveBeenCalledTimes(1)
    expect(loadConversationDetail).toHaveBeenCalledWith('conversation-1')
  })
})

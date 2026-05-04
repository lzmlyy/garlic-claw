import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createChatStoreModule } from '@/modules/chat/modules/chat-store.module'
import { INTERNAL_CONFIG_CHANGED_EVENT } from '@/modules/ai-settings/internal-config-change'
import type { Conversation } from '@garlic-claw/shared'
import type { ChatMessage } from '@/modules/chat/store/chat-store.types'

vi.mock('@/modules/chat/modules/chat-conversation.data', () => ({
  createConversationRecord: vi.fn(),
  deleteConversationMessageRecord: vi.fn(),
  deleteConversationRecord: vi.fn(),
  loadConversationContextWindowRecord: vi.fn(),
  loadPendingRuntimePermissionsRecord: vi.fn(),
  loadConversationList: vi.fn(),
  loadConversationMessages: vi.fn(),
  loadConversationTodoRecord: vi.fn(),
  replyRuntimePermissionRecord: vi.fn(),
  stopConversationMessageRecord: vi.fn(),
  updateConversationMessageRecord: vi.fn(),
}))

vi.mock('@/modules/chat/modules/chat-stream.module', () => ({
  abortChatStream: vi.fn(),
  discardPendingMessageUpdates: vi.fn(),
  dispatchRetryMessage: vi.fn(),
  dispatchSendMessage: vi.fn(),
  scheduleChatRecoveryWithState: vi.fn(),
  stopChatRecovery: vi.fn(),
  syncChatStreamingState: vi.fn(),
}))

vi.mock('@/modules/chat/modules/chat-model-selection', () => ({
  ensureChatModelSelection: vi.fn(),
  findLatestAssistantSelection: vi.fn(() => ({
    providerId: null,
    modelId: null,
  })),
}))

import * as chatConversationData from '@/modules/chat/modules/chat-conversation.data'
import * as chatStreamModule from '@/modules/chat/modules/chat-stream.module'
import * as chatModelSelection from '@/modules/chat/modules/chat-model-selection'

describe('createChatStoreModule', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(chatConversationData.createConversationRecord).mockReset()
    vi.mocked(chatConversationData.deleteConversationMessageRecord).mockReset()
    vi.mocked(chatConversationData.deleteConversationRecord).mockReset()
    vi.mocked(chatConversationData.loadConversationContextWindowRecord).mockReset().mockResolvedValue({
      contextLength: 256,
      enabled: true,
      estimatedTokens: 80,
      excludedMessageIds: [],
      frontendMessageWindowSize: 200,
      includedMessageIds: [],
      keepRecentMessages: 6,
      source: 'estimated',
      slidingWindowUsagePercent: 50,
      strategy: 'summary',
    })
    vi.mocked(chatConversationData.loadPendingRuntimePermissionsRecord).mockReset().mockResolvedValue([])
    vi.mocked(chatConversationData.loadConversationList).mockReset().mockResolvedValue([])
    vi.mocked(chatConversationData.loadConversationMessages).mockReset().mockResolvedValue([])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockReset().mockResolvedValue([])
    vi.mocked(chatConversationData.replyRuntimePermissionRecord).mockReset().mockResolvedValue({
      requestId: 'permission-1',
      resolution: 'approved',
    })
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockReset()
    vi.mocked(chatConversationData.updateConversationMessageRecord).mockReset()
    vi.mocked(chatStreamModule.abortChatStream).mockReset()
    vi.mocked(chatStreamModule.discardPendingMessageUpdates).mockReset()
    vi.mocked(chatStreamModule.dispatchRetryMessage).mockReset().mockResolvedValue(undefined)
    vi.mocked(chatStreamModule.dispatchSendMessage).mockReset().mockResolvedValue(undefined)
    vi.mocked(chatStreamModule.scheduleChatRecoveryWithState).mockReset()
    vi.mocked(chatStreamModule.stopChatRecovery).mockReset()
    vi.mocked(chatStreamModule.syncChatStreamingState).mockReset()
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockReset().mockResolvedValue()
  })

  it('clears the current chat state when the selected conversation is no longer returned by the server', async () => {
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-2',
        title: '新的会话',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:00:00.000Z',
        _count: { messages: 0 },
      },
    ] satisfies Conversation[])

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.selectedProvider.value = 'smoke-ui-provider'
    store.selectedModel.value = 'smoke-ui-model'
    store.messages.value = [
      {
        role: 'user',
        content: 'smoke-ui chat message',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    await store.loadConversations()

    expect(store.conversations.value).toEqual([
      expect.objectContaining({
        id: 'conversation-2',
      }),
    ])
    expect(store.currentConversationId.value).toBeNull()
    expect(store.selectedProvider.value).toBeNull()
    expect(store.selectedModel.value).toBeNull()
    expect(store.todoItems.value).toEqual([])
    expect(store.messages.value).toEqual([])
    expect(chatStreamModule.abortChatStream).toHaveBeenCalledTimes(1)
    expect(chatStreamModule.stopChatRecovery).toHaveBeenCalledTimes(1)
    expect(chatStreamModule.syncChatStreamingState).toHaveBeenCalledTimes(1)
  })

  it('clears an invalid legacy conversation id before issuing conversation requests', async () => {
    const legacyConversationId = '11111111-1111-4111-8111-111111111111'
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      createChatMessage('message-1', '不会被读取'),
    ])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockResolvedValue([
      { content: '不会被读取', priority: 'medium', status: 'pending' },
    ])
    vi.mocked(chatConversationData.loadPendingRuntimePermissionsRecord).mockResolvedValue([
      {
        id: 'permission-1',
        conversationId: legacyConversationId,
        backendKind: 'just-bash',
        toolName: 'bash',
        operations: ['command.execute'],
        createdAt: '2026-04-20T09:00:00.000Z',
        summary: '不会被读取',
      },
    ])

    const store = createChatStoreModule()

    await store.selectConversation(legacyConversationId)

    expect(store.currentConversationId.value).toBeNull()
    expect(store.messages.value).toEqual([])
    expect(store.todoItems.value).toEqual([])
    expect(store.pendingRuntimePermissions.value).toEqual([])
    expect(chatConversationData.loadConversationMessages).not.toHaveBeenCalled()
    expect(chatConversationData.loadConversationTodoRecord).not.toHaveBeenCalled()
    expect(chatConversationData.loadPendingRuntimePermissionsRecord).not.toHaveBeenCalled()
  })

  it('refreshes conversation-related state after a streamed send finishes', async () => {
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '更新后的标题',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:05:00.000Z',
        _count: { messages: 2 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '已同步最新消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()
    vi.mocked(chatStreamModule.dispatchSendMessage).mockImplementation(
      async (state, _input, params) => {
        state.todoItems.value = [
          {
            content: '更新会话摘要',
            priority: 'high',
            status: 'in_progress',
          },
        ]
        await params?.refreshConversationSummary?.()
        await params?.refreshConversationState?.({ summaryRefreshed: true })
      },
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    await store.sendMessage({
      content: '你好',
    })

    expect(chatStreamModule.dispatchSendMessage).toHaveBeenCalledTimes(1)
    expect(chatConversationData.loadConversationList).toHaveBeenCalledTimes(1)
    expect(chatConversationData.loadConversationMessages).not.toHaveBeenCalled()
    expect(chatConversationData.loadPendingRuntimePermissionsRecord).not.toHaveBeenCalled()
    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledTimes(1)
    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledWith(
      'conversation-1',
      {
        modelId: null,
        providerId: null,
      },
    )
    expect(chatConversationData.loadConversationTodoRecord).not.toHaveBeenCalled()
    expect(store.conversations.value).toEqual([
      expect.objectContaining({
        id: 'conversation-1',
        title: '更新后的标题',
      }),
    ])
    expect(store.messages.value).toEqual([])
    expect(store.todoItems.value).toEqual([
      expect.objectContaining({
        content: '更新会话摘要',
      }),
    ])
  })

  it('refreshes the conversation snapshot immediately when auto-compaction continuation starts', async () => {
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'display-summary-1',
        role: 'display',
        content: '压缩摘要',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
      {
        id: 'assistant-2',
        role: 'assistant',
        content: '',
        status: 'pending',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: 'provider-stream',
        model: 'model-stream',
      },
    ])
    vi.mocked(chatConversationData.loadConversationContextWindowRecord).mockResolvedValue({
      contextLength: 100000,
      enabled: true,
      estimatedTokens: 8200,
      excludedMessageIds: [],
      frontendMessageWindowSize: 200,
      includedMessageIds: ['display-summary-1', 'assistant-2'],
      keepRecentMessages: 0,
      source: 'provider',
      slidingWindowUsagePercent: 80,
      strategy: 'summary',
    })
    vi.mocked(chatStreamModule.dispatchSendMessage).mockImplementation(
      async (_state, _input, params) => {
        await (params as {
          refreshConversationSnapshot?: () => Promise<void>;
        } | undefined)?.refreshConversationSnapshot?.()
      },
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.selectedProvider.value = 'provider-stream'
    store.selectedModel.value = 'model-stream'

    await store.sendMessage({
      content: '继续执行',
    })

    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledWith(
      'conversation-1',
      {
        modelId: 'model-stream',
        providerId: 'provider-stream',
      },
    )
    expect(chatConversationData.loadConversationMessages).toHaveBeenCalledWith('conversation-1')
    expect(store.contextWindowPreview.value).toEqual(
      expect.objectContaining({
        estimatedTokens: 8200,
        strategy: 'summary',
      }),
    )
    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'display-summary-1',
        role: 'display',
      }),
      expect.objectContaining({
        id: 'assistant-2',
        role: 'assistant',
      }),
    ])
  })

  it('still sends messages when the context window preview request fails', async () => {
    vi.mocked(chatConversationData.loadConversationContextWindowRecord).mockRejectedValue(
      new Error('preview failed'),
    )
    vi.mocked(chatStreamModule.dispatchSendMessage).mockResolvedValue(undefined)
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    await store.sendMessage({
      content: '你好',
    })

    expect(chatStreamModule.dispatchSendMessage).toHaveBeenCalledTimes(1)
  })

  it('queues later messages while streaming and drains them after the current reply completes', async () => {
    const store = createChatStoreModule()
    let queuedSendTask: Promise<void> | null = null
    vi.mocked(chatStreamModule.dispatchSendMessage).mockImplementationOnce(
      async (state) => {
        state.streaming.value = true
        queuedSendTask = store.sendMessage({
          content: '第二条',
        })
        state.streaming.value = false
        await queuedSendTask
      },
    )
    vi.mocked(chatStreamModule.dispatchSendMessage).mockResolvedValueOnce(undefined)

    store.currentConversationId.value = 'conversation-1'

    await store.sendMessage({
      content: '第一条',
    })

    expect(chatStreamModule.dispatchSendMessage).toHaveBeenCalledTimes(2)
    expect(chatStreamModule.dispatchSendMessage).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({
        content: '第二条',
      }),
      expect.any(Object),
    )
    expect(store.queuedSendCount.value).toBe(0)
  })

  it('keeps a send request on the original conversation when model selection resolves after the user switches conversations', async () => {
    let resolveSelection: (() => void) | null = null
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockImplementation(
      async ({ selectedProvider, selectedModel, selectedSource, shouldApply }) =>
        new Promise((resolve) => {
          resolveSelection = () => {
            if (!shouldApply || shouldApply()) {
              selectedProvider.value = 'provider-a'
              selectedModel.value = 'model-a'
              if (selectedSource) {
                selectedSource.value = 'default'
              }
            }
            resolve({
              modelId: 'model-a',
              providerId: 'provider-a',
              source: 'default',
            })
          }
        }),
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    const sendTask = store.sendMessage({
      content: '旧会话消息',
    })
    store.currentConversationId.value = 'conversation-2'
    resolveSelection?.()
    await sendTask

    expect(chatStreamModule.dispatchSendMessage).not.toHaveBeenCalled()
    expect(store.selectedProvider.value).toBeNull()
    expect(store.selectedModel.value).toBeNull()
    expect(store.queuedSendCount.value).toBe(0)

    store.currentConversationId.value = 'conversation-1'
    expect(store.popQueuedSendRequestTail()).toEqual({
      content: '旧会话消息',
      model: 'model-a',
      provider: 'provider-a',
    })
  })

  it('waits for the stop request to finish before draining queued messages', async () => {
    let resolveStop: (() => void) | null = null
    vi.mocked(chatStreamModule.syncChatStreamingState).mockImplementation((state) => {
      state.currentStreamingMessageId.value = null
      state.streaming.value = false
    })
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '会话一',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:10:00.000Z',
        _count: { messages: 1 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockImplementation(
      () => new Promise((resolve) => {
        resolveStop = () => resolve({
          message: 'Generation stopped',
        })
      }),
    )
    vi.mocked(chatStreamModule.dispatchSendMessage).mockResolvedValue(undefined)

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.currentStreamingMessageId.value = 'assistant-1'
    store.streaming.value = true
    store.messages.value = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正在生成中的回复',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    await store.sendMessage({
      content: '停止后发送',
    })

    expect(chatStreamModule.dispatchSendMessage).not.toHaveBeenCalled()
    expect(store.queuedSendCount.value).toBe(1)

    const stopTask = store.stopStreaming()
    await Promise.resolve()

    expect(chatConversationData.stopConversationMessageRecord).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
    )
    expect(chatStreamModule.dispatchSendMessage).not.toHaveBeenCalled()
    expect(store.queuedSendCount.value).toBe(1)

    resolveStop?.()
    await stopTask

    expect(chatStreamModule.dispatchSendMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        content: '停止后发送',
      }),
      expect.any(Object),
    )
    expect(store.queuedSendCount.value).toBe(0)
  })

  it('keeps queued messages isolated per conversation and pops only the current conversation tail', async () => {
    const store = createChatStoreModule()
    store.streaming.value = true

    store.currentConversationId.value = 'conversation-1'
    await store.sendMessage({
      content: '会话一-第一条',
    })
    await store.sendMessage({
      content: '会话一-第二条',
    })

    store.currentConversationId.value = 'conversation-2'
    await store.sendMessage({
      content: '会话二-第一条',
    })

    expect(store.queuedSendCount.value).toBe(1)
    expect(store.queuedSendPreviewEntries.value).toEqual([
      expect.objectContaining({
        preview: '会话二-第一条',
      }),
    ])

    const poppedSecondConversation = store.popQueuedSendRequestTail()
    expect(poppedSecondConversation).toEqual(
      expect.objectContaining({
        content: '会话二-第一条',
      }),
    )
    expect(store.queuedSendCount.value).toBe(0)

    store.currentConversationId.value = 'conversation-1'
    expect(store.queuedSendCount.value).toBe(2)
    expect(store.queuedSendPreviewEntries.value).toEqual([
      expect.objectContaining({
        preview: '会话一-第二条',
      }),
      expect.objectContaining({
        preview: '会话一-第一条',
      }),
    ])

    const poppedFirstConversation = store.popQueuedSendRequestTail()
    expect(poppedFirstConversation).toEqual(
      expect.objectContaining({
        content: '会话一-第二条',
      }),
    )
    expect(store.queuedSendCount.value).toBe(1)
  })

  it('drains queued messages after recovery reload marks the conversation idle', async () => {
    vi.mocked(chatStreamModule.syncChatStreamingState).mockImplementation((state) => {
      const activeMessage = state.messages.value.find(
        (message) => message.role === 'assistant'
          && (message.status === 'pending' || message.status === 'streaming'),
      )
      state.currentStreamingMessageId.value = activeMessage?.id ?? null
      state.streaming.value = Boolean(activeMessage)
    })
    vi.mocked(chatConversationData.loadConversationMessages)
      .mockResolvedValueOnce([
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '仍在恢复中的回复',
          status: 'streaming',
          parts: [],
          toolCalls: [],
          toolResults: [],
          error: null,
          provider: null,
          model: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '恢复完成后的最终回复',
          status: 'completed',
          parts: [],
          toolCalls: [],
          toolResults: [],
          error: null,
          provider: null,
          model: null,
        },
      ])
    vi.mocked(chatStreamModule.dispatchSendMessage).mockResolvedValue(undefined)

    const store = createChatStoreModule()
    await store.selectConversation('conversation-1')

    await store.sendMessage({
      content: '恢复完成后继续发送',
    })

    expect(store.streaming.value).toBe(true)
    expect(store.queuedSendCount.value).toBe(1)

    const recoveryLoadConversationDetail =
      vi.mocked(chatStreamModule.scheduleChatRecoveryWithState).mock.calls.at(-1)?.[1]
    expect(recoveryLoadConversationDetail).toBeTypeOf('function')

    await recoveryLoadConversationDetail?.('conversation-1')

    expect(chatStreamModule.dispatchSendMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        content: '恢复完成后继续发送',
      }),
      expect.any(Object),
    )
    expect(store.queuedSendCount.value).toBe(0)
  })

  it('refreshes conversation-related state after a streamed retry finishes', async () => {
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '重试后标题',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:06:00.000Z',
        _count: { messages: 2 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '重试后的最终回复',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    vi.mocked(chatStreamModule.dispatchRetryMessage).mockImplementation(
      async (state, _messageId, params) => {
        state.todoItems.value = [
          {
            content: '重试期间同步 todo',
            priority: 'medium',
            status: 'pending',
          },
        ]
        await params?.refreshConversationSummary?.()
        await params?.refreshConversationState?.({ summaryRefreshed: true })
      },
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    await store.retryMessage('assistant-1')

    expect(chatStreamModule.dispatchRetryMessage).toHaveBeenCalledTimes(1)
    expect(chatConversationData.loadConversationList).toHaveBeenCalledTimes(1)
    expect(chatConversationData.loadConversationMessages).not.toHaveBeenCalled()
    expect(chatConversationData.loadPendingRuntimePermissionsRecord).not.toHaveBeenCalled()
    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledTimes(1)
    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledWith(
      'conversation-1',
      {
        modelId: null,
        providerId: null,
      },
    )
    expect(chatConversationData.loadConversationTodoRecord).not.toHaveBeenCalled()
    expect(store.conversations.value).toEqual([
      expect.objectContaining({
        id: 'conversation-1',
        title: '重试后标题',
      }),
    ])
    expect(store.todoItems.value).toEqual([
      expect.objectContaining({
        content: '重试期间同步 todo',
      }),
    ])
  })

  it('refreshes runtime permissions after send only when the stream changed permission state', async () => {
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '权限中的会话',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:05:00.000Z',
        _count: { messages: 1 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockResolvedValue([])
    vi.mocked(chatConversationData.loadPendingRuntimePermissionsRecord).mockResolvedValue([
      {
        id: 'permission-1',
        conversationId: 'conversation-1',
        backendKind: 'just-bash',
        toolName: 'bash',
        operations: ['command.execute'],
        createdAt: '2026-04-20T09:00:00.000Z',
        summary: '执行 pwd',
      },
    ])
    vi.mocked(chatStreamModule.dispatchSendMessage).mockImplementation(
      async (_state, _input, params) => {
        await params?.refreshConversationSummary?.()
        await params?.refreshConversationState?.({
          summaryRefreshed: true,
          permissionStateChanged: true,
        })
      },
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    await store.sendMessage({
      content: '你好',
    })

    expect(chatConversationData.loadPendingRuntimePermissionsRecord).toHaveBeenCalledWith(
      'conversation-1',
    )
    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledTimes(1)
    expect(store.pendingRuntimePermissions.value).toEqual([
      expect.objectContaining({
        id: 'permission-1',
        toolName: 'bash',
      }),
    ])
  })

  it('still drains queued messages after a normal completion when permission refresh fails', async () => {
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '权限失败后的会话',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:05:00.000Z',
        _count: { messages: 2 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.loadPendingRuntimePermissionsRecord).mockRejectedValue(
      new Error('permission refresh failed'),
    )
    const store = createChatStoreModule()
    vi.mocked(chatStreamModule.dispatchSendMessage).mockImplementationOnce(
      async (state, _input, params) => {
        state.streaming.value = true
        await store.sendMessage({
          content: '权限失败后继续发第二条',
        })
        state.streaming.value = false
        await params?.refreshConversationSummary?.()
        await params?.refreshConversationState?.({
          summaryRefreshed: true,
          permissionStateChanged: true,
        })
      },
    )
    vi.mocked(chatStreamModule.dispatchSendMessage).mockResolvedValueOnce(undefined)

    store.currentConversationId.value = 'conversation-1'

    await store.sendMessage({
      content: '第一条',
    })

    expect(chatStreamModule.dispatchSendMessage).toHaveBeenCalledTimes(2)
    expect(chatStreamModule.dispatchSendMessage).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({
        content: '权限失败后继续发第二条',
      }),
      expect.any(Object),
    )
    expect(store.queuedSendCount.value).toBe(0)
    expect(chatStreamModule.scheduleChatRecoveryWithState).toHaveBeenCalled()
  })

  it('refreshes derived state after updating and deleting messages', async () => {
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '会话一',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:10:00.000Z',
        _count: { messages: 1 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.updateConversationMessageRecord).mockResolvedValue({
      id: 'assistant-1',
      role: 'assistant',
      content: '本地更新消息',
      status: 'completed',
      parts: [],
      toolCalls: [],
      toolResults: [],
      error: null,
      provider: null,
      model: null,
    })
    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.messages.value = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '旧消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]
    store.todoItems.value = [
      {
        content: '停止当前生成',
        priority: 'medium',
        status: 'pending',
      },
    ]

    await store.updateMessage('assistant-1', { content: '修改后' })
    await store.deleteMessage('assistant-1')

    expect(chatConversationData.updateConversationMessageRecord).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
      { content: '修改后' },
    )
    expect(chatConversationData.deleteConversationMessageRecord).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
    )
    expect(chatConversationData.loadConversationList).toHaveBeenCalledTimes(2)
    expect(chatConversationData.loadConversationMessages).not.toHaveBeenCalled()
    expect(chatConversationData.loadPendingRuntimePermissionsRecord).not.toHaveBeenCalled()
    expect(chatConversationData.loadConversationTodoRecord).not.toHaveBeenCalled()
    expect(store.messages.value).toEqual([])
    expect(store.todoItems.value).toEqual([
      expect.objectContaining({
        content: '停止当前生成',
      }),
    ])
  })

  it('marks the current assistant as stopped and refreshes conversation detail after stop', async () => {
    vi.mocked(chatStreamModule.syncChatStreamingState).mockImplementation((state) => {
      state.currentStreamingMessageId.value = null
      state.streaming.value = false
    })
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockResolvedValue({
      message: 'Generation stopped',
    })
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '后端同步后的停止结果',
        status: 'stopped',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.currentStreamingMessageId.value = 'assistant-1'
    store.streaming.value = true
    store.messages.value = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '已生成的部分回复',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]
    store.todoItems.value = [
      {
        content: '检查停止后的上下文窗口',
        priority: 'medium',
        status: 'pending',
      },
    ]

    await store.stopStreaming()

    expect(chatConversationData.stopConversationMessageRecord).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-1',
    )
    expect(chatConversationData.loadConversationList).not.toHaveBeenCalled()
    expect(chatConversationData.loadConversationMessages).toHaveBeenCalledWith('conversation-1')
    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledWith(
      'conversation-1',
      {
        modelId: null,
        providerId: null,
      },
    )
    expect(chatConversationData.loadConversationTodoRecord).not.toHaveBeenCalled()
    expect(chatStreamModule.scheduleChatRecoveryWithState).not.toHaveBeenCalled()
    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        content: '后端同步后的停止结果',
        status: 'stopped',
      }),
    ])
    expect(store.todoItems.value).toEqual([
      expect.objectContaining({
        content: '检查停止后的上下文窗口',
      }),
    ])
  })

  it('stops display result messages and releases the queue', async () => {
    vi.mocked(chatStreamModule.syncChatStreamingState).mockImplementation((state) => {
      state.currentStreamingMessageId.value = null
      state.streaming.value = false
    })
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockResolvedValue(undefined)
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'display-result-1',
        role: 'display',
        content: 'display result 已停止',
        status: 'stopped',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: 'system',
        model: 'context-compaction-command',
        metadata: {
          annotations: [
            {
              data: { variant: 'result' },
              owner: 'conversation.display-message',
              type: 'display-message',
              version: '1',
            },
          ],
        },
      },
    ])
    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.currentStreamingMessageId.value = 'display-result-1'
    store.streaming.value = true
    store.messages.value = [
      {
        id: 'display-result-1',
        role: 'display',
        content: '',
        status: 'pending',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: 'system',
        model: 'context-compaction-command',
        metadata: {
          annotations: [
            {
              data: { variant: 'result' },
              owner: 'conversation.display-message',
              type: 'display-message',
              version: '1',
            },
          ],
        },
      },
    ]
    await store.sendMessage({
      content: '排队中的下一条消息',
    })

    expect(store.canStopStreaming.value).toBe(true)
    expect(store.queuedSendCount.value).toBe(1)

    await store.stopStreaming()

    expect(chatConversationData.stopConversationMessageRecord).toHaveBeenCalledWith(
      'conversation-1',
      'display-result-1',
    )
    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'display-result-1',
        content: 'display result 已停止',
        status: 'stopped',
      }),
    ])
    expect(store.queuedSendCount.value).toBe(0)
  })

  it('keeps queued messages blocked and schedules recovery when stop refresh still returns an active reply', async () => {
    vi.mocked(chatStreamModule.syncChatStreamingState).mockImplementation((state) => {
      const activeMessage = state.messages.value.find(
        (message) => message.role === 'assistant'
          && (message.status === 'pending' || message.status === 'streaming'),
      )
      state.currentStreamingMessageId.value = activeMessage?.id ?? null
      state.streaming.value = Boolean(activeMessage)
    })
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockResolvedValue({
      message: 'Generation stopped',
    })
    vi.mocked(chatConversationData.loadConversationMessages)
      .mockResolvedValueOnce([
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '停止请求后仍在收尾',
          status: 'streaming',
          parts: [],
          toolCalls: [],
          toolResults: [],
          error: null,
          provider: null,
          model: null,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 'assistant-1',
          role: 'assistant',
          content: '恢复后的最终停止结果',
          status: 'stopped',
          parts: [],
          toolCalls: [],
          toolResults: [],
          error: null,
          provider: null,
          model: null,
        },
      ])
    vi.mocked(chatStreamModule.dispatchSendMessage).mockResolvedValue(undefined)

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.currentStreamingMessageId.value = 'assistant-1'
    store.streaming.value = true
    store.messages.value = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正在生成中的回复',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    await store.sendMessage({
      content: '等 stop 真完成再发',
    })

    await store.stopStreaming()

    expect(store.streaming.value).toBe(true)
    expect(store.queuedSendCount.value).toBe(1)
    expect(chatStreamModule.dispatchSendMessage).not.toHaveBeenCalled()
    expect(chatStreamModule.scheduleChatRecoveryWithState).toHaveBeenCalled()

    const recoveryLoadConversationDetail =
      vi.mocked(chatStreamModule.scheduleChatRecoveryWithState).mock.calls.at(-1)?.[1]
    expect(recoveryLoadConversationDetail).toBeTypeOf('function')

    await recoveryLoadConversationDetail?.('conversation-1')

    expect(chatStreamModule.dispatchSendMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        content: '等 stop 真完成再发',
      }),
      expect.any(Object),
    )
    expect(store.queuedSendCount.value).toBe(0)
  })

  it('still drains queued messages after stop when message detail is idle but permission refresh fails', async () => {
    vi.mocked(chatStreamModule.syncChatStreamingState).mockImplementation((state) => {
      const activeMessage = state.messages.value.find(
        (message) => message.role === 'assistant'
          && (message.status === 'pending' || message.status === 'streaming'),
      )
      state.currentStreamingMessageId.value = activeMessage?.id ?? null
      state.streaming.value = Boolean(activeMessage)
    })
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockRejectedValue(
      new Error('stop request failed'),
    )
    vi.mocked(chatConversationData.loadPendingRuntimePermissionsRecord).mockRejectedValue(
      new Error('permission refresh failed'),
    )
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '后端其实已经停止',
        status: 'stopped',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    vi.mocked(chatStreamModule.dispatchSendMessage).mockResolvedValue(undefined)

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.currentStreamingMessageId.value = 'assistant-1'
    store.streaming.value = true
    store.messages.value = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正在生成中的回复',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    await store.sendMessage({
      content: '详情已 idle 就继续发送',
    })

    await store.stopStreaming()

    expect(chatStreamModule.dispatchSendMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        content: '详情已 idle 就继续发送',
      }),
      expect.any(Object),
    )
    expect(store.queuedSendCount.value).toBe(0)
  })

  it('does not schedule recovery for the old conversation when the user switches away during stop sync', async () => {
    let resolvePermissions: (() => void) | null = null
    vi.mocked(chatStreamModule.syncChatStreamingState).mockImplementation((state) => {
      const activeMessage = state.messages.value.find(
        (message) => message.role === 'assistant'
          && (message.status === 'pending' || message.status === 'streaming'),
      )
      state.currentStreamingMessageId.value = activeMessage?.id ?? null
      state.streaming.value = Boolean(activeMessage)
    })
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockResolvedValue({
      message: 'Generation stopped',
    })
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '停止请求后仍在收尾',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    vi.mocked(chatConversationData.loadPendingRuntimePermissionsRecord).mockImplementation(
      () => new Promise((resolve) => {
        resolvePermissions = () => resolve([])
      }),
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.currentStreamingMessageId.value = 'assistant-1'
    store.streaming.value = true
    store.messages.value = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正在生成中的回复',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    const stopTask = store.stopStreaming()
    await Promise.resolve()

    store.currentConversationId.value = 'conversation-2'
    resolvePermissions?.()
    await stopTask

    expect(chatStreamModule.scheduleChatRecoveryWithState).not.toHaveBeenCalled()
  })

  it('restores the previous conversation state when switching to another conversation fails', async () => {
    vi.mocked(chatConversationData.loadConversationMessages).mockImplementation(
      async (conversationId: string) => {
        if (conversationId === 'conversation-2') {
          throw new Error('load failed')
        }
        return []
      },
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.setModelSelection({
      provider: 'provider-a',
      model: 'model-a',
    })
    store.contextWindowPreview.value = {
      contextLength: 256,
      enabled: true,
      estimatedTokens: 80,
      excludedMessageIds: [],
      frontendMessageWindowSize: 200,
      includedMessageIds: [],
      keepRecentMessages: 6,
      source: 'estimated',
      slidingWindowUsagePercent: 50,
      strategy: 'summary',
    }
    store.pendingRuntimePermissions.value = [
      {
        id: 'permission-1',
        conversationId: 'conversation-1',
        backendKind: 'just-bash',
        toolName: 'bash',
        operations: ['command.execute'],
        createdAt: '2026-05-01T00:00:00.000Z',
        summary: '执行 pwd',
        resolving: false,
      },
    ]
    store.todoItems.value = [
      { content: '旧会话待办', priority: 'high', status: 'in_progress' },
    ]
    store.messages.value = [
      createChatMessage('message-1', '旧会话消息'),
    ]

    await expect(store.selectConversation('conversation-2')).resolves.toBeUndefined()

    expect(store.currentConversationId.value).toBe('conversation-1')
    expect(store.selectedProvider.value).toBe('provider-a')
    expect(store.selectedModel.value).toBe('model-a')
    expect(store.todoItems.value).toEqual([
      { content: '旧会话待办', priority: 'high', status: 'in_progress' },
    ])
    expect(store.messages.value).toEqual([
      createChatMessage('message-1', '旧会话消息'),
    ])
  })

  it('restores the last stable conversation state when a newer switch fails during an older pending switch', async () => {
    let resolveConversation2Messages: ((messages: ChatMessage[]) => void) | null = null
    vi.mocked(chatConversationData.loadConversationMessages).mockImplementation(
      async (conversationId: string) => {
        if (conversationId === 'conversation-2') {
          return await new Promise<ChatMessage[]>((resolve) => {
            resolveConversation2Messages = resolve
          })
        }
        if (conversationId === 'conversation-3') {
          throw new Error('load failed')
        }
        return []
      },
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.setModelSelection({
      provider: 'provider-a',
      model: 'model-a',
    })
    store.contextWindowPreview.value = {
      contextLength: 256,
      enabled: true,
      estimatedTokens: 80,
      excludedMessageIds: [],
      frontendMessageWindowSize: 200,
      includedMessageIds: [],
      keepRecentMessages: 6,
      source: 'estimated',
      slidingWindowUsagePercent: 50,
      strategy: 'summary',
    }
    store.pendingRuntimePermissions.value = [
      {
        id: 'permission-1',
        conversationId: 'conversation-1',
        backendKind: 'just-bash',
        toolName: 'bash',
        operations: ['command.execute'],
        createdAt: '2026-05-01T00:00:00.000Z',
        summary: '执行 pwd',
        resolving: false,
      },
    ]
    store.todoItems.value = [
      { content: '旧会话待办', priority: 'high', status: 'in_progress' },
    ]
    store.messages.value = [
      createChatMessage('message-1', '旧会话消息'),
    ]

    const firstSwitch = store.selectConversation('conversation-2')
    await Promise.resolve()
    await expect(store.selectConversation('conversation-3')).resolves.toBeUndefined()

    expect(store.currentConversationId.value).toBe('conversation-1')
    expect(store.selectedProvider.value).toBe('provider-a')
    expect(store.selectedModel.value).toBe('model-a')
    expect(store.todoItems.value).toEqual([
      { content: '旧会话待办', priority: 'high', status: 'in_progress' },
    ])
    expect(store.messages.value).toEqual([
      createChatMessage('message-1', '旧会话消息'),
    ])

    resolveConversation2Messages?.([])
    await firstSwitch

    expect(store.currentConversationId.value).toBe('conversation-1')
    expect(store.messages.value).toEqual([
      createChatMessage('message-1', '旧会话消息'),
    ])
  })

  it('falls back to normal sending when editing the last user message after the last assistant was deleted', async () => {
    vi.mocked(chatConversationData.deleteConversationMessageRecord).mockResolvedValue(undefined)
    vi.mocked(chatStreamModule.dispatchSendMessage).mockResolvedValue(undefined)

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.messages.value = [
      {
        id: 'user-1',
        role: 'user',
        content: '旧问题',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    await store.updateMessage('user-1', { content: '新问题' })

    expect(chatConversationData.deleteConversationMessageRecord).toHaveBeenCalledWith(
      'conversation-1',
      'user-1',
    )
    expect(chatConversationData.updateConversationMessageRecord).not.toHaveBeenCalled()
    expect(chatStreamModule.dispatchSendMessage).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        content: '新问题',
      }),
      expect.any(Object),
    )
  })

  it('does not write an old conversation update into the newly selected conversation', async () => {
    let resolveUpdate: ((value: ChatMessage) => void) | null = null
    let resolveDelete: (() => void) | null = null
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '会话一',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:10:00.000Z',
        _count: { messages: 1 },
      },
      {
        id: 'conversation-2',
        title: '会话二',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:11:00.000Z',
        _count: { messages: 1 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.updateConversationMessageRecord).mockImplementation(
      () => new Promise((resolve) => {
        resolveUpdate = resolve
      }),
    )
    vi.mocked(chatConversationData.deleteConversationMessageRecord).mockImplementation(
      () => new Promise((resolve) => {
        resolveDelete = () => resolve(undefined)
      }),
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.messages.value = [
      {
        id: 'assistant-a',
        role: 'assistant',
        content: '会话一旧消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    const updateTask = store.updateMessage('assistant-a', { content: '修改后' })
    store.currentConversationId.value = 'conversation-2'
    store.messages.value = [
      {
        id: 'assistant-b',
        role: 'assistant',
        content: '会话二当前消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]
    resolveUpdate?.({
      id: 'assistant-a',
      role: 'assistant',
      content: '会话一修改后',
      status: 'completed',
      parts: [],
      toolCalls: [],
      toolResults: [],
      error: null,
      provider: null,
      model: null,
    })
    await updateTask

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-b',
        content: '会话二当前消息',
      }),
    ])

    store.currentConversationId.value = 'conversation-1'
    store.messages.value = [
      {
        id: 'assistant-a',
        role: 'assistant',
        content: '会话一消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]
    const deleteTask = store.deleteMessage('assistant-a')
    store.currentConversationId.value = 'conversation-2'
    store.messages.value = [
      {
        id: 'assistant-b',
        role: 'assistant',
        content: '会话二当前消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]
    resolveDelete?.()
    await deleteTask

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-b',
        content: '会话二当前消息',
      }),
    ])
  })

  it('does not write a stopped old conversation back into the newly selected conversation', async () => {
    let resolveStop: (() => void) | null = null
    vi.mocked(chatConversationData.loadConversationList).mockResolvedValue([
      {
        id: 'conversation-1',
        title: '会话一',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:10:00.000Z',
        _count: { messages: 1 },
      },
      {
        id: 'conversation-2',
        title: '会话二',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:11:00.000Z',
        _count: { messages: 1 },
      },
    ] satisfies Conversation[])
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockImplementation(
      () => new Promise((resolve) => {
        resolveStop = () => resolve({ message: 'Generation stopped' })
      }),
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.currentStreamingMessageId.value = 'assistant-a'
    store.messages.value = [
      {
        id: 'assistant-a',
        role: 'assistant',
        content: '会话一流式消息',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    const stopTask = store.stopStreaming()
    store.currentConversationId.value = 'conversation-2'
    store.messages.value = [
      {
        id: 'assistant-b',
        role: 'assistant',
        content: '会话二当前消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]
    resolveStop?.()
    await stopTask

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-b',
        content: '会话二当前消息',
      }),
    ])
  })

  it('keeps the latest conversation list when concurrent refreshes return out of order', async () => {
    let resolveFirst: ((value: Conversation[]) => void) | null = null
    let resolveSecond: ((value: Conversation[]) => void) | null = null
    vi.mocked(chatConversationData.loadConversationList)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirst = resolve
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecond = resolve
      }))

    const store = createChatStoreModule()

    const firstLoad = store.loadConversations()
    const secondLoad = store.loadConversations()

    resolveSecond?.([
      {
        id: 'conversation-2',
        title: '新的标题',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:10:00.000Z',
        _count: { messages: 1 },
      },
    ])
    await secondLoad

    resolveFirst?.([
      {
        id: 'conversation-1',
        title: '旧的标题',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:01:00.000Z',
        _count: { messages: 1 },
      },
    ])
    await firstLoad

    expect(store.conversations.value).toEqual([
      expect.objectContaining({
        id: 'conversation-2',
        title: '新的标题',
      }),
    ])
  })

  it('ignores an old conversation list refresh after the user switches to another conversation', async () => {
    let resolveList: ((value: Conversation[]) => void) | null = null
    vi.mocked(chatConversationData.loadConversationList).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveList = resolve
        }),
    )
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-conversation-2',
        role: 'assistant',
        content: '会话二详情',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    const refreshTask = store.loadConversations()
    const selectTask = store.selectConversation('conversation-2')

    resolveList?.([
      {
        id: 'conversation-1',
        title: '旧列表结果',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:01:00.000Z',
        _count: { messages: 1 },
      },
    ])

    await Promise.all([refreshTask, selectTask])

    expect(store.currentConversationId.value).toBe('conversation-2')
    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-conversation-2',
        content: '会话二详情',
      }),
    ])
    expect(store.conversations.value).toEqual([])
  })

  it('keeps the latest conversation detail when concurrent refreshes return out of order', async () => {
    let resolveFirstDetail: ((value: ChatMessage[]) => void) | null = null
    let resolveSecondDetail: ((value: ChatMessage[]) => void) | null = null
    const latestDetail = [
      {
        id: 'assistant-new',
        role: 'assistant',
        content: '新的详情',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ] satisfies ChatMessage[]

    vi.mocked(chatConversationData.loadConversationMessages)
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveFirstDetail = resolve
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveSecondDetail = resolve
      }))
      .mockResolvedValue(latestDetail)
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()
    const firstSelect = store.selectConversation('conversation-1')
    const secondSelect = store.selectConversation('conversation-1')

    resolveSecondDetail?.(latestDetail)
    await secondSelect

    resolveFirstDetail?.([
      {
        id: 'assistant-old',
        role: 'assistant',
        content: '旧的详情',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    await firstSelect

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-new',
        content: '新的详情',
        status: 'completed',
      }),
    ])
  })

  it('clears previous conversation messages immediately while the next conversation detail is still loading', async () => {
    let resolveDetail: ((value: ChatMessage[]) => void) | null = null
    vi.mocked(chatConversationData.loadConversationMessages).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveDetail = resolve
        }),
    )
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.messages.value = [
      {
        id: 'assistant-old',
        role: 'assistant',
        content: '上一会话内容',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    const selectTask = store.selectConversation('conversation-2')

    expect(store.currentConversationId.value).toBe('conversation-2')
    expect(store.messages.value).toEqual([])

    resolveDetail?.([
      {
        id: 'assistant-new',
        role: 'assistant',
        content: '当前会话内容',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    await selectTask

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-new',
        content: '当前会话内容',
      }),
    ])
  })

  it('routes recovery polling through the same guarded conversation detail loader', async () => {
    const initialDetail = [
      {
        id: 'assistant-initial',
        role: 'assistant',
        content: '初始详情',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ] satisfies ChatMessage[]

    vi.mocked(chatConversationData.loadConversationMessages)
      .mockResolvedValueOnce(initialDetail)
      .mockImplementationOnce(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
        return [
          {
            id: 'assistant-old',
            role: 'assistant',
            content: '恢复后的旧详情',
            status: 'streaming',
            parts: [],
            toolCalls: [],
            toolResults: [],
            error: null,
            provider: null,
            model: null,
          },
        ] satisfies ChatMessage[]
      })
      .mockResolvedValueOnce([
        {
          id: 'assistant-new',
          role: 'assistant',
          content: '恢复后的新详情',
          status: 'completed',
          parts: [],
          toolCalls: [],
          toolResults: [],
          error: null,
          provider: null,
          model: null,
        },
      ])
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()
    await store.selectConversation('conversation-1')

    const recoveryLoadConversationDetail =
      vi.mocked(chatStreamModule.scheduleChatRecoveryWithState).mock.calls[0]?.[1]
    expect(recoveryLoadConversationDetail).toBeTypeOf('function')

    const firstRefresh = recoveryLoadConversationDetail?.('conversation-1')
    const secondRefresh = recoveryLoadConversationDetail?.('conversation-1')

    await secondRefresh
    await firstRefresh

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-new',
        content: '恢复后的新详情',
        status: 'completed',
      }),
    ])
  })

  it('clears model selection when deleting the current conversation', async () => {
    vi.mocked(chatConversationData.deleteConversationRecord).mockResolvedValue(undefined)

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.selectedProvider.value = 'provider-a'
    store.selectedModel.value = 'model-a'
    store.messages.value = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '当前消息',
        status: 'completed',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    await store.deleteConversation('conversation-1')

    expect(store.currentConversationId.value).toBeNull()
    expect(store.selectedProvider.value).toBeNull()
    expect(store.selectedModel.value).toBeNull()
    expect(store.todoItems.value).toEqual([])
    expect(store.messages.value).toEqual([])
  })

  it('drops an invalid legacy conversation id locally instead of calling the delete API', async () => {
    const legacyConversationId = '11111111-1111-4111-8111-111111111111'
    const store = createChatStoreModule()
    store.currentConversationId.value = legacyConversationId
    store.conversations.value = [
      {
        id: legacyConversationId,
        title: '旧会话',
        createdAt: '2026-04-18T09:00:00.000Z',
        updatedAt: '2026-04-18T09:00:00.000Z',
        _count: { messages: 1 },
      },
    ]
    store.selectedProvider.value = 'provider-a'
    store.selectedModel.value = 'model-a'
    store.messages.value = [
      createChatMessage('assistant-1', '旧消息'),
    ]

    await store.deleteConversation(legacyConversationId)

    expect(chatConversationData.deleteConversationRecord).not.toHaveBeenCalled()
    expect(store.currentConversationId.value).toBeNull()
    expect(store.conversations.value).toEqual([])
    expect(store.selectedProvider.value).toBeNull()
    expect(store.selectedModel.value).toBeNull()
    expect(store.messages.value).toEqual([])
  })

  it('loads pending runtime permissions for the selected conversation', async () => {
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockResolvedValue([])
    vi.mocked(chatConversationData.loadPendingRuntimePermissionsRecord).mockResolvedValue([
      {
        id: 'permission-1',
        conversationId: 'conversation-1',
        backendKind: 'just-bash',
        toolName: 'bash',
        operations: ['command.execute', 'network.access'],
        createdAt: '2026-04-20T09:00:00.000Z',
        summary: '执行 curl 请求',
        metadata: {
          command: 'curl https://example.com',
        },
      },
    ])
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()

    await store.selectConversation('conversation-1')

    expect(chatConversationData.loadPendingRuntimePermissionsRecord).toHaveBeenCalledWith(
      'conversation-1',
    )
    expect(store.pendingRuntimePermissions.value).toEqual([
      expect.objectContaining({
        id: 'permission-1',
        resolving: false,
        toolName: 'bash',
      }),
    ])
  })

  it('replies to a runtime permission request and removes it from the pending list', async () => {
    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.pendingRuntimePermissions.value = [
      {
        id: 'permission-1',
        conversationId: 'conversation-1',
        backendKind: 'just-bash',
        toolName: 'bash',
        operations: ['command.execute'],
        createdAt: '2026-04-20T09:00:00.000Z',
        summary: '执行 pwd',
        resolving: false,
      },
    ]

    await store.replyRuntimePermission('permission-1', 'always')

    expect(chatConversationData.replyRuntimePermissionRecord).toHaveBeenCalledWith(
      'conversation-1',
      'permission-1',
      'always',
    )
    expect(store.pendingRuntimePermissions.value).toEqual([])
  })

  it('stores only the configured recent message window after loading preview', async () => {
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      createChatMessage('message-1', '第一条'),
      createChatMessage('message-2', '第二条'),
      createChatMessage('message-3', '第三条'),
    ])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockResolvedValue([])
    vi.mocked(chatConversationData.loadConversationContextWindowRecord).mockResolvedValue({
      contextLength: 256,
      enabled: true,
      estimatedTokens: 80,
      excludedMessageIds: ['message-2'],
      frontendMessageWindowSize: 2,
      includedMessageIds: ['message-3'],
      keepRecentMessages: 1,
      source: 'estimated',
      slidingWindowUsagePercent: 50,
      strategy: 'sliding',
    })
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockResolvedValue()

    const store = createChatStoreModule()

    await store.selectConversation('conversation-1')

    expect(store.contextWindowPreview.value).toEqual(
      expect.objectContaining({
        excludedMessageIds: ['message-2'],
        frontendMessageWindowSize: 2,
      }),
    )
    expect(store.messages.value).toEqual([
      expect.objectContaining({ id: 'message-2', content: '第二条' }),
      expect.objectContaining({ id: 'message-3', content: '第三条' }),
    ])
    expect(chatConversationData.loadConversationMessages).toHaveBeenCalledTimes(1)
  })

  it('refreshes the current conversation window when relevant AI config changes', async () => {
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      createChatMessage('message-1', '第一条'),
    ])
    vi.mocked(chatConversationData.loadConversationTodoRecord).mockResolvedValue([])

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    window.dispatchEvent(new CustomEvent(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail: {
        scope: 'context-governance',
      },
    }))
    window.dispatchEvent(new CustomEvent(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail: {
        scope: 'provider-models',
      },
    }))
    await new Promise((resolve) => setTimeout(resolve, 350))

    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledWith(
      'conversation-1',
      {
        modelId: null,
        providerId: null,
      },
    )
    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledTimes(1)
    expect(chatConversationData.loadConversationMessages).not.toHaveBeenCalled()
  })

  it('refreshes only the context window preview when switching provider or model', async () => {
    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'

    store.setModelSelection({
      provider: 'openai',
      model: 'gpt-5.4',
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledWith(
      'conversation-1',
      {
        modelId: 'gpt-5.4',
        providerId: 'openai',
      },
    )
    expect(chatConversationData.loadConversationMessages).not.toHaveBeenCalled()
  })

  it('recomputes selected provider and model after provider-model config changes', async () => {
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockImplementation(
      async ({ selectedProvider, selectedModel, selectedSource, force }) => {
        if (!force) {
          return
        }
        selectedProvider.value = 'provider-b'
        selectedModel.value = 'model-b'
        if (selectedSource) {
          selectedSource.value = 'default'
        }
      },
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.setModelSelection({
      provider: 'provider-a',
      model: 'model-a',
    })
    vi.clearAllMocks()

    window.dispatchEvent(new CustomEvent(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail: {
        scope: 'provider-models',
      },
    }))
    await new Promise((resolve) => setTimeout(resolve, 350))

    expect(chatModelSelection.ensureChatModelSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
      }),
    )
    expect(store.selectedProvider.value).toBe('provider-b')
    expect(store.selectedModel.value).toBe('model-b')
    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledWith(
      'conversation-1',
      {
        modelId: 'model-b',
        providerId: 'provider-b',
      },
    )
  })

  it('replays provider-model refresh after streaming ends', async () => {
    vi.mocked(chatModelSelection.ensureChatModelSelection).mockImplementation(
      async ({ selectedProvider, selectedModel, selectedSource, force }) => {
        if (!force) {
          return
        }
        selectedProvider.value = 'provider-stream'
        selectedModel.value = 'model-stream'
        if (selectedSource) {
          selectedSource.value = 'default'
        }
      },
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.streaming.value = true
    store.setModelSelection({
      provider: 'provider-a',
      model: 'model-a',
    })
    vi.clearAllMocks()

    window.dispatchEvent(new CustomEvent(INTERNAL_CONFIG_CHANGED_EVENT, {
      detail: {
        scope: 'provider-models',
      },
    }))
    await new Promise((resolve) => setTimeout(resolve, 350))

    expect(chatModelSelection.ensureChatModelSelection).not.toHaveBeenCalled()
    store.streaming.value = false
    await new Promise((resolve) => setTimeout(resolve, 350))

    expect(chatModelSelection.ensureChatModelSelection).toHaveBeenCalledWith(
      expect.objectContaining({
        force: true,
      }),
    )
    expect(chatConversationData.loadConversationContextWindowRecord).toHaveBeenCalledWith(
      'conversation-1',
      {
        modelId: 'model-stream',
        providerId: 'provider-stream',
      },
    )
  })

  it('marks the current assistant as stopped before the stop request finishes', async () => {
    let resolveStop: (() => void) | null = null
    vi.mocked(chatStreamModule.syncChatStreamingState).mockImplementation((state) => {
      state.currentStreamingMessageId.value = null
      state.streaming.value = false
    })
    vi.mocked(chatConversationData.loadConversationMessages).mockResolvedValue([
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '后端最终同步内容',
        status: 'stopped',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ])
    vi.mocked(chatConversationData.stopConversationMessageRecord).mockImplementation(
      () => new Promise((resolve) => {
        resolveStop = () => resolve({ message: 'Generation stopped' })
      }),
    )

    const store = createChatStoreModule()
    store.currentConversationId.value = 'conversation-1'
    store.currentStreamingMessageId.value = 'assistant-1'
    store.streaming.value = true
    store.messages.value = [
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '正在生成中的回复',
        status: 'streaming',
        parts: [],
        toolCalls: [],
        toolResults: [],
        error: null,
        provider: null,
        model: null,
      },
    ]

    const stopTask = store.stopStreaming()
    await Promise.resolve()

    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        status: 'stopped',
      }),
    ])
    expect(store.streaming.value).toBe(false)
    expect(chatConversationData.loadConversationMessages).not.toHaveBeenCalled()

    resolveStop?.()
    await stopTask

    expect(chatConversationData.loadConversationMessages).toHaveBeenCalledWith('conversation-1')
    expect(store.messages.value).toEqual([
      expect.objectContaining({
        id: 'assistant-1',
        content: '后端最终同步内容',
        status: 'stopped',
      }),
    ])
  })
})

function createChatMessage(id: string, content: string): ChatMessage {
  return {
    id,
    role: 'assistant',
    content,
    status: 'completed',
    parts: [],
    toolCalls: [],
    toolResults: [],
    error: null,
    provider: null,
    model: null,
  }
}

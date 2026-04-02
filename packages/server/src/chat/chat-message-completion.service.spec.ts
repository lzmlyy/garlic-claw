import { ChatMessageCompletionService } from './chat-message-completion.service';

describe('ChatMessageCompletionService', () => {
  const prisma = {
    message: {
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    conversation: {
      update: jest.fn(),
    },
  };

  const orchestration = {
    applyFinalResponseHooks: jest.fn(),
    runResponseAfterSendHooks: jest.fn(),
  };

  let service: ChatMessageCompletionService;

  beforeEach(() => {
    jest.clearAllMocks();
    orchestration.applyFinalResponseHooks.mockImplementation(
      async ({ result }: { result: unknown }) => result,
    );
    orchestration.runResponseAfterSendHooks.mockResolvedValue(undefined);
    service = new ChatMessageCompletionService(
      prisma as never,
      orchestration as never,
    );
  });

  it('writes a short-circuited assistant reply, applies final hooks, and emits after-send hooks', async () => {
    prisma.message.update
      .mockResolvedValueOnce({
        id: 'assistant-message-1',
        content: '插件已经直接回复。',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '插件已经直接回复。',
          },
        ]),
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        status: 'completed',
        error: null,
        toolCalls: null,
        toolResults: null,
      })
      .mockResolvedValueOnce({
        id: 'assistant-message-1',
        content: '发送前统一包装后的回复。',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '发送前统一包装后的回复。',
          },
        ]),
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        status: 'completed',
        error: null,
        toolCalls: null,
        toolResults: null,
      });
    prisma.conversation.update.mockResolvedValue(null);
    orchestration.applyFinalResponseHooks.mockResolvedValue({
      assistantMessageId: 'assistant-message-1',
      conversationId: 'conversation-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      content: '发送前统一包装后的回复。',
      parts: [
        {
          type: 'text',
          text: '发送前统一包装后的回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });

    await expect(
      service.completeShortCircuitedAssistant({
        assistantMessageId: 'assistant-message-1',
        userId: 'user-1',
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        activePersonaId: 'builtin.default-assistant',
        assistantContent: '插件已经直接回复。',
      }),
    ).resolves.toEqual({
      id: 'assistant-message-1',
      content: '发送前统一包装后的回复。',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '发送前统一包装后的回复。',
        },
      ]),
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      status: 'completed',
      error: null,
      toolCalls: null,
      toolResults: null,
    });

    expect(orchestration.applyFinalResponseHooks).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      responseSource: 'short-circuit',
      result: {
        assistantMessageId: 'assistant-message-1',
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        content: '插件已经直接回复。',
        parts: [
          {
            type: 'text',
            text: '插件已经直接回复。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });
    expect(orchestration.runResponseAfterSendHooks).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      responseSource: 'short-circuit',
      result: {
        assistantMessageId: 'assistant-message-1',
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        content: '发送前统一包装后的回复。',
        parts: [
          {
            type: 'text',
            text: '发送前统一包装后的回复。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });
  });

  it('writes vision fallback metadata onto the current user and assistant messages', async () => {
    prisma.message.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      service.applyVisionFallbackMetadata({
        userMessage: {
          id: 'user-message-1',
          metadataJson: null,
        },
        assistantMessage: {
          id: 'assistant-message-1',
          metadataJson: null,
        },
        visionFallbackEntries: [
          {
            text: '图片里是一只趴着的橘猫。',
            source: 'generated',
          },
        ],
      }),
    ).resolves.toEqual({
      userMessage: {
        id: 'user-message-1',
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [
              {
                text: '图片里是一只趴着的橘猫。',
                source: 'generated',
              },
            ],
          },
        }),
      },
      assistantMessage: {
        id: 'assistant-message-1',
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [
              {
                text: '图片里是一只趴着的橘猫。',
                source: 'generated',
              },
            ],
          },
        }),
      },
    });

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['user-message-1', 'assistant-message-1'],
        },
      },
      data: {
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [
              {
                text: '图片里是一只趴着的橘猫。',
                source: 'generated',
              },
            ],
          },
        }),
      },
    });
  });

  it('writes vision fallback metadata onto the retried assistant message only', async () => {
    prisma.message.update.mockResolvedValue({
      id: 'assistant-message-2',
      metadataJson: JSON.stringify({
        visionFallback: {
          state: 'completed',
          entries: [
            {
              text: '一只戴围巾的柴犬。',
              source: 'cache',
            },
          ],
        },
      }),
    });

    await expect(
      service.applyVisionFallbackMetadataToAssistant({
        assistantMessage: {
          id: 'assistant-message-2',
          metadataJson: null,
        },
        visionFallbackEntries: [
          {
            text: '一只戴围巾的柴犬。',
            source: 'cache',
          },
        ],
      }),
    ).resolves.toEqual({
      id: 'assistant-message-2',
      metadataJson: JSON.stringify({
        visionFallback: {
          state: 'completed',
          entries: [
            {
              text: '一只戴围巾的柴犬。',
              source: 'cache',
            },
          ],
        },
      }),
    });

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: {
        id: 'assistant-message-2',
      },
      data: {
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [
              {
                text: '一只戴围巾的柴犬。',
                source: 'cache',
              },
            ],
          },
        }),
      },
    });
  });
});

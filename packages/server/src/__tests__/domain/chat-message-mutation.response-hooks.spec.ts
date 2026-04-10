import { createChatMessageMutationFixture } from '../fixtures/chat-message-mutation.fixture';

describe('ChatMessageMutationService - response hooks & metadata', () => {
  it('writes a short-circuited assistant reply, applies final hooks, and emits after-send hooks', async () => {
    const { service, prisma, orchestration } = createChatMessageMutationFixture();
    prisma.message.update.mockResolvedValue({
      id: 'assistant-message-1',
      content: '发送前统一包装后的回复。',
      partsJson: JSON.stringify([{ type: 'text', text: '发送前统一包装后的回复。' }]),
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      status: 'completed',
      error: null,
      toolCalls: null,
      toolResults: null,
    });
    orchestration.applyFinalResponseHooks.mockResolvedValue({
      assistantMessageId: 'assistant-message-1',
      conversationId: 'conversation-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      content: '发送前统一包装后的回复。',
      parts: [{ type: 'text', text: '发送前统一包装后的回复。' }],
      toolCalls: [],
      toolResults: [],
    });

    await expect(
      service.completeShortCircuitedAssistant({
        assistantMessageId: 'assistant-message-1',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
        completion: {
          assistantContent: '插件已经直接回复。',
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
        },
      }),
    ).resolves.toEqual({
      id: 'assistant-message-1',
      content: '发送前统一包装后的回复。',
      partsJson: JSON.stringify([{ type: 'text', text: '发送前统一包装后的回复。' }]),
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      status: 'completed',
      error: null,
      toolCalls: null,
      toolResults: null,
    });
  });

  it('writes vision fallback metadata onto the current user and assistant messages', async () => {
    const { service, prisma } = createChatMessageMutationFixture();
    prisma.message.updateMany.mockResolvedValue({ count: 2 });

    await expect(
      service.applyVisionFallbackMetadata({
        userMessage: { id: 'user-message-1', metadataJson: null },
        assistantMessage: { id: 'assistant-message-1', metadataJson: null },
        visionFallbackEntries: [{ text: '图片里是一只趴着的橘猫。', source: 'generated' }],
      }),
    ).resolves.toEqual({
      userMessage: {
        id: 'user-message-1',
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [{ text: '图片里是一只趴着的橘猫。', source: 'generated' }],
          },
        }),
      },
      assistantMessage: {
        id: 'assistant-message-1',
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [{ text: '图片里是一只趴着的橘猫。', source: 'generated' }],
          },
        }),
      },
    });
  });

  it('writes vision fallback metadata onto the retried assistant message only', async () => {
    const { service, prisma } = createChatMessageMutationFixture();
    prisma.message.update.mockResolvedValue({
      id: 'assistant-message-2',
      metadataJson: JSON.stringify({
        visionFallback: {
          state: 'completed',
          entries: [{ text: '一只戴围巾的柴犬。', source: 'cache' }],
        },
      }),
    });

    await expect(
      service.applyVisionFallbackMetadata({
        assistantMessage: { id: 'assistant-message-2', metadataJson: null },
        visionFallbackEntries: [{ text: '一只戴围巾的柴犬。', source: 'cache' }],
      }),
    ).resolves.toEqual({
      userMessage: null,
      assistantMessage: {
        id: 'assistant-message-2',
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [{ text: '一只戴围巾的柴犬。', source: 'cache' }],
          },
        }),
      },
    });
  });
});

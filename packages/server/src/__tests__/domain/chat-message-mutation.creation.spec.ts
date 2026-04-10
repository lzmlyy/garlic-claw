import { createChatMessageMutationFixture } from '../fixtures/chat-message-mutation.fixture';

describe('ChatMessageMutationService - creation & target', () => {
  it('startGenerationTurn persists a hook-mutated user message and pending assistant', async () => {
    const { service, pluginChatRuntime, prisma } = createChatMessageMutationFixture();
    pluginChatRuntime.applyMessageCreated.mockResolvedValue({
      context: {
        source: 'chat',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'plugin-provider',
        activeModelId: 'plugin-model',
        activePersonaId: 'persona-1',
      },
      conversationId: 'conversation-1',
      message: {
        role: 'user',
        content: '插件改写后的用户消息',
        parts: [{ type: 'text', text: '插件改写后的用户消息' }],
        status: 'completed',
      },
      modelMessages: [{ role: 'user', content: [{ type: 'text', text: '插件改写后的用户消息' }] }],
    });
    prisma.message.create
      .mockResolvedValueOnce({
        id: 'user-message-1',
        conversationId: 'conversation-1',
        role: 'user',
        content: '插件改写后的用户消息',
        partsJson: JSON.stringify([{ type: 'text', text: '插件改写后的用户消息' }]),
        status: 'completed',
      })
      .mockResolvedValueOnce({
        id: 'assistant-message-1',
        conversationId: 'conversation-1',
        role: 'assistant',
        content: '',
        partsJson: null,
        provider: 'openai',
        model: 'gpt-5.2',
        status: 'pending',
      });

    await expect(
      service.startGenerationTurn({
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'persona-1',
        modelConfig: {
          providerId: 'openai',
          id: 'gpt-5.2',
        },
        receivedMessagePayload: {
          message: {
            content: '原始用户消息',
            parts: [{ type: 'text', text: '原始用户消息' }],
          },
          modelMessages: [{ role: 'user', content: [{ type: 'text', text: '原始用户消息' }] }],
        },
      }),
    ).resolves.toEqual({
      userMessage: expect.objectContaining({ id: 'user-message-1', content: '插件改写后的用户消息' }),
      assistantMessage: expect.objectContaining({ id: 'assistant-message-1', status: 'pending' }),
      modelMessages: [{ role: 'user', content: [{ type: 'text', text: '插件改写后的用户消息' }] }],
    });
  });

  it('createHookedStoredMessage persists a hook-mutated assistant message', async () => {
    const { service, pluginChatRuntime, prisma } = createChatMessageMutationFixture();
    pluginChatRuntime.applyMessageCreated.mockResolvedValue({
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'plugin-provider',
        activeModelId: 'plugin-model',
        activePersonaId: 'persona-1',
      },
      conversationId: 'conversation-1',
      message: {
        role: 'assistant',
        content: '插件改写后的回复',
        parts: [{ type: 'text', text: '插件改写后的回复' }],
        provider: 'plugin-provider',
        model: 'plugin-model',
        status: 'completed',
      },
      modelMessages: [{ role: 'assistant', content: [{ type: 'text', text: '插件改写后的回复' }] }],
    });
    prisma.message.create.mockResolvedValue({
      id: 'assistant-message-created-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: '插件改写后的回复',
      partsJson: JSON.stringify([{ type: 'text', text: '插件改写后的回复' }]),
      provider: 'plugin-provider',
      model: 'plugin-model',
      status: 'completed',
    });
    const createHookedStoredMessage = (
      service as unknown as {
        createHookedStoredMessage: (input: unknown) => Promise<unknown>;
      }
    ).createHookedStoredMessage.bind(service);

    await expect(
      createHookedStoredMessage({
        conversationId: 'conversation-1',
        hookContext: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'plugin-provider',
          activeModelId: 'plugin-model',
          activePersonaId: 'persona-1',
        },
        modelMessages: [{ role: 'assistant', content: [{ type: 'text', text: '原始回复' }] }],
        message: {
          role: 'assistant',
          content: '原始回复',
          parts: [{ type: 'text', text: '原始回复' }],
          provider: 'plugin-provider',
          model: 'plugin-model',
          status: 'completed',
        },
      }),
    ).resolves.toEqual({
      createdMessage: expect.objectContaining({ id: 'assistant-message-created-1', content: '插件改写后的回复' }),
      modelMessages: [{ role: 'assistant', content: [{ type: 'text', text: '插件改写后的回复' }] }],
    });
  });

  it('sendPluginMessage returns the persisted assistant view after message:created mutates message.send output', async () => {
    const { service, chatService, pluginChatRuntime, prisma } = createChatMessageMutationFixture();
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      title: '当前会话',
      messages: [],
    });
    pluginChatRuntime.applyMessageCreated.mockResolvedValue({
      context: {
        source: 'cron',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'hook-provider',
        activeModelId: 'hook-model',
        activePersonaId: 'persona-1',
      },
      conversationId: 'conversation-1',
      message: {
        role: 'assistant',
        content: 'hook 改写后的回复',
        parts: [{ type: 'text', text: 'hook 改写后的回复' }],
        provider: 'hook-provider',
        model: 'hook-model',
        status: 'completed',
      },
      modelMessages: [{ role: 'assistant', content: [{ type: 'text', text: 'hook 改写后的回复' }] }],
    });
    prisma.message.create.mockResolvedValue({
      id: 'assistant-message-send-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: 'hook 改写后的回复',
      partsJson: JSON.stringify([{ type: 'text', text: 'hook 改写后的回复' }]),
      provider: 'hook-provider',
      model: 'hook-model',
      status: 'completed',
      createdAt: new Date('2026-04-04T08:00:00.000Z'),
      updatedAt: new Date('2026-04-04T08:00:01.000Z'),
    });

    await expect(
      service.sendPluginMessage({
        context: {
          source: 'cron',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'call-provider',
          activeModelId: 'call-model',
          activePersonaId: 'persona-1',
        },
        target: { type: 'conversation', id: 'conversation-1' },
        content: '原始回复',
        provider: 'call-provider',
        model: 'call-model',
      }),
    ).resolves.toEqual({
      target: { type: 'conversation', id: 'conversation-1', label: '当前会话' },
      id: 'assistant-message-send-1',
      role: 'assistant',
      content: 'hook 改写后的回复',
      parts: [{ type: 'text', text: 'hook 改写后的回复' }],
      provider: 'hook-provider',
      model: 'hook-model',
      status: 'completed',
      createdAt: '2026-04-04T08:00:00.000Z',
      updatedAt: '2026-04-04T08:00:01.000Z',
    });
  });

  it('returns the current conversation as the current plugin message target', async () => {
    const { service, chatService } = createChatMessageMutationFixture();
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      title: '当前会话',
      messages: [],
    });

    await expect(
      service.getCurrentPluginMessageTarget({
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      }),
    ).resolves.toEqual({
      type: 'conversation',
      id: 'conversation-1',
      label: '当前会话',
    });
  });

  it('sends a plugin message through the generic message target interface', async () => {
    const { service, chatService, pluginChatRuntime, prisma } = createChatMessageMutationFixture();
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-2',
      title: 'Plugin Target',
      messages: [],
    });
    pluginChatRuntime.applyMessageCreated.mockResolvedValue({
      context: {
        source: 'cron',
        userId: 'user-1',
        conversationId: 'conversation-2',
        activeProviderId: 'plugin-provider',
        activeModelId: 'plugin-model',
        activePersonaId: 'persona-1',
      },
      conversationId: 'conversation-2',
      message: {
        role: 'assistant',
        content: '插件补充回复',
        parts: [{ type: 'text', text: '插件补充回复' }],
        provider: 'plugin-provider',
        model: 'plugin-model',
        status: 'completed',
      },
      modelMessages: [{ role: 'assistant', content: [{ type: 'text', text: '插件补充回复' }] }],
    });
    prisma.message.create.mockResolvedValue({
      id: 'assistant-message-plugin-1',
      conversationId: 'conversation-2',
      role: 'assistant',
      content: '插件补充回复',
      partsJson: JSON.stringify([{ type: 'text', text: '插件补充回复' }]),
      provider: 'plugin-provider',
      model: 'plugin-model',
      status: 'completed',
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
    });

    await expect(
      service.sendPluginMessage({
        context: {
          source: 'cron',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'persona-1',
        },
        target: { type: 'conversation', id: 'conversation-2' },
        content: '插件补充回复',
        provider: 'plugin-provider',
        model: 'plugin-model',
      }),
    ).resolves.toEqual({
      id: 'assistant-message-plugin-1',
      target: { type: 'conversation', id: 'conversation-2', label: 'Plugin Target' },
      role: 'assistant',
      content: '插件补充回复',
      parts: [{ type: 'text', text: '插件补充回复' }],
      provider: 'plugin-provider',
      model: 'plugin-model',
      status: 'completed',
      createdAt: '2026-03-28T10:00:00.000Z',
      updatedAt: '2026-03-28T10:00:00.000Z',
    });
  });
});

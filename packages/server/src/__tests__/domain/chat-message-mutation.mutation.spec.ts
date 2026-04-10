import { createChatMessageMutationFixture } from '../fixtures/chat-message-mutation.fixture';

describe('ChatMessageMutationService - update & delete', () => {
  it('applies message:updated hooks before persisting a user message edit', async () => {
    const { service, chatService, pluginChatRuntime, prisma } = createChatMessageMutationFixture();
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: '旧内容',
          partsJson: JSON.stringify([{ type: 'text', text: '旧内容' }]),
          status: 'completed',
        },
      ],
    });
    pluginChatRuntime.applyMessageUpdated.mockResolvedValue({
      context: { source: 'chat-hook', userId: 'user-1', conversationId: 'conversation-1' },
      conversationId: 'conversation-1',
      messageId: 'message-1',
      currentMessage: {
        id: 'message-1',
        role: 'user',
        content: '旧内容',
        parts: [{ type: 'text', text: '旧内容' }],
        status: 'completed',
      },
      nextMessage: {
        role: 'user',
        content: '插件改写后的新内容',
        parts: [{ type: 'text', text: '插件改写后的新内容' }],
        status: 'completed',
      },
    });
    prisma.message.update.mockResolvedValue({
      id: 'message-1',
      role: 'user',
      content: '插件改写后的新内容',
      partsJson: JSON.stringify([{ type: 'text', text: '插件改写后的新内容' }]),
      status: 'completed',
    });

    await service.updateMessage('user-1', 'conversation-1', 'message-1', {
      content: '用户输入的新内容',
      parts: [{ type: 'text', text: '用户输入的新内容' }],
    } as never);

    expect(pluginChatRuntime.applyMessageUpdated).toHaveBeenCalledWith({
      hookContext: { source: 'chat-hook', userId: 'user-1', conversationId: 'conversation-1' },
      conversationId: 'conversation-1',
      messageId: 'message-1',
      currentMessage: {
        id: 'message-1',
        role: 'user',
        content: '旧内容',
        partsJson: JSON.stringify([{ type: 'text', text: '旧内容' }]),
        status: 'completed',
      },
      nextMessage: {
        role: 'user',
        content: '用户输入的新内容',
        parts: [{ type: 'text', text: '用户输入的新内容' }],
        hasImages: false,
        status: 'completed',
      },
    });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: {
        content: '插件改写后的新内容',
        partsJson: JSON.stringify([{ type: 'text', text: '插件改写后的新内容' }]),
        status: 'completed',
        error: null,
      },
    });
  });

  it('dispatches message:deleted hooks before deleting a message', async () => {
    const { service, chatService, pluginChatRuntime, prisma } = createChatMessageMutationFixture();
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          content: '待删除消息',
          partsJson: null,
          status: 'completed',
          provider: 'openai',
          model: 'gpt-5.2',
        },
      ],
    });
    prisma.message.delete.mockResolvedValue({ id: 'message-1' });

    await service.deleteMessage('user-1', 'conversation-1', 'message-1');

    expect(pluginChatRuntime.dispatchMessageDeleted).toHaveBeenCalledWith({
      hookContext: { source: 'chat-hook', userId: 'user-1', conversationId: 'conversation-1' },
      conversationId: 'conversation-1',
      messageId: 'message-1',
      message: expect.objectContaining({
        id: 'message-1',
        role: 'assistant',
        content: '待删除消息',
        provider: 'openai',
        model: 'gpt-5.2',
        status: 'completed',
      }),
    });
    expect(prisma.message.delete).toHaveBeenCalledWith({ where: { id: 'message-1' } });
  });
});

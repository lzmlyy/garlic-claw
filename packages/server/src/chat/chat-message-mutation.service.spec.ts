import { ChatMessageMutationService } from './chat-message-mutation.service';

describe('ChatMessageMutationService', () => {
  const prisma = {
    message: {
      update: jest.fn(),
      delete: jest.fn(),
    },
    conversation: {
      update: jest.fn(),
    },
  };

  const chatService = {
    getConversation: jest.fn(),
  };

  const pluginRuntime = {
    runMessageUpdatedHooks: jest.fn(),
    runMessageDeletedHooks: jest.fn(),
  };

  const chatTaskService = {
    stopTask: jest.fn(),
  };

  let service: ChatMessageMutationService;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginRuntime.runMessageUpdatedHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );
    pluginRuntime.runMessageDeletedHooks.mockResolvedValue(undefined);
    chatTaskService.stopTask.mockResolvedValue(false);
    prisma.conversation.update.mockResolvedValue(null);
    service = new ChatMessageMutationService(
      prisma as never,
      chatService as never,
      pluginRuntime as never,
      chatTaskService as never,
    );
  });

  it('applies message:updated hooks before persisting a user message edit', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: '旧内容',
          partsJson: JSON.stringify([
            {
              type: 'text',
              text: '旧内容',
            },
          ]),
          status: 'completed',
        },
      ],
    });
    pluginRuntime.runMessageUpdatedHooks.mockResolvedValue({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      conversationId: 'conversation-1',
      messageId: 'message-1',
      currentMessage: {
        id: 'message-1',
        role: 'user',
        content: '旧内容',
        parts: [
          {
            type: 'text',
            text: '旧内容',
          },
        ],
        status: 'completed',
      },
      nextMessage: {
        role: 'user',
        content: '插件改写后的新内容',
        parts: [
          {
            type: 'text',
            text: '插件改写后的新内容',
          },
        ],
        status: 'completed',
      },
    });
    prisma.message.update.mockResolvedValue({
      id: 'message-1',
      role: 'user',
      content: '插件改写后的新内容',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '插件改写后的新内容',
        },
      ]),
      status: 'completed',
    });

    await service.updateMessage('user-1', 'conversation-1', 'message-1', {
      content: '用户输入的新内容',
      parts: [
        {
          type: 'text',
          text: '用户输入的新内容',
        },
      ],
    } as never);

    expect(pluginRuntime.runMessageUpdatedHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        conversationId: 'conversation-1',
        messageId: 'message-1',
        currentMessage: {
          id: 'message-1',
          role: 'user',
          content: '旧内容',
          parts: [
            {
              type: 'text',
              text: '旧内容',
            },
          ],
          status: 'completed',
        },
        nextMessage: {
          role: 'user',
          content: '用户输入的新内容',
          parts: [
            {
              type: 'text',
              text: '用户输入的新内容',
            },
          ],
          status: 'completed',
        },
      },
    });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: {
        content: '插件改写后的新内容',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '插件改写后的新内容',
          },
        ]),
        status: 'completed',
        error: null,
      },
    });
  });

  it('dispatches message:deleted hooks before deleting a message', async () => {
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
    prisma.message.delete.mockResolvedValue({
      id: 'message-1',
    });

    await service.deleteMessage('user-1', 'conversation-1', 'message-1');

    expect(pluginRuntime.runMessageDeletedHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        conversationId: 'conversation-1',
        messageId: 'message-1',
        message: {
          id: 'message-1',
          role: 'assistant',
          content: '待删除消息',
          parts: [],
          provider: 'openai',
          model: 'gpt-5.2',
          status: 'completed',
        },
      },
    });
    expect(prisma.message.delete).toHaveBeenCalledWith({
      where: { id: 'message-1' },
    });
  });
});

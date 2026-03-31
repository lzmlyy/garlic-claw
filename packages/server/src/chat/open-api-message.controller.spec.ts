import { OpenApiMessageController } from './open-api-message.controller';

describe('OpenApiMessageController', () => {
  const chatMessages = {
    sendPluginMessage: jest.fn(),
  };

  let controller: OpenApiMessageController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new OpenApiMessageController(chatMessages as never);
  });

  it('writes assistant messages into a conversation through the shared message.send chain', async () => {
    chatMessages.sendPluginMessage.mockResolvedValue({
      id: 'assistant-message-1',
      target: {
        type: 'conversation',
        id: 'conversation-1',
        label: 'Roadmap',
      },
      role: 'assistant',
      content: '后台任务已经完成。',
      parts: [],
      provider: 'openai',
      model: 'gpt-5.2',
      status: 'completed',
      createdAt: '2026-03-31T08:00:00.000Z',
      updatedAt: '2026-03-31T08:00:00.000Z',
    });

    await expect(
      controller.writeAssistantMessage(
        {
          id: 'user-1',
          authType: 'api_key',
          username: 'alice',
          email: 'alice@example.com',
          role: 'user',
          apiKeyId: 'key-1',
          scopes: ['conversation.message.write'],
        } as never,
        'conversation-1',
        {
          content: '后台任务已经完成。',
          provider: 'openai',
          model: 'gpt-5.2',
        } as never,
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        id: 'assistant-message-1',
        content: '后台任务已经完成。',
      }),
    );
    expect(chatMessages.sendPluginMessage).toHaveBeenCalledWith({
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      target: {
        type: 'conversation',
        id: 'conversation-1',
      },
      content: '后台任务已经完成。',
      parts: undefined,
      provider: 'openai',
      model: 'gpt-5.2',
    });
  });
});

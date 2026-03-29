import { ChatService } from './chat.service';

describe('ChatService', () => {
  const prisma = {
    conversation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  };

  const pluginRuntime = {
    runConversationCreatedHooks: jest.fn(),
  };

  let service: ChatService;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginRuntime.runConversationCreatedHooks.mockResolvedValue(undefined);
    service = new ChatService(
      prisma as never,
      pluginRuntime as never,
    );
  });

  it('dispatches conversation:created hooks after persisting a conversation', async () => {
    prisma.conversation.create.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      title: '新的对话',
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
    });

    const result = await service.createConversation('user-1', {
      title: '新的对话',
    });

    expect(result).toEqual({
      id: 'conversation-1',
      userId: 'user-1',
      title: '新的对话',
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
    });
    expect(pluginRuntime.runConversationCreatedHooks).toHaveBeenCalledWith({
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        context: {
          source: 'http-route',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        conversation: {
          id: 'conversation-1',
          title: '新的对话',
          createdAt: '2026-03-28T10:00:00.000Z',
          updatedAt: '2026-03-28T10:00:00.000Z',
        },
      },
    });
  });
});

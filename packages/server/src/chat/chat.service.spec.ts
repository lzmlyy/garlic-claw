import { ChatService } from './chat.service';

describe('ChatService', () => {
  const prisma = {
    conversation: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  const pluginRuntime = {
    runConversationCreatedHooks: jest.fn(),
  };

  const skillSession = {
    getConversationSkillStateForUser: jest.fn(),
    updateConversationSkillStateForUser: jest.fn(),
  };

  let service: ChatService;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginRuntime.runConversationCreatedHooks.mockResolvedValue(undefined);
    service = new ChatService(
      prisma as never,
      pluginRuntime as never,
      skillSession as never,
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

  it('returns normalized host service defaults when a conversation has no persisted settings', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      hostServicesJson: null,
    });

    await expect(
      service.getConversationHostServices('user-1', 'conversation-1'),
    ).resolves.toEqual({
      sessionEnabled: true,
      llmEnabled: true,
      ttsEnabled: true,
    });
  });

  it('merges and persists updated host service settings for the owned conversation', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      userId: 'user-1',
      hostServicesJson: JSON.stringify({
        sessionEnabled: true,
        llmEnabled: true,
        ttsEnabled: true,
      }),
    });
    prisma.conversation.update.mockResolvedValue({
      hostServicesJson: JSON.stringify({
        sessionEnabled: true,
        llmEnabled: false,
        ttsEnabled: true,
      }),
    });

    await expect(
      service.updateConversationHostServices('user-1', 'conversation-1', {
        llmEnabled: false,
      }),
    ).resolves.toEqual({
      sessionEnabled: true,
      llmEnabled: false,
      ttsEnabled: true,
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: {
        hostServicesJson: JSON.stringify({
          sessionEnabled: true,
          llmEnabled: false,
          ttsEnabled: true,
        }),
      },
    });
  });

  it('delegates conversation skill state reads and writes to the skill session service', async () => {
    skillSession.getConversationSkillStateForUser.mockResolvedValue({
      activeSkillIds: ['project/planner'],
      activeSkills: [
        {
          id: 'project/planner',
          name: '规划执行',
        },
      ],
    });
    skillSession.updateConversationSkillStateForUser.mockResolvedValue({
      activeSkillIds: ['project/plugin-operator'],
      activeSkills: [
        {
          id: 'project/plugin-operator',
          name: '插件运维',
        },
      ],
    });

    await expect(
      service.getConversationSkillState('user-1', 'conversation-1'),
    ).resolves.toEqual({
      activeSkillIds: ['project/planner'],
      activeSkills: [
        {
          id: 'project/planner',
          name: '规划执行',
        },
      ],
    });
    await expect(
      service.updateConversationSkills('user-1', 'conversation-1', [
        'project/plugin-operator',
      ]),
    ).resolves.toEqual({
      activeSkillIds: ['project/plugin-operator'],
      activeSkills: [
        {
          id: 'project/plugin-operator',
          name: '插件运维',
        },
      ],
    });

    expect(skillSession.getConversationSkillStateForUser).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
    );
    expect(skillSession.updateConversationSkillStateForUser).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      ['project/plugin-operator'],
    );
  });
});

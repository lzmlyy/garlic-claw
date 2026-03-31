import { SkillCommandService } from './skill-command.service';

describe('SkillCommandService', () => {
  const skillRegistry = {
    listSkillSummaries: jest.fn(),
  };

  const skillSession = {
    getConversationSkillStateForUser: jest.fn(),
    updateConversationSkillStateForUser: jest.fn(),
  };

  let service: SkillCommandService;

  beforeEach(() => {
    jest.clearAllMocks();
    skillRegistry.listSkillSummaries.mockResolvedValue([
      {
        id: 'project/planner',
        name: '规划执行',
        description: '先拆任务，再逐步执行。',
        tags: ['planning'],
        sourceKind: 'project',
        entryPath: 'planner/SKILL.md',
        promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
        toolPolicy: {
          allow: ['kb.search'],
          deny: [],
        },
      },
    ]);
    skillSession.getConversationSkillStateForUser.mockResolvedValue({
      activeSkillIds: [],
      activeSkills: [],
    });
    skillSession.updateConversationSkillStateForUser.mockResolvedValue({
      activeSkillIds: ['project/planner'],
      activeSkills: [
        {
          id: 'project/planner',
          name: '规划执行',
          description: '先拆任务，再逐步执行。',
          tags: ['planning'],
          sourceKind: 'project',
          entryPath: 'planner/SKILL.md',
          promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
          toolPolicy: {
            allow: ['kb.search'],
            deny: [],
          },
        },
      ],
    });
    service = new SkillCommandService(
      skillRegistry as never,
      skillSession as never,
    );
  });

  it('returns null for non skill commands', async () => {
    await expect(
      service.tryHandleMessage({
        userId: 'user-1',
        conversationId: 'conversation-1',
        messageText: '普通消息',
      }),
    ).resolves.toBeNull();
  });

  it('activates a skill through /skill use and returns a short-circuit response', async () => {
    await expect(
      service.tryHandleMessage({
        userId: 'user-1',
        conversationId: 'conversation-1',
        messageText: '/skill use project/planner',
      }),
    ).resolves.toEqual({
      assistantContent: expect.stringContaining('已激活 1 个 skill'),
      assistantParts: [
        {
          type: 'text',
          text: expect.stringContaining('project/planner'),
        },
      ],
      providerId: 'system',
      modelId: 'skill-command',
    });

    expect(skillSession.updateConversationSkillStateForUser).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
      ['project/planner'],
    );
  });

  it('lists available and active skills through /skill list', async () => {
    skillSession.getConversationSkillStateForUser.mockResolvedValue({
      activeSkillIds: ['project/planner'],
      activeSkills: [
        {
          id: 'project/planner',
          name: '规划执行',
          description: '先拆任务，再逐步执行。',
          tags: ['planning'],
          sourceKind: 'project',
          entryPath: 'planner/SKILL.md',
          promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
          toolPolicy: {
            allow: ['kb.search'],
            deny: [],
          },
        },
      ],
    });

    await expect(
      service.tryHandleMessage({
        userId: 'user-1',
        conversationId: 'conversation-1',
        messageText: '/skill list',
      }),
    ).resolves.toEqual({
      assistantContent: expect.stringContaining('当前可用 skills'),
      assistantParts: [
        {
          type: 'text',
          text: expect.stringContaining('已激活'),
        },
      ],
      providerId: 'system',
      modelId: 'skill-command',
    });
  });
});

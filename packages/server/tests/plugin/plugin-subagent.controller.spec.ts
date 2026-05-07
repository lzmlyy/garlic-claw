import { SubagentController } from '../../src/modules/execution/subagent/subagent.controller';

describe('SubagentController', () => {
  const subagentRunner = {
    closeSubagent: jest.fn(),
    getSubagentOrThrow: jest.fn(),
    listOverview: jest.fn(),
    listTypes: jest.fn(),
  };

  let controller: SubagentController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new SubagentController(subagentRunner as never);
  });

  it('returns the subagent overview', () => {
    subagentRunner.listOverview.mockReturnValue({
      subagents: [
        {
          conversationId: 'subagent-conversation-1',
          title: '总结当前对话',
          messageCount: 2,
          updatedAt: '2026-03-30T12:00:05.000Z',
          pluginId: 'subagent',
          pluginDisplayName: 'Subagent',
          runtimeKind: 'local',
          status: 'completed',
          requestPreview: '请帮我总结当前对话',
          resultPreview: '这是后台子代理总结',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          requestedAt: '2026-03-30T12:00:00.000Z',
          startedAt: '2026-03-30T12:00:01.000Z',
          finishedAt: '2026-03-30T12:00:05.000Z',
          closedAt: null,
        },
      ],
    });

    expect(controller.listOverview()).toEqual({
      subagents: [
        expect.objectContaining({
          conversationId: 'subagent-conversation-1',
          status: 'completed',
        }),
      ],
    });
  });

  it('returns one persisted subagent conversation projection', () => {
    subagentRunner.getSubagentOrThrow.mockReturnValue({
      conversationId: 'subagent-conversation-1',
      title: '总结当前对话',
      messageCount: 2,
      updatedAt: '2026-03-30T12:00:05.000Z',
      pluginId: 'subagent',
      pluginDisplayName: 'Subagent',
      runtimeKind: 'local',
      status: 'completed',
      requestPreview: '请帮我总结当前对话',
      resultPreview: '这是后台子代理总结',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      requestedAt: '2026-03-30T12:00:00.000Z',
      startedAt: '2026-03-30T12:00:01.000Z',
      finishedAt: '2026-03-30T12:00:05.000Z',
      closedAt: null,
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        messages: [
          {
            role: 'user',
            content: '请帮我总结当前对话',
          },
        ],
      },
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      result: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        text: '这是后台子代理总结',
        message: {
          role: 'assistant',
          content: '这是后台子代理总结',
        },
        finishReason: 'stop',
        toolCalls: [],
        toolResults: [],
      },
    });

    expect(controller.getSubagent('subagent-conversation-1')).toEqual(
      expect.objectContaining({
        conversationId: 'subagent-conversation-1',
        request: expect.objectContaining({
          messages: [
            {
              role: 'user',
              content: '请帮我总结当前对话',
            },
          ],
        }),
        result: expect.objectContaining({
          text: '这是后台子代理总结',
        }),
      }),
    );
  });

  it('returns available subagent types for config selectors', () => {
    subagentRunner.listTypes.mockReturnValue([
      {
        id: 'general',
        name: '通用',
        description: '默认子代理',
      },
      {
        id: 'explore',
        name: '探索',
      },
    ]);

    expect(controller.listTypes()).toEqual([
      {
        id: 'general',
        name: '通用',
        description: '默认子代理',
      },
      {
        id: 'explore',
        name: '探索',
      },
    ]);
  });

  it('closes one persisted subagent conversation projection', async () => {
    subagentRunner.getSubagentOrThrow
      .mockReturnValueOnce({
        conversationId: 'subagent-conversation-1',
        pluginId: 'subagent',
      })
      .mockReturnValueOnce({
        conversationId: 'subagent-conversation-1',
        pluginId: 'subagent',
        status: 'closed',
      });
    subagentRunner.closeSubagent.mockResolvedValue({
      conversationId: 'subagent-conversation-1',
      pluginId: 'subagent',
      status: 'closed',
    });

    await expect(controller.closeSubagent('subagent-conversation-1')).resolves.toEqual({
      conversationId: 'subagent-conversation-1',
      pluginId: 'subagent',
      status: 'closed',
    });
    expect(subagentRunner.closeSubagent).toHaveBeenCalledWith('subagent', {
      conversationId: 'subagent-conversation-1',
    });
  });
});


import { PluginController } from '../../../../src/adapters/http/plugin/plugin.controller';

describe('PluginController subagent task routes', () => {
  const pluginEventStoreService = {
    recordEvent: jest.fn(),
  };
  const pluginRemoteBootstrapService = {
    issueBootstrap: jest.fn(),
  };
  const pluginPersistenceService = {
    deletePlugin: jest.fn(),
    getPluginOrThrow: jest.fn(),
    upsertPlugin: jest.fn(),
  };
  const runtimeHostConversationRecordService = {
    listPluginConversationSessions: jest.fn(),
  };
  const runtimeHostPluginDispatchService = {
    invokeRoute: jest.fn(),
    listPlugins: jest.fn(),
  };
  const runtimeHostPluginRuntimeService = {
    deleteCronJob: jest.fn(),
    listCronJobs: jest.fn(),
    deletePluginStorage: jest.fn(),
    listPluginStorage: jest.fn(),
    setPluginStorage: jest.fn(),
  };
  const runtimeHostSubagentRunnerService = {
    getTaskOrThrow: jest.fn(),
    listOverview: jest.fn(),
  };
  const runtimePluginGovernanceService = {
    checkPluginHealth: jest.fn(),
    listPlugins: jest.fn(),
    listSupportedActions: jest.fn(),
    runPluginAction: jest.fn(),
  };

  let controller: PluginController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PluginController(
      pluginRemoteBootstrapService as never,
      pluginPersistenceService as never,
      runtimeHostConversationRecordService as never,
      runtimeHostPluginDispatchService as never,
      runtimeHostPluginRuntimeService as never,
      runtimeHostSubagentRunnerService as never,
      runtimePluginGovernanceService as never,
    );
  });

  it('returns the background subagent task overview', async () => {
    runtimeHostSubagentRunnerService.listOverview.mockReturnValue({
      tasks: [
        {
          id: 'subagent-task-1',
          pluginId: 'builtin.subagent-delegate',
          pluginDisplayName: '子代理委派',
          runtimeKind: 'builtin',
          status: 'completed',
          requestPreview: '请帮我总结当前对话',
          resultPreview: '这是后台任务总结',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          writeBackStatus: 'sent',
          writeBackMessageId: 'assistant-message-1',
          requestedAt: '2026-03-30T12:00:00.000Z',
          startedAt: '2026-03-30T12:00:01.000Z',
          finishedAt: '2026-03-30T12:00:05.000Z',
        },
      ],
    });

    expect(controller.listSubagentTaskOverview()).toEqual({
      tasks: [
        expect.objectContaining({
          id: 'subagent-task-1',
          status: 'completed',
        }),
      ],
    });
  });

  it('returns one persisted background subagent task by id', async () => {
    runtimeHostSubagentRunnerService.getTaskOrThrow.mockReturnValue({
      id: 'subagent-task-1',
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: '子代理委派',
      runtimeKind: 'builtin',
      status: 'completed',
      requestPreview: '请帮我总结当前对话',
      resultPreview: '这是后台任务总结',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      writeBackStatus: 'sent',
      writeBackMessageId: 'assistant-message-1',
      requestedAt: '2026-03-30T12:00:00.000Z',
      startedAt: '2026-03-30T12:00:01.000Z',
      finishedAt: '2026-03-30T12:00:05.000Z',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        messages: [
          {
            role: 'user',
            content: '请帮我总结当前对话',
          },
        ],
        maxSteps: 4,
      },
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      result: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        text: '这是后台任务总结',
        message: {
          role: 'assistant',
          content: '这是后台任务总结',
        },
        finishReason: 'stop',
        toolCalls: [],
        toolResults: [],
      },
    });

    expect(controller.getSubagentTask('subagent-task-1')).toEqual(
      expect.objectContaining({
        id: 'subagent-task-1',
        result: expect.objectContaining({
          text: '这是后台任务总结',
        }),
      }),
    );
  });
});

import { BadRequestException } from '@nestjs/common';
import { PluginController } from '../../../../src/adapters/http/plugin/plugin.controller';

describe('PluginController runtime resources', () => {
  const pluginEventStoreService = {
    recordEvent: jest.fn(),
  };
  const pluginRemoteBootstrapService = {
    issueBootstrap: jest.fn(),
  };
  const pluginPersistenceService = {
    deletePlugin: jest.fn(),
    getPluginOrThrow: jest.fn(),
    recordPluginEvent: jest.fn(),
    upsertPlugin: jest.fn(),
  };
  const runtimeHostConversationRecordService = {
    finishPluginConversationSession: jest.fn(),
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

  it('delegates storage, cron and session routes to matching runtime owners', async () => {
    runtimeHostPluginRuntimeService.listPluginStorage.mockReturnValue([
      { key: 'greeting', value: 'hello' },
    ]);
    runtimeHostPluginRuntimeService.setPluginStorage.mockReturnValue('world');
    runtimeHostPluginRuntimeService.deletePluginStorage.mockReturnValue(true);
    runtimeHostPluginRuntimeService.listCronJobs.mockReturnValue([
      { id: 'cron-job-1', name: 'heartbeat' },
    ]);
    runtimeHostPluginRuntimeService.deleteCronJob.mockReturnValue(true);
    runtimeHostConversationRecordService.listPluginConversationSessions.mockReturnValue([
      {
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 45000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:00:45.000Z',
        lastMatchedAt: '2026-03-28T12:00:10.000Z',
        captureHistory: true,
        historyMessages: [],
      },
    ]);
    runtimeHostConversationRecordService.finishPluginConversationSession.mockReturnValue(true);

    expect(controller.listPluginStorage('builtin.memory-context', 'greet')).toEqual([
      { key: 'greeting', value: 'hello' },
    ]);
    expect(controller.setPluginStorage('builtin.memory-context', {
      key: 'greeting',
      value: 'world',
    } as never)).toEqual({ key: 'greeting', value: 'world' });
    expect(controller.deletePluginStorage('builtin.memory-context', 'greeting')).toBe(true);
    expect(controller.listPluginCrons('builtin.cron-heartbeat')).toEqual([
      { id: 'cron-job-1', name: 'heartbeat' },
    ]);
    expect(controller.deletePluginCron('builtin.cron-heartbeat', 'cron-job-1')).toBe(true);
    expect(controller.listPluginConversationSessions('builtin.idiom-session')).toEqual([
      expect.objectContaining({
        conversationId: 'conversation-1',
      }),
    ]);
    expect(controller.finishPluginConversationSession('builtin.idiom-session', 'conversation-1')).toBe(true);
  });

  it('rejects empty storage keys before touching runtime host storage', () => {
    expect(() => controller.deletePluginStorage('builtin.memory-context', '   ')).toThrow(BadRequestException);
    expect(runtimeHostPluginRuntimeService.deletePluginStorage).not.toHaveBeenCalled();
  });
});

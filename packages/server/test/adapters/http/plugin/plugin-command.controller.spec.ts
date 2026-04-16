import { PluginController } from '../../../../src/adapters/http/plugin/plugin.controller';

describe('PluginController command overview', () => {
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

  it('returns the unified plugin command directory overview', async () => {
    runtimePluginGovernanceService.listPlugins.mockReturnValue([
      {
        connected: true,
        manifest: {
          id: 'builtin.core-tools',
          name: '核心工具',
          runtime: 'builtin',
          version: '1.0.0',
          permissions: [],
          commands: [
            {
              kind: 'command',
              canonicalCommand: '/sys reload',
              path: ['sys', 'reload'],
              aliases: ['/sr'],
              variants: ['/sys reload', '/sr'],
            },
          ],
          tools: [],
        },
        pluginId: 'builtin.core-tools',
      },
      {
        connected: false,
        manifest: {
          id: 'builtin.alias-tools',
          name: '别名工具',
          runtime: 'builtin',
          version: '1.0.0',
          permissions: [],
          commands: [
            {
              kind: 'command',
              canonicalCommand: '/sys reload',
              path: ['sys', 'reload'],
              aliases: [],
              variants: ['/sys reload'],
            },
          ],
          tools: [],
        },
        pluginId: 'builtin.alias-tools',
      },
    ]);

    await expect(controller.listCommandOverview()).resolves.toEqual({
      commands: expect.arrayContaining([
        expect.objectContaining({
          commandId: 'builtin.core-tools:/sys reload:command',
          canonicalCommand: '/sys reload',
        }),
        expect.objectContaining({
          commandId: 'builtin.alias-tools:/sys reload:command',
          canonicalCommand: '/sys reload',
        }),
      ]),
      conflicts: expect.arrayContaining([
        expect.objectContaining({
          trigger: '/sys reload',
        }),
      ]),
    });
  });

  it('keeps disconnected commands marked offline even when runtime snapshots still retain the plugin record', async () => {
    runtimePluginGovernanceService.listPlugins.mockReturnValue([
      {
        connected: false,
        manifest: {
          id: 'remote.echo',
          name: 'Remote Echo',
          runtime: 'remote',
          version: '1.0.0',
          permissions: [],
          commands: [
            {
              kind: 'command',
              canonicalCommand: '/remote ping',
              path: ['remote', 'ping'],
              aliases: [],
              variants: ['/remote ping'],
            },
          ],
          tools: [],
        },
        pluginId: 'remote.echo',
      },
    ]);

    await expect(controller.listCommandOverview()).resolves.toEqual({
      commands: [
        expect.objectContaining({
          commandId: 'remote.echo:/remote ping:command',
          connected: false,
        }),
      ],
      conflicts: [],
    });
  });
});

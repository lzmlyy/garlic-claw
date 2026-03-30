import type {
  PluginConfigSchema,
  PluginConversationSessionInfo,
  PluginInfo,
} from '@garlic-claw/shared';
import { PluginController } from './plugin.controller';

describe('PluginController', () => {
  const pluginService = {
    findAll: jest.fn(),
    getPluginConfig: jest.fn(),
    updatePluginConfig: jest.fn(),
    listPluginStorage: jest.fn(),
    setPluginStorage: jest.fn(),
    deletePluginStorage: jest.fn(),
    getPluginScope: jest.fn(),
    updatePluginScope: jest.fn(),
    getPluginHealth: jest.fn(),
    listPluginEvents: jest.fn(),
  };

  const pluginRuntime = {
    listPlugins: jest.fn(),
    getRuntimePressure: jest.fn(),
    refreshPluginGovernance: jest.fn(),
    listConversationSessions: jest.fn(),
    finishConversationSessionForGovernance: jest.fn(),
  };

  const pluginCronService = {
    listCronJobs: jest.fn(),
    deleteCron: jest.fn(),
  };

  const pluginAdmin = {
    runAction: jest.fn(),
  };

  const configSchema: PluginConfigSchema = {
    fields: [
      {
        key: 'limit',
        type: 'number',
        defaultValue: 5,
      },
    ],
  };

  let controller: PluginController;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginRuntime.getRuntimePressure.mockReturnValue(null);
    controller = new PluginController(
      pluginService as never,
      pluginRuntime as never,
      pluginCronService as never,
      pluginAdmin as never,
    );
  });

  it('returns plugin config snapshots from the plugin service', async () => {
    pluginService.getPluginConfig.mockResolvedValue({
      schema: configSchema,
      values: {
        limit: 8,
      },
    });

    await expect(controller.getPluginConfig('builtin.memory-context')).resolves.toEqual({
      schema: configSchema,
      values: {
        limit: 8,
      },
    });
  });

  it('updates plugin config and refreshes the runtime cache', async () => {
    pluginService.updatePluginConfig.mockResolvedValue({
      schema: configSchema,
      values: {
        limit: 6,
      },
    });

    await expect(
      controller.updatePluginConfig('builtin.memory-context', {
        values: {
          limit: 6,
        },
      } as never),
    ).resolves.toEqual({
      schema: configSchema,
      values: {
        limit: 6,
      },
    });
    expect(pluginRuntime.refreshPluginGovernance).toHaveBeenCalledWith(
      'builtin.memory-context',
    );
  });

  it('returns and updates plugin scope rules', async () => {
    pluginService.getPluginScope.mockResolvedValue({
      defaultEnabled: true,
      conversations: {
        'conversation-1': false,
      },
    });
    pluginService.updatePluginScope.mockResolvedValue({
      defaultEnabled: false,
      conversations: {
        'conversation-1': true,
      },
    });

    await expect(controller.getPluginScope('builtin.memory-context')).resolves.toEqual({
      defaultEnabled: true,
      conversations: {
        'conversation-1': false,
      },
    });
    await expect(
      controller.updatePluginScope('builtin.memory-context', {
        defaultEnabled: false,
        conversations: {
          'conversation-1': true,
        },
      } as never),
    ).resolves.toEqual({
      defaultEnabled: false,
      conversations: {
        'conversation-1': true,
      },
    });
    expect(pluginRuntime.refreshPluginGovernance).toHaveBeenCalledWith(
      'builtin.memory-context',
    );
  });

  it('still merges runtime manifests into plugin list responses', async () => {
    const pluginInfo: PluginInfo = {
      id: 'plugin-1',
      name: 'builtin.memory-context',
      deviceType: 'builtin',
      status: 'online',
      capabilities: [],
      connected: true,
      lastSeenAt: '2026-03-27T12:00:00.000Z',
      createdAt: '2026-03-27T12:00:00.000Z',
      updatedAt: '2026-03-27T12:00:00.000Z',
    };
    pluginService.findAll.mockResolvedValue([
      {
        ...pluginInfo,
        lastSeenAt: new Date('2026-03-27T12:00:00.000Z'),
        createdAt: new Date('2026-03-27T12:00:00.000Z'),
        updatedAt: new Date('2026-03-27T12:00:00.000Z'),
        capabilities: '[]',
      },
    ]);
    pluginRuntime.listPlugins.mockReturnValue([
      {
        pluginId: 'builtin.memory-context',
        runtimeKind: 'builtin',
        deviceType: 'builtin',
        supportedActions: ['health-check', 'reload'],
        runtimePressure: {
          activeExecutions: 1,
          maxConcurrentExecutions: 4,
        },
        manifest: {
          id: 'builtin.memory-context',
          name: '记忆上下文',
          version: '1.0.0',
          runtime: 'builtin',
          permissions: ['memory:read', 'config:read'],
          tools: [],
          hooks: [
            {
              name: 'chat:before-model',
            },
          ],
          routes: [
            {
              path: 'inspect/context',
              methods: ['GET'],
            },
          ],
          config: configSchema,
        },
      },
    ]);
    pluginCronService.listCronJobs.mockResolvedValue([
      {
        id: 'cron-job-1',
        pluginId: 'builtin.memory-context',
        name: 'heartbeat',
        cron: '10s',
        description: '定时写入插件心跳',
        source: 'manifest',
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        createdAt: '2026-03-27T12:00:00.000Z',
        updatedAt: '2026-03-27T12:00:00.000Z',
      },
    ]);

    const result = await controller.listPlugins();

    expect(result[0]).toMatchObject({
      name: 'builtin.memory-context',
      connected: true,
      runtimeKind: 'builtin',
      governance: {
        canDisable: true,
        builtinRole: 'user-facing',
      },
      supportedActions: ['health-check', 'reload'],
      version: '1.0.0',
      permissions: ['memory:read', 'config:read'],
      routes: [
        {
          path: 'inspect/context',
          methods: ['GET'],
        },
      ],
      crons: [
        {
          id: 'cron-job-1',
          pluginId: 'builtin.memory-context',
          name: 'heartbeat',
          cron: '10s',
          description: '定时写入插件心跳',
          source: 'manifest',
          enabled: true,
        },
      ],
      health: expect.objectContaining({
        runtimePressure: {
          activeExecutions: 1,
          maxConcurrentExecutions: 4,
        },
      }),
    });
    expect(pluginCronService.listCronJobs).toHaveBeenCalledWith(
      'builtin.memory-context',
    );
  });

  it('merges runtime concurrency pressure into plugin health responses', async () => {
    pluginService.getPluginHealth.mockResolvedValue({
      status: 'healthy',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: '2026-03-28T05:00:00.000Z',
      lastCheckedAt: '2026-03-28T05:00:00.000Z',
    });
    pluginRuntime.getRuntimePressure.mockReturnValue({
      activeExecutions: 2,
      maxConcurrentExecutions: 6,
    });

    await expect(controller.getPluginHealth('builtin.memory-context')).resolves.toEqual({
      status: 'healthy',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: '2026-03-28T05:00:00.000Z',
      lastCheckedAt: '2026-03-28T05:00:00.000Z',
      runtimePressure: {
        activeExecutions: 2,
        maxConcurrentExecutions: 6,
      },
    });
  });

  it('returns runtime-declared governance actions instead of letting the client guess by runtime kind', async () => {
    pluginService.findAll.mockResolvedValue([
      {
        id: 'plugin-2',
        name: 'remote.pc-host',
        displayName: '电脑助手',
        description: '远程 PC 插件',
        deviceType: 'pc',
        runtimeKind: 'remote',
        status: 'online',
        capabilities: '[]',
        permissions: '[]',
        hooks: '[]',
        routes: '[]',
        version: '1.0.0',
        healthStatus: 'healthy',
        failureCount: 0,
        consecutiveFailures: 0,
        lastError: null,
        lastErrorAt: null,
        lastSuccessAt: null,
        lastCheckedAt: null,
        lastSeenAt: new Date('2026-03-27T12:10:00.000Z'),
        createdAt: new Date('2026-03-27T12:10:00.000Z'),
        updatedAt: new Date('2026-03-27T12:10:00.000Z'),
      },
    ]);
    pluginRuntime.listPlugins.mockReturnValue([
      {
        pluginId: 'remote.pc-host',
        runtimeKind: 'remote',
        deviceType: 'pc',
        supportedActions: ['health-check', 'reload', 'reconnect'],
        manifest: {
          id: 'remote.pc-host',
          name: '电脑助手',
          version: '1.0.0',
          runtime: 'remote',
          permissions: [],
          tools: [],
        },
      },
    ]);
    pluginCronService.listCronJobs.mockResolvedValue([]);

    const result = await controller.listPlugins();

    expect(result[0]?.supportedActions).toEqual([
      'health-check',
      'reload',
      'reconnect',
    ]);
  });

  it('falls back to safe defaults when persisted plugin manifest json is malformed', async () => {
    pluginService.findAll.mockResolvedValue([
      {
        id: 'plugin-3',
        name: 'remote.broken-manifest',
        displayName: 'Broken Manifest',
        description: '损坏的持久化清单',
        deviceType: 'pc',
        runtimeKind: 'remote',
        status: 'offline',
        capabilities: '{not-json',
        permissions: '{not-json',
        hooks: '{not-json',
        routes: '{not-json',
        version: '1.0.0',
        healthStatus: 'unknown',
        failureCount: 0,
        consecutiveFailures: 0,
        lastError: null,
        lastErrorAt: null,
        lastSuccessAt: null,
        lastCheckedAt: null,
        lastSeenAt: null,
        createdAt: new Date('2026-03-27T12:10:00.000Z'),
        updatedAt: new Date('2026-03-27T12:10:00.000Z'),
      },
    ]);
    pluginRuntime.listPlugins.mockReturnValue([]);
    pluginCronService.listCronJobs.mockResolvedValue([]);

    await expect(controller.listPlugins()).resolves.toEqual([
      expect.objectContaining({
        name: 'remote.broken-manifest',
        governance: {
          canDisable: true,
        },
        capabilities: [],
        permissions: [],
        hooks: [],
        routes: [],
        supportedActions: ['health-check'],
      }),
    ]);
  });

  it('returns plugin health and recent event logs', async () => {
    pluginService.getPluginHealth.mockResolvedValue({
      status: 'degraded',
      failureCount: 2,
      consecutiveFailures: 1,
      lastError: 'memory.search timeout',
      lastErrorAt: '2026-03-27T12:00:00.000Z',
      lastSuccessAt: '2026-03-27T11:58:00.000Z',
      lastCheckedAt: '2026-03-27T12:00:00.000Z',
    });
    pluginService.listPluginEvents.mockResolvedValue({
      items: [
        {
          id: 'event-1',
          type: 'tool:error',
          level: 'error',
          message: 'memory.search timeout',
          metadata: {
            toolName: 'memory.search',
          },
          createdAt: '2026-03-27T12:00:00.000Z',
        },
      ],
      nextCursor: 'event-1',
    });

    await expect(
      (controller as any).getPluginHealth('builtin.memory-context'),
    ).resolves.toEqual({
      status: 'degraded',
      failureCount: 2,
      consecutiveFailures: 1,
      lastError: 'memory.search timeout',
      lastErrorAt: '2026-03-27T12:00:00.000Z',
      lastSuccessAt: '2026-03-27T11:58:00.000Z',
      lastCheckedAt: '2026-03-27T12:00:00.000Z',
    });
    await expect(
      (controller as any).listPluginEvents('builtin.memory-context', '50'),
    ).resolves.toEqual({
      items: [
        {
          id: 'event-1',
          type: 'tool:error',
          level: 'error',
          message: 'memory.search timeout',
          metadata: {
            toolName: 'memory.search',
          },
          createdAt: '2026-03-27T12:00:00.000Z',
        },
      ],
      nextCursor: 'event-1',
    });
  });

  it('passes event log filters and cursor to the plugin service', async () => {
    pluginService.listPluginEvents.mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    await expect(
      (controller as any).listPluginEvents(
        'builtin.memory-context',
        '100',
        'error',
        'tool:error',
        'memory.search',
        'event-2',
      ),
    ).resolves.toEqual({
      items: [],
      nextCursor: null,
    });

    expect(pluginService.listPluginEvents).toHaveBeenCalledWith(
      'builtin.memory-context',
      {
        limit: 100,
        level: 'error',
        type: 'tool:error',
        keyword: 'memory.search',
        cursor: 'event-2',
      },
    );
  });

  it('deletes host cron jobs through the cron service', async () => {
    pluginCronService.deleteCron.mockResolvedValue(true);

    await expect(
      (controller as any).deletePluginCron('builtin.cron-heartbeat', 'cron-job-2'),
    ).resolves.toBe(true);

    expect(pluginCronService.deleteCron).toHaveBeenCalledWith(
      'builtin.cron-heartbeat',
      'cron-job-2',
    );
  });

  it('lists and force-finishes plugin conversation sessions through the runtime service', async () => {
    const sessions: PluginConversationSessionInfo[] = [
      {
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 45000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:00:45.000Z',
        lastMatchedAt: '2026-03-28T12:00:10.000Z',
        captureHistory: true,
        historyMessages: [
          {
            role: 'user',
            content: '成语接龙',
            parts: [
              {
                type: 'text',
                text: '成语接龙',
              },
            ],
          },
        ],
        metadata: {
          flow: 'idiom',
        },
      },
    ];
    pluginRuntime.listConversationSessions.mockReturnValue(sessions);
    pluginRuntime.finishConversationSessionForGovernance.mockReturnValue(true);

    await expect(
      (controller as any).listPluginConversationSessions('builtin.idiom-session'),
    ).resolves.toEqual(sessions);
    await expect(
      (controller as any).finishPluginConversationSession(
        'builtin.idiom-session',
        'conversation-1',
      ),
    ).resolves.toBe(true);

    expect(pluginRuntime.listConversationSessions).toHaveBeenCalledWith(
      'builtin.idiom-session',
    );
    expect(pluginRuntime.finishConversationSessionForGovernance).toHaveBeenCalledWith(
      'builtin.idiom-session',
      'conversation-1',
    );
  });

  it('lists, writes, and deletes plugin storage entries through the plugin service', async () => {
    pluginService.listPluginStorage.mockResolvedValue([
      {
        key: 'cursor.offset',
        value: 3,
      },
    ]);
    pluginService.setPluginStorage.mockResolvedValue(5);
    pluginService.deletePluginStorage.mockResolvedValue(true);

    await expect(
      (controller as any).listPluginStorage('builtin.memory-context', 'cursor.'),
    ).resolves.toEqual([
      {
        key: 'cursor.offset',
        value: 3,
      },
    ]);
    await expect(
      (controller as any).setPluginStorage('builtin.memory-context', {
        key: 'cursor.offset',
        value: 5,
      }),
    ).resolves.toEqual({
      key: 'cursor.offset',
      value: 5,
    });
    await expect(
      (controller as any).deletePluginStorage('builtin.memory-context', 'cursor.offset'),
    ).resolves.toBe(true);

    expect(pluginService.listPluginStorage).toHaveBeenCalledWith(
      'builtin.memory-context',
      'cursor.',
    );
    expect(pluginService.setPluginStorage).toHaveBeenCalledWith(
      'builtin.memory-context',
      'cursor.offset',
      5,
    );
    expect(pluginService.deletePluginStorage).toHaveBeenCalledWith(
      'builtin.memory-context',
      'cursor.offset',
    );
  });

  it('dispatches governance actions through the plugin admin service', async () => {
    pluginAdmin.runAction.mockResolvedValue({
      accepted: true,
      action: 'reload',
      pluginId: 'builtin.memory-context',
      message: '已重新装载内建插件',
    });

    await expect(
      (controller as any).runPluginAction('builtin.memory-context', 'reload'),
    ).resolves.toEqual({
      accepted: true,
      action: 'reload',
      pluginId: 'builtin.memory-context',
      message: '已重新装载内建插件',
    });
    expect(pluginAdmin.runAction).toHaveBeenCalledWith(
      'builtin.memory-context',
      'reload',
    );
  });
});

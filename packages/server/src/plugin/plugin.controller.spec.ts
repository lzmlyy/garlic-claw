import type {
  PluginConfigSchema,
  PluginInfo,
} from '@garlic-claw/shared';
import { PluginController } from './plugin.controller';

describe('PluginController', () => {
  const pluginService = {
    findAll: jest.fn(),
    getPluginConfig: jest.fn(),
    updatePluginConfig: jest.fn(),
    getPluginScope: jest.fn(),
    updatePluginScope: jest.fn(),
    getPluginHealth: jest.fn(),
    listPluginEvents: jest.fn(),
  };

  const pluginRuntime = {
    listPlugins: jest.fn(),
    refreshPluginGovernance: jest.fn(),
  };

  const pluginCronService = {
    listCronJobs: jest.fn(),
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
        manifest: {
          id: 'builtin.memory-context',
          name: 'Memory Context',
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
    });
    expect(pluginCronService.listCronJobs).toHaveBeenCalledWith(
      'builtin.memory-context',
    );
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
    pluginService.listPluginEvents.mockResolvedValue([
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
    ]);

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
    ).resolves.toEqual([
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
    ]);
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

import { PluginToolProvider } from './plugin-tool.provider';

describe('PluginToolProvider', () => {
  it('normalizes persisted plugin health for tool sources', async () => {
    const pluginRuntime = {
      listPlugins: jest.fn().mockReturnValue([
        {
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'server',
          manifest: {
            name: '记忆工具',
          },
          supportedActions: ['health-check', 'reload'],
          runtimePressure: null,
        },
        {
          pluginId: 'remote.pc-host',
          runtimeKind: 'remote',
          deviceType: 'desktop',
          manifest: {
            name: '电脑助手',
          },
          supportedActions: ['health-check', 'reconnect'],
          runtimePressure: null,
        },
      ]),
      listTools: jest.fn().mockReturnValue([]),
      executeTool: jest.fn(),
    };
    const pluginService = {
      findAll: jest.fn().mockResolvedValue([
        {
          name: 'builtin.memory-tools',
          status: 'online',
          healthStatus: 'degraded',
          lastError: '最近三次健康检查里有一次超时',
          lastCheckedAt: new Date('2026-03-31T12:00:00.000Z'),
        },
        {
          name: 'remote.pc-host',
          status: 'online',
          healthStatus: 'totally-bad-state',
          lastError: null,
          lastCheckedAt: null,
        },
      ]),
    };
    const provider = new PluginToolProvider(
      pluginRuntime as never,
      pluginService as never,
    );

    await expect(provider.listSources()).resolves.toEqual([
      {
        kind: 'plugin',
        id: 'builtin.memory-tools',
        label: '记忆工具',
        enabled: true,
        health: 'error',
        lastError: '最近三次健康检查里有一次超时',
        lastCheckedAt: '2026-03-31T12:00:00.000Z',
        supportedActions: ['health-check', 'reload'],
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
      {
        kind: 'plugin',
        id: 'remote.pc-host',
        label: '电脑助手',
        enabled: true,
        health: 'unknown',
        lastError: null,
        lastCheckedAt: null,
        supportedActions: ['health-check', 'reconnect'],
        pluginId: 'remote.pc-host',
        runtimeKind: 'remote',
      },
    ]);
  });
});

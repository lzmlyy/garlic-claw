import { BadRequestException } from '@nestjs/common';
import { PluginController } from '../../src/modules/plugin/plugin.controller';

describe('PluginController', () => {
  const pluginBootstrapService = {
    canReloadLocal: jest.fn(),
    getPlugin: jest.fn(),
    reloadLocal: jest.fn(),
    upsertRemotePlugin: jest.fn(),
  };
  const pluginPersistenceService = {
    deletePlugin: jest.fn(),
    getPluginConfig: jest.fn(),
    getPluginEventLog: jest.fn(),
    getPluginLlmPreference: jest.fn(),
    getPluginOrThrow: jest.fn(),
    getPluginScope: jest.fn(),
    listPluginEvents: jest.fn(),
    recordDetachedPluginEvent: jest.fn(),
    recordPluginEvent: jest.fn(),
    updatePluginConfig: jest.fn(),
    updatePluginLlmPreference: jest.fn(),
    updatePluginScope: jest.fn(),
    upsertPlugin: jest.fn(),
  };
  const conversationStore = {
    deletePluginConversationSessions: jest.fn(),
    listPluginConversationSessions: jest.fn(),
  };
  const pluginDispatch = {
    invokeRoute: jest.fn(),
    listPlugins: jest.fn(),
  };
  const pluginRuntime = {
    deleteCronJob: jest.fn(),
    deletePluginRuntimeState: jest.fn(),
    listCronJobs: jest.fn(),
    deletePluginStorage: jest.fn(),
    listPluginStorage: jest.fn(),
    setPluginStorage: jest.fn(),
  };
  const runtimePluginGovernanceService = {
    checkPluginHealth: jest.fn(),
    readPluginHealthSnapshot: jest.fn(),
    listConnectedPlugins: jest.fn(),
    listPlugins: jest.fn(),
    listSupportedActions: jest.fn(),
    deletePluginRuntimeState: jest.fn(),
    runPluginAction: jest.fn(),
  };
  const toolManagementSettingsService = {
    deleteSourceOverrides: jest.fn(),
  };

  let controller: PluginController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PluginController(
      pluginBootstrapService as never,
      pluginPersistenceService as never,
      conversationStore as never,
      pluginDispatch as never,
      pluginRuntime as never,
      runtimePluginGovernanceService as never,
      toolManagementSettingsService as never,
    );
  });

  it('lists plugins and connected plugins from the dispatch owner', () => {
    runtimePluginGovernanceService.listSupportedActions.mockReturnValue(['health-check', 'reload']);
    runtimePluginGovernanceService.listPlugins.mockReturnValue([
      {
        connected: true,
        defaultEnabled: true,
        createdAt: '2026-03-26T00:00:00.000Z',
        governance: { canDisable: true },
        lastSeenAt: null,
        manifest: {
          id: 'builtin.memory',
          name: 'Memory',
          description: 'Memory plugin',
          permissions: [],
          runtime: 'local',
          tools: [],
          version: '1.0.0',
        },
        pluginId: 'builtin.memory',
        remote: null,
        status: 'online',
        updatedAt: '2026-03-26T01:00:00.000Z',
      },
      {
        connected: false,
        defaultEnabled: true,
        createdAt: '2026-03-27T00:00:00.000Z',
        governance: { canDisable: true },
        lastSeenAt: null,
        manifest: {
          id: 'remote.echo',
          name: 'Remote Echo',
          description: 'Remote plugin',
          permissions: [],
          remote: {
            auth: {
              mode: 'required',
            },
            capabilityProfile: 'query',
            remoteEnvironment: 'api',
          },
          runtime: 'remote',
          tools: [],
          version: '1.0.0',
        },
        pluginId: 'remote.echo',
        remote: {
          access: {
            accessKey: 'smoke-access-key',
            serverUrl: 'ws://127.0.0.1:23331',
          },
          descriptor: {
            auth: {
              mode: 'required',
            },
            capabilityProfile: 'query',
            remoteEnvironment: 'api',
          },
          metadataCache: {
            lastSyncedAt: null,
            manifestHash: null,
            status: 'empty',
          },
        },
        status: 'offline',
        updatedAt: '2026-03-27T01:00:00.000Z',
      },
    ]);
    runtimePluginGovernanceService.listConnectedPlugins.mockReturnValue([
      {
        connected: true,
        defaultEnabled: true,
        createdAt: '2026-03-26T00:00:00.000Z',
        governance: { canDisable: true },
        lastSeenAt: null,
        manifest: {
          id: 'builtin.memory',
          name: 'Memory',
          description: 'Memory plugin',
          permissions: [],
          runtime: 'local',
          tools: [],
          version: '1.0.0',
        },
        pluginId: 'builtin.memory',
        remote: null,
        status: 'online',
        updatedAt: '2026-03-26T01:00:00.000Z',
      },
    ]);

    expect(controller.listPlugins()).toEqual([
      {
        connected: true,
        defaultEnabled: true,
        createdAt: '2026-03-26T00:00:00.000Z',
        description: 'Memory plugin',
        displayName: 'Memory',
        eventLog: {},
        governance: { canDisable: true },
        id: 'builtin.memory',
        lastSeenAt: null,
        manifest: {
          id: 'builtin.memory',
          name: 'Memory',
          description: 'Memory plugin',
          permissions: [],
          runtime: 'local',
          tools: [],
          version: '1.0.0',
        },
        name: 'builtin.memory',
        remote: null,
        runtimeKind: 'local',
        status: 'online',
        supportedActions: ['health-check', 'reload'],
        updatedAt: '2026-03-26T01:00:00.000Z',
        version: '1.0.0',
      },
      {
        connected: false,
        defaultEnabled: true,
        createdAt: '2026-03-27T00:00:00.000Z',
        description: 'Remote plugin',
        displayName: 'Remote Echo',
        eventLog: {},
        governance: { canDisable: true },
        id: 'remote.echo',
        lastSeenAt: null,
        manifest: {
          id: 'remote.echo',
          name: 'Remote Echo',
          description: 'Remote plugin',
          permissions: [],
          remote: {
            auth: {
              mode: 'required',
            },
            capabilityProfile: 'query',
            remoteEnvironment: 'api',
          },
          runtime: 'remote',
          tools: [],
          version: '1.0.0',
        },
        name: 'remote.echo',
        remote: {
          access: {
            accessKey: 'smoke-access-key',
            serverUrl: 'ws://127.0.0.1:23331',
          },
          descriptor: {
            auth: {
              mode: 'required',
            },
            capabilityProfile: 'query',
            remoteEnvironment: 'api',
          },
          metadataCache: {
            lastSyncedAt: null,
            manifestHash: null,
            status: 'empty',
          },
        },
        runtimeKind: 'remote',
        status: 'offline',
        supportedActions: ['health-check', 'reload'],
        updatedAt: '2026-03-27T01:00:00.000Z',
        version: '1.0.0',
      },
    ]);
    expect(controller.getConnectedPlugins()).toEqual([
      {
        manifest: {
          description: 'Memory plugin',
          id: 'builtin.memory',
          name: 'Memory',
          permissions: [],
          runtime: 'local',
          tools: [],
          version: '1.0.0',
        },
        name: 'builtin.memory',
        runtimeKind: 'local',
      },
    ]);
  });

  it('upserts remote access config, reads remote connection info and delegates plugin actions', async () => {
    pluginBootstrapService.upsertRemotePlugin.mockReturnValue({
      connected: false,
      defaultEnabled: true,
      createdAt: '2026-03-27T00:00:00.000Z',
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'remote.echo',
        name: 'Remote Echo',
        permissions: [],
        remote: {
          auth: {
            mode: 'required',
          },
          capabilityProfile: 'query',
          remoteEnvironment: 'api',
        },
        runtime: 'remote',
        tools: [],
        version: '1.0.0',
      },
      pluginId: 'remote.echo',
      remote: {
        access: {
          accessKey: 'smoke-access-key',
          serverUrl: 'ws://127.0.0.1:23331',
        },
        descriptor: {
          auth: {
            mode: 'required',
          },
          capabilityProfile: 'query',
          remoteEnvironment: 'api',
        },
        metadataCache: {
          lastSyncedAt: null,
          manifestHash: null,
          status: 'empty',
        },
      },
      status: 'offline',
      updatedAt: '2026-03-27T01:00:00.000Z',
    });
    pluginBootstrapService.getPlugin.mockReturnValue({
      pluginId: 'remote.echo',
      remote: {
        access: {
          accessKey: 'smoke-access-key',
          serverUrl: 'ws://127.0.0.1:23331',
        },
        descriptor: {
          auth: {
            mode: 'required',
          },
          capabilityProfile: 'query',
          remoteEnvironment: 'api',
        },
      },
    });
    runtimePluginGovernanceService.readPluginHealthSnapshot.mockReturnValue({
      status: 'healthy',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: '2026-03-28T00:00:00.000Z',
      lastCheckedAt: '2026-03-28T00:05:00.000Z',
    });
    runtimePluginGovernanceService.runPluginAction.mockResolvedValue({
      accepted: true,
      action: 'refresh-metadata',
      pluginId: 'remote.echo',
      message: '已刷新远程插件元数据缓存',
    });

    expect(controller.upsertRemotePlugin('remote.echo', {
      access: {
        accessKey: 'smoke-access-key',
        serverUrl: 'ws://127.0.0.1:23331',
      },
      displayName: 'Remote Echo',
      remote: {
        auth: {
          mode: 'required',
        },
        capabilityProfile: 'query',
        remoteEnvironment: 'api',
      },
      version: '1.0.0',
    } as never)).toMatchObject({
      id: 'remote.echo',
      remote: {
        access: {
          accessKey: 'smoke-access-key',
          serverUrl: 'ws://127.0.0.1:23331',
        },
        descriptor: {
          remoteEnvironment: 'api',
        },
      },
      runtimeKind: 'remote',
    });
    expect(pluginBootstrapService.upsertRemotePlugin).toHaveBeenCalledWith({
      access: {
        accessKey: 'smoke-access-key',
        serverUrl: 'ws://127.0.0.1:23331',
      },
      description: undefined,
      displayName: 'Remote Echo',
      pluginName: 'remote.echo',
      remote: {
        auth: {
          mode: 'required',
        },
        capabilityProfile: 'query',
        remoteEnvironment: 'api',
      },
      version: '1.0.0',
    });
    expect(controller.getRemotePluginConnection('remote.echo')).toEqual({
      accessKey: 'smoke-access-key',
      pluginName: 'remote.echo',
      remote: {
        auth: {
          mode: 'required',
        },
        capabilityProfile: 'query',
        remoteEnvironment: 'api',
      },
      serverUrl: 'ws://127.0.0.1:23331',
    });
    expect(controller.getPluginHealth('remote.echo')).toEqual({
      status: 'healthy',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: '2026-03-28T00:00:00.000Z',
      lastCheckedAt: '2026-03-28T00:05:00.000Z',
    });
    await expect(
      controller.runPluginAction('remote.echo', 'refresh-metadata'),
    ).resolves.toEqual({
      accepted: true,
      action: 'refresh-metadata',
      pluginId: 'remote.echo',
      message: '已刷新远程插件元数据缓存',
    });
    expect(runtimePluginGovernanceService.runPluginAction).toHaveBeenCalledWith({
      action: 'refresh-metadata',
      pluginId: 'remote.echo',
    });
    expect(pluginPersistenceService.recordPluginEvent).toHaveBeenCalledWith('remote.echo', {
      level: 'info',
      message: '已刷新远程插件元数据缓存',
      type: 'governance:refresh-metadata',
    });
  });

  it('cleans current plugin runtime state when local reload finds that the directory was removed', async () => {
    pluginPersistenceService.getPluginEventLog.mockReturnValue({
      enabled: true,
      maxFileSizeMb: 10,
      maxFiles: 5,
    });
    pluginBootstrapService.getPlugin.mockReturnValue({
      manifest: {
        runtime: 'local',
      },
      pluginId: 'local.echo',
    });
    pluginBootstrapService.canReloadLocal.mockReturnValue(true);
    pluginBootstrapService.reloadLocal.mockReturnValue({
      pluginId: 'local.echo',
      removed: true,
    });

    await expect(
      controller.runPluginAction('local.echo', 'reload'),
    ).resolves.toEqual({
      accepted: true,
      action: 'reload',
      pluginId: 'local.echo',
      message: '本地插件目录已删除，已清理旧记录',
    });

    expect(pluginRuntime.deletePluginRuntimeState).toHaveBeenCalledWith('local.echo');
    expect(conversationStore.deletePluginConversationSessions).toHaveBeenCalledWith('local.echo');
    expect(runtimePluginGovernanceService.deletePluginRuntimeState).toHaveBeenCalledWith('local.echo');
    expect(toolManagementSettingsService.deleteSourceOverrides).toHaveBeenCalledWith('plugin:local.echo');
    expect(runtimePluginGovernanceService.runPluginAction).not.toHaveBeenCalled();
    expect(pluginPersistenceService.recordDetachedPluginEvent).toHaveBeenCalledWith('local.echo', {
      enabled: true,
      maxFileSizeMb: 10,
      maxFiles: 5,
    }, {
      level: 'info',
      message: '本地插件目录已删除，已清理旧记录',
      type: 'governance:reload',
    });
    expect(pluginPersistenceService.recordPluginEvent).not.toHaveBeenCalled();
  });

  it('delegates config and scope routes to the plugin http mutation owner', async () => {
    pluginPersistenceService.getPluginConfig.mockReturnValue({
      values: { limit: 8 },
    });
    pluginPersistenceService.getPluginLlmPreference.mockReturnValue({
      mode: 'inherit',
      modelId: null,
      providerId: null,
    });
    pluginPersistenceService.updatePluginConfig.mockReturnValue({
      values: { limit: 6 },
    });
    pluginPersistenceService.updatePluginLlmPreference.mockReturnValue({
      mode: 'override',
      modelId: 'deepseek-reasoner',
      providerId: 'ds2api',
    });
    pluginPersistenceService.getPluginScope.mockReturnValueOnce({
      defaultEnabled: true,
      conversations: { 'conversation-1': false },
    }).mockReturnValueOnce({
      defaultEnabled: true,
      conversations: { 'conversation-1': true },
    });
    pluginPersistenceService.updatePluginScope.mockReturnValue({
      defaultEnabled: true,
      conversations: { 'conversation-1': true },
    });

    expect(controller.getPluginConfig('builtin.memory')).toEqual({
      values: { limit: 8 },
    });
    expect(controller.updatePluginConfig('builtin.memory', {
      values: { limit: 6 },
    } as never)).toEqual({
      values: { limit: 6 },
    });
    expect(controller.getPluginLlmPreference('builtin.memory')).toEqual({
      mode: 'inherit',
      modelId: null,
      providerId: null,
    });
    expect(controller.updatePluginLlmPreference('builtin.memory', {
      mode: 'override',
      modelId: 'deepseek-reasoner',
      providerId: 'ds2api',
    } as never)).toEqual({
      mode: 'override',
      modelId: 'deepseek-reasoner',
      providerId: 'ds2api',
    });
    expect(controller.getPluginScope('builtin.memory')).toEqual({
      defaultEnabled: true,
      conversations: { 'conversation-1': false },
    });
    expect(controller.updatePluginScope('builtin.memory', {
      conversations: { 'conversation-1': true },
    } as never)).toEqual({
      defaultEnabled: true,
      conversations: { 'conversation-1': true },
    });
    expect(pluginPersistenceService.updatePluginConfig).toHaveBeenCalledWith('builtin.memory', {
      limit: 6,
    });
    expect(pluginPersistenceService.updatePluginLlmPreference).toHaveBeenCalledWith('builtin.memory', {
      mode: 'override',
      modelId: 'deepseek-reasoner',
      providerId: 'ds2api',
    });
    expect(pluginPersistenceService.updatePluginScope).toHaveBeenCalledWith('builtin.memory', {
      conversations: { 'conversation-1': true },
    });
    expect(pluginPersistenceService.recordPluginEvent).toHaveBeenCalledWith('builtin.memory', {
      level: 'info',
      message: '插件 builtin.memory 的配置已更新',
      metadata: { keys: ['limit'] },
      type: 'plugin:config.updated',
    });
    expect(pluginPersistenceService.recordPluginEvent).toHaveBeenCalledWith('builtin.memory', {
      level: 'info',
      message: '插件 builtin.memory 的 LLM 偏好设置已更新',
      metadata: {
        mode: 'override',
        modelId: 'deepseek-reasoner',
        providerId: 'ds2api',
      },
      type: 'plugin:llm-preference.updated',
    });
    expect(pluginPersistenceService.recordPluginEvent).toHaveBeenCalledWith('builtin.memory', {
      level: 'info',
      message: '插件 builtin.memory 的作用域已更新',
      metadata: { conversationCount: 1 },
      type: 'plugin:scope.updated',
    });
  });

  it('delegates event listing and validates event query values', async () => {
    pluginPersistenceService.listPluginEvents.mockReturnValue({
      items: [],
      nextCursor: null,
    });

    expect(controller.listPluginEvents('builtin.memory', {
      limit: '100',
      level: 'error',
      type: 'tool:error',
      keyword: 'memory.search',
      cursor: 'event-2',
    })).toEqual({ items: [], nextCursor: null });
    expect(pluginPersistenceService.listPluginEvents).toHaveBeenCalledWith('builtin.memory', {
      limit: 100,
      level: 'error',
      type: 'tool:error',
      keyword: 'memory.search',
      cursor: 'event-2',
    });
    expect(() =>
      controller.listPluginEvents('builtin.memory', {
        limit: '0',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.listPluginEvents('builtin.memory', {
        level: 'fatal',
      }),
    ).toThrow(BadRequestException);
  });

  it('deletes plugins through persistence owner and cleans current runtime state', async () => {
    pluginPersistenceService.deletePlugin.mockReturnValue({
      pluginId: 'remote.echo',
    });

    expect(controller.deletePlugin('remote.echo')).toEqual({
      pluginId: 'remote.echo',
    });
    expect(pluginPersistenceService.deletePlugin).toHaveBeenCalledWith('remote.echo');
    expect(pluginRuntime.deletePluginRuntimeState).toHaveBeenCalledWith('remote.echo');
    expect(conversationStore.deletePluginConversationSessions).toHaveBeenCalledWith('remote.echo');
    expect(runtimePluginGovernanceService.deletePluginRuntimeState).toHaveBeenCalledWith('remote.echo');
    expect(toolManagementSettingsService.deleteSourceOverrides).toHaveBeenCalledWith('plugin:remote.echo');
    expect(pluginPersistenceService.recordDetachedPluginEvent).not.toHaveBeenCalled();
  });

  it('does not record plugin deleted events when the delete request is rejected', () => {
    pluginPersistenceService.deletePlugin.mockImplementation(() => {
      throw new BadRequestException('Plugin remote.echo is still connected');
    });

    expect(() => controller.deletePlugin('remote.echo')).toThrow('Plugin remote.echo is still connected');
    expect(pluginRuntime.deletePluginRuntimeState).not.toHaveBeenCalled();
    expect(conversationStore.deletePluginConversationSessions).not.toHaveBeenCalled();
    expect(runtimePluginGovernanceService.deletePluginRuntimeState).not.toHaveBeenCalled();
    expect(toolManagementSettingsService.deleteSourceOverrides).not.toHaveBeenCalled();
    expect(pluginPersistenceService.recordPluginEvent).not.toHaveBeenCalled();
  });
});


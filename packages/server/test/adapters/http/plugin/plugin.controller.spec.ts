import { BadRequestException } from '@nestjs/common';
import { PluginController } from '../../../../src/adapters/http/plugin/plugin.controller';
import { DEVICE_TYPE } from '../../../../src/plugin/plugin.constants';

describe('PluginController', () => {
  const pluginBootstrapService = {
    issueRemoteBootstrap: jest.fn(),
  };
  const pluginPersistenceService = {
    deletePlugin: jest.fn(),
    getPluginConfig: jest.fn(),
    getPluginOrThrow: jest.fn(),
    getPluginScope: jest.fn(),
    listPluginEvents: jest.fn(),
    recordPluginEvent: jest.fn(),
    updatePluginConfig: jest.fn(),
    updatePluginScope: jest.fn(),
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
    listConnectedPlugins: jest.fn(),
    listPlugins: jest.fn(),
    listSupportedActions: jest.fn(),
    runPluginAction: jest.fn(),
  };

  let controller: PluginController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PluginController(
      pluginBootstrapService as never,
      pluginPersistenceService as never,
      runtimeHostConversationRecordService as never,
      runtimeHostPluginDispatchService as never,
      runtimeHostPluginRuntimeService as never,
      runtimeHostSubagentRunnerService as never,
      runtimePluginGovernanceService as never,
    );
  });

  it('lists plugins and connected plugins from the dispatch owner', () => {
    runtimePluginGovernanceService.listSupportedActions.mockReturnValue(['health-check', 'reload']);
    runtimePluginGovernanceService.listPlugins.mockReturnValue([
      {
        connected: true,
        defaultEnabled: true,
        createdAt: '2026-03-26T00:00:00.000Z',
        deviceType: 'builtin',
        governance: { canDisable: true },
        lastSeenAt: null,
        manifest: {
          id: 'builtin.memory-context',
          name: 'Memory Context',
          description: 'Memory plugin',
          permissions: [],
          runtime: 'builtin',
          tools: [],
          version: '1.0.0',
        },
        pluginId: 'builtin.memory-context',
        status: 'online',
        updatedAt: '2026-03-26T01:00:00.000Z',
      },
      {
        connected: false,
        defaultEnabled: true,
        createdAt: '2026-03-27T00:00:00.000Z',
        deviceType: 'desktop',
        governance: { canDisable: true },
        lastSeenAt: null,
        manifest: {
          id: 'remote.echo',
          name: 'Remote Echo',
          description: 'Remote plugin',
          permissions: [],
          runtime: 'remote',
          tools: [],
          version: '1.0.0',
        },
        pluginId: 'remote.echo',
        status: 'offline',
        updatedAt: '2026-03-27T01:00:00.000Z',
      },
    ]);
    runtimePluginGovernanceService.listConnectedPlugins.mockReturnValue([
      {
        connected: true,
        defaultEnabled: true,
        createdAt: '2026-03-26T00:00:00.000Z',
        deviceType: 'builtin',
        governance: { canDisable: true },
        lastSeenAt: null,
        manifest: {
          id: 'builtin.memory-context',
          name: 'Memory Context',
          description: 'Memory plugin',
          permissions: [],
          runtime: 'builtin',
          tools: [],
          version: '1.0.0',
        },
        pluginId: 'builtin.memory-context',
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
        deviceType: 'builtin',
        displayName: 'Memory Context',
        governance: { canDisable: true },
        health: {
          consecutiveFailures: 0,
          failureCount: 0,
          lastCheckedAt: null,
          lastError: null,
          lastErrorAt: null,
          lastSuccessAt: null,
          status: 'healthy',
        },
        id: 'builtin.memory-context',
        lastSeenAt: null,
        manifest: {
          id: 'builtin.memory-context',
          name: 'Memory Context',
          description: 'Memory plugin',
          permissions: [],
          runtime: 'builtin',
          tools: [],
          version: '1.0.0',
        },
        name: 'builtin.memory-context',
        runtimeKind: 'builtin',
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
        deviceType: 'desktop',
        displayName: 'Remote Echo',
        governance: { canDisable: true },
        health: {
          consecutiveFailures: 0,
          failureCount: 0,
          lastCheckedAt: null,
          lastError: null,
          lastErrorAt: null,
          lastSuccessAt: null,
          status: 'offline',
        },
        id: 'remote.echo',
        lastSeenAt: null,
        manifest: {
          id: 'remote.echo',
          name: 'Remote Echo',
          description: 'Remote plugin',
          permissions: [],
          runtime: 'remote',
          tools: [],
          version: '1.0.0',
        },
        name: 'remote.echo',
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
          id: 'builtin.memory-context',
          name: 'Memory Context',
          permissions: [],
          runtime: 'builtin',
          tools: [],
          version: '1.0.0',
        },
        name: 'builtin.memory-context',
        runtimeKind: 'builtin',
      },
    ]);
  });

  it('issues remote bootstrap tokens and delegates plugin actions', async () => {
    pluginBootstrapService.issueRemoteBootstrap.mockReturnValue({
      deviceType: DEVICE_TYPE.PC,
      pluginName: 'remote.echo',
      serverUrl: 'ws://127.0.0.1:23331',
      token: 'signed-token',
      tokenExpiresIn: '30d',
    });
    runtimePluginGovernanceService.checkPluginHealth.mockReturnValue({ ok: true });
    runtimePluginGovernanceService.runPluginAction.mockResolvedValue({
      accepted: true,
      action: 'reload',
      pluginId: 'remote.echo',
      message: '已触发远程插件重连',
    });

    expect(controller.createRemoteBootstrap({
      deviceType: DEVICE_TYPE.PC,
      pluginName: 'remote.echo',
    })).toEqual({
      deviceType: DEVICE_TYPE.PC,
      pluginName: 'remote.echo',
      serverUrl: 'ws://127.0.0.1:23331',
      token: 'signed-token',
      tokenExpiresIn: '30d',
    });
    expect(controller.getPluginHealth('remote.echo')).toEqual({ ok: true });
    await expect(
      controller.runPluginAction('remote.echo', 'reload'),
    ).resolves.toEqual({
      accepted: true,
      action: 'reload',
      pluginId: 'remote.echo',
      message: '已触发远程插件重连',
    });
    expect(runtimePluginGovernanceService.runPluginAction).toHaveBeenCalledWith({
      action: 'reload',
      pluginId: 'remote.echo',
    });
    expect(pluginPersistenceService.recordPluginEvent).toHaveBeenCalledWith('remote.echo', {
      level: 'info',
      message: '已触发远程插件重连',
      type: 'governance:reload',
    });
  });

  it('delegates config and scope routes to the plugin http mutation owner', async () => {
    pluginPersistenceService.getPluginConfig.mockReturnValue({
      values: { limit: 8 },
    });
    pluginPersistenceService.updatePluginConfig.mockReturnValue({
      values: { limit: 6 },
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

    expect(controller.getPluginConfig('builtin.memory-context')).toEqual({
      values: { limit: 8 },
    });
    expect(controller.updatePluginConfig('builtin.memory-context', {
      values: { limit: 6 },
    } as never)).toEqual({
      values: { limit: 6 },
    });
    expect(controller.getPluginScope('builtin.memory-context')).toEqual({
      defaultEnabled: true,
      conversations: { 'conversation-1': false },
    });
    expect(controller.updatePluginScope('builtin.memory-context', {
      conversations: { 'conversation-1': true },
    } as never)).toEqual({
      defaultEnabled: true,
      conversations: { 'conversation-1': true },
    });
    expect(pluginPersistenceService.updatePluginConfig).toHaveBeenCalledWith('builtin.memory-context', {
      limit: 6,
    });
    expect(pluginPersistenceService.updatePluginScope).toHaveBeenCalledWith('builtin.memory-context', {
      conversations: { 'conversation-1': true },
    });
    expect(pluginPersistenceService.recordPluginEvent).toHaveBeenCalledWith('builtin.memory-context', {
      level: 'info',
      message: 'Updated plugin config for builtin.memory-context',
      metadata: { keys: ['limit'] },
      type: 'plugin:config.updated',
    });
    expect(pluginPersistenceService.recordPluginEvent).toHaveBeenCalledWith('builtin.memory-context', {
      level: 'info',
      message: 'Updated plugin scope for builtin.memory-context',
      metadata: { conversationCount: 1 },
      type: 'plugin:scope.updated',
    });
  });

  it('delegates event listing and validates event query values', async () => {
    pluginPersistenceService.listPluginEvents.mockReturnValue({
      items: [],
      nextCursor: null,
    });

    expect(controller.listPluginEvents('builtin.memory-context', {
      limit: '100',
      level: 'error',
      type: 'tool:error',
      keyword: 'memory.search',
      cursor: 'event-2',
    })).toEqual({ items: [], nextCursor: null });
    expect(pluginPersistenceService.listPluginEvents).toHaveBeenCalledWith('builtin.memory-context', {
      limit: 100,
      level: 'error',
      type: 'tool:error',
      keyword: 'memory.search',
      cursor: 'event-2',
    });
    expect(() =>
      controller.listPluginEvents('builtin.memory-context', {
        limit: '0',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.listPluginEvents('builtin.memory-context', {
        level: 'fatal',
      }),
    ).toThrow(BadRequestException);
  });

  it('deletes plugins through persistence owner and records plugin deletion events', async () => {
    pluginPersistenceService.deletePlugin.mockReturnValue({
      pluginId: 'remote.echo',
    });

    expect(controller.deletePlugin('remote.echo')).toEqual({
      pluginId: 'remote.echo',
    });
    expect(pluginPersistenceService.deletePlugin).toHaveBeenCalledWith('remote.echo');
    expect(pluginPersistenceService.recordPluginEvent).toHaveBeenCalledWith('remote.echo', {
      level: 'warn',
      message: 'Deleted plugin remote.echo',
      type: 'plugin:deleted',
    });
  });
});

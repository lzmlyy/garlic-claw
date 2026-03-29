import { PluginAdminService } from './plugin-admin.service';

describe('PluginAdminService', () => {
  const pluginService = {
    findByName: jest.fn(),
    recordPluginSuccess: jest.fn(),
    recordHealthCheck: jest.fn(),
  };

  const pluginRuntime = {
    runPluginAction: jest.fn(),
    checkPluginHealth: jest.fn(),
    listSupportedActions: jest.fn(),
  };

  let service: PluginAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginAdminService(
      pluginService as never,
      pluginRuntime as never,
    );
  });

  it('delegates builtin reload through runtime and records builtin governance success', async () => {
    pluginService.findByName.mockResolvedValue({
      name: 'builtin.memory-context',
      runtimeKind: 'builtin',
    });
    pluginRuntime.listSupportedActions.mockReturnValue([
      'health-check',
      'reload',
    ]);
    pluginRuntime.runPluginAction.mockResolvedValue(undefined);

    await expect(
      service.runAction('builtin.memory-context', 'reload'),
    ).resolves.toEqual({
      accepted: true,
      action: 'reload',
      pluginId: 'builtin.memory-context',
      message: '已重新装载内建插件',
    });

    expect(pluginRuntime.runPluginAction).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-context',
      action: 'reload',
    });
    expect(pluginService.recordPluginSuccess).toHaveBeenCalledWith(
      'builtin.memory-context',
      {
        type: 'governance:reload',
        message: '已重新装载内建插件',
      },
    );
  });

  it('delegates remote reconnect through runtime and records reconnect success', async () => {
    pluginService.findByName.mockResolvedValue({
      name: 'remote.pc-host',
      runtimeKind: 'remote',
    });
    pluginRuntime.listSupportedActions.mockReturnValue([
      'health-check',
      'reload',
      'reconnect',
    ]);
    pluginRuntime.runPluginAction.mockResolvedValue(undefined);

    await expect(
      service.runAction('remote.pc-host', 'reconnect'),
    ).resolves.toEqual({
      accepted: true,
      action: 'reconnect',
      pluginId: 'remote.pc-host',
      message: '已请求远程插件重连',
    });

    expect(pluginRuntime.runPluginAction).toHaveBeenCalledWith({
      pluginId: 'remote.pc-host',
      action: 'reconnect',
    });
    expect(pluginService.recordPluginSuccess).toHaveBeenCalledWith(
      'remote.pc-host',
      {
        type: 'governance:reconnect',
        message: '已请求远程插件重连',
      },
    );
  });

  it('records failed health checks when runtime reports the plugin unhealthy', async () => {
    pluginService.findByName.mockResolvedValue({
      name: 'remote.pc-host',
      runtimeKind: 'remote',
    });
    pluginRuntime.listSupportedActions.mockReturnValue([
      'health-check',
      'reload',
      'reconnect',
    ]);
    pluginRuntime.checkPluginHealth.mockResolvedValue({
      ok: false,
    });

    await expect(
      service.runAction('remote.pc-host', 'health-check'),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      pluginId: 'remote.pc-host',
      message: '插件健康检查失败',
    });

    expect(pluginRuntime.checkPluginHealth).toHaveBeenCalledWith('remote.pc-host');
    expect(pluginService.recordHealthCheck).toHaveBeenCalledWith(
      'remote.pc-host',
      {
        ok: false,
        message: '插件健康检查失败',
      },
    );
  });

  it('rejects reconnect when the runtime-declared action set does not include it', async () => {
    pluginService.findByName.mockResolvedValue({
      name: 'remote.pc-host',
      runtimeKind: 'remote',
    });
    pluginRuntime.listSupportedActions.mockReturnValue([
      'health-check',
      'reload',
    ]);

    await expect(
      service.runAction('remote.pc-host', 'reconnect'),
    ).rejects.toThrow('插件 remote.pc-host 不支持治理动作 reconnect');

    expect(pluginRuntime.runPluginAction).not.toHaveBeenCalled();
  });
});

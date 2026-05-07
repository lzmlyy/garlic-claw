import type { Response } from 'express';
import { PluginController } from '../../src/modules/plugin/plugin.controller';

describe('PluginController route forwarding', () => {
  const pluginRemoteBootstrapService = {
    issueBootstrap: jest.fn(),
  };
  const pluginPersistenceService = {
    deletePlugin: jest.fn(),
    getPluginOrThrow: jest.fn(),
    upsertPlugin: jest.fn(),
  };
  const conversationStore = {
    listPluginConversationSessions: jest.fn(),
  };
  const pluginDispatch = {
    invokeRoute: jest.fn(),
    listPlugins: jest.fn(),
  };
  const pluginRuntime = {
    deleteCronJob: jest.fn(),
    listCronJobs: jest.fn(),
    deletePluginStorage: jest.fn(),
    listPluginStorage: jest.fn(),
    setPluginStorage: jest.fn(),
  };
  const runtimePluginGovernanceService = {
    checkPluginHealth: jest.fn(),
    invokeRoute: jest.fn(),
    listPlugins: jest.fn(),
    listSupportedActions: jest.fn(),
    runPluginAction: jest.fn(),
  };
  const toolManagementSettingsService = {
    deleteSourceOverrides: jest.fn(),
  };

  let controller: PluginController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PluginController(
      pluginRemoteBootstrapService as never,
      pluginPersistenceService as never,
      conversationStore as never,
      pluginDispatch as never,
      pluginRuntime as never,
      runtimePluginGovernanceService as never,
      toolManagementSettingsService as never,
    );
  });

  it('forwards authenticated HTTP requests into the unified plugin route runtime', async () => {
    pluginDispatch.invokeRoute.mockResolvedValue({
      status: 200,
      headers: {
        'x-plugin-route': 'ok',
        'set-cookie': 'session=1',
      },
      body: {
        ok: true,
      },
    });

    const res = createResponseStub();
    const req = {
      method: 'GET',
      params: {
        path: 'inspect/context',
      },
      headers: {
        authorization: 'Bearer token',
        cookie: 'refreshToken=secret',
        'x-request-id': 'req-1',
      },
      body: undefined,
      user: {
        id: 'user-1',
      },
    };

    await expect(
      controller.handleRoute(
        'builtin.route-inspector',
        {
          conversationId: 'conversation-1',
        },
        req as never,
        res as never,
      ),
    ).resolves.toEqual({
      ok: true,
    });

    expect(pluginDispatch.invokeRoute).toHaveBeenCalledWith({
      pluginId: 'builtin.route-inspector',
      request: {
        path: 'inspect/context',
        method: 'GET',
        headers: {
          'x-request-id': 'req-1',
        },
        query: {
          conversationId: 'conversation-1',
        },
        body: null,
      },
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('x-plugin-route', 'ok');
    expect(res.setHeader).not.toHaveBeenCalledWith('set-cookie', 'session=1');
  });

  it('supports named wildcard params produced by the route converter', async () => {
    pluginDispatch.invokeRoute.mockResolvedValue({
      status: 200,
      headers: {},
      body: {
        ok: true,
      },
    });

    const res = createResponseStub();
    const req = {
      method: 'GET',
      params: {
        path: ['inspect', 'context'],
      },
      headers: {},
      body: undefined,
      user: {
        id: 'user-1',
      },
    };

    await expect(
      controller.handleRoute(
        'builtin.route-inspector',
        {},
        req as never,
        res as never,
      ),
    ).resolves.toEqual({
      ok: true,
    });

    expect(pluginDispatch.invokeRoute).toHaveBeenCalledWith({
      pluginId: 'builtin.route-inspector',
      request: expect.objectContaining({
        path: 'inspect/context',
      }),
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: undefined,
      },
    });
  });

  it('rejects unsupported http methods before dispatching into plugin runtime', async () => {
    const res = createResponseStub();
    const req = {
      method: 'HEAD',
      params: {
        path: 'inspect/context',
      },
      headers: {},
      body: undefined,
      user: {
        id: 'user-1',
      },
    };

    await expect(
      controller.handleRoute(
        'builtin.route-inspector',
        {},
        req as never,
        res as never,
      ),
    ).rejects.toThrow('插件 Route 暂不支持 HTTP 方法 HEAD');

    expect(pluginDispatch.invokeRoute).not.toHaveBeenCalled();
  });
});

function createResponseStub(): Pick<Response, 'status' | 'setHeader'> {
  return {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  } as never;
}

import type { Response } from 'express';
import { PluginRouteController } from './plugin-route.controller';

describe('PluginRouteController', () => {
  const pluginRuntime = {
    invokeRoute: jest.fn(),
  };

  let controller: PluginRouteController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new PluginRouteController(pluginRuntime as never);
  });

  it('forwards authenticated HTTP requests into the unified plugin route runtime', async () => {
    pluginRuntime.invokeRoute.mockResolvedValue({
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
        0: 'inspect/context',
      },
      headers: {
        authorization: 'Bearer token',
        cookie: 'refreshToken=secret',
        'x-request-id': 'req-1',
      },
      body: undefined,
    };

    await expect(
      controller.handleRoute(
        'user-1',
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

    expect(pluginRuntime.invokeRoute).toHaveBeenCalledWith({
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
    pluginRuntime.invokeRoute.mockResolvedValue({
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
    };

    await expect(
      controller.handleRoute(
        'user-1',
        'builtin.route-inspector',
        {},
        req as never,
        res as never,
      ),
    ).resolves.toEqual({
      ok: true,
    });

    expect(pluginRuntime.invokeRoute).toHaveBeenCalledWith({
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
});

/**
 * 创建最小响应对象桩。
 * @returns 仅包含控制器测试所需方法的响应对象
 */
function createResponseStub(): Pick<Response, 'status' | 'setHeader'> {
  return {
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn(),
  } as never;
}

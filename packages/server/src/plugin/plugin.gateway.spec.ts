import {
  WS_ACTION,
  WS_TYPE,
  type HostCallPayload,
  type PluginManifest,
  type RegisterPayload,
} from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import { PluginGateway } from './plugin.gateway';

describe('PluginGateway', () => {
  const pluginRuntime = {
    registerPlugin: jest.fn(),
    unregisterPlugin: jest.fn(),
    callHost: jest.fn(),
  };

  const jwtService = {
    verify: jest.fn(),
  };

  const configService = {
    get: jest.fn((key: string, fallback: unknown) => fallback),
  };

  const remoteManifest: PluginManifest = {
    id: 'remote.pc-host',
    name: 'PC Host',
    version: '1.0.0',
    runtime: 'remote',
    permissions: ['conversation:read'],
    tools: [
      {
        name: 'list_directory',
        description: '列目录',
        parameters: {
          dirPath: {
            type: 'string',
            required: true,
          },
        },
      },
    ],
    hooks: [
      {
        name: 'chat:before-model',
      },
    ],
  };

  let gateway: PluginGateway;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = new PluginGateway(
      pluginRuntime as never,
      jwtService as never,
      configService as never,
    );
  });

  it('registers a remote plugin manifest into the unified runtime', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: null,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        } satisfies RegisterPayload,
      },
    );

    expect(pluginRuntime.registerPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: remoteManifest,
        runtimeKind: 'remote',
        transport: expect.any(Object),
      }),
    );
    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER_OK,
        payload: {},
      }),
    );
  });

  it('handles host api calls from remote plugins and returns the result over websocket', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };
    const payload: HostCallPayload = {
      method: 'memory.search',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      params: {
        query: '咖啡',
        limit: 3,
      },
    };

    pluginRuntime.callHost.mockResolvedValue([
      {
        id: 'memory-1',
        content: '用户喜欢咖啡',
      },
    ]);

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_CALL,
        requestId: 'request-1',
        payload,
      },
    );

    expect(pluginRuntime.callHost).toHaveBeenCalledWith({
      pluginId: 'remote.pc-host',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'memory.search',
      params: {
        query: '咖啡',
        limit: 3,
      },
    });
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_RESULT,
      requestId: 'request-1',
      payload: {
        data: [
          {
            id: 'memory-1',
            content: '用户喜欢咖啡',
          },
        ],
      },
    });
  });

  it('sends execute messages through the registered remote transport and resolves the response', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: remoteManifest,
        } satisfies RegisterPayload,
      },
    );

    const registerCall = pluginRuntime.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.executeTool({
      toolName: 'list_directory',
      params: {
        dirPath: 'C:\\\\',
      },
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
    });

    const sentMessage = JSON.parse(ws.send.mock.calls[1]?.[0] ?? '{}');
    expect(sentMessage).toEqual({
      type: WS_TYPE.COMMAND,
      action: WS_ACTION.EXECUTE,
      requestId: expect.any(String),
      payload: {
        toolName: 'list_directory',
        params: {
          dirPath: 'C:\\\\',
        },
        context: {
          source: 'automation',
          userId: 'user-1',
          automationId: 'automation-1',
        },
      },
    });

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.COMMAND,
        action: WS_ACTION.EXECUTE_RESULT,
        requestId: sentMessage.requestId,
        payload: {
          data: {
            entries: ['Users', 'Windows'],
          },
        },
      },
    );

    await expect(resultPromise).resolves.toEqual({
      entries: ['Users', 'Windows'],
    });
  });

  it('sends route messages through the registered remote transport and resolves the response', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: {
            ...remoteManifest,
            routes: [
              {
                path: 'inspect/context',
                methods: ['GET'],
              },
            ],
          },
        } satisfies RegisterPayload,
      },
    );

    const registerCall = pluginRuntime.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.invokeRoute({
      request: {
        path: 'inspect/context',
        method: 'GET',
        headers: {},
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

    const sentMessage = JSON.parse(ws.send.mock.calls[1]?.[0] ?? '{}');
    expect(sentMessage).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.ROUTE_INVOKE,
      requestId: expect.any(String),
      payload: {
        request: {
          path: 'inspect/context',
          method: 'GET',
          headers: {},
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
      },
    });

    await (gateway as any).handleMessage(
      ws,
      conn,
      {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.ROUTE_RESULT,
        requestId: sentMessage.requestId,
        payload: {
          data: {
            status: 200,
            body: {
              ok: true,
            },
          },
        },
      },
    );

    await expect(resultPromise).resolves.toEqual({
      status: 200,
      body: {
        ok: true,
      },
    });
  });

  it('disconnects a connected remote plugin to trigger reconnect', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };
    (gateway as any).connectionByPluginId.set('remote.pc-host', conn);

    await expect(
      (gateway as any).disconnectPlugin('remote.pc-host'),
    ).resolves.toBeUndefined();

    expect(ws.close).toHaveBeenCalled();
  });

  it('performs a remote health check by pinging the websocket', async () => {
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
    };
    (gateway as any).connectionByPluginId.set('remote.pc-host', conn);

    const healthPromise = (gateway as any).checkPluginHealth('remote.pc-host', 5000);
    const pongHandler = ws.once.mock.calls.find((call) => call[0] === 'pong')?.[1];
    expect(typeof pongHandler).toBe('function');
    pongHandler();

    await expect(healthPromise).resolves.toEqual({
      ok: true,
    });
    expect(ws.ping).toHaveBeenCalled();
  });
});

/**
 * 创建最小 WebSocket 桩对象。
 * @returns 仅包含网关测试所需字段的方法桩
 */
function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    off: jest.fn(),
    ping: jest.fn(),
  };
}

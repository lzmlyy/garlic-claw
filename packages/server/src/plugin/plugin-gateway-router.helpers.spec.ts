import { WS_ACTION, WS_TYPE } from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import {
  handlePluginGatewayMessageEnvelope,
  handlePluginGatewayCommandMessage,
  handlePluginGatewayPluginMessage,
} from './plugin-gateway-router.helpers';

describe('plugin-gateway-router.helpers', () => {
  it('rejects unauthenticated non-auth envelopes before routing', async () => {
    const ws = createSocketStub();
    const onPluginMessage = jest.fn();

    await handlePluginGatewayMessageEnvelope({
      ws,
      connection: {
        authenticated: false,
        manifest: null,
        lastHeartbeatAt: 0,
      },
      msg: {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: {},
      },
      protocolErrorAction: 'protocol_error',
      onAuth: jest.fn(),
      onPluginMessage,
      onCommandMessage: jest.fn(),
      onHeartbeatPing: jest.fn(),
    });

    expect(onPluginMessage).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: 'error',
      action: 'auth_fail',
      payload: { error: '未认证' },
    });
  });

  it('rejects malformed auth payloads before auth handlers run', async () => {
    const ws = createSocketStub();
    const onAuth = jest.fn();

    await handlePluginGatewayMessageEnvelope({
      ws,
      connection: {
        authenticated: false,
        manifest: null,
        lastHeartbeatAt: 0,
      },
      msg: {
        type: WS_TYPE.AUTH,
        action: WS_ACTION.AUTHENTICATE,
        payload: null,
      },
      protocolErrorAction: 'protocol_error',
      onAuth,
      onPluginMessage: jest.fn(),
      onCommandMessage: jest.fn(),
      onHeartbeatPing: jest.fn(),
    });

    expect(onAuth).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: 'error',
      action: 'protocol_error',
      payload: { error: '无效的认证负载' },
    });
  });

  it('refreshes heartbeat timestamps and routes ping envelopes', async () => {
    const onHeartbeatPing = jest.fn().mockResolvedValue(undefined);
    const connection = {
      authenticated: true,
      manifest: {
        id: 'plugin-a',
        name: 'Plugin A',
        version: '1.0.0',
        runtime: 'remote',
        permissions: [],
        tools: [],
        hooks: [],
        routes: [],
      } as never,
      lastHeartbeatAt: 1,
    };

    await handlePluginGatewayMessageEnvelope({
      ws: createSocketStub(),
      connection,
      msg: {
        type: WS_TYPE.HEARTBEAT,
        action: WS_ACTION.PING,
        payload: {},
      },
      protocolErrorAction: 'protocol_error',
      onAuth: jest.fn(),
      onPluginMessage: jest.fn(),
      onCommandMessage: jest.fn(),
      onHeartbeatPing,
      now: () => 123456,
    });

    expect(connection.lastHeartbeatAt).toBe(123456);
    expect(onHeartbeatPing).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed register payloads before register handlers run', async () => {
    const ws = createSocketStub();
    const onRegister = jest.fn();

    await handlePluginGatewayPluginMessage({
      ws,
      msg: {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: null,
      },
      pendingRequests: new Map(),
      activeRequestContexts: new Map(),
      protocolErrorAction: 'protocol_error',
      onRegister,
      onHostCall: jest.fn(),
    });

    expect(onRegister).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: 'error',
      action: 'protocol_error',
      payload: { error: '无效的插件注册负载' },
    });
  });

  it('routes route results through the shared pending-request resolver', async () => {
    const timer = setTimeout(() => undefined, 60_000);
    const resolve = jest.fn();
    const reject = jest.fn();
    const socket = createSocketStub();
    const pendingRequests = new Map([
      [
        'request-1',
        {
          ws: socket,
          timer,
          resolve,
          reject,
        },
      ],
    ]);
    const activeRequestContexts = new Map([
      [
        'request-1',
        {
          ws: socket,
          context: {
            source: 'plugin' as const,
          },
        },
      ],
    ]);

    await handlePluginGatewayPluginMessage({
      ws: socket,
      msg: {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.ROUTE_RESULT,
        requestId: 'request-1',
        payload: {
          data: {
            status: 200,
            body: {
              ok: true,
            },
          },
        },
      },
      pendingRequests,
      activeRequestContexts,
      protocolErrorAction: 'protocol_error',
      onRegister: jest.fn(),
      onHostCall: jest.fn(),
    });

    expect(resolve).toHaveBeenCalledWith({
      status: 200,
      body: {
        ok: true,
      },
    });
    expect(reject).not.toHaveBeenCalled();
  });

  it('routes command errors through the shared pending-request rejecter', () => {
    const timer = setTimeout(() => undefined, 60_000);
    const reject = jest.fn();
    const socket = createSocketStub();
    const pendingRequests = new Map([
      [
        'request-1',
        {
          ws: socket,
          timer,
          resolve: jest.fn(),
          reject,
        },
      ],
    ]);
    const activeRequestContexts = new Map([
      [
        'request-1',
        {
          ws: socket,
          context: {
            source: 'plugin' as const,
          },
        },
      ],
    ]);

    handlePluginGatewayCommandMessage({
      msg: {
        type: WS_TYPE.COMMAND,
        action: WS_ACTION.EXECUTE_ERROR,
        requestId: 'request-1',
        payload: {
          error: 'remote boom',
        },
      },
      pendingRequests,
      activeRequestContexts,
    });

    expect(reject).toHaveBeenCalledWith(new Error('remote boom'));
  });
});

function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
  } as unknown as WebSocket & {
    send: jest.Mock;
    close: jest.Mock;
  };
}

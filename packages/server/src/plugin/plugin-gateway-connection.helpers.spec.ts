import { WS_ACTION, WS_TYPE } from '@garlic-claw/shared';
import { WebSocket } from 'ws';
import {
  attachPluginGatewaySocketHandlers,
  createPluginGatewayConnectionRecord,
} from './plugin-gateway-connection.helpers';

describe('plugin-gateway-connection.helpers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates unauthenticated connection records with empty plugin identity', () => {
    const ws = createSocketStub();

    expect(createPluginGatewayConnectionRecord(ws, 123456)).toEqual({
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: 123456,
    });
  });

  it('closes unauthenticated sockets after the auth timeout', () => {
    const ws = createSocketStub();
    const connection = createPluginGatewayConnectionRecord(ws, 1);

    attachPluginGatewaySocketHandlers({
      ws,
      connection,
      authTimeoutMs: 10_000,
      onIncomingMessage: jest.fn(),
      onDisconnect: jest.fn(),
    });

    jest.advanceTimersByTime(10_000);

    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.ERROR,
      action: WS_ACTION.AUTH_FAIL,
      payload: { error: '认证超时' },
    });
    expect(ws.close).toHaveBeenCalled();
  });

  it('wires message, close, and error handlers around the shared connection record', () => {
    const ws = createSocketStub();
    const connection = createPluginGatewayConnectionRecord(ws, 1);
    const onIncomingMessage = jest.fn();
    const onDisconnect = jest.fn();
    const onSocketError = jest.fn();

    attachPluginGatewaySocketHandlers({
      ws,
      connection,
      onIncomingMessage,
      onDisconnect,
      onSocketError,
      authTimeoutMs: 10_000,
    });

    const messageHandler = ws.on.mock.calls.find((call) => call[0] === 'message')?.[1];
    const closeHandler = ws.on.mock.calls.find((call) => call[0] === 'close')?.[1];
    const errorHandler = ws.on.mock.calls.find((call) => call[0] === 'error')?.[1];
    const error = new Error('boom');
    const raw = Buffer.from('test');

    messageHandler(raw);
    errorHandler(error);
    closeHandler();
    jest.advanceTimersByTime(10_000);

    expect(onIncomingMessage).toHaveBeenCalledWith(ws, connection, raw);
    expect(onSocketError).toHaveBeenCalledWith(error, connection);
    expect(onDisconnect).toHaveBeenCalledWith(connection);
    expect(ws.send).not.toHaveBeenCalled();
  });
});

function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
    on: jest.fn(),
  } as unknown as WebSocket & {
    send: jest.Mock;
    close: jest.Mock;
    on: jest.Mock;
  };
}

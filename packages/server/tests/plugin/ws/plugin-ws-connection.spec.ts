import type { WebSocket } from 'ws';
import { WS_ACTION, WS_TYPE } from '../../../src/modules/plugin/ws/plugin-ws-message.constants';
import { PluginWsInboundService } from '../../../src/modules/plugin/ws/plugin-ws-inbound.service';
import { PluginWsModule } from '../../../src/modules/plugin/ws/plugin-ws.module';

describe('PluginWsModule connection lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('opens connections with remoteAddress and flushes replies and outbound messages', async () => {
    const fixture = createFixture({
      currentConnection: {
        authenticated: true,
        claims: {
          authMode: 'required',
          pluginName: 'remote.echo',
          remoteEnvironment: 'api',
        },
        connectionId: 'conn-1',
        lastHeartbeatAt: '2026-04-12T00:00:00.000Z',
        pluginId: 'remote.echo',
        remoteEnvironment: 'api',
      },
      outboundMessages: [{
        action: WS_ACTION.REGISTER_OK,
        payload: {},
        requestId: 'request-1',
        type: WS_TYPE.PLUGIN,
      }],
    });

    fixture.service.handleConnection(fixture.socket as never, '127.0.0.1');
    fixture.socket.emit('message', {
      toString: () => JSON.stringify({
        action: WS_ACTION.AUTHENTICATE,
        payload: {
          accessKey: 'smoke-access-key',
          pluginName: 'remote.echo',
          remoteEnvironment: 'api',
        },
        type: WS_TYPE.AUTH,
      }),
    });
    fixture.socket.emit('message', {
      toString: () => JSON.stringify({
        action: WS_ACTION.REGISTER,
        payload: {
          manifest: {
            name: 'Remote Echo',
            permissions: [],
            tools: [],
            version: '1.0.0',
          },
        },
        type: WS_TYPE.PLUGIN,
      }),
    });
    await flushPromises();

    expect(fixture.runtimeGatewayConnectionLifecycleService.openConnection).toHaveBeenCalledWith({
      remoteAddress: '127.0.0.1',
    });
    expect(fixture.runtimeGatewayConnectionLifecycleService.registerRemotePlugin).toHaveBeenCalledWith({
      connectionId: 'conn-1',
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        name: 'Remote Echo',
        permissions: [],
        tools: [],
        version: '1.0.0',
      },
      remoteEnvironment: 'api',
    });
    expect(fixture.socket.send).toHaveBeenNthCalledWith(1, JSON.stringify({
      action: WS_ACTION.AUTH_OK,
      payload: {},
      type: WS_TYPE.AUTH,
    }));
    expect(fixture.socket.send).toHaveBeenNthCalledWith(2, JSON.stringify({
      action: WS_ACTION.REGISTER_OK,
      payload: {},
      type: WS_TYPE.PLUGIN,
    }));
    expect(fixture.socket.send).toHaveBeenNthCalledWith(3, JSON.stringify({
      action: WS_ACTION.REGISTER_OK,
      payload: {},
      requestId: 'request-1',
      type: WS_TYPE.PLUGIN,
    }));

    jest.advanceTimersByTime(10_001);
    expect(fixture.socket.close).not.toHaveBeenCalled();
  });

  it('closes unauthenticated sockets after auth timeout', () => {
    const fixture = createFixture();

    fixture.service.handleConnection(fixture.socket as never);
    jest.advanceTimersByTime(10_001);

    expect(fixture.socket.send).toHaveBeenCalledWith(JSON.stringify({
      action: WS_ACTION.AUTH_FAIL,
      payload: {
        error: '认证超时',
      },
      type: WS_TYPE.ERROR,
    }));
    expect(fixture.socket.close).toHaveBeenCalled();
  });

  it('disconnects plugin-owned connections on socket close', () => {
    const fixture = createFixture({
      currentConnection: {
        pluginId: 'remote.echo',
      },
    });

    fixture.service.handleConnection(fixture.socket as never);
    fixture.socket.emit('close');

    expect(fixture.runtimeGatewayConnectionLifecycleService.disconnectPlugin).toHaveBeenCalledWith('remote.echo');
    expect(fixture.runtimeGatewayConnectionLifecycleService.disconnectConnection).not.toHaveBeenCalled();
  });
});

function createFixture(input?: {
  currentConnection?: Record<string, unknown> | null;
  outboundMessages?: unknown[];
}) {
  const handlers: Partial<Record<'close' | 'error' | 'message', (value?: unknown) => void>> = {};
  const socket = {
    close: jest.fn(),
    off: jest.fn(),
    on: jest.fn((event: 'close' | 'error' | 'message', handler: (value?: unknown) => void) => {
      handlers[event] = handler;
      return socket;
    }),
    once: jest.fn(),
    ping: jest.fn(),
    readyState: 1,
    send: jest.fn(),
    emit(event: 'close' | 'error' | 'message', value?: unknown) {
      handlers[event]?.(value);
    },
  } as unknown as WebSocket & {
    emit(event: 'close' | 'error' | 'message', value?: unknown): void;
  };
  const runtimeGatewayConnectionLifecycleService = {
    authenticateConnection: jest.fn(),
    disconnectConnection: jest.fn(),
    disconnectPlugin: jest.fn(),
    getConnection: jest.fn().mockReturnValue(
      input?.currentConnection
        ? {
            authenticated: true,
            claims: null,
            connectionId: 'conn-1',
            lastHeartbeatAt: '2026-04-12T00:00:00.000Z',
            pluginId: null,
            remoteEnvironment: null,
            ...input.currentConnection,
          }
        : null,
    ),
    openConnection: jest.fn().mockReturnValue({
      authenticated: false,
      claims: null,
      connectionId: 'conn-1',
      lastHeartbeatAt: '2026-04-12T00:00:00.000Z',
      pluginId: null,
      remoteEnvironment: null,
    }),
    registerRemotePlugin: jest.fn(),
  };
  const runtimeGatewayRemoteTransportService = {
    consumeOutboundMessages: jest.fn().mockReturnValue(input?.outboundMessages ?? []),
    resolveHostCallContext: jest.fn(),
    settlePendingRequest: jest.fn(),
  };
  const pluginWsInboundService = new PluginWsInboundService(
    runtimeGatewayConnectionLifecycleService as never,
    runtimeGatewayRemoteTransportService as never,
    { call: jest.fn() } as never,
  );

  return {
    pluginWsInboundService,
    runtimeGatewayConnectionLifecycleService,
    runtimeGatewayRemoteTransportService,
    service: new PluginWsModule(
      { get: jest.fn() } as never,
      runtimeGatewayConnectionLifecycleService as never,
      runtimeGatewayRemoteTransportService as never,
      pluginWsInboundService as never,
    ),
    socket,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

import { WS_ACTION, WS_TYPE } from '../../../../src/adapters/ws/plugin-gateway/plugin-gateway.constants';
import type { WebSocket } from 'ws';
import { PluginGatewayWsModule } from '../../../../src/adapters/ws/plugin-gateway/plugin-gateway.module';
import { PluginGatewayWsInboundService } from '../../../../src/adapters/ws/plugin-gateway/plugin-gateway-ws-inbound.service';

describe('PluginGatewayWsModule connection lifecycle', () => {
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
          authKind: 'remote-plugin',
          deviceType: 'desktop',
          pluginName: 'remote.echo',
          role: 'remote_plugin',
        },
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-12T00:00:00.000Z',
        pluginId: 'remote.echo',
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
          deviceType: 'desktop',
          pluginName: 'remote.echo',
          token: 'token-1',
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
      claims: {
        authKind: 'remote-plugin',
        deviceType: 'desktop',
        pluginName: 'remote.echo',
        role: 'remote_plugin',
      },
      connectionId: 'conn-1',
      deviceType: 'desktop',
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
  const jwtService = {
    verify: jest.fn().mockReturnValue({
      authKind: 'remote-plugin',
      deviceType: 'desktop',
      pluginName: 'remote.echo',
      role: 'remote_plugin',
    }),
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
            deviceType: 'desktop',
            lastHeartbeatAt: '2026-04-12T00:00:00.000Z',
            pluginId: null,
            ...input.currentConnection,
          }
        : null,
    ),
    openConnection: jest.fn().mockReturnValue({
      authenticated: false,
      claims: null,
      connectionId: 'conn-1',
      deviceType: null,
      lastHeartbeatAt: '2026-04-12T00:00:00.000Z',
      pluginId: null,
    }),
    registerRemotePlugin: jest.fn(),
  };
  const runtimeGatewayRemoteTransportService = {
    consumeOutboundMessages: jest.fn().mockReturnValue(input?.outboundMessages ?? []),
    resolveHostCallContext: jest.fn(),
    settlePendingRequest: jest.fn(),
  };
  const pluginGatewayWsInboundService = new PluginGatewayWsInboundService(
    { get: jest.fn() } as never,
    jwtService as never,
    runtimeGatewayConnectionLifecycleService as never,
    runtimeGatewayRemoteTransportService as never,
    { callHost: jest.fn() } as never,
  );

  return {
    pluginGatewayWsInboundService,
    runtimeGatewayConnectionLifecycleService,
    runtimeGatewayRemoteTransportService,
    service: new PluginGatewayWsModule(
      { get: jest.fn() } as never,
      runtimeGatewayConnectionLifecycleService as never,
      runtimeGatewayRemoteTransportService as never,
      pluginGatewayWsInboundService as never,
    ),
    socket,
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

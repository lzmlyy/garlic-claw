import { PluginGatewayWsModule } from '../../../../src/adapters/ws/plugin-gateway/plugin-gateway.module';
import { WS_ACTION, WS_TYPE } from '../../../../src/adapters/ws/plugin-gateway/plugin-gateway.constants';
import { PluginGatewayWsInboundService } from '../../../../src/adapters/ws/plugin-gateway/plugin-gateway-ws-inbound.service';

describe('PluginGatewayWsModule inbound handling', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('registers websocket lifecycle callbacks on module init', () => {
    const fixture = createFixture({ wsPort: 0 });

    fixture.service.onModuleInit();

    expect(fixture.runtimeGatewayConnectionLifecycleService.registerConnectionCloser).toHaveBeenCalledWith(expect.any(Function));
    expect(fixture.runtimeGatewayConnectionLifecycleService.registerConnectionHealthProbe).toHaveBeenCalledWith(expect.any(Function));

    fixture.service.onModuleDestroy();
  });

  it('rejects unauthenticated websocket plugin messages before routing', async () => {
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: false,
        claims: null,
        connectionId: 'conn-1',
        deviceType: null,
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: null,
      },
    });

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
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
      } as never,
    });

    expect(fixture.runtimeGatewayConnectionLifecycleService.registerRemotePlugin).not.toHaveBeenCalled();
    expect(result).toEqual({
      reply: {
        action: WS_ACTION.AUTH_FAIL,
        payload: {
          error: '未认证',
        },
        type: WS_TYPE.ERROR,
      },
    });
  });

  it('authenticates remote plugins and replies with AUTH_OK', async () => {
    const fixture = createFixture();

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
        action: WS_ACTION.AUTHENTICATE,
        payload: {
          deviceType: 'desktop',
          pluginName: 'remote.echo',
          token: 'token-1',
        },
        type: WS_TYPE.AUTH,
      } as never,
    });

    expect(
      fixture.runtimeGatewayConnectionLifecycleService.authenticateConnection,
    ).toHaveBeenCalledWith({
      claims: {
        authKind: 'remote-plugin',
        deviceType: 'desktop',
        pluginName: 'remote.echo',
        role: 'remote_plugin',
      },
      connectionId: 'conn-1',
      deviceType: 'desktop',
      pluginName: 'remote.echo',
    });
    expect(result).toEqual({
      reply: {
        action: WS_ACTION.AUTH_OK,
        payload: {},
        type: WS_TYPE.AUTH,
      },
    });
  });

  it('rejects malformed auth payloads before authentication runs', async () => {
    const fixture = createFixture();

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
        action: WS_ACTION.AUTHENTICATE,
        payload: null,
        type: WS_TYPE.AUTH,
      } as never,
    });

    expect(fixture.jwtService.verify).not.toHaveBeenCalled();
    expect(result).toEqual({
      reply: {
        action: 'protocol_error',
        payload: {
          error: '无效的认证负载',
        },
        type: WS_TYPE.ERROR,
      },
    });
  });

  it('registers remote plugins and requests outbound flush', async () => {
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: {
          authKind: 'remote-plugin',
          deviceType: 'desktop',
          pluginName: 'remote.echo',
          role: 'remote_plugin',
        },
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
    });

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
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
      } as never,
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
    expect(result).toEqual({
      flushOutbound: true,
      reply: {
        action: WS_ACTION.REGISTER_OK,
        payload: {},
        type: WS_TYPE.PLUGIN,
      },
    });
  });

  it('rejects malformed register payloads without throwing from the plugin message handler', async () => {
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: {
          authKind: 'remote-plugin',
          deviceType: 'desktop',
          pluginName: 'remote.echo',
          role: 'remote_plugin',
        },
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
    });

    await expect(
      fixture.service.handleMessage({
        connectionId: 'conn-1',
        message: {
          action: WS_ACTION.REGISTER,
          payload: null,
          type: WS_TYPE.PLUGIN,
        } as never,
      }),
    ).resolves.toEqual({
      reply: {
        action: 'protocol_error',
        payload: {
          error: '无效的插件注册负载',
        },
        type: WS_TYPE.ERROR,
      },
    });
    expect(fixture.runtimeGatewayConnectionLifecycleService.registerRemotePlugin).not.toHaveBeenCalled();
  });

  it('touches heartbeat and replies with PONG', async () => {
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: null,
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
    });

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
        action: WS_ACTION.PING,
        payload: {},
        type: WS_TYPE.HEARTBEAT,
      } as never,
    });

    expect(
      fixture.runtimeGatewayConnectionLifecycleService.touchConnectionHeartbeat,
    ).toHaveBeenCalledWith('conn-1');
    expect(result).toEqual({
      reply: {
        action: WS_ACTION.PONG,
        payload: {},
        type: WS_TYPE.HEARTBEAT,
      },
    });
  });

  it('rejects malformed host api payloads before they reach the runtime', async () => {
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: null,
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
    });

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
        action: WS_ACTION.HOST_CALL,
        payload: {
          method: 'plugin.self.get',
          params: 'bad-params',
        },
        requestId: 'request-bad-host',
        type: WS_TYPE.PLUGIN,
      } as never,
    });

    expect(fixture.runtimeGatewayRemoteTransportService.resolveHostCallContext).not.toHaveBeenCalled();
    expect(fixture.runtimeHostService.call).not.toHaveBeenCalled();
    expect(result).toEqual({
      reply: {
        action: WS_ACTION.HOST_ERROR,
        payload: {
          error: '无效的 Host API 调用负载',
        },
        requestId: 'request-bad-host',
        type: WS_TYPE.PLUGIN,
      },
    });
  });

  it('returns HOST_ERROR when host call execution fails', async () => {
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: null,
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
    });
    fixture.runtimeGatewayRemoteTransportService.resolveHostCallContext.mockReturnValue({
      conversationId: 'conversation-1',
      source: 'chat-tool',
      userId: 'user-1',
    });
    fixture.runtimeHostService.call.mockRejectedValue(new Error('host failed'));

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
        action: WS_ACTION.HOST_CALL,
        payload: {
          context: {
            conversationId: 'conversation-1',
            source: 'chat-tool',
            userId: 'user-1',
          },
          method: 'memory.search',
          params: {
            query: 'coffee',
          },
        },
        requestId: 'request-1',
        type: WS_TYPE.PLUGIN,
      } as never,
    });

    expect(result).toEqual({
      reply: {
        action: WS_ACTION.HOST_ERROR,
        payload: {
          error: 'host failed',
        },
        requestId: 'request-1',
        type: WS_TYPE.PLUGIN,
      },
    });
  });

  it('settles command results into the runtime kernel', async () => {
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: null,
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
    });

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
        action: WS_ACTION.EXECUTE_RESULT,
        payload: {
          data: {
            ok: true,
          },
        },
        requestId: 'request-1',
        type: WS_TYPE.COMMAND,
      } as never,
    });

    expect(result).toBeUndefined();
    expect(fixture.runtimeGatewayRemoteTransportService.settlePendingRequest).toHaveBeenCalledWith({
      requestId: 'request-1',
      result: {
        ok: true,
      },
    });
  });

  it('rejects malformed hook results instead of leaving pending requests hanging', async () => {
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: null,
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
    });

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
        action: WS_ACTION.HOOK_RESULT,
        payload: {
          bad: true,
        },
        requestId: 'request-2',
        type: WS_TYPE.PLUGIN,
      } as never,
    });

    expect(result).toBeUndefined();
    expect(fixture.runtimeGatewayRemoteTransportService.settlePendingRequest).toHaveBeenCalledWith({
      error: '无效的 Hook 返回负载',
      requestId: 'request-2',
    });
  });

  it('rejects malformed route results instead of treating them as successful responses', async () => {
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: null,
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
    });

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
        action: WS_ACTION.ROUTE_RESULT,
        payload: {
          data: {
            ok: true,
          },
        },
        requestId: 'request-3',
        type: WS_TYPE.PLUGIN,
      } as never,
    });

    expect(result).toBeUndefined();
    expect(fixture.runtimeGatewayRemoteTransportService.settlePendingRequest).toHaveBeenCalledWith({
      error: '无效的插件 Route 返回负载',
      requestId: 'request-3',
    });
  });

  it('warns and ignores plugin result messages that do not include request ids', async () => {
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: null,
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
    });
    const loggerWarn = jest.fn();
    fixture.pluginGatewayWsInboundService['logger'].warn = loggerWarn;

    const result = await fixture.service.handleMessage({
      connectionId: 'conn-1',
      message: {
        action: WS_ACTION.EXECUTE_ERROR,
        payload: {
          error: 'ignored',
        },
        type: WS_TYPE.COMMAND,
      } as never,
    });

    expect(result).toBeUndefined();
    expect(loggerWarn).toHaveBeenCalledWith(
      '收到缺少 requestId 的插件消息: command/execute_error',
    );
    expect(fixture.runtimeGatewayRemoteTransportService.settlePendingRequest).not.toHaveBeenCalled();
  });

  it('clears auth timeout after raw auth success', async () => {
    jest.useFakeTimers();
    const socket = createSocketMock();
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: false,
        claims: null,
        connectionId: 'conn-1',
        deviceType: null,
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: null,
      },
      openConnectionId: 'conn-1',
    });

    fixture.service.handleConnection(socket as never, '127.0.0.1');
    await fixture.service['handleRawMessage']('conn-1', JSON.stringify({
      action: WS_ACTION.AUTHENTICATE,
      payload: { deviceType: 'desktop', pluginName: 'remote.echo', token: 'token-1' },
      type: WS_TYPE.AUTH,
    }));

    await jest.advanceTimersByTimeAsync(10001);

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ action: WS_ACTION.AUTH_OK, payload: {}, type: WS_TYPE.AUTH }));
    expect(socket.close).not.toHaveBeenCalled();
    fixture.service.onModuleDestroy();
  });

  it('flushes outbound messages after register replies request it', async () => {
    const socket = createSocketMock();
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: {
          authKind: 'remote-plugin',
          deviceType: 'desktop',
          pluginName: 'remote.echo',
          role: 'remote_plugin',
        },
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
      openConnectionId: 'conn-1',
      outboundMessages: [{ action: WS_ACTION.PONG, payload: {}, type: WS_TYPE.HEARTBEAT }],
    });

    fixture.service.handleConnection(socket as never, '127.0.0.1');
    await fixture.service['handleRawMessage']('conn-1', JSON.stringify({
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
    }));

    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ action: WS_ACTION.REGISTER_OK, payload: {}, type: WS_TYPE.PLUGIN }));
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ action: WS_ACTION.PONG, payload: {}, type: WS_TYPE.HEARTBEAT }));
    fixture.service.onModuleDestroy();
  });

  it('disconnects plugin-owned connections through runtime gateway lifecycle service', () => {
    const socket = createSocketMock();
    const fixture = createFixture({
      gatewayConnection: {
        authenticated: true,
        claims: null,
        connectionId: 'conn-1',
        deviceType: 'desktop',
        lastHeartbeatAt: '2026-04-11T00:00:00.000Z',
        pluginId: 'remote.echo',
      },
      openConnectionId: 'conn-1',
    });

    fixture.service.handleConnection(socket as never, '127.0.0.1');
    fixture.service['handleDisconnect']('conn-1');

    expect(fixture.runtimeGatewayConnectionLifecycleService.disconnectPlugin).toHaveBeenCalledWith('remote.echo');
    fixture.service.onModuleDestroy();
  });

  it('probes websocket health through ping/pong', async () => {
    const socket = createSocketMock();
    const fixture = createFixture({
      gatewayConnection: null,
      openConnectionId: 'conn-1',
    });

    fixture.service.handleConnection(socket as never, '127.0.0.1');
    const pingPromise = fixture.service['pingConnection']('conn-1', 50);
    socket.onceHandlers.pong?.();

    await expect(pingPromise).resolves.toEqual({ ok: true });
    expect(socket.ping).toHaveBeenCalledTimes(1);
    fixture.service.onModuleDestroy();
  });
});

function createFixture(input?: {
  gatewayConnection?: Record<string, unknown> | null;
  openConnectionId?: string;
  outboundMessages?: Array<Record<string, unknown>>;
  wsPort?: number;
}) {
  const configService = {
    get: jest.fn((_key: string, fallback?: string) => input?.wsPort ?? fallback),
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
    checkHeartbeats: jest.fn().mockReturnValue([]),
    disconnectConnection: jest.fn(),
    disconnectPlugin: jest.fn(),
    getConnection: jest.fn().mockReturnValue(input?.gatewayConnection ?? null),
    openConnection: jest.fn().mockReturnValue({ connectionId: input?.openConnectionId ?? 'conn-1' }),
    registerConnectionCloser: jest.fn(),
    registerConnectionHealthProbe: jest.fn(),
    registerRemotePlugin: jest.fn(),
    touchConnectionHeartbeat: jest.fn(),
  };
  const runtimeGatewayRemoteTransportService = {
    consumeOutboundMessages: jest.fn().mockReturnValue(input?.outboundMessages ?? []),
    resolveHostCallContext: jest.fn(),
    settlePendingRequest: jest.fn(),
  };
  const runtimeHostService = {
    call: jest.fn(),
  };
  const pluginGatewayWsInboundService = new PluginGatewayWsInboundService(
    configService as never,
    jwtService as never,
    runtimeGatewayConnectionLifecycleService as never,
    runtimeGatewayRemoteTransportService as never,
    runtimeHostService as never,
  );

  return {
    jwtService,
    pluginGatewayWsInboundService,
    runtimeGatewayConnectionLifecycleService,
    runtimeGatewayRemoteTransportService,
    runtimeHostService,
    service: new PluginGatewayWsModule(
      configService as never,
      runtimeGatewayConnectionLifecycleService as never,
      runtimeGatewayRemoteTransportService as never,
      pluginGatewayWsInboundService as never,
    ),
  };
}

function createSocketMock() {
  const eventHandlers: Record<string, (...args: unknown[]) => void> = {};
  const onceHandlers: Record<string, (...args: unknown[]) => void> = {};
  return {
    close: jest.fn(),
    eventHandlers,
    off: jest.fn((event: string) => {
      delete onceHandlers[event];
    }),
    on: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      eventHandlers[event] = handler;
      return undefined;
    }),
    once: jest.fn((event: string, handler: (...args: unknown[]) => void) => {
      onceHandlers[event] = handler;
      return undefined;
    }),
    onceHandlers,
    ping: jest.fn(),
    readyState: 1,
    send: jest.fn(),
  };
}

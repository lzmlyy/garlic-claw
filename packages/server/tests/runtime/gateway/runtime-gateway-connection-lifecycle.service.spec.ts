import { PluginBootstrapService } from '../../../src/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/plugin/persistence/plugin-persistence.service';
import { RuntimeGatewayConnectionLifecycleService } from '../../../src/runtime/gateway/runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayRemoteTransportService } from '../../../src/runtime/gateway/runtime-gateway-remote-transport.service';

describe('Runtime gateway owners', () => {
  it('registers remote plugins against authenticated connections', () => {
    const service = createService();

    service.openConnection({
      connectionId: 'conn-1',
      remoteAddress: '127.0.0.1',
      seenAt: '2026-04-10T00:00:00.000Z',
    });
    service.registerRemotePlugin({
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
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    expect(service.getConnection('conn-1')).toMatchObject({
      authenticated: true,
      connectionId: 'conn-1',
      deviceType: 'desktop',
      pluginId: 'remote.echo',
      remoteAddress: '127.0.0.1',
    });
    expect(service.getSnapshot()).toEqual({
      authenticatedConnectionCount: 1,
      authorizedContextCount: 0,
      connectionCount: 1,
      connectedPluginIds: ['remote.echo'],
      protocol: 'ws',
      status: 'ready',
    });
  });

  it('replaces older plugin connections and clears their authorized contexts', () => {
    const service = createService();

    service.openConnection({
      connectionId: 'conn-1',
    });
    service.authenticateConnection({
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
    void service.createPendingRequest({
      action: 'hook_invoke',
      connectionId: 'conn-1',
      context: {
        conversationId: 'conversation-1',
        source: 'chat-hook',
        userId: 'user-1',
      },
      payload: {
        data: true,
      },
      type: 'plugin',
    }).catch(() => undefined);

    service.openConnection({
      connectionId: 'conn-2',
    });
    service.authenticateConnection({
      claims: {
        authKind: 'remote-plugin',
        deviceType: 'desktop',
        pluginName: 'remote.echo',
        role: 'remote_plugin',
      },
      connectionId: 'conn-2',
      deviceType: 'desktop',
      pluginName: 'remote.echo',
    });

    expect(service.getConnection('conn-1')).toBeNull();
    expect(service.getConnection('conn-2')).toMatchObject({
      authenticated: true,
      connectionId: 'conn-2',
      pluginId: 'remote.echo',
    });
  });

  it('resolves connection-scoped and authorized host call contexts', () => {
    const service = createService();

    service.openConnection({
      connectionId: 'conn-1',
    });
    service.authenticateConnection({
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
    void service.createPendingRequest({
      action: 'execute',
      connectionId: 'conn-1',
      context: {
        conversationId: 'conversation-1',
        source: 'chat-tool',
        userId: 'user-1',
      },
      payload: {
        query: 'coffee',
      },
      type: 'command',
    }).catch(() => undefined);

    expect(
      service.resolveHostCallContext({
        connectionId: 'conn-1',
        context: {
          conversationId: 'forged-conversation',
          source: 'chat-tool',
          userId: 'forged-user',
        },
        method: 'plugin.self.get',
      }),
    ).toEqual({
      source: 'plugin',
    });
    expect(
      service.resolveHostCallContext({
        connectionId: 'conn-1',
        context: {
          conversationId: 'conversation-1',
          source: 'chat-tool',
          userId: 'user-1',
        },
        method: 'memory.search',
      }),
    ).toEqual({
      conversationId: 'conversation-1',
      source: 'chat-tool',
      userId: 'user-1',
    });
    expect(() =>
      service.resolveHostCallContext({
        connectionId: 'conn-1',
        context: {
          conversationId: 'conversation-9',
          source: 'chat-tool',
          userId: 'user-9',
        },
        method: 'memory.search',
      }),
    ).toThrow('Host API memory.search is missing an authorized invocation context');
  });

  it('disconnects stale connections during heartbeat sweeps', () => {
    const service = createService();

    service.openConnection({
      connectionId: 'conn-1',
      seenAt: '2026-04-10T00:00:00.000Z',
    });
    service.registerRemotePlugin({
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
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    service.touchConnectionHeartbeat('conn-1', '2026-04-10T00:00:00.000Z');

    expect(
      service.checkHeartbeats({
        maxIdleMs: 10_000,
        now: Date.parse('2026-04-10T00:01:00.000Z'),
      }),
    ).toEqual(['conn-1']);
    expect(service.getSnapshot()).toEqual({
      authenticatedConnectionCount: 0,
      authorizedContextCount: 0,
      connectionCount: 0,
      connectedPluginIds: [],
      protocol: 'ws',
      status: 'ready',
    });
  });

  it('closes active remote sockets when disconnecting plugins', () => {
    const service = createService();
    const closeConnection = jest.fn();

    service.registerConnectionCloser(closeConnection);
    service.openConnection({
      connectionId: 'conn-1',
    });
    service.registerRemotePlugin({
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
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    service.disconnectPlugin('remote.echo');

    expect(closeConnection).toHaveBeenCalledWith('conn-1');
    expect(service.getConnection('conn-1')).toBeNull();
    expect(service.getSnapshot()).toEqual({
      authenticatedConnectionCount: 0,
      authorizedContextCount: 0,
      connectionCount: 0,
      connectedPluginIds: [],
      protocol: 'ws',
      status: 'ready',
    });
  });

  it('creates remote transport requests and settles pending results', async () => {
    const service = createService();

    service.openConnection({
      connectionId: 'conn-1',
    });
    service.registerRemotePlugin({
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
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const transport = service.createRemoteTransport('remote.echo');
    const resultPromise = transport.executeTool({
      context: {
        conversationId: 'conversation-1',
        source: 'chat-tool',
        userId: 'user-1',
      },
      params: {
        query: 'coffee',
      },
      toolName: 'memory.search',
    });
    const outbound = service.consumeOutboundMessages('conn-1');

    expect(outbound).toEqual([
      {
        action: 'execute',
        payload: {
          context: {
            conversationId: 'conversation-1',
            source: 'chat-tool',
            userId: 'user-1',
          },
          params: {
            query: 'coffee',
          },
          toolName: 'memory.search',
        },
        requestId: expect.any(String),
        type: 'command',
      },
    ]);

    service.settlePendingRequest({
      requestId: outbound[0].requestId,
      result: {
        items: [
          {
            id: 'memory-1',
          },
        ],
      },
    });

    await expect(resultPromise).resolves.toEqual({
      items: [
        {
          id: 'memory-1',
        },
      ],
    });
  });

  it('settles remote hook and route requests through the gateway transport', async () => {
    const service = createService();

    service.openConnection({
      connectionId: 'conn-1',
    });
    service.registerRemotePlugin({
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
        permissions: [],
        routes: [
          {
            methods: ['GET'],
            path: 'inspect/context',
          },
        ],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const transport = service.createRemoteTransport('remote.echo');
    const hookPromise = transport.invokeHook({
      context: {
        conversationId: 'conversation-1',
        source: 'chat-hook',
        userId: 'user-1',
      },
      hookName: 'chat:before-model',
      payload: {
        message: 'hello',
      },
    });
    const routePromise = transport.invokeRoute({
      context: {
        conversationId: 'conversation-1',
        source: 'http-route',
        userId: 'user-1',
      },
      request: {
        body: null,
        headers: {},
        method: 'GET',
        path: 'inspect/context',
        query: {},
      },
    });
    const outbound = service.consumeOutboundMessages('conn-1');

    expect(outbound).toEqual([
      {
        action: 'hook_invoke',
        payload: {
          context: {
            conversationId: 'conversation-1',
            source: 'chat-hook',
            userId: 'user-1',
          },
          hookName: 'chat:before-model',
          payload: {
            message: 'hello',
          },
        },
        requestId: expect.any(String),
        type: 'plugin',
      },
      {
        action: 'route_invoke',
        payload: {
          context: {
            conversationId: 'conversation-1',
            source: 'http-route',
            userId: 'user-1',
          },
          request: {
            body: null,
            headers: {},
            method: 'GET',
            path: 'inspect/context',
            query: {},
          },
        },
        requestId: expect.any(String),
        type: 'plugin',
      },
    ]);

    service.settlePendingRequest({
      requestId: outbound[0].requestId,
      result: {
        action: 'continue',
      },
    });
    service.settlePendingRequest({
      requestId: outbound[1].requestId,
      result: {
        body: {
          ok: true,
        },
        status: 200,
      },
    });

    await expect(hookPromise).resolves.toEqual({
      action: 'continue',
    });
    await expect(routePromise).resolves.toEqual({
      body: {
        ok: true,
      },
      status: 200,
    });
  });

  it('rejects pending remote requests when the connection drops', async () => {
    const service = createService();

    service.openConnection({
      connectionId: 'conn-1',
    });
    service.registerRemotePlugin({
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
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const transport = service.createRemoteTransport('remote.echo');
    const pending = transport.executeTool({
      context: {
        conversationId: 'conversation-1',
        source: 'chat-tool',
        userId: 'user-1',
      },
      params: {
        query: 'coffee',
      },
      toolName: 'memory.search',
    });

    service.disconnectConnection('conn-1');

    await expect(pending).rejects.toThrow('Plugin connection closed');
  });
});

function createService() {
  const pluginBootstrapService = new PluginBootstrapService(
    new PluginGovernanceService(),
    new PluginPersistenceService(),
  );
  const runtimeGatewayConnectionLifecycleService = new RuntimeGatewayConnectionLifecycleService(
    pluginBootstrapService,
  );
  const runtimeGatewayRemoteTransportService = new RuntimeGatewayRemoteTransportService(
    runtimeGatewayConnectionLifecycleService,
  );
  const gatewayInternals = runtimeGatewayConnectionLifecycleService as unknown as {
    connections: Map<string, { authenticated: boolean }>;
  };
  return {
    authenticateConnection: (input: Parameters<RuntimeGatewayConnectionLifecycleService['authenticateConnection']>[0]) =>
      runtimeGatewayConnectionLifecycleService.authenticateConnection(input),
    checkHeartbeats: (input: Parameters<RuntimeGatewayConnectionLifecycleService['checkHeartbeats']>[0]) =>
      runtimeGatewayConnectionLifecycleService.checkHeartbeats(input),
    checkPluginHealth: (pluginId: string) => runtimeGatewayConnectionLifecycleService.checkPluginHealth(pluginId),
    consumeOutboundMessages: (connectionId: string) => runtimeGatewayRemoteTransportService.consumeOutboundMessages(connectionId),
    createPendingRequest: (input: Parameters<RuntimeGatewayRemoteTransportService['createPendingRequest']>[0]) =>
      runtimeGatewayRemoteTransportService.createPendingRequest(input),
    createRemoteTransport: (pluginId: string) => runtimeGatewayRemoteTransportService.createRemoteTransport(pluginId),
    disconnectConnection: (connectionId: string) => runtimeGatewayConnectionLifecycleService.disconnectConnection(connectionId),
    disconnectPlugin: (pluginId: string) => runtimeGatewayConnectionLifecycleService.disconnectPlugin(pluginId),
    getConnection: (connectionId: string) => runtimeGatewayConnectionLifecycleService.getConnection(connectionId),
    getSnapshot: () => ({
      authenticatedConnectionCount: [...gatewayInternals.connections.values()].filter((connection) => connection.authenticated).length,
      authorizedContextCount: runtimeGatewayRemoteTransportService.getAuthorizedContextCount(),
      connectionCount: gatewayInternals.connections.size,
      connectedPluginIds: pluginBootstrapService
        .listPlugins()
        .filter((plugin) => plugin.connected && plugin.manifest.runtime === 'remote')
        .map((plugin) => plugin.pluginId),
      protocol: 'ws' as const,
      status: 'ready' as const,
    }),
    openConnection: (input?: Parameters<RuntimeGatewayConnectionLifecycleService['openConnection']>[0]) =>
      runtimeGatewayConnectionLifecycleService.openConnection(input),
    registerConnectionCloser: (closer: Parameters<RuntimeGatewayConnectionLifecycleService['registerConnectionCloser']>[0]) =>
      runtimeGatewayConnectionLifecycleService.registerConnectionCloser(closer),
    registerConnectionHealthProbe: (probe: Parameters<RuntimeGatewayConnectionLifecycleService['registerConnectionHealthProbe']>[0]) =>
      runtimeGatewayConnectionLifecycleService.registerConnectionHealthProbe(probe),
    registerRemotePlugin: (input: Parameters<RuntimeGatewayConnectionLifecycleService['registerRemotePlugin']>[0]) =>
      runtimeGatewayConnectionLifecycleService.registerRemotePlugin(input),
    resolveHostCallContext: (input: Parameters<RuntimeGatewayRemoteTransportService['resolveHostCallContext']>[0]) =>
      runtimeGatewayRemoteTransportService.resolveHostCallContext(input),
    settlePendingRequest: (input: Parameters<RuntimeGatewayRemoteTransportService['settlePendingRequest']>[0]) =>
      runtimeGatewayRemoteTransportService.settlePendingRequest(input),
    touchConnectionHeartbeat: (connectionId: string, seenAt?: string) =>
      runtimeGatewayConnectionLifecycleService.touchConnectionHeartbeat(connectionId, seenAt),
  };
}

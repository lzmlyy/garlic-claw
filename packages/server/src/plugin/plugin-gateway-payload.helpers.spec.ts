import {
  extractPluginCallContext,
  isConnectionScopedHostMethod,
  isJsonObjectValue,
  isJsonValue,
  isPluginHostMethod,
  readAuthPayload,
  readDataPayload,
  readErrorPayload,
  readHostCallPayload,
  readPluginCallContext,
  readPluginGatewayMessage,
  readPluginRouteResponse,
  readPluginRouteResponseOrThrow,
  readRegisterPayload,
  readRouteResultPayload,
  readUnknownObject,
} from './plugin-gateway-payload.helpers';

describe('plugin-gateway-payload.helpers', () => {
  it('reads gateway envelope and basic payload shapes safely', () => {
    expect(
      readPluginGatewayMessage({
        type: 'plugin',
        action: 'host_call',
        requestId: 'request-1',
        payload: {
          ok: true,
        },
      }),
    ).toEqual({
      type: 'plugin',
      action: 'host_call',
      requestId: 'request-1',
      payload: {
        ok: true,
      },
    });
    expect(readPluginGatewayMessage('bad')).toBeNull();

    expect(
      readAuthPayload({
        token: 'token-1',
        pluginName: 'remote.pc-host',
        deviceType: 'pc',
      }),
    ).toEqual({
      token: 'token-1',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });
    expect(readAuthPayload({ token: 'token-1' })).toBeNull();

    expect(
      readRegisterPayload({
        manifest: {
          id: 'remote.pc-host',
        },
      }),
    ).toEqual({
      manifest: {
        id: 'remote.pc-host',
      },
    });
    expect(readRegisterPayload({ manifest: 'bad' })).toBeNull();

    expect(
      readDataPayload({
        data: {
          ok: true,
        },
      }),
    ).toEqual({
      data: {
        ok: true,
      },
    });
    expect(readDataPayload({ data: Symbol('bad') })).toBeNull();

    expect(
      readErrorPayload({
        error: 'bad payload',
      }),
    ).toEqual({
      error: 'bad payload',
    });
    expect(readErrorPayload({ error: 42 })).toBeNull();
  });

  it('validates route payloads and throws for malformed route responses', () => {
    const routeResponse = {
      status: 200,
      body: {
        ok: true,
      },
      headers: {
        'content-type': 'application/json',
      },
    };

    expect(readPluginRouteResponse(routeResponse)).toEqual(routeResponse);
    expect(
      readRouteResultPayload({
        data: routeResponse,
      }),
    ).toEqual({
      data: routeResponse,
    });
    expect(() => readPluginRouteResponseOrThrow('bad')).toThrow(
      '无效的插件 Route 返回负载',
    );
    expect(
      readRouteResultPayload({
        data: {
          status: '200',
          body: null,
        },
      }),
    ).toBeNull();
  });

  it('validates host call methods, contexts, and connection-scoped access', () => {
    const hostCallPayload = {
      method: 'memory.search',
      params: {
        query: '咖啡',
      },
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        metadata: {
          timeoutMs: 1234,
        },
      },
    };

    expect(readHostCallPayload(hostCallPayload)).toEqual(hostCallPayload);
    expect(
      extractPluginCallContext({
        context: hostCallPayload.context,
      }),
    ).toEqual(hostCallPayload.context);
    expect(readHostCallPayload({ ...hostCallPayload, method: 'host.not-real' })).toBeNull();
    expect(readHostCallPayload({ ...hostCallPayload, params: 'bad' })).toBeNull();
    expect(
      readHostCallPayload({
        ...hostCallPayload,
        context: {
          ...hostCallPayload.context,
          userId: 42,
        },
      }),
    ).toBeNull();

    expect(isPluginHostMethod('plugin.self.get')).toBe(true);
    expect(isPluginHostMethod('host.not-real')).toBe(false);
    expect(isConnectionScopedHostMethod('plugin.self.get')).toBe(true);
    expect(isConnectionScopedHostMethod('memory.search')).toBe(false);
  });

  it('accepts only JSON-safe values and plugin invocation contexts', () => {
    expect(isJsonValue(['ok', 1, true, null])).toBe(true);
    expect(isJsonValue({ nested: ['ok'] })).toBe(true);
    expect(isJsonValue(undefined)).toBe(false);
    expect(isJsonObjectValue({ ok: true })).toBe(true);
    expect(isJsonObjectValue(['bad'])).toBe(false);

    expect(readUnknownObject({ ok: true })).toEqual({ ok: true });
    expect(readUnknownObject(['bad'])).toBeNull();

    expect(
      readPluginCallContext({
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        automationId: 'automation-1',
        cronJobId: 'cron-1',
        activeProviderId: 'provider-1',
        activeModelId: 'model-1',
        activePersonaId: 'persona-1',
        metadata: {
          enabled: true,
        },
      }),
    ).toEqual({
      source: 'chat-hook',
      userId: 'user-1',
      conversationId: 'conversation-1',
      automationId: 'automation-1',
      cronJobId: 'cron-1',
      activeProviderId: 'provider-1',
      activeModelId: 'model-1',
      activePersonaId: 'persona-1',
      metadata: {
        enabled: true,
      },
    });
    expect(
      readPluginCallContext({
        source: 'not-real',
      }),
    ).toBeNull();
    expect(
      readPluginCallContext({
        source: 'plugin',
        metadata: {
          invalid: undefined,
        },
      }),
    ).toBeNull();
  });
});

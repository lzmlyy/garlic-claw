import {
  type RegisterPayload,
  WS_ACTION,
  WS_TYPE,
} from '@garlic-claw/shared';
import {
  createPluginGatewayFixture,
  createSocketStub,
  readLastSentMessage,
  remoteManifest,
} from '../fixtures/plugin-gateway.fixture';

describe('PluginGateway adapter - transport & lifecycle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('refreshes persisted heartbeat timestamps when a remote plugin sends ping', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
      lastHeartbeatAt: 0,
    };
    pluginRuntimeOrchestrator.touchPluginHeartbeat.mockResolvedValue(undefined);

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.HEARTBEAT,
      action: WS_ACTION.PING,
      payload: {},
    });

    expect(pluginRuntimeOrchestrator.touchPluginHeartbeat).toHaveBeenCalledWith('remote.pc-host');
    expect(conn.lastHeartbeatAt).toBeGreaterThan(0);
  });

  it('closes stale authenticated remote plugin connections during heartbeat sweeps', () => {
    const { gateway } = createPluginGatewayFixture();
    const staleSocket = createSocketStub();
    const freshSocket = createSocketStub();
    const staleConnection = {
      ws: staleSocket,
      pluginName: 'remote.stale-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
      lastHeartbeatAt: Date.now() - 120_000,
    };
    const freshConnection = {
      ws: freshSocket,
      pluginName: 'remote.fresh-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
      lastHeartbeatAt: Date.now(),
    };

    (gateway as any).connections.set(staleSocket, staleConnection);
    (gateway as any).connections.set(freshSocket, freshConnection);
    (gateway as any).checkHeartbeats();

    expect(staleSocket.close).toHaveBeenCalled();
    expect(freshSocket.close).not.toHaveBeenCalled();
  });

  it('sends execute messages through the registered remote transport and resolves the response', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: { manifest: remoteManifest } satisfies RegisterPayload,
    });

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.executeTool({
      toolName: 'list_directory',
      params: { dirPath: 'C:\\\\' },
      context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
    });
    const sentMessage = JSON.parse(ws.send.mock.calls[1]?.[0] ?? '{}');

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.COMMAND,
      action: WS_ACTION.EXECUTE_RESULT,
      requestId: sentMessage.requestId,
      payload: { data: { entries: ['Users', 'Windows'] } },
    });

    await expect(resultPromise).resolves.toEqual({ entries: ['Users', 'Windows'] });
  });

  it('rejects pending execute requests when the remote plugin returns command errors', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: { manifest: remoteManifest } satisfies RegisterPayload,
    });

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.executeTool({
      toolName: 'list_directory',
      params: { dirPath: 'C:\\\\' },
      context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
    });
    const sentMessage = JSON.parse(ws.send.mock.calls[1]?.[0] ?? '{}');

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.COMMAND,
      action: WS_ACTION.EXECUTE_ERROR,
      requestId: sentMessage.requestId,
      payload: { error: 'remote boom' },
    });

    await expect(resultPromise).rejects.toThrow('remote boom');
  });

  it('sends hook messages through the registered remote transport and resolves the response', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };
    const context = {
      source: 'chat-hook',
      userId: 'user-1',
      conversationId: 'conversation-1',
      metadata: { timeoutMs: 1234 },
    } as const;

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: { manifest: remoteManifest } satisfies RegisterPayload,
    });

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.invokeHook({
      hookName: 'chat:before-model',
      context,
      payload: { message: 'hello' },
    });
    const sentMessage = readLastSentMessage(ws);
    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOOK_RESULT,
      requestId: sentMessage.requestId,
      payload: { data: { action: 'continue' } },
    });

    await expect(resultPromise).resolves.toEqual({ action: 'continue' });
  });

  it('rejects pending hook invocations when the remote plugin returns malformed hook results', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: { manifest: remoteManifest } satisfies RegisterPayload,
    });

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.invokeHook({
      hookName: 'chat:before-model',
      context: { source: 'chat-hook' },
      payload: { message: 'hello' },
    });
    const sentMessage = readLastSentMessage(ws);

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOOK_RESULT,
      requestId: sentMessage.requestId,
      payload: { bad: true },
    });

    await expect(resultPromise).rejects.toThrow('无效的 Hook 返回负载');
  });

  it('rejects pending hook invocations when the remote plugin returns hook errors', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };
    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: { manifest: remoteManifest } satisfies RegisterPayload,
    });

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.invokeHook({
      hookName: 'chat:before-model',
      context: { source: 'chat-hook' },
      payload: { message: 'hello' },
    });
    const sentMessage = readLastSentMessage(ws);

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOOK_ERROR,
      requestId: sentMessage.requestId,
      payload: { error: 'hook boom' },
    });

    await expect(resultPromise).rejects.toThrow('hook boom');
  });

  it('sends route messages through the registered remote transport and resolves the response', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };
    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: {
        manifest: {
          ...remoteManifest,
          routes: [{ path: 'inspect/context', methods: ['GET'] }],
        },
      } satisfies RegisterPayload,
    });

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.invokeRoute({
      request: {
        path: 'inspect/context',
        method: 'GET',
        headers: {},
        query: { conversationId: 'conversation-1' },
        body: null,
      },
      context: { source: 'http-route', userId: 'user-1', conversationId: 'conversation-1' },
    });
    const sentMessage = JSON.parse(ws.send.mock.calls[1]?.[0] ?? '{}');

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.ROUTE_RESULT,
      requestId: sentMessage.requestId,
      payload: { data: { status: 200, body: { ok: true } } },
    });

    await expect(resultPromise).resolves.toEqual({ status: 200, body: { ok: true } });
  });

  it('disconnects a connected remote plugin to trigger reconnect', async () => {
    const { gateway } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };
    (gateway as any).connectionByPluginId.set('remote.pc-host', conn);
    await expect((gateway as any).disconnectPlugin('remote.pc-host')).resolves.toBeUndefined();
    expect(ws.close).toHaveBeenCalled();
  });

  it('rejects pending remote requests immediately when the websocket disconnects', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = {
      ws,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
      authenticated: true,
      manifest: remoteManifest,
      lastHeartbeatAt: Date.now(),
    };
    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: { manifest: remoteManifest } satisfies RegisterPayload,
    });

    const registerCall = pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0];
    const resultPromise = registerCall.transport.executeTool({
      toolName: 'list_directory',
      params: { dirPath: 'C:\\\\' },
      context: { source: 'chat-tool', userId: 'user-1', conversationId: 'conversation-1' },
    });

    await (gateway as any).handleDisconnect(conn);
    await expect(resultPromise).rejects.toThrow('插件连接已断开');
    expect((gateway as any).pendingRequests.size).toBe(0);
    expect((gateway as any).activeRequestContexts.size).toBe(0);
  });

  it('warns and ignores command messages that do not include request ids', async () => {
    const { gateway } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const loggerWarn = jest.fn();
    (gateway as any).logger.warn = loggerWarn;

    await (gateway as any).handleMessage(
      ws,
      { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest, lastHeartbeatAt: Date.now() },
      { type: WS_TYPE.COMMAND, action: WS_ACTION.EXECUTE_ERROR, payload: { error: 'ignored' } },
    );

    expect(loggerWarn).toHaveBeenCalledWith('收到缺少 requestId 的插件消息: command/execute_error');
  });

  it('performs a remote health check by pinging the websocket', async () => {
    const { gateway } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };
    (gateway as any).connectionByPluginId.set('remote.pc-host', conn);

    const healthPromise = (gateway as any).checkPluginHealth('remote.pc-host', 5000);
    const pongHandler = ws.once.mock.calls.find((call) => call[0] === 'pong')?.[1];
    expect(typeof pongHandler).toBe('function');
    (pongHandler as () => void)();

    await expect(healthPromise).resolves.toEqual({ ok: true });
    expect(ws.ping).toHaveBeenCalled();
  });
});

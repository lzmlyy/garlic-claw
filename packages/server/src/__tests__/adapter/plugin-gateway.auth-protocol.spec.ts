import {
  WS_ACTION,
  WS_TYPE,
} from '@garlic-claw/shared';
import {
  closeSocketConnection,
  createPluginGatewayFixture,
  createSocketStub,
  flushPendingTasks,
  getSocketHandler,
  readLastSentMessage,
  remoteManifest,
} from '../fixtures/plugin-gateway.fixture';

describe('PluginGateway adapter - auth & protocol', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an unauthenticated connection record and closes the socket when auth times out', () => {
    const { gateway } = createPluginGatewayFixture();
    const ws = createSocketStub();
    jest.useFakeTimers();
    try {
      (gateway as any).handleConnection(ws);

      expect((gateway as any).connections.get(ws)).toEqual({
        ws,
        pluginName: '',
        deviceType: '',
        authenticated: false,
        manifest: null,
        lastHeartbeatAt: expect.any(Number),
      });

      jest.advanceTimersByTime(10_000);
      expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
        type: WS_TYPE.ERROR,
        action: WS_ACTION.AUTH_FAIL,
        payload: { error: '认证超时' },
      });
      expect(ws.close).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('clears auth timeout on close and logs websocket errors through the gateway logger', () => {
    const { gateway } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const loggerError = jest.fn();
    (gateway as any).logger.error = loggerError;
    jest.useFakeTimers();
    try {
      (gateway as any).handleConnection(ws);
      getSocketHandler(ws, 'error')(new Error('boom'));
      getSocketHandler(ws, 'close')();
      jest.advanceTimersByTime(10_000);

      expect(loggerError).toHaveBeenCalledWith('来自 "" 的 WS 错误：boom');
      expect((gateway as any).connections.has(ws)).toBe(false);
      expect(ws.send).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects malformed raw websocket payloads before gateway routing', async () => {
    const { gateway } = createPluginGatewayFixture();
    const ws = createSocketStub();
    (gateway as any).handleConnection(ws);
    getSocketHandler(ws, 'message')(Buffer.from('{bad-json'));
    await flushPendingTasks();
    expect(readLastSentMessage(ws)).toEqual({
      type: WS_TYPE.ERROR,
      action: 'parse_error',
      payload: { error: '无效的 JSON' },
    });
    closeSocketConnection(ws);
  });

  it('rejects malformed websocket envelopes before they reach the gateway message router', async () => {
    const { gateway } = createPluginGatewayFixture();
    const ws = createSocketStub();
    (gateway as any).handleConnection(ws);
    getSocketHandler(ws, 'message')(Buffer.from(JSON.stringify({ type: WS_TYPE.PLUGIN })));
    await flushPendingTasks();
    expect(readLastSentMessage(ws)).toEqual({
      type: WS_TYPE.ERROR,
      action: 'protocol_error',
      payload: { error: '无效的插件协议消息' },
    });
    closeSocketConnection(ws);
  });

  it('rejects unauthenticated websocket plugin messages before routing', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: '', deviceType: '', authenticated: false, manifest: null, lastHeartbeatAt: 0 };
    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: { manifest: remoteManifest },
    });
    expect(pluginRuntimeOrchestrator.registerPlugin).not.toHaveBeenCalled();
    expect(readLastSentMessage(ws)).toEqual({
      type: WS_TYPE.ERROR,
      action: WS_ACTION.AUTH_FAIL,
      payload: { error: '未认证' },
    });
  });

  it('rejects malformed auth payloads before authentication runs', async () => {
    const { gateway, jwtService } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: '', deviceType: '', authenticated: false, manifest: null, lastHeartbeatAt: 0 };
    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.AUTH,
      action: WS_ACTION.AUTHENTICATE,
      payload: null,
    });
    expect(jwtService.verify).not.toHaveBeenCalled();
    expect(readLastSentMessage(ws)).toEqual({
      type: WS_TYPE.ERROR,
      action: 'protocol_error',
      payload: { error: '无效的认证负载' },
    });
  });

  it('replaces older authenticated connections with the same plugin name without unregistering the new one', async () => {
    const { gateway, jwtService, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const oldSocket = createSocketStub();
    const newSocket = createSocketStub();
    const oldConnection = { ws: oldSocket, pluginName: '', deviceType: '', authenticated: false, manifest: null, lastHeartbeatAt: 0 };
    const newConnection = { ws: newSocket, pluginName: '', deviceType: '', authenticated: false, manifest: null, lastHeartbeatAt: 0 };
    jwtService.verify.mockReturnValue({ sub: 'plugin-token', role: 'admin' });

    await (gateway as any).handleAuth(oldSocket, oldConnection, {
      token: 'token-1',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });
    await (gateway as any).handleAuth(newSocket, newConnection, {
      token: 'token-2',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });

    expect(oldSocket.close).toHaveBeenCalled();
    expect((gateway as any).connectionByPluginId.get('remote.pc-host')).toBe(newConnection);
    await (gateway as any).handleDisconnect(oldConnection);
    expect(pluginRuntimeOrchestrator.unregisterPlugin).not.toHaveBeenCalled();
  });

  it('authenticates remote bootstrap tokens when plugin identity matches the token claims', async () => {
    const { gateway, jwtService } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: '', deviceType: '', authenticated: false, manifest: null, lastHeartbeatAt: 0 };
    jwtService.verify.mockReturnValue({
      role: 'remote_plugin',
      authKind: 'remote-plugin',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });

    await (gateway as any).handleAuth(ws, conn, {
      token: 'remote-bootstrap-token',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });

    expect(conn).toEqual(expect.objectContaining({
      authenticated: true,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    }));
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.AUTH,
      action: WS_ACTION.AUTH_OK,
      payload: {},
    });
  });

  it('rejects remote bootstrap tokens when the token claims do not match the requested plugin identity', async () => {
    const { gateway, jwtService } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: '', deviceType: '', authenticated: false, manifest: null, lastHeartbeatAt: 0 };
    jwtService.verify.mockReturnValue({
      role: 'remote_plugin',
      authKind: 'remote-plugin',
      pluginName: 'remote.other-host',
      deviceType: 'pc',
    });

    await (gateway as any).handleAuth(ws, conn, {
      token: 'remote-bootstrap-token',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });

    expect(conn.authenticated).toBe(false);
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.AUTH,
      action: WS_ACTION.AUTH_FAIL,
      payload: { error: '远程插件令牌与当前插件标识不匹配' },
    });
  });

  it('rejects websocket authentication for non-admin tokens', async () => {
    const { gateway, jwtService } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: '', deviceType: '', authenticated: false, manifest: null, lastHeartbeatAt: 0 };
    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      role: 'user',
    });

    await (gateway as any).handleAuth(ws, conn, {
      token: 'token-user',
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });

    expect(ws.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: WS_TYPE.AUTH,
        action: WS_ACTION.AUTH_FAIL,
        payload: { error: '只有管理员或专用远程插件令牌可以接入远程插件' },
      }),
    );
    expect(ws.close).toHaveBeenCalled();
    expect(conn.authenticated).toBe(false);
  });
});

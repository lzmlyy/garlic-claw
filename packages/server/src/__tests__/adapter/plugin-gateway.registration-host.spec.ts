import {
  type HostCallPayload,
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
import { resolvePluginGatewayManifest } from '../../plugin/plugin.gateway';

describe('PluginGateway adapter - registration & host call', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns protocol errors when downstream plugin message handling throws', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    (gateway as any).handleConnection(ws);
    Object.assign((gateway as any).connections.get(ws), {
      authenticated: true,
      pluginName: 'remote.pc-host',
      deviceType: 'pc',
    });
    pluginRuntimeOrchestrator.registerPlugin.mockRejectedValueOnce(new Error('boom'));

    const handler = ws.on.mock.calls.find((call) => call[0] === 'message')?.[1] as (raw: Buffer) => void;
    handler(Buffer.from(JSON.stringify({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: { manifest: remoteManifest },
    })));
    await new Promise((resolve) => setImmediate(resolve));

    expect(readLastSentMessage(ws)).toEqual({
      type: WS_TYPE.ERROR,
      action: 'protocol_error',
      payload: { error: '插件协议消息处理失败' },
    });
  });

  it('registers a remote plugin manifest into the unified runtime', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: null };

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: { manifest: remoteManifest } satisfies RegisterPayload,
    });

    expect(pluginRuntimeOrchestrator.registerPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: { ...remoteManifest, routes: [] },
        runtimeKind: 'remote',
        transport: expect.any(Object),
      }),
    );
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER_OK,
      payload: {},
    }));
    expect(
      pluginRuntimeOrchestrator.registerPlugin.mock.calls[0]?.[0].transport.listSupportedActions(),
    ).toEqual([
      'health-check',
      'reload',
      'reconnect',
    ]);
  });

  it('normalizes malformed manifest entries during remote plugin registration', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: null };

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER,
      payload: {
        manifest: {
          ...remoteManifest,
          permissions: ['conversation:read', 42],
          tools: [remoteManifest.tools[0], { name: 9 }],
          hooks: [{ name: 'chat:before-model' }, { name: 7 }],
        },
      },
    });

    expect(pluginRuntimeOrchestrator.registerPlugin).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: {
          id: 'remote.pc-host',
          name: '电脑助手',
          version: '1.0.0',
          runtime: 'remote',
          permissions: ['conversation:read'],
          tools: [remoteManifest.tools[0]],
          hooks: [{ name: 'chat:before-model' }],
          routes: [],
        },
      }),
    );
  });

  it('throws when resolving a remote manifest without a manifest body', () => {
    expect(() =>
      resolvePluginGatewayManifest({
        pluginName: 'remote.pc-host',
        manifest: null,
      }),
    ).toThrow('插件注册负载缺少 manifest');
  });

  it('rejects malformed register payloads without throwing from the plugin message handler', async () => {
    const { gateway, pluginRuntimeOrchestrator } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: null };

    await expect(
      (gateway as any).handleMessage(ws, conn, {
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.REGISTER,
        payload: null,
      }),
    ).resolves.toBeUndefined();

    expect(pluginRuntimeOrchestrator.registerPlugin).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.ERROR,
      action: 'protocol_error',
      payload: { error: '无效的插件注册负载' },
    });
  });

  it('handles host api calls from remote plugins and returns the result over websocket', async () => {
    const { gateway, pluginRuntime } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };
    const payload: HostCallPayload = {
      method: 'memory.search',
      context: { source: 'chat-tool', userId: 'user-1', conversationId: 'conversation-1' },
      params: { query: '咖啡', limit: 3 },
    };
    (gateway as any).activeRequestContexts.set('runtime-request-1', {
      socket: ws,
      context: payload.context,
    });
    pluginRuntime.callHost.mockResolvedValue([{ id: 'memory-1', content: '用户喜欢咖啡' }]);

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_CALL,
      requestId: 'request-1',
      payload,
    });

    expect(pluginRuntime.callHost).toHaveBeenCalledWith({
      pluginId: 'remote.pc-host',
      context: { source: 'chat-tool', userId: 'user-1', conversationId: 'conversation-1' },
      method: 'memory.search',
      params: { query: '咖啡', limit: 3 },
    });
  });

  it('rejects malformed host api payloads before they reach the runtime', async () => {
    const { gateway, pluginRuntime } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_CALL,
      requestId: 'request-bad-host',
      payload: { method: 'plugin.self.get', params: 'bad-params' },
    });

    expect(pluginRuntime.callHost).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_ERROR,
      requestId: 'request-bad-host',
      payload: { error: '无效的 Host API 调用负载' },
    });
  });

  it('rejects unknown host api method names before they reach the runtime', async () => {
    const { gateway, pluginRuntime } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };
    const approvedContext = { source: 'chat-tool', userId: 'user-1', conversationId: 'conversation-1' };
    (gateway as any).activeRequestContexts.set('runtime-request-invalid-method', { socket: ws, context: approvedContext });

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_CALL,
      requestId: 'request-invalid-method',
      payload: { method: 'host.not-real', context: approvedContext, params: {} },
    });

    expect(pluginRuntime.callHost).not.toHaveBeenCalled();
  });

  it('rejects remote host api calls that forge execution-scoped context', async () => {
    const { gateway, pluginRuntime } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_CALL,
      requestId: 'request-2',
      payload: {
        method: 'memory.search',
        context: { source: 'chat-tool', userId: 'user-9', conversationId: 'conversation-9' },
        params: { query: '越权读取' },
      } satisfies HostCallPayload,
    });

    expect(pluginRuntime.callHost).not.toHaveBeenCalled();
  });

  it('allows connection-scoped host api calls without trusting plugin-supplied user context', async () => {
    const { gateway, pluginRuntime } = createPluginGatewayFixture();
    const ws = createSocketStub();
    const conn = { ws, pluginName: 'remote.pc-host', deviceType: 'pc', authenticated: true, manifest: remoteManifest };
    pluginRuntime.callHost.mockResolvedValue({ id: 'remote.pc-host', name: '电脑助手' });

    await (gateway as any).handleMessage(ws, conn, {
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.HOST_CALL,
      requestId: 'request-3',
      payload: {
        method: 'plugin.self.get',
        context: { source: 'chat-tool', userId: 'forged-user', conversationId: 'forged-conversation' },
        params: {},
      } satisfies HostCallPayload,
    });

    expect(pluginRuntime.callHost).toHaveBeenCalledWith({
      pluginId: 'remote.pc-host',
      context: { source: 'plugin' },
      method: 'plugin.self.get',
      params: {},
    });
  });
});

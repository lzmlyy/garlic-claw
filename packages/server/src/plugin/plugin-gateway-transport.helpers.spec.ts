import { WebSocket } from 'ws';
import {
  readPluginGatewayRequestId,
  readPluginGatewayTimeoutMs,
  rejectPluginGatewayPendingRequest,
  rejectPluginGatewayPendingRequestsForSocket,
  resolvePluginGatewayPendingRequest,
  sendPluginGatewayRequest,
} from './plugin-gateway-transport.helpers';

describe('plugin-gateway-transport.helpers', () => {
  it('sends requests, tracks context, and resolves pending entries', async () => {
    const ws = createSocketStub();
    const pendingRequests = new Map();
    const activeRequestContexts = new Map();
    const context = {
      source: 'chat-tool',
      userId: 'user-1',
      conversationId: 'conversation-1',
      metadata: {
        timeoutMs: 1234,
      },
    } as const;

    const resultPromise = sendPluginGatewayRequest({
      ws,
      type: 'plugin',
      action: 'hook_invoke',
      payload: {
        context,
        payload: {
          ok: true,
        },
      },
      timeoutMs: 1234,
      pendingRequests,
      activeRequestContexts,
      extractContext: (payload) => (payload as { context?: typeof context }).context,
      cloneContext: (value) => ({
        ...value,
        ...(value.metadata ? { metadata: { ...value.metadata } } : {}),
      }),
    });

    const sentMessage = JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}');
    expect(sentMessage).toEqual({
      type: 'plugin',
      action: 'hook_invoke',
      requestId: expect.any(String),
      payload: {
        context,
        payload: {
          ok: true,
        },
      },
    });
    expect(pendingRequests.size).toBe(1);
    expect(activeRequestContexts.get(sentMessage.requestId)?.context).toEqual(context);

    resolvePluginGatewayPendingRequest({
      requestId: sentMessage.requestId,
      data: {
        done: true,
      },
      pendingRequests,
      activeRequestContexts,
    });

    await expect(resultPromise).resolves.toEqual({
      done: true,
    });
    expect(pendingRequests.size).toBe(0);
    expect(activeRequestContexts.size).toBe(0);
  });

  it('rejects pending requests directly and on socket disconnect', async () => {
    const ws = createSocketStub();
    const pendingRequests = new Map();
    const activeRequestContexts = new Map();
    const firstPromise = sendPluginGatewayRequest({
      ws,
      type: 'command',
      action: 'execute',
      payload: {
        toolName: 'list_directory',
      },
      pendingRequests,
      activeRequestContexts,
      cloneContext: (value) => value,
    });
    const firstRequestId = JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}').requestId;

    rejectPluginGatewayPendingRequest({
      requestId: firstRequestId,
      error: 'bad payload',
      pendingRequests,
      activeRequestContexts,
    });
    await expect(firstPromise).rejects.toThrow('bad payload');

    const secondPromise = sendPluginGatewayRequest({
      ws,
      type: 'command',
      action: 'execute',
      payload: {
        toolName: 'list_directory',
      },
      pendingRequests,
      activeRequestContexts,
      cloneContext: (value) => value,
    });

    rejectPluginGatewayPendingRequestsForSocket({
      ws,
      error: new Error('插件连接已断开'),
      pendingRequests,
      activeRequestContexts,
    });
    await expect(secondPromise).rejects.toThrow('插件连接已断开');
    expect(pendingRequests.size).toBe(0);
    expect(activeRequestContexts.size).toBe(0);
  });

  it('reads request ids and timeout overrides safely', () => {
    const onMissing = jest.fn();

    expect(
      readPluginGatewayRequestId({
        msg: {
          type: 'plugin',
          action: 'host_call',
          requestId: 'request-1',
        },
        onMissing,
      }),
    ).toBe('request-1');
    expect(
      readPluginGatewayRequestId({
        msg: {
          type: 'plugin',
          action: 'host_call',
        },
        onMissing,
      }),
    ).toBeNull();
    expect(onMissing).toHaveBeenCalledWith('收到缺少 requestId 的插件消息: plugin/host_call');

    expect(
      readPluginGatewayTimeoutMs(
        {
          source: 'plugin',
          metadata: {
            timeoutMs: 2345,
          },
        },
        5000,
      ),
    ).toBe(2345);
    expect(readPluginGatewayTimeoutMs(undefined, 5000)).toBe(5000);
  });
});

function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
  } as unknown as WebSocket & {
    send: jest.Mock;
  };
}

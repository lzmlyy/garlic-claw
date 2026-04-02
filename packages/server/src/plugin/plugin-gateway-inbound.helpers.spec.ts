import { WebSocket } from 'ws';
import { handlePluginGatewayInboundRawMessage } from './plugin-gateway-inbound.helpers';

describe('plugin-gateway-inbound.helpers', () => {
  it('rejects malformed JSON before protocol decoding', async () => {
    const ws = createSocketStub();
    const handleMessage = jest.fn();

    await handlePluginGatewayInboundRawMessage({
      ws,
      raw: Buffer.from('{bad-json'),
      protocolErrorAction: 'protocol_error',
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: 'error',
      action: 'parse_error',
      payload: { error: '无效的 JSON' },
    });
  });

  it('rejects malformed protocol envelopes before they reach the message handler', async () => {
    const ws = createSocketStub();
    const handleMessage = jest.fn();

    await handlePluginGatewayInboundRawMessage({
      ws,
      raw: Buffer.from(JSON.stringify({ type: 'plugin' })),
      protocolErrorAction: 'protocol_error',
      handleMessage,
    });

    expect(handleMessage).not.toHaveBeenCalled();
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: 'error',
      action: 'protocol_error',
      payload: { error: '无效的插件协议消息' },
    });
  });

  it('warns and returns protocol errors when the downstream message handler throws', async () => {
    const ws = createSocketStub();
    const handleMessage = jest.fn().mockRejectedValue(new Error('boom'));
    const logWarn = jest.fn();

    await handlePluginGatewayInboundRawMessage({
      ws,
      raw: Buffer.from(JSON.stringify({ type: 'plugin', action: 'noop', payload: {} })),
      protocolErrorAction: 'protocol_error',
      handleMessage,
      logWarn,
    });

    expect(handleMessage).toHaveBeenCalledWith({
      type: 'plugin',
      action: 'noop',
      payload: {},
    });
    expect(logWarn).toHaveBeenCalledWith('插件协议消息处理失败: boom');
    expect(JSON.parse(ws.send.mock.calls[0]?.[0] ?? '{}')).toEqual({
      type: 'error',
      action: 'protocol_error',
      payload: { error: '插件协议消息处理失败' },
    });
  });
});

function createSocketStub() {
  return {
    readyState: WebSocket.OPEN,
    send: jest.fn(),
    close: jest.fn(),
  } as unknown as WebSocket & {
    send: jest.Mock;
    close: jest.Mock;
  };
}

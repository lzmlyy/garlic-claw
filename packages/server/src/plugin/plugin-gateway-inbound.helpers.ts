import type { WebSocket } from 'ws';
import {
  readPluginGatewayMessage,
  type PluginGatewayInboundMessage,
} from './plugin-gateway-payload.helpers';
import {
  sendPluginGatewayMessage,
  sendPluginGatewayProtocolError,
} from './plugin-gateway-transport.helpers';

export async function handlePluginGatewayInboundRawMessage(input: {
  ws: WebSocket;
  raw: Buffer;
  protocolErrorAction: string;
  handleMessage: (message: PluginGatewayInboundMessage) => Promise<void>;
  sendMessage?: typeof sendPluginGatewayMessage;
  sendProtocolError?: typeof sendPluginGatewayProtocolError;
  readMessage?: (value: unknown) => PluginGatewayInboundMessage | null;
  logWarn?: (message: string) => void;
}): Promise<void> {
  const sendMessage = input.sendMessage ?? sendPluginGatewayMessage;
  const sendProtocolError = input.sendProtocolError ?? sendPluginGatewayProtocolError;
  const readMessage = input.readMessage ?? readPluginGatewayMessage;
  let parsed: unknown;

  try {
    parsed = JSON.parse(input.raw.toString());
  } catch {
    sendMessage({
      ws: input.ws,
      type: 'error',
      action: 'parse_error',
      payload: { error: '无效的 JSON' },
    });
    return;
  }

  const message = readMessage(parsed);
  if (!message) {
    sendProtocolError({
      ws: input.ws,
      error: '无效的插件协议消息',
      protocolErrorAction: input.protocolErrorAction,
    });
    return;
  }

  try {
    await input.handleMessage(message);
  } catch (error) {
    const messageText = error instanceof Error ? error.message : String(error);
    input.logWarn?.(`插件协议消息处理失败: ${messageText}`);
    sendProtocolError({
      ws: input.ws,
      error: '插件协议消息处理失败',
      protocolErrorAction: input.protocolErrorAction,
    });
  }
}

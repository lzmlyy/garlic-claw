import type { PluginManifest } from '@garlic-claw/shared';
import { WS_ACTION, WS_TYPE } from '@garlic-claw/shared';
import type { WebSocket } from 'ws';
import { sendPluginGatewayMessage } from './plugin-gateway-transport.helpers';

export interface PluginGatewaySocketConnection {
  ws: WebSocket;
  pluginName: string;
  deviceType: string;
  authenticated: boolean;
  manifest: PluginManifest | null;
  lastHeartbeatAt: number;
}

export function createPluginGatewayConnectionRecord(
  ws: WebSocket,
  now = Date.now(),
): PluginGatewaySocketConnection {
  return {
    ws,
    pluginName: '',
    deviceType: '',
    authenticated: false,
    manifest: null,
    lastHeartbeatAt: now,
  };
}

export function attachPluginGatewaySocketHandlers(input: {
  ws: WebSocket;
  connection: PluginGatewaySocketConnection;
  onIncomingMessage: (
    ws: WebSocket,
    connection: PluginGatewaySocketConnection,
    raw: Buffer,
  ) => void;
  onDisconnect: (connection: PluginGatewaySocketConnection) => void;
  onSocketError?: (
    error: Error,
    connection: PluginGatewaySocketConnection,
  ) => void;
  authTimeoutMs?: number;
  sendMessage?: typeof sendPluginGatewayMessage;
}): void {
  const sendMessage = input.sendMessage ?? sendPluginGatewayMessage;
  const authTimeout = setTimeout(() => {
    if (!input.connection.authenticated) {
      sendMessage({
        ws: input.ws,
        type: WS_TYPE.ERROR,
        action: WS_ACTION.AUTH_FAIL,
        payload: { error: '认证超时' },
      });
      input.ws.close();
    }
  }, input.authTimeoutMs ?? 10_000);

  input.ws.on('message', (raw: Buffer) => {
    input.onIncomingMessage(input.ws, input.connection, raw);
  });

  input.ws.on('close', () => {
    clearTimeout(authTimeout);
    input.onDisconnect(input.connection);
  });

  input.ws.on('error', (error) => {
    input.onSocketError?.(error, input.connection);
  });
}

import {
  assertPluginGatewayAuthClaims,
  type AuthPayload,
  type PluginGatewayPayload,
  type PluginGatewayVerifiedToken,
  WS_ACTION,
  WS_TYPE,
} from '@garlic-claw/shared';
import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { WebSocket } from 'ws';
import type { PluginConnection } from '../connection-context.aggregate';

interface PluginGatewayAuthTransportDeps {
  jwtService: JwtService;
  configService: ConfigService;
  logger: Logger;
  findConnectionByPluginId: (pluginId: string) => PluginConnection | undefined;
  bindPluginConnection: (pluginId: string, connection: PluginConnection) => void;
  markHeartbeat: (socket: WebSocket, heartbeatAt: number) => void;
  sendSocketMessage: (
    socket: WebSocket,
    type: string,
    action: string,
    payload?: PluginGatewayPayload,
  ) => void;
}

export class PluginGatewayAuthTransport {
  constructor(private readonly deps: PluginGatewayAuthTransportDeps) {}

  async handleAuth(input: {
    socket: WebSocket;
    connection: PluginConnection;
    payload: AuthPayload;
  }): Promise<void> {
    try {
      const secret = this.deps.configService.get<string>('JWT_SECRET', 'fallback-secret');
      const verified = this.deps.jwtService.verify<PluginGatewayVerifiedToken>(input.payload.token, {
        secret,
      });
      assertPluginGatewayAuthClaims({ verified, payload: input.payload });

      const previousConnection = this.deps.findConnectionByPluginId(input.payload.pluginName);
      input.connection.authenticated = true;
      input.connection.pluginName = input.payload.pluginName;
      input.connection.deviceType = input.payload.deviceType;
      input.connection.lastHeartbeatAt = Date.now();
      this.deps.markHeartbeat(input.connection.ws, input.connection.lastHeartbeatAt);
      this.deps.bindPluginConnection(input.payload.pluginName, input.connection);

      if (previousConnection && previousConnection.ws !== input.socket) {
        this.deps.logger.warn(`插件 "${input.payload.pluginName}" 已存在旧连接，当前将其替换`);
        previousConnection.ws.close();
      }

      this.deps.sendSocketMessage(input.socket, WS_TYPE.AUTH, WS_ACTION.AUTH_OK);
      this.deps.logger.log(`Plugin "${input.payload.pluginName}" authenticated`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      this.deps.sendSocketMessage(input.socket, WS_TYPE.AUTH, WS_ACTION.AUTH_FAIL, { error: message });
      input.socket.close();
    }
  }
}

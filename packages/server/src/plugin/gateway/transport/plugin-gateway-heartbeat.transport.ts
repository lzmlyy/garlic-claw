import {
  WS_ACTION,
  WS_TYPE,
  type PluginGatewayPayload,
} from '@garlic-claw/shared';
import { Logger } from '@nestjs/common';
import type { PluginRuntimeOrchestratorService } from '../../plugin-runtime-orchestrator.service';
import type { PluginConnection } from '../connection-context.aggregate';
import type { WebSocket } from 'ws';

interface PluginGatewayHeartbeatTransportDeps {
  logger: Logger;
  runtimeOrchestrator: Pick<PluginRuntimeOrchestratorService, 'touchPluginHeartbeat'>;
  heartbeatTimeoutMs: number;
  sendSocketMessage: (
    socket: WebSocket,
    type: string,
    action: string,
    payload?: PluginGatewayPayload,
  ) => void;
}

export class PluginGatewayHeartbeatTransport {
  constructor(private readonly deps: PluginGatewayHeartbeatTransportDeps) {}

  async handlePing(input: {
    socket: WebSocket;
    connection: PluginConnection;
  }): Promise<void> {
    if (input.connection.manifest) {
      await this.deps.runtimeOrchestrator.touchPluginHeartbeat(input.connection.pluginName);
    }
    this.deps.sendSocketMessage(input.socket, WS_TYPE.HEARTBEAT, WS_ACTION.PONG);
  }

  checkHeartbeats(connections: Iterable<PluginConnection>, now = Date.now()): void {
    for (const connection of connections) {
      if (!connection.authenticated) {
        continue;
      }

      const lastHeartbeatAt = typeof connection.lastHeartbeatAt === 'number'
        ? connection.lastHeartbeatAt
        : now;
      if (now - lastHeartbeatAt <= this.deps.heartbeatTimeoutMs) {
        continue;
      }

      this.deps.logger.warn(
        `插件 "${connection.pluginName || 'unknown'}" 心跳超时，主动断开连接`,
      );
      connection.ws.close();
    }
  }
}

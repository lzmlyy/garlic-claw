import {
  handlePluginGatewayCommandMessage,
  handlePluginGatewayHostCall,
  handlePluginGatewayMessageEnvelope,
  handlePluginGatewayPluginMessage,
  type ActiveRequestContext,
  type PendingRequest,
  type PluginGatewayInboundMessage,
  type ValidatedRegisterPayload,
} from '@garlic-claw/shared';
import { Logger } from '@nestjs/common';
import type { WebSocket } from 'ws';
import type { PluginRuntimeService } from '../../plugin-runtime.service';
import type { PluginConnection } from '../connection-context.aggregate';
import type { PluginGatewayAuthTransport } from './plugin-gateway-auth.transport';
import type { PluginGatewayHeartbeatTransport } from './plugin-gateway-heartbeat.transport';

interface PluginGatewayRouterTransportDeps {
  logger: Logger;
  pluginRuntime: Pick<PluginRuntimeService, 'callHost'>;
  authTransport: PluginGatewayAuthTransport;
  heartbeatTransport: PluginGatewayHeartbeatTransport;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  registerPluginConnection: (
    socket: WebSocket,
    connection: PluginConnection,
    payload: ValidatedRegisterPayload,
  ) => Promise<void>;
}

export class PluginGatewayRouterTransport {
  constructor(private readonly deps: PluginGatewayRouterTransportDeps) {}

  async handleMessage(input: {
    socket: WebSocket;
    connection: PluginConnection;
    message: PluginGatewayInboundMessage;
    protocolErrorAction: string;
  }): Promise<void> {
    const logWarn = (message: string) => this.deps.logger.warn(message);

    await handlePluginGatewayMessageEnvelope({
      socket: input.socket,
      connection: input.connection,
      msg: input.message,
      protocolErrorAction: input.protocolErrorAction,
      onAuth: (payload) => this.deps.authTransport.handleAuth({
        socket: input.socket,
        connection: input.connection,
        payload,
      }),
      onPluginMessage: async (message) => {
        await handlePluginGatewayPluginMessage({
          socket: input.socket,
          msg: message,
          pendingRequests: this.deps.pendingRequests,
          activeRequestContexts: this.deps.activeRequestContexts,
          protocolErrorAction: input.protocolErrorAction,
          onRegister: (payload) =>
            this.deps.registerPluginConnection(input.socket, input.connection, payload),
          onHostCall: (hostCallMessage) =>
            handlePluginGatewayHostCall({
              socket: input.socket,
              connection: {
                socket: input.connection.ws,
                pluginName: input.connection.pluginName,
              },
              msg: hostCallMessage,
              activeRequestContexts: this.deps.activeRequestContexts,
              callHost: (hostInput) => this.deps.pluginRuntime.callHost(hostInput),
              logWarn,
            }),
          logWarn,
        });
      },
      onCommandMessage: async (message) => {
        handlePluginGatewayCommandMessage({
          msg: message,
          pendingRequests: this.deps.pendingRequests,
          activeRequestContexts: this.deps.activeRequestContexts,
          logWarn,
        });
      },
      onHeartbeatPing: async () => {
        await this.deps.heartbeatTransport.handlePing({
          socket: input.socket,
          connection: input.connection,
        });
      },
    });
  }
}

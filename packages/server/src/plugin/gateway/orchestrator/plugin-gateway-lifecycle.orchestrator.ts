import {
  createPluginGatewayRemoteTransport,
  type ActiveRequestContext,
  type PendingRequest,
  type PluginGatewayPayload,
  type PluginManifest,
  type ValidatedRegisterPayload,
  WS_ACTION,
  WS_TYPE,
} from '@garlic-claw/shared';
import { Logger } from '@nestjs/common';
import type { WebSocket } from 'ws';
import type { PluginRuntimeOrchestratorService } from '../../plugin-runtime-orchestrator.service';
import type { PluginConnection } from '../connection-context.aggregate';
import type { PluginGatewayRequestOrchestrator } from './plugin-gateway-request.orchestrator';

interface PluginGatewayLifecycleOrchestratorDeps {
  logger: Logger;
  runtimeOrchestrator: Pick<PluginRuntimeOrchestratorService, 'registerPlugin' | 'unregisterPlugin'>;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  connectionByPluginId: Map<string, PluginConnection>;
  requestOrchestrator: PluginGatewayRequestOrchestrator;
  removeConnection: (connection: PluginConnection) => void;
  resolveManifest: (input: {
    pluginName: string;
    manifest: Record<string, unknown> | null | undefined;
  }) => PluginManifest;
  disconnectPlugin: (pluginId: string) => Promise<void>;
  checkPluginHealth: (pluginId: string) => Promise<{ ok: boolean }>;
  sendSocketMessage: (
    socket: WebSocket,
    type: string,
    action: string,
    payload?: PluginGatewayPayload,
  ) => void;
}

export class PluginGatewayLifecycleOrchestrator {
  constructor(private readonly deps: PluginGatewayLifecycleOrchestratorDeps) {}

  async registerConnection(input: {
    socket: WebSocket;
    connection: PluginConnection;
    payload: ValidatedRegisterPayload;
  }): Promise<void> {
    const manifest = this.deps.resolveManifest({
      pluginName: input.connection.pluginName,
      manifest: input.payload.manifest as unknown as Record<string, unknown>,
    });
    input.connection.manifest = manifest;

    await this.deps.runtimeOrchestrator.registerPlugin({
      manifest,
      runtimeKind: 'remote',
      deviceType: input.connection.deviceType,
      transport: createPluginGatewayRemoteTransport({
        connection: input.connection,
        pendingRequests: this.deps.pendingRequests,
        activeRequestContexts: this.deps.activeRequestContexts,
        disconnectPlugin: (pluginId: string) => this.deps.disconnectPlugin(pluginId),
        checkPluginHealth: (pluginId: string) => this.deps.checkPluginHealth(pluginId),
      }),
    });

    this.deps.sendSocketMessage(input.socket, WS_TYPE.PLUGIN, WS_ACTION.REGISTER_OK);
  }

  async unregisterConnection(input: {
    connection: PluginConnection;
  }): Promise<void> {
    this.deps.removeConnection(input.connection);
    this.deps.requestOrchestrator.rejectPendingRequestsForSocket({
      socket: input.connection.ws,
      reason: '插件连接已断开',
      pendingRequests: this.deps.pendingRequests,
      activeRequestContexts: this.deps.activeRequestContexts,
    });
    if (!input.connection.pluginName) {
      return;
    }

    const activeConnection = this.deps.connectionByPluginId.get(input.connection.pluginName);
    if (activeConnection?.ws !== input.connection.ws) {
      this.deps.logger.log(`插件 "${input.connection.pluginName}" 的旧连接已断开`);
      return;
    }

    this.deps.connectionByPluginId.delete(input.connection.pluginName);
    try {
      await this.deps.runtimeOrchestrator.unregisterPlugin(input.connection.pluginName);
    } catch {
      return;
    }

    this.deps.logger.log(`插件 "${input.connection.pluginName}" 已断开连接`);
  }
}

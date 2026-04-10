import {
  handlePluginGatewayInboundRawMessage,
  sendPluginGatewayMessage,
  type AuthPayload,
  type PluginGatewayInboundMessage,
  type PluginGatewayPayload,
  type PluginManifest,
  type ValidatedRegisterPayload,
  DeviceType,
  WS_ACTION,
  WS_TYPE,
} from '@garlic-claw/shared';
import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WebSocket, WebSocketServer } from 'ws';
import { normalizePluginManifestCandidate } from './plugin-manifest.persistence';
import { PluginRuntimeOrchestratorService } from './plugin-runtime-orchestrator.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import {
  ConnectionContextAggregate,
  type PluginConnection,
} from './gateway/connection-context.aggregate';
import { PluginGatewayAuthTransport } from './gateway/transport/plugin-gateway-auth.transport';
import { PluginGatewayHeartbeatTransport } from './gateway/transport/plugin-gateway-heartbeat.transport';
import { PluginGatewayRouterTransport } from './gateway/transport/plugin-gateway-router.transport';
import { PluginGatewayLifecycleOrchestrator } from './gateway/orchestrator/plugin-gateway-lifecycle.orchestrator';
import { PluginGatewayRequestOrchestrator } from './gateway/orchestrator/plugin-gateway-request.orchestrator';

const HEARTBEAT_SWEEP_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;
const AUTH_TIMEOUT_MS = 10_000;
const PROTOCOL_ERROR_ACTION = 'protocol_error';

export function resolvePluginGatewayManifest(input: {
  pluginName: string;
  manifest: Record<string, unknown> | null | undefined;
}): PluginManifest {
  if (!input.manifest) {
    throw new Error('插件注册负载缺少 manifest');
  }

  return normalizePluginManifestCandidate(input.manifest, {
    id: input.pluginName,
    displayName: input.pluginName,
    version: '0.0.0',
    runtimeKind: 'remote',
  });
}

@Injectable()
export class PluginGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginGateway.name);
  private wss!: WebSocketServer;
  private readonly connectionContextAggregate = new ConnectionContextAggregate();
  private readonly authTransport: PluginGatewayAuthTransport;
  private readonly heartbeatTransport: PluginGatewayHeartbeatTransport;
  private readonly routerTransport: PluginGatewayRouterTransport;
  private readonly requestOrchestrator: PluginGatewayRequestOrchestrator;
  private readonly lifecycleOrchestrator: PluginGatewayLifecycleOrchestrator;
  private heartbeatInterval!: ReturnType<typeof setInterval>;

  constructor(
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly pluginRuntimeOrchestrator: PluginRuntimeOrchestratorService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.requestOrchestrator = new PluginGatewayRequestOrchestrator();
    this.authTransport = new PluginGatewayAuthTransport({
      jwtService: this.jwtService,
      configService: this.configService,
      logger: this.logger,
      findConnectionByPluginId: (pluginId) => this.connectionByPluginId.get(pluginId),
      bindPluginConnection: (pluginId, connection) => this.connectionContextAggregate.bindPlugin(pluginId, connection),
      markHeartbeat: (socket, heartbeatAt) => this.connectionContextAggregate.markHeartbeat(socket, heartbeatAt),
      sendSocketMessage: (socket, type, action, payload) => this.sendSocketMessage(socket, type, action, payload),
    });
    this.heartbeatTransport = new PluginGatewayHeartbeatTransport({
      logger: this.logger,
      runtimeOrchestrator: this.pluginRuntimeOrchestrator,
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      sendSocketMessage: (socket, type, action, payload) => this.sendSocketMessage(socket, type, action, payload),
    });
    this.routerTransport = new PluginGatewayRouterTransport({
      logger: this.logger,
      pluginRuntime: this.pluginRuntime,
      authTransport: this.authTransport,
      heartbeatTransport: this.heartbeatTransport,
      pendingRequests: this.pendingRequests,
      activeRequestContexts: this.activeRequestContexts,
      registerPluginConnection: (socket, connection, payload) =>
        this.registerPluginConnection(socket, connection, payload),
    });
    this.lifecycleOrchestrator = new PluginGatewayLifecycleOrchestrator({
      logger: this.logger,
      runtimeOrchestrator: this.pluginRuntimeOrchestrator,
      pendingRequests: this.pendingRequests,
      activeRequestContexts: this.activeRequestContexts,
      connectionByPluginId: this.connectionByPluginId,
      requestOrchestrator: this.requestOrchestrator,
      removeConnection: (connection) => this.connectionContextAggregate.removeConnection(connection),
      resolveManifest: (input) => resolvePluginGatewayManifest(input),
      disconnectPlugin: (pluginId) => this.disconnectPlugin(pluginId),
      checkPluginHealth: (pluginId) => this.checkPluginHealth(pluginId),
      sendSocketMessage: (socket, type, action, payload) => this.sendSocketMessage(socket, type, action, payload),
    });
  }

  private get connections() {
    return this.connectionContextAggregate.connections;
  }

  private get connectionByPluginId() {
    return this.connectionContextAggregate.connectionByPluginId;
  }

  private get pendingRequests() {
    return this.connectionContextAggregate.pendingRequests;
  }

  private get activeRequestContexts() {
    return this.connectionContextAggregate.activeRequestContexts;
  }

  onModuleInit() {
    const port = this.configService.get<number>('WS_PORT', 23331);
    this.wss = new WebSocketServer({ port });
    this.logger.log(`插件 WebSocket 服务器监听端口 ${port}`);
    this.wss.on('connection', (ws: WebSocket) => this.handleConnection(ws));
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), HEARTBEAT_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy() {
    clearInterval(this.heartbeatInterval);
    this.requestOrchestrator.shutdown({
      pendingRequests: this.pendingRequests,
      activeRequestContexts: this.activeRequestContexts,
      reason: '服务器关闭',
    });
    this.wss?.close();
  }

  async disconnectPlugin(pluginId: string): Promise<void> {
    this.getConnectedPluginOrThrow(pluginId).ws.close();
  }

  async checkPluginHealth(
    pluginId: string,
    timeoutMs = 5000,
  ): Promise<{ ok: boolean }> {
    const connection = this.getConnectedPluginOrThrow(pluginId);
    if (connection.ws.readyState !== WebSocket.OPEN) {
      return { ok: false };
    }

    return new Promise<{ ok: boolean }>((resolve, reject) => {
      const handlePong = () => {
        clearTimeout(timer);
        connection.ws.off('pong', handlePong);
        resolve({ ok: true });
      };
      const timer = setTimeout(() => {
        connection.ws.off('pong', handlePong);
        reject(new Error(`插件健康检查超时: ${pluginId}`));
      }, timeoutMs);

      connection.ws.once('pong', handlePong);
      connection.ws.ping();
    });
  }

  private handleConnection(ws: WebSocket) {
    const connection = this.createConnectionRecord(ws);
    const logWarn = (message: string) => this.logger.warn(message);

    const authTimeout = setTimeout(() => {
      if (connection.authenticated) {
        return;
      }

      this.sendSocketMessage(ws, WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '认证超时' });
      ws.close();
    }, AUTH_TIMEOUT_MS);

    ws.on('message', (raw: Buffer) => {
      void handlePluginGatewayInboundRawMessage({
        socket: ws,
        raw,
        protocolErrorAction: PROTOCOL_ERROR_ACTION,
        handleMessage: (message) => this.handleMessage(ws, connection, message),
        logWarn,
      });
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      void this.handleDisconnect(connection);
    });

    ws.on('error', (error) => {
      this.logger.error(`来自 "${connection.pluginName}" 的 WS 错误：${error.message}`);
    });
  }

  private async handleMessage(
    ws: WebSocket,
    conn: PluginConnection,
    msg: PluginGatewayInboundMessage,
  ): Promise<void> {
    await this.routerTransport.handleMessage({
      socket: ws,
      connection: conn,
      message: msg,
      protocolErrorAction: PROTOCOL_ERROR_ACTION,
    });
  }

  private async handleAuth(
    ws: WebSocket,
    conn: PluginConnection,
    payload: AuthPayload,
  ): Promise<void> {
    await this.authTransport.handleAuth({
      socket: ws,
      connection: conn,
      payload,
    });
  }

  private async registerPluginConnection(
    ws: WebSocket,
    connection: PluginConnection,
    payload: ValidatedRegisterPayload,
  ): Promise<void> {
    await this.lifecycleOrchestrator.registerConnection({
      socket: ws,
      connection,
      payload,
    });
  }

  private async handleDisconnect(conn: PluginConnection): Promise<void> {
    await this.lifecycleOrchestrator.unregisterConnection({
      connection: conn,
    });
  }

  private checkHeartbeats() {
    this.heartbeatTransport.checkHeartbeats(this.connections.values());
  }

  private createConnectionRecord(ws: WebSocket, now = Date.now()): PluginConnection {
    return this.connectionContextAggregate.createConnection(ws, now);
  }

  private sendSocketMessage(
    socket: WebSocket,
    type: string,
    action: string,
    payload: PluginGatewayPayload = {},
  ): void {
    sendPluginGatewayMessage({
      socket,
      type,
      action,
      payload,
    });
  }

  private getConnectedPluginOrThrow(pluginId: string): PluginConnection {
    const connection = this.connectionByPluginId.get(pluginId);
    if (!connection) {
      throw new NotFoundException(`Plugin not connected: ${pluginId}`);
    }
    return connection;
  }
}

export { DeviceType };

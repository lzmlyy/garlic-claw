import type { WsMessage } from '@garlic-claw/shared';
import { Module, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { WebSocket, WebSocketServer } from 'ws';
import { RuntimeGatewayConnectionLifecycleService } from '../../../runtime/gateway/runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayModule } from '../../../runtime/gateway/runtime-gateway.module';
import { RuntimeGatewayRemoteTransportService } from '../../../runtime/gateway/runtime-gateway-remote-transport.service';
import { RuntimeHostModule } from '../../../runtime/host/runtime-host.module';
import {
  createWsReply,
  type PluginGatewayInboundResult,
  readWsMessage,
} from './plugin-gateway.protocol';
import { WS_ACTION, WS_TYPE } from './plugin-gateway.constants';
import { PluginGatewayWsInboundService } from './plugin-gateway-ws-inbound.service';

const HEARTBEAT_SWEEP_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 90_000;
const OUTBOUND_FLUSH_INTERVAL_MS = 100;
const AUTH_TIMEOUT_MS = 10_000;

@Module({
  imports: [
    ConfigModule,
    JwtModule.register({}),
    RuntimeGatewayModule,
    RuntimeHostModule,
  ],
  providers: [PluginGatewayWsInboundService],
})
export class PluginGatewayWsModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginGatewayWsModule.name);
  private readonly authTimeouts = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly sockets = new Map<string, WebSocket>();
  private heartbeatInterval?: ReturnType<typeof setInterval>;
  private outboundFlushInterval?: ReturnType<typeof setInterval>;
  private server?: WebSocketServer;

  constructor(
    private readonly configService: ConfigService,
    private readonly runtimeGatewayConnectionLifecycleService: RuntimeGatewayConnectionLifecycleService,
    private readonly runtimeGatewayRemoteTransportService: RuntimeGatewayRemoteTransportService,
    private readonly pluginGatewayWsInboundService: PluginGatewayWsInboundService,
  ) {}

  onModuleInit() {
    const port = this.configService.get<number>('WS_PORT', 23331);
    this.server = new WebSocketServer({ port });
    this.logger.log(`插件 WebSocket 服务器监听端口 ${port}`);
    this.server.on('connection', (socket, request) =>
      this.handleConnection(socket, request.socket.remoteAddress));
    this.runtimeGatewayConnectionLifecycleService.registerConnectionCloser((connectionId) =>
      this.sockets.get(connectionId)?.close());
    this.runtimeGatewayConnectionLifecycleService.registerConnectionHealthProbe((input) =>
      this.pingConnection(input.connectionId, input.timeoutMs));
    this.heartbeatInterval = setInterval(() => {
      for (const connectionId of this.runtimeGatewayConnectionLifecycleService.checkHeartbeats({ maxIdleMs: HEARTBEAT_TIMEOUT_MS })) {
        this.sockets.get(connectionId)?.close();
      }
    }, HEARTBEAT_SWEEP_INTERVAL_MS);
    this.outboundFlushInterval = setInterval(() => {
      for (const connectionId of this.sockets.keys()) {
        for (const message of this.runtimeGatewayRemoteTransportService.consumeOutboundMessages(connectionId)) {
          this.sendToConnection(connectionId, message);
        }
      }
    }, OUTBOUND_FLUSH_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.heartbeatInterval) {clearInterval(this.heartbeatInterval);}
    if (this.outboundFlushInterval) {clearInterval(this.outboundFlushInterval);}
    for (const timeout of this.authTimeouts.values()) {
      clearTimeout(timeout);
    }
    this.authTimeouts.clear();
    this.server?.close();
  }

  handleConnection(socket: WebSocket, remoteAddress?: string): void {
    const connection = this.runtimeGatewayConnectionLifecycleService.openConnection({
      remoteAddress,
    });
    this.sockets.set(connection.connectionId, socket);
    this.authTimeouts.set(connection.connectionId, setTimeout(() => {
      this.sendToConnection(
        connection.connectionId,
        createWsReply(WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '认证超时' }),
      );
      socket.close();
    }, AUTH_TIMEOUT_MS));

    socket.on('message', (raw) => {
      void this.handleRawMessage(connection.connectionId, raw.toString()).catch((error) => {
        this.logger.warn(error instanceof Error ? error.message : String(error));
        this.sendToConnection(
          connection.connectionId,
          createWsReply(WS_TYPE.ERROR, 'protocol_error', { error: '插件协议消息处理失败' }),
        );
      });
    });
    socket.on('close', () => this.handleDisconnect(connection.connectionId));
    socket.on('error', (error) => {
      this.logger.error(
        `插件网关连接错误 ${connection.connectionId}${remoteAddress ? ` ${remoteAddress}` : ''}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
  }

  async handleMessage({ connectionId, message }: {
    connectionId: string;
    message: WsMessage;
  }): Promise<PluginGatewayInboundResult | void> {
    return this.pluginGatewayWsInboundService.handleMessage({ connectionId, message });
  }

  private clearAuthTimeout(connectionId: string): void {
    const timeout = this.authTimeouts.get(connectionId);
    if (timeout) {
      clearTimeout(timeout);
      this.authTimeouts.delete(connectionId);
    }
  }

  private handleDisconnect(connectionId: string): void {
    this.clearAuthTimeout(connectionId);
    this.sockets.delete(connectionId);
    const current = this.runtimeGatewayConnectionLifecycleService.getConnection(connectionId);
    if (current?.pluginId) {
      this.runtimeGatewayConnectionLifecycleService.disconnectPlugin(current.pluginId);
      return;
    }
    this.runtimeGatewayConnectionLifecycleService.disconnectConnection(connectionId);
  }

  private async handleRawMessage(connectionId: string, raw: string): Promise<void> {
    const result = await this.handleMessage({
      connectionId,
      message: readWsMessage(raw),
    });
    if (result?.reply) {
      if (result.reply.type === WS_TYPE.AUTH && result.reply.action === WS_ACTION.AUTH_OK) {
        this.clearAuthTimeout(connectionId);
      }
      this.sendToConnection(connectionId, result.reply);
    }
    if (result?.flushOutbound) {
      for (const message of this.runtimeGatewayRemoteTransportService.consumeOutboundMessages(connectionId)) {
        this.sendToConnection(connectionId, message);
      }
    }
  }

  private pingConnection(connectionId: string, timeoutMs = 5_000): Promise<{ ok: boolean }> {
    const socket = this.sockets.get(connectionId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false });
    }
    return new Promise((resolve) => {
      let settled = false;
      const timeout: ReturnType<typeof setTimeout> | undefined = setTimeout(() => settle(false), timeoutMs);
      const settle = (ok: boolean) => {
        if (settled) {return;}
        settled = true;
        if (timeout) {clearTimeout(timeout);}
        socket.off('close', onClose);
        socket.off('error', onError);
        socket.off('pong', onPong);
        resolve({ ok });
      };
      const onClose = () => settle(false);
      const onError = () => settle(false);
      const onPong = () => settle(true);
      socket.once('close', onClose);
      socket.once('error', onError);
      socket.once('pong', onPong);
      socket.ping();
    });
  }

  private sendToConnection(connectionId: string, message: WsMessage): void {
    const socket = this.sockets.get(connectionId);
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify(message));
  }
}

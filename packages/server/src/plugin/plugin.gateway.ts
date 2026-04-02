import {
  type AuthPayload,
  type JsonValue,
  type PluginManifest,
  WS_ACTION,
  DeviceType,
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
import type { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { JsonObject } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import {
  attachPluginGatewaySocketHandlers,
  createPluginGatewayConnectionRecord,
} from './plugin-gateway-connection.helpers';
import {
  resolvePluginGatewayManifest,
} from './plugin-gateway-context.helpers';
import {
  handlePluginGatewayErrorMessage,
  handlePluginGatewayResultMessage,
} from './plugin-gateway-dispatch.helpers';
import { handlePluginGatewayHostCall } from './plugin-gateway-host.helpers';
import { handlePluginGatewayInboundRawMessage } from './plugin-gateway-inbound.helpers';
import {
  authenticatePluginGatewayConnection,
  disconnectPluginGatewayConnection,
  registerPluginGatewayConnection,
} from './plugin-gateway-lifecycle.helpers';
import {
  readAuthPayload,
  readDataPayload,
  readErrorPayload,
  readRegisterPayload,
  readRouteResultPayload,
  type PluginGatewayInboundMessage,
  type ValidatedRegisterPayload,
} from './plugin-gateway-payload.helpers';
import {
  checkPluginGatewayHealth,
  createPluginGatewayRemoteTransport,
  sweepStalePluginGatewayConnections,
} from './plugin-gateway-runtime.helpers';
import {
  rejectPluginGatewayPendingRequestsForSocket,
  sendPluginGatewayMessage,
  sendPluginGatewayProtocolError,
  type ActiveRequestContext,
  type PendingRequest,
} from './plugin-gateway-transport.helpers';
import { PluginRuntimeOrchestratorService } from './plugin-runtime-orchestrator.service';
import { PluginRuntimeService } from './plugin-runtime.service';
import type { PluginTransport } from './plugin-runtime.types';

/**
 * 远程插件心跳扫描间隔。
 */
const HEARTBEAT_SWEEP_INTERVAL_MS = 30_000;

/**
 * 远程插件连接失活阈值。
 */
const HEARTBEAT_TIMEOUT_MS = 90_000;

/**
 * 协议错误消息 action。
 */
const PROTOCOL_ERROR_ACTION = 'protocol_error';

/**
 * 远程插件连接状态。
 */
interface PluginConnection {
  /** WebSocket 连接。 */
  ws: WebSocket;
  /** 插件名。 */
  pluginName: string;
  /** 设备类型。 */
  deviceType: string;
  /** 是否已认证。 */
  authenticated: boolean;
  /** 已注册 manifest。 */
  manifest: PluginManifest | null;
  /** 最近一次收到该连接消息的时间。 */
  lastHeartbeatAt: number;
}

/**
 * 插件 WebSocket 网关。
 *
 * 输入:
 * - 远程插件的 WebSocket 连接与消息
 *
 * 输出:
 * - 远程插件注册到统一 runtime
 * - Host API 与工具/Hook 调用的双向消息桥接
 *
 * 预期行为:
 * - 网关只负责远程 transport 与协议编解码
 * - 真正的注册、执行与 Hook 调度都交给 PluginRuntimeService
 */
@Injectable()
export class PluginGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginGateway.name);
  private wss!: WebSocketServer;
  private readonly connections = new Map<WebSocket, PluginConnection>();
  private readonly connectionByPluginId = new Map<string, PluginConnection>();
  private readonly pendingRequests = new Map<string, PendingRequest>();
  private readonly activeRequestContexts = new Map<string, ActiveRequestContext>();
  private heartbeatInterval!: ReturnType<typeof setInterval>;

  constructor(
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly pluginRuntimeOrchestrator: PluginRuntimeOrchestratorService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const port = this.configService.get<number>('WS_PORT', 23331);
    this.wss = new WebSocketServer({ port });
    this.logger.log(`插件 WebSocket 服务器监听端口 ${port}`);

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      this.handleConnection(ws);
    });

    this.heartbeatInterval = setInterval(
      () => this.checkHeartbeats(),
      HEARTBEAT_SWEEP_INTERVAL_MS,
    );
  }

  onModuleDestroy() {
    clearInterval(this.heartbeatInterval);
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      this.activeRequestContexts.delete(requestId);
      pending.reject(new Error('服务器关闭'));
    }
    this.pendingRequests.clear();
    this.wss?.close();
  }

  /**
   * 在统一 runtime 上执行远程插件工具。
   * @param pluginId 插件 ID
   * @param capability 工具名
   * @param params JSON 参数
   * @param timeoutMs 超时时间
   * @returns 工具返回值
   */
  async executeCommand(
    pluginId: string,
    capability: string,
    params: JsonObject,
    timeoutMs = 30000,
  ): Promise<JsonValue> {
    return this.pluginRuntime.executeTool({
      pluginId,
      toolName: capability,
      params,
      context: {
        source: 'plugin',
        metadata: {
          timeoutMs,
        },
      },
    });
  }

  /**
   * 获取当前在线的远程插件 ID 列表。
   * @returns 插件 ID 数组
   */
  getConnectedPlugins(): string[] {
    return [...this.connectionByPluginId.keys()];
  }

  /**
   * 主动断开指定远程插件连接。
   * @param pluginId 插件 ID
   * @returns 无返回值
   */
  async disconnectPlugin(pluginId: string): Promise<void> {
    const connection = this.connectionByPluginId.get(pluginId);
    if (!connection) {
      throw new NotFoundException(`Plugin not connected: ${pluginId}`);
    }

    connection.ws.close();
  }

  /**
   * 对指定远程插件执行一次轻量健康检查。
   * @param pluginId 插件 ID
   * @param timeoutMs 超时毫秒数
   * @returns 健康检查结果
   */
  async checkPluginHealth(
    pluginId: string,
    timeoutMs = 5000,
  ): Promise<{ ok: boolean }> {
    const connection = this.connectionByPluginId.get(pluginId);
    if (!connection) {
      throw new NotFoundException(`Plugin not connected: ${pluginId}`);
    }
    return checkPluginGatewayHealth({
      pluginId,
      connection,
      timeoutMs,
    });
  }

  /**
   * 接受一个新的 WebSocket 连接。
   * @param ws WebSocket 连接
   * @returns 无返回值
   */
  private handleConnection(ws: WebSocket) {
    const connection: PluginConnection = createPluginGatewayConnectionRecord(ws);
    this.connections.set(ws, connection);
    attachPluginGatewaySocketHandlers({
      ws,
      connection,
      onIncomingMessage: (socket, record, raw) => {
        void this.handleIncomingMessage(socket, record, raw);
      },
      onDisconnect: (record) => {
        void this.handleDisconnect(record);
      },
      onSocketError: (error, record) => {
        this.logger.error(`来自 "${record.pluginName}" 的 WS 错误：${error.message}`);
      },
    });
  }

  /**
   * 解析并处理一条原始 websocket 消息。
   * @param ws WebSocket 连接
   * @param conn 当前连接
   * @param raw 原始消息内容
   */
  private async handleIncomingMessage(
    ws: WebSocket,
    conn: PluginConnection,
    raw: Buffer,
  ): Promise<void> {
    await handlePluginGatewayInboundRawMessage({
      ws,
      raw,
      protocolErrorAction: PROTOCOL_ERROR_ACTION,
      handleMessage: (message) => this.handleMessage(ws, conn, message),
      logWarn: (message) => this.logger.warn(message),
    });
  }

  /**
   * 处理一条来自远程插件的消息。
   * @param ws WebSocket 连接
   * @param conn 当前连接
   * @param msg 插件消息
   * @returns 无返回值
   */
  private async handleMessage(
    ws: WebSocket,
    conn: PluginConnection,
    msg: PluginGatewayInboundMessage,
  ): Promise<void> {
    if (!conn.authenticated && !(msg.type === WS_TYPE.AUTH && msg.action === WS_ACTION.AUTHENTICATE)) {
      sendPluginGatewayMessage({
        ws,
        type: WS_TYPE.ERROR,
        action: WS_ACTION.AUTH_FAIL,
        payload: { error: '未认证' },
      });
      return;
    }
    if (conn.authenticated) {
      conn.lastHeartbeatAt = Date.now();
    }

    switch (msg.type) {
      case WS_TYPE.AUTH:
        if (msg.action === WS_ACTION.AUTHENTICATE) {
          const payload = readAuthPayload(msg.payload);
          if (!payload) {
            sendPluginGatewayProtocolError({
              ws,
              error: '无效的认证负载',
              protocolErrorAction: PROTOCOL_ERROR_ACTION,
            });
            return;
          }
          await this.handleAuth(ws, conn, payload);
        }
        return;

      case WS_TYPE.PLUGIN:
        await this.handlePluginMessage(ws, conn, msg);
        return;

      case WS_TYPE.COMMAND:
        await this.handleCommandMessage(msg);
        return;

      case WS_TYPE.HEARTBEAT:
        if (msg.action === WS_ACTION.PING) {
          if (conn.manifest) {
            await this.pluginRuntimeOrchestrator.touchPluginHeartbeat(conn.pluginName);
          }
          sendPluginGatewayMessage({
            ws,
            type: WS_TYPE.HEARTBEAT,
            action: WS_ACTION.PONG,
            payload: {},
          });
        }
        return;

      default:
        return;
    }
  }

  /**
   * 处理插件类型消息。
   * @param ws WebSocket 连接
   * @param conn 当前连接
   * @param msg 插件消息
   * @returns 无返回值
   */
  private async handlePluginMessage(
    ws: WebSocket,
    conn: PluginConnection,
    msg: PluginGatewayInboundMessage,
  ): Promise<void> {
    switch (msg.action) {
      case WS_ACTION.REGISTER: {
        const payload = readRegisterPayload(msg.payload);
        if (!payload) {
          sendPluginGatewayProtocolError({
            ws,
            error: '无效的插件注册负载',
            protocolErrorAction: PROTOCOL_ERROR_ACTION,
          });
          return;
        }
        await this.handleRegister(ws, conn, payload);
        return;
      }
      case WS_ACTION.HOOK_RESULT: {
        handlePluginGatewayResultMessage({
          msg,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          loggerWarn: (message) => this.logger.warn(message),
          invalidPayloadMessage: '无效的 Hook 返回负载',
          readPayload: readDataPayload,
        }, msg.payload);
        return;
      }
      case WS_ACTION.HOOK_ERROR: {
        handlePluginGatewayErrorMessage({
          msg,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          loggerWarn: (message) => this.logger.warn(message),
          invalidPayloadMessage: '无效的 Hook 错误负载',
          readPayload: readErrorPayload,
        }, msg.payload);
        return;
      }
      case WS_ACTION.ROUTE_RESULT: {
        handlePluginGatewayResultMessage({
          msg,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          loggerWarn: (message) => this.logger.warn(message),
          invalidPayloadMessage: '无效的插件 Route 返回负载',
          readPayload: (payload) => {
            const result = readRouteResultPayload(payload);
            return result
              ? {
                data: toJsonValue(result.data),
              }
              : null;
          },
        }, msg.payload);
        return;
      }
      case WS_ACTION.ROUTE_ERROR: {
        handlePluginGatewayErrorMessage({
          msg,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          loggerWarn: (message) => this.logger.warn(message),
          invalidPayloadMessage: '无效的插件 Route 错误负载',
          readPayload: readErrorPayload,
        }, msg.payload);
        return;
      }
      case WS_ACTION.HOST_CALL:
        await this.handleHostCall(ws, conn, msg);
        return;
      default:
        return;
    }
  }

  /**
   * 处理命令类型消息。
   * @param msg 插件消息
   * @returns 无返回值
   */
  private async handleCommandMessage(
    msg: PluginGatewayInboundMessage,
  ): Promise<void> {
    switch (msg.action) {
      case WS_ACTION.EXECUTE_RESULT: {
        handlePluginGatewayResultMessage({
          msg,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          loggerWarn: (message) => this.logger.warn(message),
          invalidPayloadMessage: '无效的远程命令返回负载',
          readPayload: readDataPayload,
        }, msg.payload);
        return;
      }
      case WS_ACTION.EXECUTE_ERROR: {
        handlePluginGatewayErrorMessage({
          msg,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          loggerWarn: (message) => this.logger.warn(message),
          invalidPayloadMessage: '无效的远程命令错误负载',
          readPayload: readErrorPayload,
        }, msg.payload);
        return;
      }
      default:
        return;
    }
  }

  /**
   * 处理插件认证。
   * @param ws WebSocket 连接
   * @param conn 当前连接
   * @param payload 认证负载
   * @returns 无返回值
   */
  private async handleAuth(
    ws: WebSocket,
    conn: PluginConnection,
    payload: AuthPayload,
  ): Promise<void> {
    try {
      const secret = this.configService.get<string>('JWT_SECRET', 'fallback-secret');
      await authenticatePluginGatewayConnection({
        ws,
        connection: conn,
        payload,
        verifyToken: (token) => this.jwtService.verify<{ role?: string }>(token, { secret }),
        connectionByPluginId: this.connectionByPluginId,
        logWarn: (message) => this.logger.warn(message),
        logInfo: (message) => this.logger.log(message),
        sendMessage: sendPluginGatewayMessage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      sendPluginGatewayMessage({
        ws,
        type: WS_TYPE.AUTH,
        action: WS_ACTION.AUTH_FAIL,
        payload: { error: message },
      });
      ws.close();
    }
  }

  /**
   * 处理插件注册。
   * @param ws WebSocket 连接
   * @param conn 当前连接
   * @param payload 注册负载
   * @returns 无返回值
   */
  private async handleRegister(
    ws: WebSocket,
    conn: PluginConnection,
    payload: ValidatedRegisterPayload,
  ): Promise<void> {
    await registerPluginGatewayConnection({
      ws,
      connection: conn,
      payload,
      resolveManifest: resolvePluginGatewayManifest,
      createTransport: () => this.createRemoteTransport(conn),
      registerPlugin: (input) => this.pluginRuntimeOrchestrator.registerPlugin(input),
      sendMessage: sendPluginGatewayMessage,
    });
  }

  /**
   * 处理远程插件发起的 Host API 调用。
   * @param ws WebSocket 连接
   * @param conn 当前连接
   * @param msg 原始消息
   * @returns 无返回值
   */
  private async handleHostCall(
    ws: WebSocket,
    conn: PluginConnection,
    msg: PluginGatewayInboundMessage,
  ): Promise<void> {
    await handlePluginGatewayHostCall({
      ws,
      connection: conn,
      msg,
      activeRequestContexts: this.activeRequestContexts,
      callHost: (input) => this.pluginRuntime.callHost(input),
      logWarn: (message) => this.logger.warn(message),
    });
  }

  /**
   * 断开连接时注销对应远程插件。
   * @param conn 当前连接
   * @returns 无返回值
   */
  private async handleDisconnect(conn: PluginConnection): Promise<void> {
    await disconnectPluginGatewayConnection({
      connection: conn,
      connections: this.connections,
      connectionByPluginId: this.connectionByPluginId,
      pendingRequests: this.pendingRequests,
      activeRequestContexts: this.activeRequestContexts,
      unregisterPlugin: (pluginId) => this.pluginRuntimeOrchestrator.unregisterPlugin(pluginId),
      rejectPendingRequestsForSocket: rejectPluginGatewayPendingRequestsForSocket,
      logInfo: (message) => this.logger.log(message),
    });
  }

  /**
   * 为远程连接构造统一 transport。
   * @param conn 远程连接
   * @returns 可供 runtime 调用的 transport
   */
  private createRemoteTransport(conn: PluginConnection): PluginTransport {
    return createPluginGatewayRemoteTransport({
      connection: conn,
      pendingRequests: this.pendingRequests,
      activeRequestContexts: this.activeRequestContexts,
      disconnectPlugin: (pluginId) => this.disconnectPlugin(pluginId),
      checkPluginHealth: (pluginId) => this.checkPluginHealth(pluginId),
    });
  }


  /**
   * 扫描远程插件连接，并摘除超时未活跃的连接。
   */
  private checkHeartbeats() {
    sweepStalePluginGatewayConnections({
      now: Date.now(),
      heartbeatTimeoutMs: HEARTBEAT_TIMEOUT_MS,
      connections: this.connections.values(),
      onStaleConnection: (connection) => {
        this.logger.warn(
          `插件 "${connection.pluginName || 'unknown'}" 心跳超时，主动断开连接`,
        );
      },
    });
  }
}

export { DeviceType };

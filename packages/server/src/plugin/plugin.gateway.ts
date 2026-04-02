import {
  type AuthPayload,
  type JsonValue,
  type PluginManifest,
  type PluginRouteResponse,
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
  clonePluginGatewayCallContext,
  resolvePluginGatewayHostCallContext,
  resolvePluginGatewayManifest,
  sameAuthorizedPluginGatewayContext,
} from './plugin-gateway-context.helpers';
import {
  extractPluginCallContext,
  isConnectionScopedHostMethod,
  readAuthPayload,
  readDataPayload,
  readErrorPayload,
  readHostCallPayload,
  readPluginGatewayMessage,
  readPluginRouteResponseOrThrow,
  readRegisterPayload,
  readRouteResultPayload,
  type PluginGatewayInboundMessage,
  type ValidatedRegisterPayload,
} from './plugin-gateway-payload.helpers';
import {
  readPluginGatewayRequestId,
  readPluginGatewayTimeoutMs,
  rejectPluginGatewayPendingRequest,
  rejectPluginGatewayPendingRequestsForSocket,
  resolvePluginGatewayPendingRequest,
  sendPluginGatewayMessage,
  sendPluginGatewayProtocolError,
  sendPluginGatewayRequest,
  sendTypedPluginGatewayRequest,
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
    if (connection.ws.readyState !== WebSocket.OPEN) {
      return {
        ok: false,
      };
    }

    return new Promise<{ ok: boolean }>((resolve, reject) => {
      const handlePong = () => {
        clearTimeout(timer);
        connection.ws.off('pong', handlePong);
        resolve({
          ok: true,
        });
      };
      const timer = setTimeout(() => {
        connection.ws.off('pong', handlePong);
        reject(new Error(`插件健康检查超时: ${pluginId}`));
      }, timeoutMs);

      connection.ws.once('pong', handlePong);
      connection.ws.ping();
    });
  }

  /**
   * 接受一个新的 WebSocket 连接。
   * @param ws WebSocket 连接
   * @returns 无返回值
   */
  private handleConnection(ws: WebSocket) {
    const connection: PluginConnection = {
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: Date.now(),
    };
    this.connections.set(ws, connection);

    const authTimeout = setTimeout(() => {
      if (!connection.authenticated) {
        sendPluginGatewayMessage({
          ws,
          type: WS_TYPE.ERROR,
          action: WS_ACTION.AUTH_FAIL,
          payload: { error: '认证超时' },
        });
        ws.close();
      }
    }, 10000);

    ws.on('message', (raw: Buffer) => {
      void this.handleIncomingMessage(ws, connection, raw);
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      void this.handleDisconnect(connection);
    });

    ws.on('error', (error) => {
      this.logger.error(`来自 "${connection.pluginName}" 的 WS 错误：${error.message}`);
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
    const rawText = raw.toString();
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawText);
    } catch {
      sendPluginGatewayMessage({
        ws,
        type: WS_TYPE.ERROR,
        action: 'parse_error',
        payload: { error: '无效的 JSON' },
      });
      return;
    }

    const message = readPluginGatewayMessage(parsed);
    if (!message) {
      sendPluginGatewayProtocolError({
        ws,
        error: '无效的插件协议消息',
        protocolErrorAction: PROTOCOL_ERROR_ACTION,
      });
      return;
    }

    try {
      await this.handleMessage(ws, conn, message);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.logger.warn(`插件协议消息处理失败: ${messageText}`);
      sendPluginGatewayProtocolError({
        ws,
        error: '插件协议消息处理失败',
        protocolErrorAction: PROTOCOL_ERROR_ACTION,
      });
    }
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
        const requestId = readPluginGatewayRequestId({
          msg,
          onMissing: (message) => this.logger.warn(message),
        });
        const payload = readDataPayload(msg.payload);
        if (!payload) {
          rejectPluginGatewayPendingRequest({
            requestId,
            error: '无效的 Hook 返回负载',
            pendingRequests: this.pendingRequests,
            activeRequestContexts: this.activeRequestContexts,
          });
          return;
        }
        resolvePluginGatewayPendingRequest({
          requestId,
          data: payload.data,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
        });
        return;
      }
      case WS_ACTION.HOOK_ERROR: {
        const requestId = readPluginGatewayRequestId({
          msg,
          onMissing: (message) => this.logger.warn(message),
        });
        const payload = readErrorPayload(msg.payload);
        if (!payload) {
          rejectPluginGatewayPendingRequest({
            requestId,
            error: '无效的 Hook 错误负载',
            pendingRequests: this.pendingRequests,
            activeRequestContexts: this.activeRequestContexts,
          });
          return;
        }
        rejectPluginGatewayPendingRequest({
          requestId,
          error: payload.error,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
        });
        return;
      }
      case WS_ACTION.ROUTE_RESULT: {
        const requestId = readPluginGatewayRequestId({
          msg,
          onMissing: (message) => this.logger.warn(message),
        });
        const payload = readRouteResultPayload(msg.payload);
        if (!payload) {
          rejectPluginGatewayPendingRequest({
            requestId,
            error: '无效的插件 Route 返回负载',
            pendingRequests: this.pendingRequests,
            activeRequestContexts: this.activeRequestContexts,
          });
          return;
        }
        resolvePluginGatewayPendingRequest({
          requestId,
          data: toJsonValue(payload.data),
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
        });
        return;
      }
      case WS_ACTION.ROUTE_ERROR: {
        const requestId = readPluginGatewayRequestId({
          msg,
          onMissing: (message) => this.logger.warn(message),
        });
        const payload = readErrorPayload(msg.payload);
        if (!payload) {
          rejectPluginGatewayPendingRequest({
            requestId,
            error: '无效的插件 Route 错误负载',
            pendingRequests: this.pendingRequests,
            activeRequestContexts: this.activeRequestContexts,
          });
          return;
        }
        rejectPluginGatewayPendingRequest({
          requestId,
          error: payload.error,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
        });
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
        const requestId = readPluginGatewayRequestId({
          msg,
          onMissing: (message) => this.logger.warn(message),
        });
        const payload = readDataPayload(msg.payload);
        if (!payload) {
          rejectPluginGatewayPendingRequest({
            requestId,
            error: '无效的远程命令返回负载',
            pendingRequests: this.pendingRequests,
            activeRequestContexts: this.activeRequestContexts,
          });
          return;
        }
        resolvePluginGatewayPendingRequest({
          requestId,
          data: payload.data,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
        });
        return;
      }
      case WS_ACTION.EXECUTE_ERROR: {
        const requestId = readPluginGatewayRequestId({
          msg,
          onMissing: (message) => this.logger.warn(message),
        });
        const payload = readErrorPayload(msg.payload);
        if (!payload) {
          rejectPluginGatewayPendingRequest({
            requestId,
            error: '无效的远程命令错误负载',
            pendingRequests: this.pendingRequests,
            activeRequestContexts: this.activeRequestContexts,
          });
          return;
        }
        rejectPluginGatewayPendingRequest({
          requestId,
          error: payload.error,
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
        });
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
      const verified = this.jwtService.verify<{ role?: string }>(payload.token, { secret });
      if (verified.role !== 'admin' && verified.role !== 'super_admin') {
        throw new Error('只有管理员可以接入远程插件');
      }
      const previousConnection = this.connectionByPluginId.get(payload.pluginName);
      conn.authenticated = true;
      conn.pluginName = payload.pluginName;
      conn.deviceType = payload.deviceType;
      conn.lastHeartbeatAt = Date.now();
      this.connectionByPluginId.set(payload.pluginName, conn);
      if (previousConnection && previousConnection.ws !== ws) {
        this.logger.warn(`插件 "${payload.pluginName}" 已存在旧连接，当前将其替换`);
        previousConnection.ws.close();
      }
      sendPluginGatewayMessage({
        ws,
        type: WS_TYPE.AUTH,
        action: WS_ACTION.AUTH_OK,
        payload: {},
      });
      this.logger.log(`Plugin "${payload.pluginName}" authenticated`);
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
    const manifest = resolvePluginGatewayManifest({
      pluginName: conn.pluginName,
      manifest: payload.manifest,
    });
    conn.manifest = manifest;

    await this.pluginRuntimeOrchestrator.registerPlugin({
      manifest,
      runtimeKind: 'remote',
      deviceType: conn.deviceType,
      transport: this.createRemoteTransport(conn),
    });

    sendPluginGatewayMessage({
      ws,
      type: WS_TYPE.PLUGIN,
      action: WS_ACTION.REGISTER_OK,
      payload: {},
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
    const requestId = readPluginGatewayRequestId({
      msg,
      onMissing: (message) => this.logger.warn(message),
    });
    if (!requestId) {
      return;
    }

    const payload = readHostCallPayload(msg.payload);
    if (!payload) {
      sendPluginGatewayMessage({
        ws,
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_ERROR,
        payload: { error: '无效的 Host API 调用负载' },
        requestId,
      });
      return;
    }

    try {
      const context = resolvePluginGatewayHostCallContext({
        ws: conn.ws,
        method: payload.method,
        context: payload.context,
        activeRequestContexts: this.activeRequestContexts,
        isConnectionScopedHostMethod: (method) => isConnectionScopedHostMethod(method),
        isSameContext: sameAuthorizedPluginGatewayContext,
        cloneContext: clonePluginGatewayCallContext,
      });
      const result = await this.pluginRuntime.callHost({
        pluginId: conn.pluginName,
        context,
        method: payload.method,
        params: payload.params,
      });
      sendPluginGatewayMessage({
        ws,
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_RESULT,
        payload: { data: result },
        requestId,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendPluginGatewayMessage({
        ws,
        type: WS_TYPE.PLUGIN,
        action: WS_ACTION.HOST_ERROR,
        payload: { error: message },
        requestId,
      });
    }
  }

  /**
   * 断开连接时注销对应远程插件。
   * @param conn 当前连接
   * @returns 无返回值
   */
  private async handleDisconnect(conn: PluginConnection): Promise<void> {
    this.connections.delete(conn.ws);
    rejectPluginGatewayPendingRequestsForSocket({
      ws: conn.ws,
      error: new Error('插件连接已断开'),
      pendingRequests: this.pendingRequests,
      activeRequestContexts: this.activeRequestContexts,
    });
    if (!conn.pluginName) {
      return;
    }

    const activeConnection = this.connectionByPluginId.get(conn.pluginName);
    if (activeConnection?.ws !== conn.ws) {
      this.logger.log(`插件 "${conn.pluginName}" 的旧连接已断开`);
      return;
    }

    this.connectionByPluginId.delete(conn.pluginName);
    try {
      await this.pluginRuntimeOrchestrator.unregisterPlugin(conn.pluginName);
    } catch {
      // 连接可能在注册前就断开，这里忽略。
    }
    this.logger.log(`插件 "${conn.pluginName}" 已断开连接`);
  }

  /**
   * 为远程连接构造统一 transport。
   * @param conn 远程连接
   * @returns 可供 runtime 调用的 transport
   */
  private createRemoteTransport(conn: PluginConnection): PluginTransport {
    return {
      executeTool: ({ toolName, params, context }) =>
        sendPluginGatewayRequest({
          ws: conn.ws,
          type: WS_TYPE.COMMAND,
          action: WS_ACTION.EXECUTE,
          payload: {
            toolName,
            params,
            context,
          },
          timeoutMs: readPluginGatewayTimeoutMs(context, 30000),
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          extractContext: extractPluginCallContext,
          cloneContext: clonePluginGatewayCallContext,
        }),
      invokeHook: ({ hookName, context, payload }) =>
        sendPluginGatewayRequest({
          ws: conn.ws,
          type: WS_TYPE.PLUGIN,
          action: WS_ACTION.HOOK_INVOKE,
          payload: {
            hookName,
            context,
            payload,
          },
          timeoutMs: readPluginGatewayTimeoutMs(context, 10000),
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          extractContext: extractPluginCallContext,
          cloneContext: clonePluginGatewayCallContext,
        }),
      invokeRoute: ({ request, context }) =>
        sendTypedPluginGatewayRequest<PluginRouteResponse>({
          ws: conn.ws,
          type: WS_TYPE.PLUGIN,
          action: WS_ACTION.ROUTE_INVOKE,
          payload: {
            request,
            context,
          },
          timeoutMs: readPluginGatewayTimeoutMs(context, 15000),
          pendingRequests: this.pendingRequests,
          activeRequestContexts: this.activeRequestContexts,
          extractContext: extractPluginCallContext,
          cloneContext: clonePluginGatewayCallContext,
          readResult: readPluginRouteResponseOrThrow,
        }),
      reload: () => this.disconnectPlugin(conn.pluginName),
      reconnect: () => this.disconnectPlugin(conn.pluginName),
      checkHealth: () => this.checkPluginHealth(conn.pluginName),
      listSupportedActions: () => ['health-check', 'reload', 'reconnect'],
    };
  }


  /**
   * 扫描远程插件连接，并摘除超时未活跃的连接。
   */
  private checkHeartbeats() {
    const now = Date.now();

    for (const connection of this.connections.values()) {
      if (!connection.authenticated) {
        continue;
      }

      const lastHeartbeatAt = typeof connection.lastHeartbeatAt === 'number'
        ? connection.lastHeartbeatAt
        : now;
      if (now - lastHeartbeatAt <= HEARTBEAT_TIMEOUT_MS) {
        continue;
      }

      this.logger.warn(
        `插件 "${connection.pluginName || 'unknown'}" 心跳超时，主动断开连接`,
      );
      connection.ws.close();
    }
  }
}

export { DeviceType };

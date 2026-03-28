import {
  type AuthPayload,
  type ExecuteErrorPayload,
  type ExecutePayload,
  type ExecuteResultPayload,
  type HookInvokePayload,
  type HookResultPayload,
  type HostCallPayload,
  type HostResultPayload,
  type JsonValue,
  type PluginCallContext,
  type PluginCapability,
  type PluginManifest,
  type PluginRouteResponse,
  type RegisterPayload,
  type RouteInvokePayload,
  type RouteResultPayload,
  WS_ACTION,
  WS_TYPE,
  type WsMessage,
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
import { PluginRuntimeService, type PluginTransport } from './plugin-runtime.service';

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
}

/**
 * 等待远程插件回包的请求。
 */
interface PendingRequest {
  /** 成功回调。 */
  resolve: (value: JsonValue) => void;
  /** 失败回调。 */
  reject: (reason: Error) => void;
  /** 超时计时器。 */
  timer: ReturnType<typeof setTimeout>;
}

/**
 * 网关消息负载联合。
 */
type PluginGatewayPayload =
  | AuthPayload
  | RegisterPayload
  | ExecutePayload
  | ExecuteResultPayload
  | ExecuteErrorPayload
  | HookInvokePayload
  | HookResultPayload
  | HostCallPayload
  | HostResultPayload
  | RouteInvokePayload
  | RouteResultPayload
  | JsonValue;

type PluginGatewayMessage = WsMessage<PluginGatewayPayload>;

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
  private heartbeatInterval!: ReturnType<typeof setInterval>;

  constructor(
    private readonly pluginRuntime: PluginRuntimeService,
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

    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 30000);
  }

  onModuleDestroy() {
    clearInterval(this.heartbeatInterval);
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
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
   * 获取指定远程插件的工具列表。
   * @param pluginId 插件 ID
   * @returns 该插件的工具描述列表
   */
  getPluginCapabilities(pluginId: string): PluginCapability[] {
    return this.connectionByPluginId.get(pluginId)?.manifest?.tools ?? [];
  }

  /**
   * 获取所有在线远程插件的工具列表。
   * @returns 插件 ID 到工具列表的映射
   */
  getAllCapabilities(): Map<string, PluginCapability[]> {
    const capabilities = new Map<string, PluginCapability[]>();
    for (const [pluginId, connection] of this.connectionByPluginId) {
      capabilities.set(pluginId, connection.manifest?.tools ?? []);
    }

    return capabilities;
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
    };
    this.connections.set(ws, connection);

    const authTimeout = setTimeout(() => {
      if (!connection.authenticated) {
        this.send(ws, WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '认证超时' });
        ws.close();
      }
    }, 10000);

    ws.on('message', (raw: Buffer) => {
      try {
        const message = JSON.parse(raw.toString()) as PluginGatewayMessage;
        void this.handleMessage(ws, connection, message);
      } catch {
        this.send(ws, WS_TYPE.ERROR, 'parse_error', { error: '无效的 JSON' });
      }
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
   * 处理一条来自远程插件的消息。
   * @param ws WebSocket 连接
   * @param conn 当前连接
   * @param msg 插件消息
   * @returns 无返回值
   */
  private async handleMessage(
    ws: WebSocket,
    conn: PluginConnection,
    msg: PluginGatewayMessage,
  ): Promise<void> {
    if (!conn.authenticated && !(msg.type === WS_TYPE.AUTH && msg.action === WS_ACTION.AUTHENTICATE)) {
      this.send(ws, WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '未认证' });
      return;
    }

    switch (msg.type) {
      case WS_TYPE.AUTH:
        if (msg.action === WS_ACTION.AUTHENTICATE) {
          await this.handleAuth(ws, conn, msg.payload as AuthPayload);
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
            await this.pluginRuntime.touchPluginHeartbeat(conn.pluginName);
          }
          this.send(ws, WS_TYPE.HEARTBEAT, WS_ACTION.PONG, {});
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
    msg: PluginGatewayMessage,
  ): Promise<void> {
    switch (msg.action) {
      case WS_ACTION.REGISTER:
        await this.handleRegister(ws, conn, msg.payload as RegisterPayload);
        return;
      case WS_ACTION.HOOK_RESULT:
        this.resolvePendingRequest(
          this.readRequestId(msg),
          (msg.payload as HookResultPayload).data,
        );
        return;
      case WS_ACTION.HOOK_ERROR:
        this.rejectPendingRequest(
          this.readRequestId(msg),
          (msg.payload as ExecuteErrorPayload).error,
        );
        return;
      case WS_ACTION.ROUTE_RESULT:
        this.resolvePendingRequest(
          this.readRequestId(msg),
          (msg.payload as RouteResultPayload).data as unknown as JsonValue,
        );
        return;
      case WS_ACTION.ROUTE_ERROR:
        this.rejectPendingRequest(
          this.readRequestId(msg),
          (msg.payload as ExecuteErrorPayload).error,
        );
        return;
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
    msg: PluginGatewayMessage,
  ): Promise<void> {
    switch (msg.action) {
      case WS_ACTION.EXECUTE_RESULT:
        this.resolvePendingRequest(
          this.readRequestId(msg),
          (msg.payload as ExecuteResultPayload).data,
        );
        return;
      case WS_ACTION.EXECUTE_ERROR:
        this.rejectPendingRequest(
          this.readRequestId(msg),
          (msg.payload as ExecuteErrorPayload).error,
        );
        return;
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
      this.jwtService.verify(payload.token, { secret });
      conn.authenticated = true;
      conn.pluginName = payload.pluginName;
      conn.deviceType = payload.deviceType;
      this.connectionByPluginId.set(payload.pluginName, conn);
      this.send(ws, WS_TYPE.AUTH, WS_ACTION.AUTH_OK, {});
      this.logger.log(`Plugin "${payload.pluginName}" authenticated`);
    } catch {
      this.send(ws, WS_TYPE.AUTH, WS_ACTION.AUTH_FAIL, { error: 'Invalid token' });
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
    payload: RegisterPayload,
  ): Promise<void> {
    const manifest = this.resolveManifest(conn, payload);
    conn.manifest = manifest;

    await this.pluginRuntime.registerPlugin({
      manifest,
      runtimeKind: 'remote',
      deviceType: conn.deviceType,
      transport: this.createRemoteTransport(conn),
    });

    this.send(ws, WS_TYPE.PLUGIN, WS_ACTION.REGISTER_OK, {});
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
    msg: PluginGatewayMessage,
  ): Promise<void> {
    const requestId = this.readRequestId(msg);
    if (!requestId) {
      return;
    }

    const payload = msg.payload as HostCallPayload;
    try {
      const result = await this.pluginRuntime.callHost({
        pluginId: conn.pluginName,
        context: payload.context ?? { source: 'plugin' },
        method: payload.method,
        params: payload.params,
      });
      this.send(ws, WS_TYPE.PLUGIN, WS_ACTION.HOST_RESULT, { data: result }, requestId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.send(ws, WS_TYPE.PLUGIN, WS_ACTION.HOST_ERROR, { error: message }, requestId);
    }
  }

  /**
   * 断开连接时注销对应远程插件。
   * @param conn 当前连接
   * @returns 无返回值
   */
  private async handleDisconnect(conn: PluginConnection): Promise<void> {
    this.connections.delete(conn.ws);
    if (!conn.pluginName) {
      return;
    }

    this.connectionByPluginId.delete(conn.pluginName);
    try {
      await this.pluginRuntime.unregisterPlugin(conn.pluginName);
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
        this.sendRequest(
          conn.ws,
          WS_TYPE.COMMAND,
          WS_ACTION.EXECUTE,
          {
            toolName,
            params,
            context,
          },
          this.readTimeoutMs(context, 30000),
        ),
      invokeHook: ({ hookName, context, payload }) =>
        this.sendRequest(
          conn.ws,
          WS_TYPE.PLUGIN,
          WS_ACTION.HOOK_INVOKE,
          {
            hookName,
            context,
            payload,
          },
          this.readTimeoutMs(context, 10000),
        ),
      invokeRoute: ({ request, context }) =>
        this.sendRequest(
          conn.ws,
          WS_TYPE.PLUGIN,
          WS_ACTION.ROUTE_INVOKE,
          {
            request,
            context,
          },
          this.readTimeoutMs(context, 15000),
        ) as unknown as Promise<PluginRouteResponse>,
      reload: () => this.disconnectPlugin(conn.pluginName),
      reconnect: () => this.disconnectPlugin(conn.pluginName),
      checkHealth: () => this.checkPluginHealth(conn.pluginName),
      listSupportedActions: () => ['health-check', 'reload', 'reconnect'],
    };
  }

  /**
   * 发送一条需要等待结果的请求。
   * @param ws WebSocket 连接
   * @param type 消息 type
   * @param action 消息 action
   * @param payload 请求负载
   * @param timeoutMs 超时时间
   * @returns 远程插件的返回值
   */
  private sendRequest(
    ws: WebSocket,
    type: string,
    action: string,
    payload: PluginGatewayPayload,
    timeoutMs = 30000,
  ): Promise<JsonValue> {
    if (ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('插件连接不可用'));
    }

    const requestId = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`插件请求超时: ${action}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer });
      this.send(ws, type, action, payload, requestId);
    });
  }

  /**
   * 从调用上下文读取超时参数。
   * @param context 插件调用上下文
   * @param fallback 默认超时
   * @returns 超时毫秒数
   */
  private readTimeoutMs(
    context: PluginCallContext | undefined,
    fallback: number,
  ): number {
    const raw = context?.metadata?.timeoutMs;
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
      return fallback;
    }

    return raw;
  }

  /**
   * 根据注册负载解析 manifest；旧插件只传 capabilities 时自动补默认 manifest。
   * @param conn 当前连接
   * @param payload 注册负载
   * @returns 规范化后的 manifest
   */
  private resolveManifest(
    conn: PluginConnection,
    payload: RegisterPayload,
  ): PluginManifest {
    if (payload.manifest) {
      return {
        ...payload.manifest,
        id: conn.pluginName,
        runtime: 'remote',
      };
    }

    return {
      id: conn.pluginName,
      name: conn.pluginName,
      version: '0.0.0',
      runtime: 'remote',
      permissions: [],
      tools: payload.capabilities ?? [],
      hooks: [],
    };
  }

  /**
   * 读取请求 ID；缺失时记录日志。
   * @param msg 插件消息
   * @returns requestId；缺失时返回 null
   */
  private readRequestId(msg: PluginGatewayMessage): string | null {
    if (msg.requestId) {
      return msg.requestId;
    }

    this.logger.warn(`收到缺少 requestId 的插件消息: ${msg.type}/${msg.action}`);
    return null;
  }

  /**
   * 成功解析一个等待中的远程请求。
   * @param requestId 请求 ID
   * @param data 返回值
   * @returns 无返回值
   */
  private resolvePendingRequest(
    requestId: string | null,
    data: JsonValue,
  ): void {
    if (!requestId) {
      return;
    }

    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(requestId);
    pending.resolve(data);
  }

  /**
   * 失败终止一个等待中的远程请求。
   * @param requestId 请求 ID
   * @param error 错误信息
   * @returns 无返回值
   */
  private rejectPendingRequest(
    requestId: string | null,
    error: string,
  ): void {
    if (!requestId) {
      return;
    }

    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pendingRequests.delete(requestId);
    pending.reject(new Error(error));
  }

  /**
   * 发送一条 WebSocket 消息。
   * @param ws WebSocket 连接
   * @param type 消息 type
   * @param action 消息 action
   * @param payload JSON 负载
   * @param requestId 可选 requestId
   * @returns 无返回值
   */
  private send(
    ws: WebSocket,
    type: string,
    action: string,
    payload: PluginGatewayPayload,
    requestId?: string,
  ): void {
    if (ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: PluginGatewayMessage = {
      type,
      action,
      payload,
      requestId,
    };
    ws.send(JSON.stringify(message));
  }

  /**
   * 心跳检查占位。
   */
  private checkHeartbeats() {
    // 当前仍由客户端主动发送 ping；后续如需失败摘除可在这里补。
  }
}

export { DeviceType } from '@garlic-claw/shared';

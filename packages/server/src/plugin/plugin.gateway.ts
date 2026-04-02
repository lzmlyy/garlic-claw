import {
  type AuthPayload,
  type ExecuteErrorPayload,
  type ExecutePayload,
  type ExecuteResultPayload,
  type HookInvokePayload,
  type HookResultPayload,
  type HostCallPayload,
  type PluginHostMethod,
  type HostResultPayload,
  type JsonValue,
  type PluginCallContext,
  type PluginManifest,
  type PluginRouteResponse,
  type RegisterPayload,
  type RouteInvokePayload,
  type RouteResultPayload,
  WS_ACTION,
  DeviceType,
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
import { toJsonValue } from '../common/utils/json-value';
import { normalizePluginManifestCandidate } from './plugin-manifest.persistence';
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
 * 当前支持的 Host API 方法集合。
 */
const PLUGIN_HOST_METHODS: PluginHostMethod[] = [
  'automation.create',
  'automation.event.emit',
  'automation.list',
  'automation.run',
  'automation.toggle',
  'config.get',
  'cron.delete',
  'cron.list',
  'cron.register',
  'conversation.get',
  'conversation.session.finish',
  'conversation.session.get',
  'conversation.session.keep',
  'conversation.session.start',
  'conversation.messages.list',
  'conversation.title.set',
  'kb.get',
  'kb.list',
  'kb.search',
  'llm.generate',
  'llm.generate-text',
  'log.list',
  'log.write',
  'message.send',
  'message.target.current.get',
  'memory.search',
  'memory.save',
  'persona.activate',
  'persona.current.get',
  'persona.get',
  'persona.list',
  'plugin.self.get',
  'provider.current.get',
  'provider.get',
  'provider.list',
  'provider.model.get',
  'storage.delete',
  'storage.get',
  'storage.list',
  'storage.set',
  'subagent.run',
  'subagent.task.get',
  'subagent.task.list',
  'subagent.task.start',
  'state.delete',
  'state.get',
  'state.list',
  'state.set',
  'user.get',
];

/**
 * 允许远程插件在无运行时上下文时直接调用的 Host API。
 */
const CONNECTION_SCOPED_HOST_METHODS = new Set<PluginHostMethod>([
  'config.get',
  'cron.delete',
  'cron.list',
  'cron.register',
  'kb.get',
  'kb.list',
  'kb.search',
  'log.list',
  'log.write',
  'persona.current.get',
  'persona.get',
  'persona.list',
  'plugin.self.get',
  'provider.current.get',
  'provider.get',
  'provider.list',
  'provider.model.get',
  'state.delete',
  'state.get',
  'state.list',
  'state.set',
  'storage.delete',
  'storage.get',
  'storage.list',
  'storage.set',
]);

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
 * 等待远程插件回包的请求。
 */
interface PendingRequest {
  /** 成功回调。 */
  resolve: (value: JsonValue) => void;
  /** 失败回调。 */
  reject: (reason: Error) => void;
  /** 超时计时器。 */
  timer: ReturnType<typeof setTimeout>;
  /** 请求所属的 WebSocket 连接。 */
  ws: WebSocket;
}

/**
 * 远程插件当前已获授权的运行时上下文。
 */
interface ActiveRequestContext {
  /** 请求所属的 WebSocket 连接。 */
  ws: WebSocket;
  /** 由宿主发出的上下文快照。 */
  context: PluginCallContext;
}

interface ValidatedRegisterPayload {
  manifest: Record<string, unknown>;
}

interface ValidatedHostCallPayload {
  method: PluginHostMethod;
  params: JsonObject;
  context?: PluginCallContext;
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
type PluginGatewayInboundMessage = WsMessage<unknown>;

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
        this.send(ws, WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '认证超时' });
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
      this.send(ws, WS_TYPE.ERROR, 'parse_error', { error: '无效的 JSON' });
      return;
    }

    const message = readPluginGatewayMessage(parsed);
    if (!message) {
      this.sendProtocolError(ws, '无效的插件协议消息');
      return;
    }

    try {
      await this.handleMessage(ws, conn, message);
    } catch (error) {
      const messageText = error instanceof Error ? error.message : String(error);
      this.logger.warn(`插件协议消息处理失败: ${messageText}`);
      this.sendProtocolError(ws, '插件协议消息处理失败');
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
      this.send(ws, WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '未认证' });
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
            this.sendProtocolError(ws, '无效的认证负载');
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
    msg: PluginGatewayInboundMessage,
  ): Promise<void> {
    switch (msg.action) {
      case WS_ACTION.REGISTER: {
        const payload = readRegisterPayload(msg.payload);
        if (!payload) {
          this.sendProtocolError(ws, '无效的插件注册负载');
          return;
        }
        await this.handleRegister(ws, conn, payload);
        return;
      }
      case WS_ACTION.HOOK_RESULT: {
        const payload = readDataPayload(msg.payload);
        if (!payload) {
          this.rejectPendingRequest(this.readRequestId(msg), '无效的 Hook 返回负载');
          return;
        }
        this.resolvePendingRequest(
          this.readRequestId(msg),
          payload.data,
        );
        return;
      }
      case WS_ACTION.HOOK_ERROR: {
        const payload = readErrorPayload(msg.payload);
        if (!payload) {
          this.rejectPendingRequest(this.readRequestId(msg), '无效的 Hook 错误负载');
          return;
        }
        this.rejectPendingRequest(
          this.readRequestId(msg),
          payload.error,
        );
        return;
      }
      case WS_ACTION.ROUTE_RESULT: {
        const payload = readRouteResultPayload(msg.payload);
        if (!payload) {
          this.rejectPendingRequest(this.readRequestId(msg), '无效的插件 Route 返回负载');
          return;
        }
        this.resolvePendingRequest(
          this.readRequestId(msg),
          toJsonValue(payload.data),
        );
        return;
      }
      case WS_ACTION.ROUTE_ERROR: {
        const payload = readErrorPayload(msg.payload);
        if (!payload) {
          this.rejectPendingRequest(this.readRequestId(msg), '无效的插件 Route 错误负载');
          return;
        }
        this.rejectPendingRequest(
          this.readRequestId(msg),
          payload.error,
        );
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
        const payload = readDataPayload(msg.payload);
        if (!payload) {
          this.rejectPendingRequest(this.readRequestId(msg), '无效的远程命令返回负载');
          return;
        }
        this.resolvePendingRequest(
          this.readRequestId(msg),
          payload.data,
        );
        return;
      }
      case WS_ACTION.EXECUTE_ERROR: {
        const payload = readErrorPayload(msg.payload);
        if (!payload) {
          this.rejectPendingRequest(this.readRequestId(msg), '无效的远程命令错误负载');
          return;
        }
        this.rejectPendingRequest(
          this.readRequestId(msg),
          payload.error,
        );
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
      this.send(ws, WS_TYPE.AUTH, WS_ACTION.AUTH_OK, {});
      this.logger.log(`Plugin "${payload.pluginName}" authenticated`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      this.send(ws, WS_TYPE.AUTH, WS_ACTION.AUTH_FAIL, { error: message });
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
    const manifest = this.resolveManifest(conn, payload);
    conn.manifest = manifest;

    await this.pluginRuntimeOrchestrator.registerPlugin({
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
    msg: PluginGatewayInboundMessage,
  ): Promise<void> {
    const requestId = this.readRequestId(msg);
    if (!requestId) {
      return;
    }

    const payload = readHostCallPayload(msg.payload);
    if (!payload) {
      this.send(
        ws,
        WS_TYPE.PLUGIN,
        WS_ACTION.HOST_ERROR,
        { error: '无效的 Host API 调用负载' },
        requestId,
      );
      return;
    }

    try {
      const context = this.resolveHostCallContext(
        conn,
        payload.method,
        payload.context,
      );
      const result = await this.pluginRuntime.callHost({
        pluginId: conn.pluginName,
        context,
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
    this.rejectPendingRequestsForSocket(conn.ws, new Error('插件连接已断开'));
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
        this.sendTypedRequest<PluginRouteResponse>(
          conn.ws,
          WS_TYPE.PLUGIN,
          WS_ACTION.ROUTE_INVOKE,
          {
            request,
            context,
          },
          this.readTimeoutMs(context, 15000),
          readPluginRouteResponseOrThrow,
        ),
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
    const activeContext = extractPluginCallContext(payload);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.activeRequestContexts.delete(requestId);
        reject(new Error(`插件请求超时: ${action}`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timer, ws });
      if (activeContext) {
        this.activeRequestContexts.set(requestId, {
          ws,
          context: clonePluginCallContext(activeContext),
        });
      }
      this.send(ws, type, action, payload, requestId);
    });
  }

  /**
   * 发送一条带类型收口的远程请求。
   * @param ws WebSocket 连接
   * @param type 消息 type
   * @param action 消息 action
   * @param payload 请求负载
   * @param timeoutMs 超时时间
   * @returns 收口后的结果
   */
  private sendTypedRequest<T>(
    ws: WebSocket,
    type: string,
    action: string,
    payload: PluginGatewayPayload,
    timeoutMs = 30000,
    readResult: (value: JsonValue) => T,
  ): Promise<T> {
    return this.sendRequest(ws, type, action, payload, timeoutMs).then((value) =>
      readResult(value),
    );
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
   * 根据注册负载解析 manifest。
   * @param conn 当前连接
   * @param payload 注册负载
   * @returns 规范化后的 manifest
   */
  private resolveManifest(
    conn: PluginConnection,
    payload: ValidatedRegisterPayload,
  ): PluginManifest {
    if (!payload.manifest) {
      throw new Error('插件注册负载缺少 manifest');
    }

    return normalizePluginManifestCandidate(payload.manifest, {
      id: conn.pluginName,
      displayName: conn.pluginName,
      version: '0.0.0',
      runtimeKind: 'remote',
    });
  }

  /**
   * 读取请求 ID；缺失时记录日志。
   * @param msg 插件消息
   * @returns requestId；缺失时返回 null
   */
  private readRequestId(msg: PluginGatewayInboundMessage): string | null {
    if (typeof msg.requestId === 'string' && msg.requestId.length > 0) {
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
    this.activeRequestContexts.delete(requestId);
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
    this.activeRequestContexts.delete(requestId);
    pending.reject(new Error(error));
  }

  /**
   * 在连接断开时失败该连接下所有等待中的远程请求。
   * @param ws 断开的 WebSocket 连接
   * @param error 失败原因
   */
  private rejectPendingRequestsForSocket(ws: WebSocket, error: Error): void {
    for (const [requestId, pending] of this.pendingRequests) {
      if (pending.ws !== ws) {
        continue;
      }

      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);
      this.activeRequestContexts.delete(requestId);
      pending.reject(error);
    }
  }

  /**
   * 归一化远程插件发起的 Host API 上下文，避免插件伪造任意 user/conversation。
   * @param conn 当前远程插件连接
   * @param method Host API 方法
   * @param context 远程插件提交的上下文
   * @returns 可安全传递给 runtime 的上下文
   */
  private resolveHostCallContext(
    conn: PluginConnection,
    method: PluginHostMethod,
    context?: PluginCallContext,
  ): PluginCallContext {
    const approvedContext = this.findApprovedRequestContext(conn.ws, context);
    if (approvedContext) {
      return approvedContext;
    }

    if (isConnectionScopedHostMethod(method)) {
      return {
        source: 'plugin',
      };
    }

    throw new Error(`Host API ${method} 缺少已授权的调用上下文`);
  }

  /**
   * 查找当前连接已获授权的宿主调用上下文。
   * @param ws 当前远程插件连接
   * @param context 远程插件提交的上下文
   * @returns 命中的宿主上下文；不存在时返回 null
   */
  private findApprovedRequestContext(
    ws: WebSocket,
    context?: PluginCallContext,
  ): PluginCallContext | null {
    if (!context) {
      return null;
    }

    for (const active of this.activeRequestContexts.values()) {
      if (active.ws !== ws) {
        continue;
      }
      if (!sameAuthorizedContext(active.context, context)) {
        continue;
      }

      return clonePluginCallContext(active.context);
    }

    return null;
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
   * 发送一条协议错误消息。
   * @param ws WebSocket 连接
   * @param error 错误描述
   */
  private sendProtocolError(ws: WebSocket, error: string): void {
    this.send(ws, WS_TYPE.ERROR, PROTOCOL_ERROR_ACTION, { error });
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

const PLUGIN_INVOCATION_SOURCES: PluginCallContext['source'][] = [
  'chat-tool',
  'chat-hook',
  'cron',
  'automation',
  'http-route',
  'subagent',
  'plugin',
];

function isJsonObjectValue(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isJsonValue(entry));
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  return isJsonObjectValue(value);
}

function readUnknownObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readPluginGatewayMessage(value: unknown): PluginGatewayInboundMessage | null {
  const record = readUnknownObject(value);
  if (!record || typeof record.type !== 'string' || typeof record.action !== 'string' || !('payload' in record)) {
    return null;
  }
  if ('requestId' in record && record.requestId !== undefined && typeof record.requestId !== 'string') {
    return null;
  }

  return {
    type: record.type,
    action: record.action,
    payload: record.payload,
    ...(typeof record.requestId === 'string' ? { requestId: record.requestId } : {}),
  };
}

function readAuthPayload(payload: unknown): AuthPayload | null {
  const record = readUnknownObject(payload);
  if (
    !record
    || typeof record.token !== 'string'
    || typeof record.pluginName !== 'string'
    || typeof record.deviceType !== 'string'
  ) {
    return null;
  }

  return {
    token: record.token,
    pluginName: record.pluginName,
    deviceType: record.deviceType as DeviceType,
  };
}

function readRegisterPayload(payload: unknown): ValidatedRegisterPayload | null {
  const record = readUnknownObject(payload);
  const manifest = record && 'manifest' in record
    ? readUnknownObject(record.manifest)
    : null;
  if (!record || !manifest) {
    return null;
  }

  return {
    manifest,
  };
}

function readDataPayload(
  payload: unknown,
): HostResultPayload | null {
  const record = readUnknownObject(payload);
  if (!record || !('data' in record) || !isJsonValue(record.data)) {
    return null;
  }

  return {
    data: record.data,
  };
}

function readErrorPayload(
  payload: unknown,
): ExecuteErrorPayload | null {
  const record = readUnknownObject(payload);
  if (!record || typeof record.error !== 'string') {
    return null;
  }

  return {
    error: record.error,
  };
}

function readRouteResultPayload(payload: unknown): RouteResultPayload | null {
  const record = readUnknownObject(payload);
  if (!record) {
    return null;
  }

  const data = readPluginRouteResponse(record.data);
  if (!data) {
    return null;
  }

  return {
    data,
  };
}

function readHostCallPayload(payload: unknown): ValidatedHostCallPayload | null {
  const record = readUnknownObject(payload);
  const method = readPluginHostMethod(record?.method);
  if (
    !record
    || !method
    || !isJsonObjectValue(record.params)
  ) {
    return null;
  }

  const context = 'context' in record && record.context !== undefined
    ? readPluginCallContext(record.context)
    : undefined;
  if ('context' in record && record.context !== undefined && !context) {
    return null;
  }

  return {
    method,
    params: record.params,
    ...(context ? { context } : {}),
  };
}

function readPluginCallContext(value: unknown): PluginCallContext | null {
  const record = readUnknownObject(value);
  if (!record || !isPluginInvocationSource(record.source)) {
    return null;
  }

  const context: PluginCallContext = {
    source: record.source,
  };
  const stringKeys = [
    'userId',
    'conversationId',
    'automationId',
    'cronJobId',
    'activeProviderId',
    'activeModelId',
    'activePersonaId',
  ] as const;

  for (const key of stringKeys) {
    if (!(key in record) || record[key] === undefined) {
      continue;
    }
    if (typeof record[key] !== 'string') {
      return null;
    }
    context[key] = record[key];
  }

  if ('metadata' in record && record.metadata !== undefined) {
    if (!isJsonObjectValue(record.metadata)) {
      return null;
    }
    context.metadata = record.metadata;
  }

  return context;
}

function readPluginRouteResponse(value: unknown): PluginRouteResponse | null {
  const record = readUnknownObject(value);
  if (
    !record
    || typeof record.status !== 'number'
    || !Number.isFinite(record.status)
    || !('body' in record)
    || !isJsonValue(record.body)
  ) {
    return null;
  }

  if ('headers' in record && record.headers !== undefined && !isStringRecord(record.headers)) {
    return null;
  }

  return {
    status: record.status,
    body: record.body,
    ...(isStringRecord(record.headers) ? { headers: record.headers } : {}),
  };
}

function readPluginRouteResponseOrThrow(value: JsonValue): PluginRouteResponse {
  const response = readPluginRouteResponse(value);
  if (!response) {
    throw new Error('无效的插件 Route 返回负载');
  }

  return response;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  const record = readUnknownObject(value);
  return !!record && Object.values(record).every((entry) => typeof entry === 'string');
}

function isPluginInvocationSource(value: unknown): value is PluginCallContext['source'] {
  return typeof value === 'string'
    && (PLUGIN_INVOCATION_SOURCES as string[]).includes(value);
}

function isConnectionScopedHostMethod(method: string): method is PluginHostMethod {
  return isPluginHostMethod(method) && CONNECTION_SCOPED_HOST_METHODS.has(method);
}

function readPluginHostMethod(value: unknown): PluginHostMethod | null {
  return isPluginHostMethod(value) ? value : null;
}

function isPluginHostMethod(value: unknown): value is PluginHostMethod {
  return typeof value === 'string'
    && PLUGIN_HOST_METHODS.includes(value as PluginHostMethod);
}

/**
 * 从远程请求负载中提取插件调用上下文。
 * @param payload 任意协议负载
 * @returns 上下文；不存在时返回 undefined
 */
function extractPluginCallContext(
  payload: PluginGatewayPayload,
): PluginCallContext | undefined {
  const record = readUnknownObject(payload);
  if (!record || !('context' in record)) {
    return undefined;
  }

  return readPluginCallContext(record.context) ?? undefined;
}

/**
 * 比较两个上下文是否拥有相同的授权边界。
 * @param left 宿主下发的上下文
 * @param right 远程插件回传的上下文
 * @returns 是否属于同一授权上下文
 */
function sameAuthorizedContext(
  left: PluginCallContext,
  right: PluginCallContext,
): boolean {
  return left.source === right.source
    && left.userId === right.userId
    && left.conversationId === right.conversationId
    && left.automationId === right.automationId
    && left.cronJobId === right.cronJobId
    && left.activeProviderId === right.activeProviderId
    && left.activeModelId === right.activeModelId
    && left.activePersonaId === right.activePersonaId;
}

/**
 * 复制插件调用上下文，避免共享可变对象。
 * @param context 原始上下文
 * @returns 新的上下文副本
 */
function clonePluginCallContext(context: PluginCallContext): PluginCallContext {
  return {
    source: context.source,
    ...(context.userId ? { userId: context.userId } : {}),
    ...(context.conversationId ? { conversationId: context.conversationId } : {}),
    ...(context.automationId ? { automationId: context.automationId } : {}),
    ...(context.cronJobId ? { cronJobId: context.cronJobId } : {}),
    ...(context.activeProviderId ? { activeProviderId: context.activeProviderId } : {}),
    ...(context.activeModelId ? { activeModelId: context.activeModelId } : {}),
    ...(context.activePersonaId ? { activePersonaId: context.activePersonaId } : {}),
    ...(context.metadata ? { metadata: { ...context.metadata } } : {}),
  };
}

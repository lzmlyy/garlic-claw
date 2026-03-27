import {
  WS_ACTION,
  WS_TYPE,
  type AuthPayload,
  type ExecuteErrorPayload,
  type ExecutePayload,
  type ExecuteResultPayload,
  type PluginCapability,
  type RegisterPayload,
  type WsMessage,
} from '@garlic-claw/shared';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import { PluginService } from './plugin.service';

interface PluginConnection {
  ws: WebSocket;
  pluginName: string;
  deviceType: string;
  authenticated: boolean;
  capabilities: PluginCapability[];
}

interface PendingCommand {
  resolve: (value: JsonValue) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type PluginGatewayPayload =
  | AuthPayload
  | RegisterPayload
  | ExecutePayload
  | ExecuteResultPayload
  | ExecuteErrorPayload
  | JsonValue;

type PluginGatewayMessage = WsMessage<PluginGatewayPayload>;

@Injectable()
export class PluginGateway implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PluginGateway.name);
  private wss!: WebSocketServer;
  private connections = new Map<WebSocket, PluginConnection>();
  private pluginByName = new Map<string, PluginConnection>();
  private pendingCommands = new Map<string, PendingCommand>();
  private heartbeatInterval!: ReturnType<typeof setInterval>;

  constructor(
    private pluginService: PluginService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    // 在 NestJS HTTP 服务器启动后附加
    // 目前，在单独的端口上创建独立的 WS 服务器
    const port = this.configService.get<number>('WS_PORT', 23331);
    this.wss = new WebSocketServer({ port });
    this.logger.log(`插件 WebSocket 服务器监听端口 ${port}`);

    this.wss.on('connection', (ws: WebSocket, _req: IncomingMessage) => {
      this.handleConnection(ws);
    });

    // 每 30 秒检查心跳
    this.heartbeatInterval = setInterval(() => this.checkHeartbeats(), 30000);
  }

  onModuleDestroy() {
    clearInterval(this.heartbeatInterval);
    for (const [, pending] of this.pendingCommands) {
      clearTimeout(pending.timer);
      pending.reject(new Error('服务器关闭'));
    }
    this.wss?.close();
  }

  private handleConnection(ws: WebSocket) {
    const conn: PluginConnection = {
      ws,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      capabilities: [],
    };
    this.connections.set(ws, conn);

    // 必须在 10 秒内完成认证
    const authTimeout = setTimeout(() => {
      if (!conn.authenticated) {
        this.send(ws, WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '认证超时' });
        ws.close();
      }
    }, 10000);

    ws.on('message', (raw: Buffer) => {
      try {
        const msg: PluginGatewayMessage = JSON.parse(raw.toString());
        this.handleMessage(ws, conn, msg);
      } catch {
        this.send(ws, WS_TYPE.ERROR, 'parse_error', { error: '无效的 JSON' });
      }
    });

    ws.on('close', () => {
      clearTimeout(authTimeout);
      this.handleDisconnect(conn);
    });

    ws.on('error', (err) => {
      this.logger.error(`来自 "${conn.pluginName}" 的 WS 错误：${err.message}`);
    });
  }

  private async handleMessage(
    ws: WebSocket,
    conn: PluginConnection,
    msg: PluginGatewayMessage,
  ) {
    // 必须先认证
    if (!conn.authenticated && !(msg.type === WS_TYPE.AUTH && msg.action === WS_ACTION.AUTHENTICATE)) {
      this.send(ws, WS_TYPE.ERROR, WS_ACTION.AUTH_FAIL, { error: '未认证' });
      return;
    }

    switch (msg.type) {
      case WS_TYPE.AUTH:
        if (msg.action === WS_ACTION.AUTHENTICATE) {
          await this.handleAuth(ws, conn, msg.payload as AuthPayload);
        }
        break;

      case WS_TYPE.PLUGIN:
        if (msg.action === WS_ACTION.REGISTER) {
          await this.handleRegister(ws, conn, msg.payload as RegisterPayload);
        }
        break;

      case WS_TYPE.COMMAND:
        if (msg.action === WS_ACTION.EXECUTE_RESULT) {
          const requestId = this.readRequestId(msg);
          if (requestId) {
            this.handleExecuteResult(requestId, msg.payload as ExecuteResultPayload);
          }
        } else if (msg.action === WS_ACTION.EXECUTE_ERROR) {
          const requestId = this.readRequestId(msg);
          if (requestId) {
            this.handleExecuteError(requestId, msg.payload as ExecuteErrorPayload);
          }
        }
        break;

      case WS_TYPE.HEARTBEAT:
        if (msg.action === WS_ACTION.PING) {
          this.send(ws, WS_TYPE.HEARTBEAT, WS_ACTION.PONG, {});
          if (conn.pluginName) {
            this.pluginService.heartbeat(conn.pluginName).catch(() => {});
          }
        }
        break;
    }
  }

  private async handleAuth(ws: WebSocket, conn: PluginConnection, payload: AuthPayload) {
    try {
      const secret = this.configService.get<string>('JWT_SECRET', 'fallback-secret');
      this.jwtService.verify(payload.token, { secret });
      conn.authenticated = true;
      conn.pluginName = payload.pluginName;
      conn.deviceType = payload.deviceType;
      this.pluginByName.set(payload.pluginName, conn);
      this.send(ws, WS_TYPE.AUTH, WS_ACTION.AUTH_OK, {});
      this.logger.log(`Plugin "${payload.pluginName}" authenticated`);
    } catch {
      this.send(ws, WS_TYPE.AUTH, WS_ACTION.AUTH_FAIL, { error: 'Invalid token' });
      ws.close();
    }
  }

  private async handleRegister(ws: WebSocket, conn: PluginConnection, payload: RegisterPayload) {
    conn.capabilities = payload.capabilities;
    await this.pluginService.registerPlugin(
      conn.pluginName,
      conn.deviceType,
      payload.capabilities,
    );
    this.send(ws, WS_TYPE.PLUGIN, WS_ACTION.REGISTER_OK, {});
  }

  private handleExecuteResult(requestId: string, payload: ExecuteResultPayload) {
    const pending = this.pendingCommands.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingCommands.delete(requestId);
      pending.resolve(toJsonValue(payload.data));
    }
  }

  private handleExecuteError(requestId: string, payload: ExecuteErrorPayload) {
    const pending = this.pendingCommands.get(requestId);
    if (pending) {
      clearTimeout(pending.timer);
      this.pendingCommands.delete(requestId);
      pending.reject(new Error(payload.error));
    }
  }

  /**
   * 读取插件回包中的 requestId。
   * @param msg 插件消息
   * @returns requestId；缺失时返回 null 并记录日志
   */
  private readRequestId(msg: PluginGatewayMessage): string | null {
    if (msg.requestId) {
      return msg.requestId;
    }

    this.logger.warn(`收到缺少 requestId 的插件消息: ${msg.type}/${msg.action}`);
    return null;
  }

  private async handleDisconnect(conn: PluginConnection) {
    this.connections.delete(conn.ws);
    if (conn.pluginName) {
      this.pluginByName.delete(conn.pluginName);
      try {
        await this.pluginService.setOffline(conn.pluginName);
      } catch { /* 插件可能在数据库中不存在 */ }
      this.logger.log(`插件 "${conn.pluginName}" 已断开连接`);
    }
  }

  /**
   * 在连接的插件上执行命令。
   * 返回一个 Promise，在成功时解析结果，超时时拒绝。
   */
  async executeCommand(
    pluginName: string,
    capability: string,
    params: JsonObject,
    timeoutMs = 30000,
  ): Promise<JsonValue> {
    const conn = this.pluginByName.get(pluginName);
    if (!conn || conn.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`插件 "${pluginName}" 未连接`);
    }

    const requestId = crypto.randomUUID();

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(requestId);
        reject(new Error(`命令 "${pluginName}:${capability}" 超时`));
      }, timeoutMs);

      this.pendingCommands.set(requestId, { resolve, reject, timer });

      const payload: ExecutePayload = { capability, params };
      this.send(conn.ws, WS_TYPE.COMMAND, WS_ACTION.EXECUTE, payload, requestId);
    });
  }

  /** 获取已连接的插件名称列表 */
  getConnectedPlugins(): string[] {
    return [...this.pluginByName.keys()];
  }

  /** 获取插件的能力 */
  getPluginCapabilities(pluginName: string): PluginCapability[] {
    return this.pluginByName.get(pluginName)?.capabilities ?? [];
  }

  /** 获取所有已连接插件的全部能力 */
  getAllCapabilities(): Map<string, PluginCapability[]> {
    const map = new Map<string, PluginCapability[]>();
    for (const [name, conn] of this.pluginByName) {
      if (conn.capabilities.length) {
        map.set(name, conn.capabilities);
      }
    }
    return map;
  }

  private checkHeartbeats() {
    // 如果 60 秒内未收到心跳，则将插件标记为离线
    // （实际心跳由客户端发起）
  }

  private send(
    ws: WebSocket,
    type: string,
    action: string,
    payload: PluginGatewayPayload,
    requestId?: string,
  ) {
    if (ws.readyState === WebSocket.OPEN) {
      const msg: PluginGatewayMessage = { type, action, payload, requestId };
      ws.send(JSON.stringify(msg));
    }
  }
}

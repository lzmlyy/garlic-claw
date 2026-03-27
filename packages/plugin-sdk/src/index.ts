import {
  type AuthPayload,
  WS_ACTION,
  WS_TYPE,
  type DeviceType,
  type ExecuteErrorPayload,
  type ExecutePayload,
  type ExecuteResultPayload,
  type JsonObject,
  type JsonValue,
  type PluginCapability,
  type RegisterPayload,
  type WsMessage,
} from '@garlic-claw/shared';
import WebSocket from 'ws';

export interface PluginClientOptions {
  /** WebSocket 服务器地址，例如 ws://localhost:23331 */
  serverUrl: string;
  /** 用于认证的 JWT 令牌 */
  token: string;
  /** 此插件实例的唯一名称 */
  pluginName: string;
  /** 设备类型 */
  deviceType: DeviceType;
  /** 此插件暴露的能力列表 */
  capabilities: PluginCapability[];
  /** 断开时自动重连（默认：true） */
  autoReconnect?: boolean;
  /** 重连间隔（毫秒，默认：5000） */
  reconnectInterval?: number;
  /** 心跳间隔（毫秒，默认：20000） */
  heartbeatInterval?: number;
}

type CommandHandler = (
  params: JsonObject,
) => Promise<JsonValue> | JsonValue;

type PluginClientPayload =
  | AuthPayload
  | RegisterPayload
  | ExecutePayload
  | ExecuteResultPayload
  | ExecuteErrorPayload
  | JsonValue;

/**
 * 输出插件 SDK 的普通运行日志。
 * @param message 完整日志文本
 * @returns 无返回值
 */
function writePluginSdkLog(message: string): void {
  process.stdout.write(`${message}\n`);
}

export class PluginClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, CommandHandler>();
  private connected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private options: Required<PluginClientOptions>;

  constructor(options: PluginClientOptions) {
    this.options = {
      autoReconnect: true,
      reconnectInterval: 5000,
      heartbeatInterval: 20000,
      ...options,
    };
  }

  /** 注册能力处理器 */
  onCommand(capabilityName: string, handler: CommandHandler) {
    this.handlers.set(capabilityName, handler);
    return this;
  }

  /** 连接到服务器 */
  connect() {
    if (this.ws) {
      return;
    }

    this.ws = new WebSocket(this.options.serverUrl);

    this.ws.on('open', () => {
      writePluginSdkLog(`[plugin-sdk] 已连接到 ${this.options.serverUrl}`);
      this.authenticate();
    });

    this.ws.on('message', (raw: Buffer) => {
      try {
        const msg: WsMessage<PluginClientPayload> = JSON.parse(raw.toString());
        this.handleMessage(msg);
      } catch (e) {
        console.error('[plugin-sdk] 消息解析失败:', e);
      }
    });

    this.ws.on('close', () => {
      writePluginSdkLog('[plugin-sdk] 已断开连接');
      this.connected = false;
      this.stopHeartbeat();
      if (this.options.autoReconnect) {
        this.scheduleReconnect();
      }
    });

    this.ws.on('error', (err) => {
      console.error('[plugin-sdk] WebSocket 错误:', err.message);
    });
  }

  /** 断开连接 */
  disconnect() {
    this.options.autoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.ws?.close();
    this.ws = null;
  }

  private authenticate() {
    this.send(WS_TYPE.AUTH, WS_ACTION.AUTHENTICATE, {
      token: this.options.token,
      pluginName: this.options.pluginName,
      deviceType: this.options.deviceType,
    });
  }

  private registerCapabilities() {
    this.send(WS_TYPE.PLUGIN, WS_ACTION.REGISTER, {
      capabilities: this.options.capabilities,
    });
  }

  private handleMessage(msg: WsMessage<PluginClientPayload>) {
    switch (msg.type) {
      case WS_TYPE.AUTH:
        if (msg.action === WS_ACTION.AUTH_OK) {
          writePluginSdkLog('[plugin-sdk] 认证通过');
          this.connected = true;
          this.registerCapabilities();
          this.startHeartbeat();
        } else if (msg.action === WS_ACTION.AUTH_FAIL) {
          console.error('[plugin-sdk] 认证失败:', (msg.payload as { error?: string }).error);
          this.options.autoReconnect = false;
          this.ws?.close();
        }
        break;

      case WS_TYPE.PLUGIN:
        if (msg.action === WS_ACTION.REGISTER_OK) {
          writePluginSdkLog('[plugin-sdk] 能力已注册');
        }
        break;

      case WS_TYPE.COMMAND:
        if (msg.action === WS_ACTION.EXECUTE) {
          this.handleExecute(msg);
        }
        break;

      case WS_TYPE.HEARTBEAT:
        // 收到 pong，无需处理
        break;
    }
  }

  private async handleExecute(msg: WsMessage<PluginClientPayload>) {
    const payload = msg.payload as ExecutePayload;
    const handler = this.handlers.get(payload.capability);

    if (!handler) {
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_ERROR,
        { error: `未知能力：${payload.capability}` },
        msg.requestId,
      );
      return;
    }

    try {
      const result = await handler(payload.params);
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_RESULT,
        { data: result },
        msg.requestId,
      );
    } catch (err) {
      this.send(
        WS_TYPE.COMMAND,
        WS_ACTION.EXECUTE_ERROR,
        { error: err instanceof Error ? err.message : String(err) },
        msg.requestId,
      );
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send(WS_TYPE.HEARTBEAT, WS_ACTION.PING, {});
    }, this.options.heartbeatInterval);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    writePluginSdkLog(
      `[plugin-sdk] 将在 ${this.options.reconnectInterval}ms 后重连...`,
    );
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ws = null;
      this.connect();
    }, this.options.reconnectInterval);
  }

  private send(
    type: string,
    action: string,
    payload: PluginClientPayload,
    requestId?: string,
  ) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg: WsMessage<PluginClientPayload> = { type, action, payload, requestId };
      this.ws.send(JSON.stringify(msg));
    }
  }
}

export { DeviceType, type PluginCapability } from '@garlic-claw/shared';


import type { JsonObject, JsonValue } from './json';

/** WebSocket 消息信封 */
export interface WsMessage<T = JsonValue> {
  type: string;
  action: string;
  payload: T;
  requestId?: string;
}

// ---- WebSocket 消息类型 (type 字段) ----
export const WS_TYPE = {
  AUTH: 'auth',
  PLUGIN: 'plugin',
  COMMAND: 'command',
  HEARTBEAT: 'heartbeat',
  ERROR: 'error',
} as const;

// ---- WebSocket 动作 (action 字段) ----
export const WS_ACTION = {
  // 认证
  AUTHENTICATE: 'authenticate',
  AUTH_OK: 'auth_ok',
  AUTH_FAIL: 'auth_fail',
  // 插件生命周期
  REGISTER: 'register',
  REGISTER_OK: 'register_ok',
  UNREGISTER: 'unregister',
  STATUS: 'status',
  // 命令 (AI → 插件)
  EXECUTE: 'execute',
  EXECUTE_RESULT: 'execute_result',
  EXECUTE_ERROR: 'execute_error',
  // 心跳
  PING: 'ping',
  PONG: 'pong',
} as const;

// ---- 负载类型 ----
export interface AuthPayload {
  token: string;
  pluginName: string;
  deviceType: DeviceType;
}

export interface RegisterPayload {
  capabilities: PluginCapability[];
}

export interface ExecutePayload {
  capability: string;
  params: JsonObject;
}

export interface ExecuteResultPayload {
  data: JsonValue;
}

export interface ExecuteErrorPayload {
  error: string;
}

/** 插件能力描述符 */
export interface PluginCapability {
  name: string;
  description: string;
  parameters: Record<string, PluginParamSchema>;
}

/** 插件/设备信息 */
export interface PluginInfo {
  id: string;
  name: string;
  deviceType: string;
  status: string;
  capabilities: PluginCapability[];
  connected: boolean;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PluginParamSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
}

export enum PluginStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  ERROR = 'error',
}

export enum DeviceType {
  PC = 'pc',
  MOBILE = 'mobile',
  IOT = 'iot',
  API = 'api',
}

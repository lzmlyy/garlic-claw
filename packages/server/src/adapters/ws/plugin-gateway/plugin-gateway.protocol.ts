import {
  type AuthPayload,
  type HostCallPayload,
  type JsonObject,
  type JsonValue,
  type PluginRouteResponse,
  type RegisterPayload,
  type WsMessage,
} from '@garlic-claw/shared';
import { WS_ACTION, WS_TYPE } from './plugin-gateway.constants';

export interface PluginGatewayInboundResult {
  flushOutbound?: boolean;
  reply?: WsMessage;
}

export function createWsReply(
  type: WsMessage['type'],
  action: WsMessage['action'],
  payload: JsonValue,
  requestId?: string,
): WsMessage {
  return {
    action,
    payload,
    ...(requestId ? { requestId } : {}),
    type,
  };
}

export function readAuthPayload(value: unknown): AuthPayload {
  const invalidMessage = '无效的认证负载';
  const record = readRecord(value, invalidMessage);
  if (
    typeof record.token !== 'string'
    || typeof record.pluginName !== 'string'
    || typeof record.deviceType !== 'string'
  ) {
    throw new Error(invalidMessage);
  }
  return record as unknown as AuthPayload;
}

export function readHostCallPayload(value: unknown): HostCallPayload {
  const record = readRecord(value, '无效的 Host API 调用负载');
  if (typeof record.method !== 'string' || !isRecord(record.params)) {
    throw new Error('无效的 Host API 调用负载');
  }
  return {
    ...(record.context ? { context: record.context as HostCallPayload['context'] } : {}),
    method: record.method as HostCallPayload['method'],
    params: record.params as JsonObject,
  };
}

export function readRegisterPayload(value: unknown): RegisterPayload {
  return {
    manifest: readPayloadField(value, 'manifest', '无效的插件注册负载', isRecord) as unknown as RegisterPayload['manifest'],
  };
}

export function readWsMessage(raw: string): WsMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('无效的 JSON');
  }
  if (!isRecord(parsed) || !('type' in parsed) || !('action' in parsed) || !('payload' in parsed)) {
    throw new Error('无效的插件协议消息');
  }
  return parsed as unknown as WsMessage;
}

export function readRemoteSettlement(message: WsMessage):
  | { missingRequestId: true }
  | { settlement: { error?: string; requestId: string; result?: JsonValue } }
  | null {
  const settleConfig = REMOTE_MESSAGE_SETTLERS[`${message.type}:${message.action}`];
  if (!settleConfig) {return null;}
  if (typeof message.requestId !== 'string' || message.requestId.length === 0) {
    return { missingRequestId: true };
  }
  try {
    return { settlement: { requestId: message.requestId, ...settleConfig.readPayload(message.payload) } };
  } catch {
    return { settlement: { error: settleConfig.invalidPayloadMessage, requestId: message.requestId } };
  }
}

const readRemoteResultPayload = (readValue: (value: unknown) => JsonValue) =>
  (payload: unknown) => ({ result: readValue(payload) });

const readRemoteErrorPayload = (payload: unknown) => ({ error: readErrorPayload(payload) });

const REMOTE_MESSAGE_SETTLERS: Record<string, {
  invalidPayloadMessage: string;
  readPayload(value: unknown): { error?: string; result?: JsonValue };
}> = {
  [`${WS_TYPE.COMMAND}:${WS_ACTION.EXECUTE_RESULT}`]: { invalidPayloadMessage: '无效的远程命令返回负载', readPayload: readRemoteResultPayload(readDataPayload) },
  [`${WS_TYPE.COMMAND}:${WS_ACTION.EXECUTE_ERROR}`]: { invalidPayloadMessage: '无效的远程命令错误负载', readPayload: readRemoteErrorPayload },
  [`${WS_TYPE.PLUGIN}:${WS_ACTION.HOOK_RESULT}`]: { invalidPayloadMessage: '无效的 Hook 返回负载', readPayload: readRemoteResultPayload(readDataPayload) },
  [`${WS_TYPE.PLUGIN}:${WS_ACTION.ROUTE_RESULT}`]: { invalidPayloadMessage: '无效的插件 Route 返回负载', readPayload: readRemoteResultPayload((payload) => readRouteResultPayload(payload) as unknown as JsonValue) },
  [`${WS_TYPE.PLUGIN}:${WS_ACTION.HOOK_ERROR}`]: { invalidPayloadMessage: '无效的 Hook 错误负载', readPayload: readRemoteErrorPayload },
  [`${WS_TYPE.PLUGIN}:${WS_ACTION.ROUTE_ERROR}`]: { invalidPayloadMessage: '无效的插件 Route 错误负载', readPayload: readRemoteErrorPayload },
};

function readDataPayload(value: unknown): JsonValue {
  return readPayloadField(value, 'data', '无效的返回负载') as JsonValue;
}

function readErrorPayload(value: unknown): string {
  return readPayloadField(value, 'error', '无效的错误负载', (entry): entry is string => typeof entry === 'string');
}

function readRouteResultPayload(value: unknown): PluginRouteResponse {
  const record = readRecord(value, '无效的 Route 返回负载');
  const data = record.data;
  if (!isRecord(data) || typeof data.status !== 'number' || !Number.isFinite(data.status) || !('body' in data)) {
    throw new Error('无效的 Route 返回负载');
  }
  if (data.headers !== undefined && !isStringRecord(data.headers)) {
    throw new Error('无效的 Route 返回负载');
  }
  return {
    body: data.body as JsonValue,
    ...(isStringRecord(data.headers) ? { headers: data.headers } : {}),
    status: data.status,
  };
}

function readRecord(value: unknown, invalidMessage: string): Record<string, unknown> {
  if (!isRecord(value)) {throw new Error(invalidMessage);}
  return value;
}

function readPayloadField<T>(
  value: unknown,
  field: string,
  invalidMessage: string,
  validate?: (entry: unknown) => entry is T,
): T {
  const record = readRecord(value, invalidMessage);
  if (!(field in record) || (validate && !validate(record[field]))) {throw new Error(invalidMessage);}
  return record[field] as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === 'string');
}

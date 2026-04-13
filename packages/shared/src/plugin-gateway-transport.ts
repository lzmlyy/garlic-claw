import type {
  AuthPayload,
  ExecuteErrorPayload,
  ExecutePayload,
  ExecuteResultPayload,
  HookInvokePayload,
  HookResultPayload,
  PluginCallContext,
  RegisterPayload,
  WsMessage,
} from './types/plugin';
import type { HostCallPayload, HostResultPayload } from './types/plugin-host';
import type { RouteInvokePayload, RouteResultPayload } from './types/plugin-route';
import type { JsonValue } from './types/json';
import { uuidv7 } from './uuid';

const OPEN_SOCKET_READY_STATE = 1;

export interface PluginGatewaySocketRef {
  readyState: number;
  send(data: string): void;
  close(): void;
}

export interface PendingRequest {
  resolve: (value: JsonValue) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  socket: PluginGatewaySocketRef;
}

export interface ActiveRequestContext {
  socket: PluginGatewaySocketRef;
  context: PluginCallContext;
}

export type PluginGatewayPayload =
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

interface PluginGatewayResultPayload {
  data: JsonValue;
}

interface PluginGatewayErrorPayload {
  error: string;
}

interface PluginGatewayDispatchInput<TPayload> {
  msg: {
    requestId?: unknown;
    type: string;
    action: string;
  };
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  loggerWarn?: (message: string) => void;
  invalidPayloadMessage: string;
  readPayload: (payload: unknown) => TPayload | null;
}

export function sendPluginGatewayRequest(input: {
  socket: PluginGatewaySocketRef;
  type: string;
  action: string;
  payload: PluginGatewayPayload;
  timeoutMs?: number;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  extractContext?: (payload: PluginGatewayPayload) => PluginCallContext | undefined;
  cloneContext: (context: PluginCallContext) => PluginCallContext;
}): Promise<JsonValue> {
  if (input.socket.readyState !== OPEN_SOCKET_READY_STATE) {
    return Promise.reject(new Error('插件连接不可用'));
  }

  const requestId = uuidv7();
  const activeContext = input.extractContext?.(input.payload);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      input.pendingRequests.delete(requestId);
      input.activeRequestContexts.delete(requestId);
      reject(new Error(`插件请求超时: ${input.action}`));
    }, input.timeoutMs ?? 30000);

    input.pendingRequests.set(requestId, {
      resolve,
      reject,
      timer,
      socket: input.socket,
    });
    if (activeContext) {
      input.activeRequestContexts.set(requestId, {
        socket: input.socket,
        context: input.cloneContext(activeContext),
      });
    }
    sendPluginGatewayMessage({
      socket: input.socket,
      type: input.type,
      action: input.action,
      payload: input.payload,
      requestId,
    });
  });
}

export function sendTypedPluginGatewayRequest<T>(input: {
  socket: PluginGatewaySocketRef;
  type: string;
  action: string;
  payload: PluginGatewayPayload;
  timeoutMs?: number;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  extractContext?: (payload: PluginGatewayPayload) => PluginCallContext | undefined;
  cloneContext: (context: PluginCallContext) => PluginCallContext;
  readResult: (value: JsonValue) => T;
}): Promise<T> {
  return sendPluginGatewayRequest({
    socket: input.socket,
    type: input.type,
    action: input.action,
    payload: input.payload,
    timeoutMs: input.timeoutMs,
    pendingRequests: input.pendingRequests,
    activeRequestContexts: input.activeRequestContexts,
    extractContext: input.extractContext,
    cloneContext: input.cloneContext,
  }).then((value) => input.readResult(value));
}

export function readPluginGatewayTimeoutMs(
  context: PluginCallContext | undefined,
  fallback: number,
): number {
  const raw = context?.metadata?.timeoutMs;
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
    return fallback;
  }

  return raw;
}

export function readPluginGatewayRequestId(input: {
  msg: {
    requestId?: unknown;
    type: string;
    action: string;
  };
  onMissing?: (message: string) => void;
}): string | null {
  if (typeof input.msg.requestId === 'string' && input.msg.requestId.length > 0) {
    return input.msg.requestId;
  }

  input.onMissing?.(`收到缺少 requestId 的插件消息: ${input.msg.type}/${input.msg.action}`);
  return null;
}

export function resolvePluginGatewayPendingRequest(input: {
  requestId: string | null;
  data: JsonValue;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
}): void {
  if (!input.requestId) {
    return;
  }

  const pending = input.pendingRequests.get(input.requestId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timer);
  input.pendingRequests.delete(input.requestId);
  input.activeRequestContexts.delete(input.requestId);
  pending.resolve(input.data);
}

export function rejectPluginGatewayPendingRequest(input: {
  requestId: string | null;
  error: string;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
}): void {
  if (!input.requestId) {
    return;
  }

  const pending = input.pendingRequests.get(input.requestId);
  if (!pending) {
    return;
  }

  clearTimeout(pending.timer);
  input.pendingRequests.delete(input.requestId);
  input.activeRequestContexts.delete(input.requestId);
  pending.reject(new Error(input.error));
}

export function rejectPluginGatewayPendingRequestsForSocket(input: {
  socket: PluginGatewaySocketRef;
  error: Error;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
}): void {
  for (const [requestId, pending] of input.pendingRequests) {
    if (pending.socket !== input.socket) {
      continue;
    }

    clearTimeout(pending.timer);
    input.pendingRequests.delete(requestId);
    input.activeRequestContexts.delete(requestId);
    pending.reject(input.error);
  }
}

export function sendPluginGatewayMessage(input: {
  socket: PluginGatewaySocketRef;
  type: string;
  action: string;
  payload: PluginGatewayPayload;
  requestId?: string;
}): void {
  if (input.socket.readyState !== OPEN_SOCKET_READY_STATE) {
    return;
  }

  const message: PluginGatewayMessage = {
    type: input.type,
    action: input.action,
    payload: input.payload,
    requestId: input.requestId,
  };
  input.socket.send(JSON.stringify(message));
}

export function sendPluginGatewayProtocolError(input: {
  socket: PluginGatewaySocketRef;
  error: string;
  protocolErrorAction: string;
}): void {
  sendPluginGatewayMessage({
    socket: input.socket,
    type: 'error',
    action: input.protocolErrorAction,
    payload: { error: input.error },
  });
}

export function handlePluginGatewayResultMessage(
  input: PluginGatewayDispatchInput<PluginGatewayResultPayload>,
  rawPayload: unknown,
): void {
  const requestId = readPluginGatewayRequestId({
    msg: input.msg,
    onMissing: input.loggerWarn,
  });
  const payload = input.readPayload(rawPayload);
  if (!payload) {
    rejectPluginGatewayPendingRequest({
      requestId,
      error: input.invalidPayloadMessage,
      pendingRequests: input.pendingRequests,
      activeRequestContexts: input.activeRequestContexts,
    });
    return;
  }

  resolvePluginGatewayPendingRequest({
    requestId,
    data: payload.data,
    pendingRequests: input.pendingRequests,
    activeRequestContexts: input.activeRequestContexts,
  });
}

export function handlePluginGatewayErrorMessage(
  input: PluginGatewayDispatchInput<PluginGatewayErrorPayload>,
  rawPayload: unknown,
): void {
  const requestId = readPluginGatewayRequestId({
    msg: input.msg,
    onMissing: input.loggerWarn,
  });
  const payload = input.readPayload(rawPayload);
  if (!payload) {
    rejectPluginGatewayPendingRequest({
      requestId,
      error: input.invalidPayloadMessage,
      pendingRequests: input.pendingRequests,
      activeRequestContexts: input.activeRequestContexts,
    });
    return;
  }

  rejectPluginGatewayPendingRequest({
    requestId,
    error: payload.error,
    pendingRequests: input.pendingRequests,
    activeRequestContexts: input.activeRequestContexts,
  });
}

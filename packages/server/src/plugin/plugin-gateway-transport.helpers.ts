import type {
  AuthPayload,
  ExecuteErrorPayload,
  ExecutePayload,
  ExecuteResultPayload,
  HookInvokePayload,
  HookResultPayload,
  HostCallPayload,
  HostResultPayload,
  JsonValue,
  PluginCallContext,
  RegisterPayload,
  RouteInvokePayload,
  RouteResultPayload,
  WsMessage,
} from '@garlic-claw/shared';
import { WebSocket } from 'ws';

export interface PendingRequest {
  /** 成功回调。 */
  resolve: (value: JsonValue) => void;
  /** 失败回调。 */
  reject: (reason: Error) => void;
  /** 超时计时器。 */
  timer: ReturnType<typeof setTimeout>;
  /** 请求所属的 WebSocket 连接。 */
  ws: WebSocket;
}

export interface ActiveRequestContext {
  /** 请求所属的 WebSocket 连接。 */
  ws: WebSocket;
  /** 由宿主发出的上下文快照。 */
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

export function sendPluginGatewayRequest(input: {
  ws: WebSocket;
  type: string;
  action: string;
  payload: PluginGatewayPayload;
  timeoutMs?: number;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
  extractContext?: (payload: PluginGatewayPayload) => PluginCallContext | undefined;
  cloneContext: (context: PluginCallContext) => PluginCallContext;
}): Promise<JsonValue> {
  if (input.ws.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error('插件连接不可用'));
  }

  const requestId = crypto.randomUUID();
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
      ws: input.ws,
    });
    if (activeContext) {
      input.activeRequestContexts.set(requestId, {
        ws: input.ws,
        context: input.cloneContext(activeContext),
      });
    }
    sendPluginGatewayMessage({
      ws: input.ws,
      type: input.type,
      action: input.action,
      payload: input.payload,
      requestId,
    });
  });
}

export function sendTypedPluginGatewayRequest<T>(input: {
  ws: WebSocket;
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
    ws: input.ws,
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
  ws: WebSocket;
  error: Error;
  pendingRequests: Map<string, PendingRequest>;
  activeRequestContexts: Map<string, ActiveRequestContext>;
}): void {
  for (const [requestId, pending] of input.pendingRequests) {
    if (pending.ws !== input.ws) {
      continue;
    }

    clearTimeout(pending.timer);
    input.pendingRequests.delete(requestId);
    input.activeRequestContexts.delete(requestId);
    pending.reject(input.error);
  }
}

export function sendPluginGatewayMessage(input: {
  ws: WebSocket;
  type: string;
  action: string;
  payload: PluginGatewayPayload;
  requestId?: string;
}): void {
  if (input.ws.readyState !== WebSocket.OPEN) {
    return;
  }

  const message: PluginGatewayMessage = {
    type: input.type,
    action: input.action,
    payload: input.payload,
    requestId: input.requestId,
  };
  input.ws.send(JSON.stringify(message));
}

export function sendPluginGatewayProtocolError(input: {
  ws: WebSocket;
  error: string;
  protocolErrorAction: string;
}): void {
  sendPluginGatewayMessage({
    ws: input.ws,
    type: 'error',
    action: input.protocolErrorAction,
    payload: { error: input.error },
  });
}

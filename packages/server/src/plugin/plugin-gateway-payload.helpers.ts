import type {
  AuthPayload,
  DeviceType,
  ExecuteErrorPayload,
  HostResultPayload,
  JsonValue,
  PluginCallContext,
  PluginHostMethod,
  PluginRouteResponse,
  RouteResultPayload,
  WsMessage,
} from '@garlic-claw/shared';
import type { JsonObject } from '../common/types/json-value';

export interface ValidatedRegisterPayload {
  manifest: Record<string, unknown>;
}

export interface ValidatedHostCallPayload {
  method: PluginHostMethod;
  params: JsonObject;
  context?: PluginCallContext;
}

export type PluginGatewayInboundMessage = WsMessage<unknown>;

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

const PLUGIN_INVOCATION_SOURCES: PluginCallContext['source'][] = [
  'chat-tool',
  'chat-hook',
  'cron',
  'automation',
  'http-route',
  'subagent',
  'plugin',
];

export function isJsonObjectValue(value: unknown): value is JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => isJsonValue(entry));
}

export function isJsonValue(value: unknown): value is JsonValue {
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

export function readUnknownObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function readPluginGatewayMessage(
  value: unknown,
): PluginGatewayInboundMessage | null {
  const record = readUnknownObject(value);
  if (
    !record
    || typeof record.type !== 'string'
    || typeof record.action !== 'string'
    || !('payload' in record)
  ) {
    return null;
  }
  if (
    'requestId' in record
    && record.requestId !== undefined
    && typeof record.requestId !== 'string'
  ) {
    return null;
  }

  return {
    type: record.type,
    action: record.action,
    payload: record.payload,
    ...(typeof record.requestId === 'string' ? { requestId: record.requestId } : {}),
  };
}

export function readAuthPayload(payload: unknown): AuthPayload | null {
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

export function readRegisterPayload(
  payload: unknown,
): ValidatedRegisterPayload | null {
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

export function readDataPayload(
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

export function readErrorPayload(
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

export function readRouteResultPayload(
  payload: unknown,
): RouteResultPayload | null {
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

export function readHostCallPayload(
  payload: unknown,
): ValidatedHostCallPayload | null {
  const record = readUnknownObject(payload);
  const method = readPluginHostMethod(record?.method);
  if (!record || !method || !isJsonObjectValue(record.params)) {
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

export function readPluginCallContext(
  value: unknown,
): PluginCallContext | null {
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

export function readPluginRouteResponse(
  value: unknown,
): PluginRouteResponse | null {
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

  if (
    'headers' in record
    && record.headers !== undefined
    && !isStringRecord(record.headers)
  ) {
    return null;
  }

  return {
    status: record.status,
    body: record.body,
    ...(isStringRecord(record.headers) ? { headers: record.headers } : {}),
  };
}

export function readPluginRouteResponseOrThrow(
  value: JsonValue,
): PluginRouteResponse {
  const response = readPluginRouteResponse(value);
  if (!response) {
    throw new Error('无效的插件 Route 返回负载');
  }

  return response;
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  const record = readUnknownObject(value);
  return !!record && Object.values(record).every((entry) => typeof entry === 'string');
}

export function isPluginInvocationSource(
  value: unknown,
): value is PluginCallContext['source'] {
  return typeof value === 'string'
    && (PLUGIN_INVOCATION_SOURCES as string[]).includes(value);
}

export function isConnectionScopedHostMethod(
  method: string,
): method is PluginHostMethod {
  return isPluginHostMethod(method) && CONNECTION_SCOPED_HOST_METHODS.has(method);
}

export function readPluginHostMethod(value: unknown): PluginHostMethod | null {
  return isPluginHostMethod(value) ? value : null;
}

export function isPluginHostMethod(value: unknown): value is PluginHostMethod {
  return typeof value === 'string'
    && PLUGIN_HOST_METHODS.includes(value as PluginHostMethod);
}

/**
 * 从远程请求负载中提取插件调用上下文。
 * @param payload 任意协议负载
 * @returns 上下文；不存在时返回 undefined
 */
export function extractPluginCallContext(
  payload: unknown,
): PluginCallContext | undefined {
  const record = readUnknownObject(payload);
  if (!record || !('context' in record)) {
    return undefined;
  }

  return readPluginCallContext(record.context) ?? undefined;
}

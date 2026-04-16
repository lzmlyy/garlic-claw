import {
  type JsonObject,
  type JsonValue,
  type ListPluginEventOptions,
  type PluginCallContext,
  type PluginRouteRequest,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PLUGIN_ROUTE_METHOD_VALUES } from './plugin-route.constants';

const BLOCKED_PLUGIN_REQUEST_HEADERS = new Set(['authorization', 'cookie']);
const BLOCKED_PLUGIN_RESPONSE_HEADERS = new Set(['connection', 'content-length', 'set-cookie', 'transfer-encoding']);

export function readOptionalQueryString(req: Request, key: string): string | null {
  const value = req.query?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function readRequestUserId(req: Request, errorMessage = '缺少当前用户'): string {
  const user = (req as Request & { user?: { id?: unknown } }).user;
  if (typeof user?.id === 'string' && user.id.trim()) {return user.id;}
  throw new BadRequestException(errorMessage);
}

export function readPluginEventQuery(raw: {
  cursor?: string;
  keyword?: string;
  level?: string;
  limit?: string;
  type?: string;
}): ListPluginEventOptions {
  const limit = raw.limit ? Number(raw.limit) : undefined;
  if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {throw new BadRequestException('limit 必须是正整数');}
  if (raw.level && !['info', 'warn', 'error'].includes(raw.level)) {throw new BadRequestException('level 必须是 info / warn / error');}
  return { ...(limit !== undefined ? { limit } : {}), ...(raw.level ? { level: raw.level as ListPluginEventOptions['level'] } : {}), ...(raw.type?.trim() ? { type: raw.type.trim() } : {}), ...(raw.keyword?.trim() ? { keyword: raw.keyword.trim() } : {}), ...(raw.cursor?.trim() ? { cursor: raw.cursor.trim() } : {}) };
}

export function readPluginRouteInvocation(
  req: Request,
  query: Record<string, unknown>,
): { context: PluginCallContext; request: PluginRouteRequest } {
  const method = req.method;
  const namedPath = req.params?.path;
  const bodyConversationId = typeof req.body === 'object' && req.body !== null && !Array.isArray(req.body) ? (req.body as Record<string, unknown>).conversationId : undefined;
  const conversationId = typeof query.conversationId === 'string' ? query.conversationId : typeof bodyConversationId === 'string' ? bodyConversationId : undefined;
  const matchedMethod = PLUGIN_ROUTE_METHOD_VALUES.find((candidate) => candidate === method);
  if (!matchedMethod) {throw new BadRequestException(`插件 Route 暂不支持 HTTP 方法 ${method}`);}
  return {
    context: { source: 'http-route', userId: readRequestUserId(req), conversationId: conversationId?.trim() || undefined },
    request: {
      path: (typeof namedPath === 'string' ? namedPath : Array.isArray(namedPath) ? namedPath.join('/') : '')
        .trim()
        .replace(/^\/+/, '')
        .replace(/\/+$/, ''),
      method: matchedMethod,
      headers: Object.fromEntries(Object.entries(req.headers).flatMap(([key, value]) =>
        BLOCKED_PLUGIN_REQUEST_HEADERS.has(key.toLowerCase()) || value === undefined
          ? []
          : [[key, Array.isArray(value) ? value.join(', ') : value]])) as Record<string, string>,
      query: Object.fromEntries(Object.entries(query).flatMap(([key, value]) =>
        value === undefined ? [] : [[key, structuredClone(value) as JsonValue]])) as JsonObject,
      body: req.body === undefined ? null : structuredClone(req.body) as JsonValue,
    },
  };
}

export function writePluginRouteResponse(res: Response, result: { body: JsonValue; headers?: Record<string, string>; status: number }): JsonValue {
  res.status(result.status);
  for (const [header, value] of Object.entries(result.headers ?? {})) {
    if (BLOCKED_PLUGIN_RESPONSE_HEADERS.has(header.toLowerCase())) {continue;}
    res.setHeader(header, value);
  }
  return result.body;
}

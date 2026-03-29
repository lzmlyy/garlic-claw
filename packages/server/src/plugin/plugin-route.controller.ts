import {
  All,
  Controller,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { toJsonValue } from '../common/utils/json-value';
import type { PluginCallContext, PluginRouteRequest } from '@garlic-claw/shared';
import { PluginRuntimeService } from './plugin-runtime.service';

const BLOCKED_PLUGIN_REQUEST_HEADERS = new Set([
  'authorization',
  'cookie',
]);

const BLOCKED_PLUGIN_RESPONSE_HEADERS = new Set([
  'connection',
  'content-length',
  'set-cookie',
  'transfer-encoding',
]);

@ApiTags('Plugin Routes')
@ApiBearerAuth()
@Controller('plugin-routes')
@UseGuards(JwtAuthGuard)
export class PluginRouteController {
  constructor(private readonly pluginRuntime: PluginRuntimeService) {}

  /**
   * 把宿主 HTTP 请求代理到插件声明的 Route 处理器。
   * @param userId 当前登录用户 ID
   * @param pluginId 插件 ID
   * @param query 原始查询参数
   * @param req Express 请求对象
   * @param res Express 响应对象
   * @returns 插件返回的 JSON body
   */
  @All(':pluginId/*path')
  async handleRoute(
    @CurrentUser('id') userId: string,
    @Param('pluginId') pluginId: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<JsonValue> {
    const routePath = readWildcardPath(req);
    const context: PluginCallContext = {
      source: 'http-route',
      userId,
      conversationId: readConversationId(query, req.body),
    };
    const request = buildRouteRequest(req, query, routePath);
    const result = await this.pluginRuntime.invokeRoute({
      pluginId,
      request,
      context,
    });

    res.status(result.status);
    for (const [header, value] of Object.entries(result.headers ?? {})) {
      if (isBlockedPluginResponseHeader(header)) {
        continue;
      }
      res.setHeader(header, value);
    }

    return result.body;
  }
}

/**
 * 从 Express wildcard 参数中读取插件 Route 路径。
 * @param req Express 请求对象
 * @returns 去掉首尾斜杠后的 Route 路径
 */
function readWildcardPath(req: Request): string {
  const legacyPath = req.params?.[0];
  if (typeof legacyPath === 'string' && legacyPath.trim()) {
    return normalizeRoutePath(legacyPath);
  }

  const namedPath = req.params?.path;
  if (typeof namedPath === 'string' && namedPath.trim()) {
    return normalizeRoutePath(namedPath);
  }
  if (Array.isArray(namedPath) && namedPath.length > 0) {
    return normalizeRoutePath(namedPath.join('/'));
  }

  return '';
}

function normalizeRoutePath(routePath: string): string {
  return routePath.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * 把 Express 请求归一化为插件可消费的 Route 请求。
 * @param req Express 请求对象
 * @param query 原始查询参数
 * @param routePath 已解析的 Route 路径
 * @returns 标准化后的 Route 请求
 */
function buildRouteRequest(
  req: Request,
  query: Record<string, unknown>,
  routePath: string,
): PluginRouteRequest {
  return {
    path: routePath,
    method: req.method as PluginRouteRequest['method'],
    headers: normalizeHeaders(req.headers),
    query: toJsonValue(query) as JsonObject,
    body: normalizeRequestBody(req.body),
  };
}

/**
 * 读取插件调用上下文中的 conversationId。
 * @param query 查询参数
 * @param body 请求体
 * @returns conversationId；不存在时返回 undefined
 */
function readConversationId(
  query: Record<string, unknown>,
  body: unknown,
): string | undefined {
  if (typeof query.conversationId === 'string' && query.conversationId.trim()) {
    return query.conversationId.trim();
  }
  if (
    body &&
    typeof body === 'object' &&
    !Array.isArray(body) &&
    'conversationId' in body &&
    typeof (body as Record<string, unknown>).conversationId === 'string'
  ) {
    const conversationId = (body as Record<string, unknown>).conversationId as string;
    return conversationId.trim() || undefined;
  }

  return undefined;
}

/**
 * 归一化 Express 请求头。
 * @param headers Express headers 对象
 * @returns 只包含字符串值的头字典
 */
function normalizeHeaders(headers: Request['headers']): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (isBlockedPluginRequestHeader(key)) {
      continue;
    }
    if (typeof value === 'string') {
      result[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      result[key] = value.join(', ');
    }
  }

  return result;
}

/**
 * 归一化插件 Route 请求体。
 * @param body 原始请求体
 * @returns JSON 请求体；缺失时返回 null
 */
function normalizeRequestBody(body: unknown): JsonValue | null {
  if (body === undefined) {
    return null;
  }

  return toJsonValue(body);
}

/**
 * 判断一个请求头是否不应转发给插件。
 * @param header 请求头名
 * @returns 是否应当屏蔽
 */
function isBlockedPluginRequestHeader(header: string): boolean {
  return BLOCKED_PLUGIN_REQUEST_HEADERS.has(header.toLowerCase());
}

/**
 * 判断一个插件返回头是否不应直接写回客户端。
 * @param header 响应头名
 * @returns 是否应当屏蔽
 */
function isBlockedPluginResponseHeader(header: string): boolean {
  return BLOCKED_PLUGIN_RESPONSE_HEADERS.has(header.toLowerCase());
}

import type { PluginRouteResponse } from '@garlic-claw/shared';

/**
 * 归一化插件 Route 路径。
 * @param path 原始路径
 * @returns 去掉首尾斜杠后的路径
 */
export function normalizeRoutePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

/**
 * 归一化 Route 响应，补默认状态码。
 * @param response 插件返回的 Route 响应
 * @returns 标准化后的 Route 响应
 */
export function normalizeRouteResponse(response: PluginRouteResponse): PluginRouteResponse {
  return {
    status: response.status || 200,
    headers: response.headers,
    body: response.body,
  };
}


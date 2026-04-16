import type { JsonObject, JsonValue } from './json';
import type { PluginCallContext } from './plugin';

/** 插件 Route 支持的 HTTP 方法。 */
export type PluginRouteMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE';

/** 插件声明的 Web Route。 */
export interface PluginRouteDescriptor {
  path: string;
  methods: PluginRouteMethod[];
  description?: string;
}

/** 插件 Web Route 请求。 */
export interface PluginRouteRequest {
  path: string;
  method: PluginRouteMethod;
  headers: Record<string, string>;
  query: JsonObject;
  body: JsonValue | null;
}

/** 插件 Web Route 响应。 */
export interface PluginRouteResponse {
  status: number;
  headers?: Record<string, string>;
  body: JsonValue;
}

/** Route 调用负载。 */
export interface RouteInvokePayload {
  request: PluginRouteRequest;
  context: PluginCallContext;
}

/** Route 返回负载。 */
export interface RouteResultPayload {
  data: PluginRouteResponse;
}

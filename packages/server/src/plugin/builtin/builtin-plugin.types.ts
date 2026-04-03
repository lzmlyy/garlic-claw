import type {
  PluginGenerateTextParams,
  PluginHostFacadeMethods,
  PluginScopedStateOptions,
} from '@garlic-claw/plugin-sdk';
import type {
  HostCallPayload,
  PluginCallContext,
  PluginHookName,
  PluginManifest,
  PluginRouteRequest,
  PluginRouteResponse,
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../../common/types/json-value';

export type BuiltinPluginScopedStateOptions = PluginScopedStateOptions;
export type BuiltinPluginGenerateTextParams = PluginGenerateTextParams;

/**
 * 内建插件可用的 Host API 调用器。
 */
export interface BuiltinPluginHostCaller {
  /**
   * 执行一次 Host API 调用。
   * @param input 插件 ID、上下文、方法和参数
   * @returns JSON 可序列化结果
   */
  call(input: {
    pluginId: string;
    context: PluginCallContext;
    method: HostCallPayload['method'];
    params: JsonObject;
  }): Promise<JsonValue>;
}

/**
 * 内建插件可选的治理动作处理器。
 */
export interface BuiltinPluginGovernanceHandlers {
  /**
   * 重新装载当前内建插件。
   * @returns 无返回值
   */
  reload?: () => Promise<void> | void;

  /**
   * 请求当前内建插件重连。
   * @returns 无返回值
   */
  reconnect?: () => Promise<void> | void;

  /**
   * 对当前内建插件执行健康检查。
   * @returns 健康检查结果
   */
  checkHealth?: () => Promise<{ ok: boolean }> | { ok: boolean };
}

/**
 * 内建插件的宿主 API 门面。
 */
export type BuiltinPluginHostFacade = PluginHostFacadeMethods;

/**
 * 内建插件执行上下文。
 */
export interface BuiltinPluginExecutionContext {
  callContext: PluginCallContext;
  host: BuiltinPluginHostFacade;
}

/**
 * 内建插件工具处理器。
 */
export type BuiltinPluginToolHandler = (
  params: JsonObject,
  context: BuiltinPluginExecutionContext,
) => Promise<JsonValue> | JsonValue;

/**
 * 内建插件 Hook 处理器。
 */
export type BuiltinPluginHookHandler = (
  payload: JsonValue,
  context: BuiltinPluginExecutionContext,
) => Promise<JsonValue | null | undefined> | JsonValue | null | undefined;

/**
 * 内建插件 Route 处理器。
 */
export type BuiltinPluginRouteHandler = (
  request: PluginRouteRequest,
  context: BuiltinPluginExecutionContext,
) => Promise<PluginRouteResponse> | PluginRouteResponse;

/**
 * 内建插件定义。
 */
export interface BuiltinPluginDefinition {
  manifest: PluginManifest;
  tools?: Record<string, BuiltinPluginToolHandler>;
  hooks?: Partial<Record<PluginHookName, BuiltinPluginHookHandler>>;
  routes?: Record<string, BuiltinPluginRouteHandler>;
}

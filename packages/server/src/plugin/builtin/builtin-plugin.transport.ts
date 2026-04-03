import {
  createPluginAuthorTransportExecutor,
  createPluginHostFacade,
  type PluginAuthorTransportExecutor,
  type PluginHostFacadeMethods,
} from '@garlic-claw/plugin-sdk';
import type {
  HostCallPayload,
  PluginCallContext,
  PluginHookName,
  PluginRouteRequest,
  PluginRouteResponse,
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { PluginTransport } from '../plugin-runtime.types';
import type {
  BuiltinPluginDefinition,
  BuiltinPluginGovernanceHandlers,
  BuiltinPluginHostCaller,
} from './builtin-plugin.types';

export type { BuiltinPluginDefinition } from './builtin-plugin.types';

/**
 * 内建插件 transport。
 *
 * 输入:
 * - 工具执行请求
 * - Hook 调用请求
 *
 * 输出:
 * - 插件执行结果
 *
 * 预期行为:
 * - 保持与 remote transport 相同的 executeTool / invokeHook / invokeRoute 语义
 * - 通过 Host API 门面访问宿主能力，而不是直接注入服务对象
 */
export class BuiltinPluginTransport implements PluginTransport {
  private readonly executor: PluginAuthorTransportExecutor;

  constructor(
    private readonly definition: BuiltinPluginDefinition,
    private readonly hostService: BuiltinPluginHostCaller,
    private readonly governance?: BuiltinPluginGovernanceHandlers,
  ) {
    this.executor = createPluginAuthorTransportExecutor({
      definition: this.definition,
      governance: this.governance,
      createExecutionContext: (context: PluginCallContext) => ({
        callContext: context,
        host: this.createHostFacade(context),
      }),
    });
  }

  /**
   * 执行一个内建插件工具。
   * @param input 工具名、参数与调用上下文
   * @returns JSON 可序列化的执行结果
   */
  async executeTool(input: {
    toolName: string;
    params: JsonObject;
    context: PluginCallContext;
  }): Promise<JsonValue> {
    return this.executor.executeTool(input);
  }

  /**
   * 调用一个内建插件 Hook。
   * @param input Hook 名称、上下文和 Hook 负载
   * @returns Hook 返回值
   */
  async invokeHook(input: {
    hookName: PluginHookName;
    context: PluginCallContext;
    payload: JsonValue;
  }): Promise<JsonValue | null | undefined> {
    return this.executor.invokeHook(input);
  }

  /**
   * 调用一个内建插件声明的 Route。
   * @param input Route 请求与调用上下文
   * @returns 标准化 Route 响应
   */
  async invokeRoute(input: {
    request: PluginRouteRequest;
    context: PluginCallContext;
  }): Promise<PluginRouteResponse> {
    return this.executor.invokeRoute(input);
  }

  /**
   * 重新装载当前内建插件。
   * @returns 无返回值
   */
  async reload(): Promise<void> {
    await this.executor.reload();
  }

  /**
   * 请求当前内建插件重连。
   * @returns 无返回值
   */
  async reconnect(): Promise<void> {
    await this.executor.reconnect();
  }

  /**
   * 对当前内建插件执行健康检查。
   * @returns 健康检查结果
   */
  async checkHealth(): Promise<{ ok: boolean }> {
    return this.executor.checkHealth();
  }

  /**
   * 返回当前内建插件真实支持的治理动作。
   * @returns 治理动作列表
   */
  listSupportedActions() {
    return this.executor.listSupportedActions();
  }

  /**
   * 执行一次原始 Host API 调用。
   * @param context 调用上下文
   * @param method Host 方法名
   * @param params JSON 参数
   * @returns 原始 JSON 返回值
   */
  private invokeHost(
    context: PluginCallContext,
    method: HostCallPayload['method'],
    params: JsonObject,
  ): Promise<JsonValue> {
    return this.hostService.call({
      pluginId: this.definition.manifest.id,
      context,
      method,
      params,
    });
  }

  /**
   * 执行一次带类型收口的 Host API 调用。
   * @param context 调用上下文
   * @param method Host 方法名
   * @param params JSON 参数
   * @returns 收口后的结构化结果
   */
  private callHost<T>(
    context: PluginCallContext,
    method: HostCallPayload['method'],
    params: JsonObject = {},
  ): Promise<T> {
    return this.invokeHost(context, method, params) as Promise<T>;
  }

  /**
   * 创建一个绑定到当前插件与调用上下文的 Host API 门面。
   * @param context 调用上下文
   * @returns 带便捷方法的 Host API 门面
   */
  private createHostFacade(context: PluginCallContext): PluginHostFacadeMethods {
    return createPluginHostFacade({
      call: (method, params) => this.invokeHost(context, method, params),
      callHost: <T>(
        method: HostCallPayload['method'],
        params: JsonObject = {},
      ) => this.callHost<T>(context, method, params),
    });
  }
}

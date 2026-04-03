import { createPluginHostFacade } from '@garlic-claw/plugin-sdk';
import type {
  ChatAfterModelHookPayload,
  ChatBeforeModelHookPayload,
  ChatBeforeModelHookResult,
  HostCallPayload,
  PluginActionName,
  PluginCallContext,
  PluginHookName,
  PluginRouteRequest,
  PluginRouteResponse,
} from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import type { PluginTransport } from '../plugin-runtime.types';
import type {
  BuiltinPluginDefinition,
  BuiltinPluginGovernanceHandlers,
  BuiltinPluginHostCaller,
  BuiltinPluginHostFacade,
} from './builtin-plugin.types';
import { readBuiltinHookPayload } from './builtin-hook-payload.helpers';

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
  constructor(
    private readonly definition: BuiltinPluginDefinition,
    private readonly hostService: BuiltinPluginHostCaller,
    private readonly governance?: BuiltinPluginGovernanceHandlers,
  ) {}

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
    const handler = this.definition.tools?.[input.toolName];
    if (!handler) {
      throw new BadRequestException(
        `未知的内建插件工具: ${this.definition.manifest.id}:${input.toolName}`,
      );
    }

    return handler(input.params, {
      callContext: input.context,
      host: this.createHostFacade(input.context),
    });
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
    const handler = this.definition.hooks?.[input.hookName];
    if (!handler) {
      return null;
    }

    return handler(input.payload, {
      callContext: input.context,
      host: this.createHostFacade(input.context),
    });
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
    const handler = this.definition.routes?.[normalizeBuiltinRoutePath(input.request.path)];
    if (!handler) {
      throw new BadRequestException(
        `未知的内建插件 Route: ${this.definition.manifest.id}:${input.request.path}`,
      );
    }

    return handler(input.request, {
      callContext: input.context,
      host: this.createHostFacade(input.context),
    });
  }

  /**
   * 重新装载当前内建插件。
   * @returns 无返回值
   */
  async reload(): Promise<void> {
    if (!this.governance?.reload) {
      throw new BadRequestException(
        `插件 ${this.definition.manifest.id} 不支持治理动作 reload`,
      );
    }

    await this.governance.reload();
  }

  /**
   * 请求当前内建插件重连。
   * @returns 无返回值
   */
  async reconnect(): Promise<void> {
    if (!this.governance?.reconnect) {
      throw new BadRequestException(
        `插件 ${this.definition.manifest.id} 不支持治理动作 reconnect`,
      );
    }

    await this.governance.reconnect();
  }

  /**
   * 对当前内建插件执行健康检查。
   * @returns 健康检查结果
   */
  async checkHealth(): Promise<{ ok: boolean }> {
    if (!this.governance?.checkHealth) {
      return {
        ok: true,
      };
    }

    return this.governance.checkHealth();
  }

  /**
   * 返回当前内建插件真实支持的治理动作。
   * @returns 治理动作列表
   */
  listSupportedActions(): PluginActionName[] {
    const actions: PluginActionName[] = ['health-check'];
    if (this.governance?.reload) {
      actions.push('reload');
    }
    if (this.governance?.reconnect) {
      actions.push('reconnect');
    }

    return actions;
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
  private createHostFacade(context: PluginCallContext): BuiltinPluginHostFacade {
    return createPluginHostFacade({
      call: (method, params) => this.invokeHost(context, method, params),
      callHost: <T>(
        method: HostCallPayload['method'],
        params: JsonObject = {},
      ) => this.callHost<T>(context, method, params),
    });
  }
}

/**
 * 将 JSON 负载收敛为聊天模型前 Hook 载荷。
 * @param payload 原始 JSON 负载
 * @returns 结构化 Hook 输入
 */
export function asChatBeforeModelPayload(
  payload: JsonValue,
): ChatBeforeModelHookPayload {
  return readBuiltinHookPayload<ChatBeforeModelHookPayload>(payload);
}

/**
 * 将 JSON 负载收敛为聊天模型后 Hook 载荷。
 * @param payload 原始 JSON 负载
 * @returns 结构化 Hook 输入
 */
export function asChatAfterModelPayload(
  payload: JsonValue,
): ChatAfterModelHookPayload {
  return readBuiltinHookPayload<ChatAfterModelHookPayload>(payload);
}

/**
 * 构造聊天模型前 Hook 返回值。
 * @param currentSystemPrompt 当前系统提示词
 * @param appendedSystemPrompt 要追加的系统提示词
 * @returns Hook 返回值对象
 */
export function createChatBeforeModelHookResult(
  currentSystemPrompt: string,
  appendedSystemPrompt: string,
): ChatBeforeModelHookResult {
  return {
    action: 'mutate',
    systemPrompt: currentSystemPrompt
      ? [currentSystemPrompt, appendedSystemPrompt].join('\n\n')
      : appendedSystemPrompt,
  };
}

/**
 * 归一化内建插件 Route 路径键。
 * @param path 原始路径
 * @returns 去掉首尾斜杠后的路径键
 */
function normalizeBuiltinRoutePath(path: string): string {
  return path.trim().replace(/^\/+|\/+$/g, '');
}

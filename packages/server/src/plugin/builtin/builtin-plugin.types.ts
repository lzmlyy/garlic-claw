import type {
  PluginAuthorDefinition,
  PluginAuthorTransportGovernanceHandlers,
  PluginHostFacadeMethods,
} from '@garlic-claw/plugin-sdk';
import type {
  HostCallPayload,
  PluginCallContext,
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../../common/types/json-value';

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

export type BuiltinPluginGovernanceHandlers = PluginAuthorTransportGovernanceHandlers;

/**
 * 内建插件定义。
 */
export type BuiltinPluginDefinition = PluginAuthorDefinition<PluginHostFacadeMethods>;

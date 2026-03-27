import { Injectable } from '@nestjs/common';
import type { JsonValue } from '../common/types/json-value';

/**
 * 插件运行时状态存储。
 *
 * 输入:
 * - 插件 ID
 * - 状态键和值
 *
 * 输出:
 * - 读取到的状态值
 * - 写入/删除后的最新状态
 *
 * 预期行为:
 * - 以插件维度隔离运行时状态
 * - 为 Host API 暴露统一的 state 读写能力
 */
@Injectable()
export class PluginStateService {
  private readonly stateByPlugin = new Map<string, Map<string, JsonValue>>();

  /**
   * 读取插件状态。
   * @param pluginId 插件 ID
   * @param key 状态键
   * @returns 已保存的状态值；不存在时返回 null
   */
  get(pluginId: string, key: string): JsonValue | null {
    return this.stateByPlugin.get(pluginId)?.get(key) ?? null;
  }

  /**
   * 写入插件状态。
   * @param pluginId 插件 ID
   * @param key 状态键
   * @param value 任意 JSON 值
   * @returns 写入后的状态值
   */
  set(pluginId: string, key: string, value: JsonValue): JsonValue {
    const pluginState = this.ensurePluginState(pluginId);
    pluginState.set(key, value);
    return value;
  }

  /**
   * 删除插件状态。
   * @param pluginId 插件 ID
   * @param key 状态键
   * @returns 是否删除成功
   */
  delete(pluginId: string, key: string): boolean {
    return this.stateByPlugin.get(pluginId)?.delete(key) ?? false;
  }

  /**
   * 获取或创建插件自己的状态 Map。
   * @param pluginId 插件 ID
   * @returns 可写状态 Map
   */
  private ensurePluginState(pluginId: string): Map<string, JsonValue> {
    let pluginState = this.stateByPlugin.get(pluginId);
    if (!pluginState) {
      pluginState = new Map<string, JsonValue>();
      this.stateByPlugin.set(pluginId, pluginState);
    }

    return pluginState;
  }
}

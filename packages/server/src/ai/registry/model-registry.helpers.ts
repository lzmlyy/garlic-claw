import {
  createDefaultCapabilities,
  type ModelCapabilities,
  type ModelConfig,
  type ModelId,
  type ProviderId,
} from '../types';

/**
 * 模型注册表过滤条件。
 */
export interface ModelRegistryFilter {
  /** 可选 provider 过滤。 */
  providerId?: ProviderId;
  /** 是否要求支持工具调用。 */
  supportsToolCall?: boolean;
  /** 是否要求支持推理。 */
  supportsReasoning?: boolean;
  /** 是否要求支持图片输入。 */
  supportsImage?: boolean;
}

/**
 * 模型能力更新输入。
 */
export type ModelCapabilitiesUpdate = Partial<
  Omit<ModelCapabilities, 'input' | 'output'>
> & {
  /** 输入模态覆盖。 */
  input?: Partial<ModelCapabilities['input']>;
  /** 输出模态覆盖。 */
  output?: Partial<ModelCapabilities['output']>;
};

/**
 * 生成模型注册表稳定键。
 *
 * 输入:
 * - provider ID
 * - model ID
 *
 * 输出:
 * - `provider/model` 形式的稳定键
 *
 * 预期行为:
 * - 统一模型存储键格式
 * - 避免服务里反复拼接字符串
 */
export function makeModelRegistryKey(
  providerId: ProviderId | string,
  modelId: ModelId | string,
): string {
  return `${String(providerId)}/${String(modelId)}`;
}

/**
 * 合并模型能力。
 *
 * 输入:
 * - 现有能力
 * - 覆盖项
 *
 * 输出:
 * - 合并后的能力对象
 *
 * 预期行为:
 * - 顶层字段与 input/output 子字段都支持局部覆盖
 * - 保留未声明字段
 */
export function mergeModelCapabilities(
  base: ModelCapabilities,
  override: ModelCapabilitiesUpdate,
): ModelCapabilities {
  return {
    ...base,
    ...override,
    input: {
      ...base.input,
      ...(override.input ?? {}),
    },
    output: {
      ...base.output,
      ...(override.output ?? {}),
    },
  };
}

/**
 * 标准化待注册模型配置。
 *
 * 输入:
 * - 原始模型配置
 * - 可选持久化能力覆盖
 *
 * 输出:
 * - 带完整能力对象的模型配置
 *
 * 预期行为:
 * - 没有持久化覆盖时补齐默认能力
 * - 有持久化覆盖时完全采用持久化结果
 */
export function normalizeRegisteredModelConfig(
  config: ModelConfig,
  savedCapabilities: ModelCapabilities | null,
): ModelConfig {
  return {
    ...config,
    capabilities:
      savedCapabilities ??
      mergeModelCapabilities(createDefaultCapabilities(), config.capabilities),
  };
}

/**
 * 按能力过滤模型列表。
 *
 * 输入:
 * - 模型列表
 * - 过滤条件
 *
 * 输出:
 * - 过滤后的模型列表
 *
 * 预期行为:
 * - 仅应用显式传入的过滤条件
 * - 不修改原数组
 */
export function filterRegisteredModels(
  models: ModelConfig[],
  filter: ModelRegistryFilter,
): ModelConfig[] {
  return models.filter((model) => {
    if (filter.providerId && model.providerId !== filter.providerId) {
      return false;
    }
    if (
      filter.supportsToolCall !== undefined &&
      model.capabilities.toolCall !== filter.supportsToolCall
    ) {
      return false;
    }
    if (
      filter.supportsReasoning !== undefined &&
      model.capabilities.reasoning !== filter.supportsReasoning
    ) {
      return false;
    }
    if (
      filter.supportsImage !== undefined &&
      model.capabilities.input.image !== filter.supportsImage
    ) {
      return false;
    }
    return true;
  });
}

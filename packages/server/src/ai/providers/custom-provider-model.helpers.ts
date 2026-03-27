import { inferModelCapabilities } from '../model-capability-inference';
import {
  createDefaultCapabilities,
  createModelId,
  type ModelCapabilities,
  type ModelConfig,
  type ProviderConfig,
  type ProviderId,
} from '../types';
import type {
  CompatibleProviderFormat,
  CustomModelDto,
  DiscoveredModel,
  RegisterCustomProviderDto,
} from './custom-provider.types';

/**
 * 推断兼容 provider 的模型能力。
 *
 * 输入:
 * - 模型 ID
 * - 可选预定义模型
 *
 * 输出:
 * - 推断后的能力配置
 *
 * 预期行为:
 * - 显式配置优先生效
 * - 未显式配置时做轻量名称推断
 */
export function inferCustomProviderCapabilities(
  modelId: string,
  predefinedModels?: CustomModelDto[],
): ModelCapabilities {
  const baseCapabilities = createDefaultCapabilities();
  const predefined = predefinedModels?.find((item) => item.id === modelId);

  if (predefined?.capabilities) {
    return mergeCustomModelCapabilities(baseCapabilities, predefined.capabilities);
  }

  const inferred = inferModelCapabilities(modelId);
  const normalizedId = modelId.toLowerCase();

  if (normalizedId.includes('vl')) {
    inferred.input.image = true;
  }

  if (
    normalizedId.includes('imagen') ||
    normalizedId.includes('image-preview') ||
    normalizedId.includes('image-generation')
  ) {
    inferred.output.image = true;
  }

  return inferred;
}

/**
 * 合并模型能力。
 *
 * 输入:
 * - 默认能力
 * - 覆盖能力
 *
 * 输出:
 * - 合并后的能力配置
 *
 * 预期行为:
 * - 支持 input/output 的局部覆盖
 * - 保留未声明字段
 */
export function mergeCustomModelCapabilities(
  base: ModelCapabilities,
  override: Partial<ModelCapabilities> & {
    input?: Partial<ModelCapabilities['input']>;
    output?: Partial<ModelCapabilities['output']>;
  },
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
 * 创建标准化的自定义 provider 配置。
 */
export function createCustomProviderConfig(
  providerId: ProviderId,
  dto: RegisterCustomProviderDto,
  npm: string,
  format: CompatibleProviderFormat,
): ProviderConfig {
  return {
    id: providerId,
    name: dto.name,
    npm,
    api: dto.baseUrl,
    env: dto.apiKeyEnv ? [dto.apiKeyEnv] : [],
    type: format,
    options: dto.options,
  };
}

/**
 * 创建标准化的自定义模型配置。
 */
export function createCustomModelConfig(
  providerId: ProviderId,
  modelDto: CustomModelDto,
  baseUrl: string,
  npmPackage: string,
): ModelConfig {
  return {
    id: createModelId(modelDto.id),
    providerId,
    name: modelDto.name,
    capabilities: mergeCustomModelCapabilities(
      createDefaultCapabilities(),
      modelDto.capabilities ?? {},
    ),
    api: {
      id: modelDto.id,
      url: baseUrl,
      npm: npmPackage,
    },
    status: 'active',
  };
}

/**
 * 将发现到的模型转换成标准模型配置。
 */
export function createDiscoveredModelConfig(
  providerId: ProviderId,
  model: DiscoveredModel,
  baseUrl: string,
  npmPackage: string,
): ModelConfig {
  return {
    id: createModelId(model.id),
    providerId,
    name: model.name,
    capabilities: model.capabilities,
    api: {
      id: model.id,
      url: baseUrl,
      npm: npmPackage,
    },
    status: 'active',
  };
}

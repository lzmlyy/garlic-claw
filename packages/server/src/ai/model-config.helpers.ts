import type { ModelConfig } from './types/provider.types';

/**
 * 创建标准化的模型配置骨架。
 */
export function createModelConfig(input: {
  modelId: ModelConfig['id'];
  providerId: ModelConfig['providerId'];
  name: string;
  capabilities: ModelConfig['capabilities'];
  baseUrl: string;
  npm: string;
}): ModelConfig {
  return {
    id: input.modelId,
    providerId: input.providerId,
    name: input.name,
    capabilities: input.capabilities,
    api: {
      id: String(input.modelId),
      url: input.baseUrl,
      npm: input.npm,
    },
    status: 'active',
  };
}

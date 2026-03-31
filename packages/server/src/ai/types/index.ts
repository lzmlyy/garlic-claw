/**
 * AI 类型定义导出入口
 */

// 只保留当前运行时仍在使用的 provider 相关类型。
export type {
  ProviderId,
  ModelId,
  ModalityCapabilities,
  ModelCapabilities,
  ApiConfig,
  ModelCost,
  ModelLimit,
  ModelConfig,
  ProviderConfig,
} from './provider.types';

export {
  createProviderId,
  createModelId,
  createDefaultModalityCapabilities,
  createDefaultCapabilities,
} from './provider.types';

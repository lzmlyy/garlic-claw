import type { AiProviderSummary } from '@garlic-claw/shared';
import type { StoredAiProviderConfig } from './config/config-manager.service';
import { inferModelCapabilities } from './model-capability-inference';
import {
  COMPATIBLE_PROVIDER_DRIVERS,
  getOfficialProviderCatalogItem,
  type CompatibleProviderDriver,
} from './official-provider-catalog';
import type { ModelConfig } from './types/provider.types';
import type { ModelCapabilities } from './types/provider.types';

/**
 * provider 写入输入。
 */
export interface UpsertAiProviderInput {
  /** provider 模式。 */
  mode: 'official' | 'compatible';
  /** 官方 driver 或兼容格式。 */
  driver: string;
  /** provider 名称。 */
  name: string;
  /** API Key。 */
  apiKey?: string;
  /** Base URL。 */
  baseUrl?: string;
  /** 默认模型。 */
  defaultModel?: string;
  /** 模型列表。 */
  models: string[];
}

/**
 * 模型写入输入。
 */
export interface UpsertAiModelInput {
  /** 模型显示名称。 */
  name?: string;
  /** 能力覆盖。 */
  capabilities?: Partial<Omit<ModelCapabilities, 'input' | 'output'>> & {
    input?: Partial<ModelCapabilities['input']>;
    output?: Partial<ModelCapabilities['output']>;
  };
}

/**
 * 管理端 provider 摘要，直接复用 shared 公共契约。
 */
export type ManagedAiProviderSummary = AiProviderSummary;

/**
 * 将持久化 provider 配置映射为管理端摘要。
 * @param provider 持久化 provider 配置
 * @returns 前端可直接消费的摘要
 */
export function toManagedProviderSummary(
  provider: StoredAiProviderConfig,
): ManagedAiProviderSummary {
  return {
    id: provider.id,
    name: provider.name,
    mode: provider.mode,
    driver: provider.driver,
    defaultModel: provider.defaultModel,
    baseUrl: provider.baseUrl,
    modelCount: provider.models.length,
    available: Boolean(provider.apiKey),
  };
}

/**
 * 校验 provider 写入输入。
 * @param input provider 输入
 */
export function validateManagedProviderInput(input: UpsertAiProviderInput): void {
  if (input.mode === 'official') {
    if (!getOfficialProviderCatalogItem(input.driver)) {
      throw new Error(`Unknown official provider driver "${input.driver}"`);
    }
    return;
  }

  if (
    !COMPATIBLE_PROVIDER_DRIVERS.includes(
      input.driver as CompatibleProviderDriver,
    )
  ) {
    throw new Error(
      'Compatible provider driver must be one of: openai, anthropic, gemini',
    );
  }
}

/**
 * 构建统一的模型配置。
 * @param provider provider 配置
 * @param modelId 模型 ID
 * @param name 可选显示名称
 * @returns 注册表使用的模型配置
 */
export function buildManagedModelConfig(
  provider: StoredAiProviderConfig,
  modelId: string,
  name?: string,
): ModelConfig {
  const official =
    provider.mode === 'official'
      ? getOfficialProviderCatalogItem(provider.driver)
      : null;

  return {
    id: modelId,
    providerId: provider.id,
    name: name ?? modelId,
    capabilities: inferModelCapabilities(modelId),
    api: {
      id: modelId,
      url: provider.baseUrl ?? official?.defaultBaseUrl ?? '',
      npm:
        official?.npm ??
        getCompatibleProviderNpm(provider.driver as CompatibleProviderDriver),
    },
    status: 'active',
  };
}

/**
 * 获取兼容 provider 对应的 SDK 包名。
 * @param driver 兼容驱动
 * @returns SDK 包名
 */
function getCompatibleProviderNpm(driver: CompatibleProviderDriver): string {
  switch (driver) {
    case 'anthropic':
      return '@ai-sdk/anthropic';
    case 'gemini':
      return '@ai-sdk/google';
    case 'openai':
    default:
      return '@ai-sdk/openai';
  }
}

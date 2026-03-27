/**
 * AI 管理服务
 *
 * 输入:
 * - provider / model / vision fallback 的管理请求
 *
 * 输出:
 * - 统一的 provider、model、capabilities、vision 配置结果
 *
 * 预期行为:
 * - 官方 provider 支持多家目录
 * - 兼容 provider 仅支持 openai / anthropic / gemini
 * - 管理操作统一落到配置存储和模型注册表
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import {
  ConfigManagerService,
  type StoredAiProviderConfig,
  type StoredVisionFallbackConfig,
} from './config/config-manager.service';
import {
  OFFICIAL_PROVIDER_CATALOG,
  getOfficialProviderCatalogItem,
  type OfficialProviderCatalogItem,
} from './official-provider-catalog';
import { ModelRegistryService } from './registry/model-registry.service';
import type { ModelCapabilities, ModelConfig } from './types/provider.types';
import {
  buildManagedModelConfig,
  toManagedProviderSummary,
  type ManagedAiProviderSummary,
  type UpsertAiModelInput,
  type UpsertAiProviderInput,
  validateManagedProviderInput,
} from './ai-management.helpers';

@Injectable()
export class AiManagementService {
  constructor(
    private readonly configManager: ConfigManagerService,
    private readonly modelRegistry: ModelRegistryService,
  ) {}

  /**
   * 列出官方 provider 目录。
   * @returns 官方 provider 元数据
   */
  listOfficialProviderCatalog(): OfficialProviderCatalogItem[] {
    return OFFICIAL_PROVIDER_CATALOG;
  }

  /**
   * 列出已配置 provider。
   * @returns provider 摘要列表
   */
  listProviders(): ManagedAiProviderSummary[] {
    return this.configManager.listProviders().map(toManagedProviderSummary);
  }

  /**
   * 获取单个 provider 配置。
   * @param providerId provider ID
   * @returns provider 配置
   */
  getProvider(providerId: string): StoredAiProviderConfig {
    const provider = this.configManager.getProviderConfig(providerId);
    if (!provider) {
      throw new NotFoundException(`Provider "${providerId}" not found`);
    }
    return provider;
  }

  /**
   * 新增或更新 provider 配置。
   * @param providerId provider ID
   * @param input 输入配置
   * @returns 写入后的 provider 配置
   */
  upsertProvider(
    providerId: string,
    input: UpsertAiProviderInput,
  ): StoredAiProviderConfig {
    validateManagedProviderInput(input);

    const official = input.mode === 'official'
      ? getOfficialProviderCatalogItem(input.driver)
      : null;
    const stored = this.configManager.upsertProvider(providerId, {
      mode: input.mode,
      driver: input.driver,
      name: input.name,
      apiKey: input.apiKey,
      baseUrl: input.baseUrl ?? official?.defaultBaseUrl,
      defaultModel: input.defaultModel ?? official?.defaultModel,
      models: [...input.models],
    });

    this.registerProviderModels(stored);
    return stored;
  }

  /**
   * 删除 provider。
   * @param providerId provider ID
   */
  deleteProvider(providerId: string): void {
    const provider = this.getProvider(providerId);
    this.configManager.removeProvider(providerId);

    for (const modelId of provider.models) {
      this.modelRegistry.unregisterModel(providerId as never, modelId as never);
    }
  }

  /**
   * 列出 provider 的模型。
   * @param providerId provider ID
   * @returns 模型列表
   */
  listModels(providerId: string): ModelConfig[] {
    const provider = this.getProvider(providerId);

    return provider.models.map((modelId) => {
      const existing = this.modelRegistry.getModel(providerId, modelId);
      if (existing) {
      return existing;
      }

      const built = buildManagedModelConfig(provider, modelId);
      this.modelRegistry.register(built);
      return built;
    });
  }

  /**
   * 新增或更新模型。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @param input 模型输入
   * @returns 写入后的模型配置
   */
  upsertModel(
    providerId: string,
    modelId: string,
    input: UpsertAiModelInput = {},
  ): ModelConfig {
    const provider = this.getProvider(providerId);
    const nextModels = provider.models.includes(modelId)
      ? provider.models
      : [...provider.models, modelId];

    const stored = this.configManager.upsertProvider(providerId, {
      ...provider,
      models: nextModels,
      defaultModel: provider.defaultModel ?? modelId,
    });

    const modelConfig = buildManagedModelConfig(stored, modelId, input.name);
    this.modelRegistry.register(modelConfig);

    if (input.capabilities) {
      this.modelRegistry.updateModelCapabilities(providerId, modelId, input.capabilities);
    }

    return this.modelRegistry.getModel(providerId, modelId) ?? modelConfig;
  }

  /**
   * 删除模型。
   * @param providerId provider ID
   * @param modelId 模型 ID
   */
  deleteModel(providerId: string, modelId: string): void {
    const provider = this.getProvider(providerId);
    const nextModels = provider.models.filter((item) => item !== modelId);

    this.configManager.upsertProvider(providerId, {
      ...provider,
      defaultModel:
        provider.defaultModel === modelId ? nextModels[0] : provider.defaultModel,
      models: nextModels,
    });
    this.modelRegistry.unregisterModel(providerId as never, modelId as never);
  }

  /**
   * 设置默认模型。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @returns 更新后的 provider 配置
   */
  setDefaultModel(providerId: string, modelId: string): StoredAiProviderConfig {
    const provider = this.getProvider(providerId);
    if (!provider.models.includes(modelId)) {
      throw new NotFoundException(
        `Model "${modelId}" is not configured for provider "${providerId}"`,
      );
    }

    return this.configManager.upsertProvider(providerId, {
      ...provider,
      defaultModel: modelId,
    });
  }

  /**
   * 更新模型能力。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @param capabilities 能力覆盖
   * @returns 更新后的模型配置
   */
  updateModelCapabilities(
    providerId: string,
    modelId: string,
    capabilities: Partial<Omit<ModelCapabilities, 'input' | 'output'>> & {
      input?: Partial<ModelCapabilities['input']>;
      output?: Partial<ModelCapabilities['output']>;
    },
  ): ModelConfig {
    const success = this.modelRegistry.updateModelCapabilities(
      providerId,
      modelId,
      capabilities,
    );
    if (!success) {
      throw new NotFoundException(
        `Model "${modelId}" is not configured for provider "${providerId}"`,
      );
    }

    const model = this.modelRegistry.getModel(providerId, modelId);
    if (!model) {
      throw new NotFoundException(
        `Model "${modelId}" is not configured for provider "${providerId}"`,
      );
    }

    return model;
  }

  /**
   * 获取视觉转述配置。
   * @returns 视觉转述配置
   */
  getVisionFallbackConfig(): StoredVisionFallbackConfig {
    return this.configManager.getVisionFallbackConfig();
  }

  /**
   * 更新视觉转述配置。
   * @param config 新配置
   * @returns 写入后的配置
   */
  updateVisionFallbackConfig(
    config: StoredVisionFallbackConfig,
  ): StoredVisionFallbackConfig {
    return this.configManager.updateVisionFallbackConfig(config);
  }

  /**
   * 将 provider 下的模型注册到模型注册表。
   * @param provider provider 配置
   */
  private registerProviderModels(provider: StoredAiProviderConfig): void {
    for (const modelId of provider.models) {
      this.modelRegistry.register(buildManagedModelConfig(provider, modelId));
    }
  }
}

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
 * - provider 目录显式区分 core 协议族和供应商 preset
 * - 协议接入仅支持 openai / anthropic / gemini
 * - 管理操作统一落到配置存储和模型注册表
 */

import { Injectable, NotFoundException } from "@nestjs/common";
import {
  isCatalogProviderMode,
  type AiProviderSummary,
} from "@garlic-claw/shared";
import { CacheService } from "../cache/cache.service";
import { Cacheable } from "../cache/cacheable.decorator";
import {
  ConfigManagerService,
  type StoredAiProviderConfig,
} from "./config/config-manager.service";
import {
  PROVIDER_CATALOG,
  type AiProviderCatalogItem,
} from "./provider-catalog";
import { resolveProviderCatalogBinding } from "./provider-resolution.helpers";
import { ModelRegistryService } from "./registry/model-registry.service";
import type { ModelCapabilities, ModelConfig } from "./types/provider.types";
import {
  buildManagedModelConfig,
  type UpsertAiModelInput,
  type UpsertAiProviderInput,
  validateManagedProviderInput,
} from "./ai-management.helpers";

const AI_PROVIDER_LIST_CACHE_PREFIX = "ai:providers:list";

@Injectable()
export class AiManagementService {
  constructor(
    private readonly configManager: ConfigManagerService,
    private readonly modelRegistry: ModelRegistryService,
    private readonly cacheService: CacheService,
  ) {}

  /**
   * 列出 provider 目录。
   * @returns provider 目录元数据
   */
  listProviderCatalog(): AiProviderCatalogItem[] {
    return PROVIDER_CATALOG;
  }

  /**
   * 列出已配置 provider。
   * @returns provider 摘要列表
   */
  @Cacheable(60, AI_PROVIDER_LIST_CACHE_PREFIX)
  listProviders(): AiProviderSummary[] {
    return this.configManager.listProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      mode: provider.mode,
      driver: provider.driver,
      defaultModel: provider.defaultModel,
      baseUrl: provider.baseUrl,
      modelCount: provider.models.length,
      available: Boolean(provider.apiKey),
    }));
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

    const resolved = resolveProviderCatalogBinding(input.mode, input.driver);
    const stored = this.configManager.upsertProvider(providerId, {
      mode: input.mode,
      driver: input.driver,
      name: input.name,
      apiKey: input.apiKey,
      baseUrl:
        input.baseUrl ??
        (isCatalogProviderMode(input.mode)
          ? resolved?.defaultBaseUrl
          : undefined),
      defaultModel:
        input.defaultModel ??
        (isCatalogProviderMode(input.mode)
          ? resolved?.defaultModel
          : undefined),
      models: [...input.models],
    });

    this.registerProviderModels(stored);
    void this.cacheService.deleteByPrefix(AI_PROVIDER_LIST_CACHE_PREFIX);
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
      this.modelRegistry.unregisterModel(providerId, modelId);
    }
    void this.cacheService.deleteByPrefix(AI_PROVIDER_LIST_CACHE_PREFIX);
  }

  /**
   * 列出 provider 的模型。
   * @param providerId provider ID
   * @returns 模型列表
   */
  listModels(providerId: string): ModelConfig[] {
    const provider = this.getProvider(providerId);

    return provider.models.map((modelId) =>
      this.modelRegistry.getOrRegisterModel(providerId, modelId, () =>
        buildManagedModelConfig(provider, modelId),
      ),
    );
  }

  /**
   * 获取单个 provider 模型。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @returns 模型配置
   */
  getProviderModel(providerId: string, modelId: string): ModelConfig {
    this.getProvider(providerId);

    const model = this.modelRegistry.getModel(providerId, modelId);
    if (model) {
      return model;
    }

    const listedModel = this.listModels(providerId).find(
      (item) => String(item.id) === modelId,
    );
    if (!listedModel) {
      throw new NotFoundException(
        `Model "${modelId}" is not configured for provider "${providerId}"`,
      );
    }

    return listedModel;
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
      this.modelRegistry.updateModelCapabilities(
        providerId,
        modelId,
        input.capabilities,
      );
    }

    void this.cacheService.deleteByPrefix(AI_PROVIDER_LIST_CACHE_PREFIX);
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
        provider.defaultModel === modelId
          ? nextModels[0]
          : provider.defaultModel,
      models: nextModels,
    });
    this.modelRegistry.unregisterModel(providerId, modelId);
    void this.cacheService.deleteByPrefix(AI_PROVIDER_LIST_CACHE_PREFIX);
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

    const stored = this.configManager.upsertProvider(providerId, {
      ...provider,
      defaultModel: modelId,
    });
    void this.cacheService.deleteByPrefix(AI_PROVIDER_LIST_CACHE_PREFIX);
    return stored;
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
    capabilities: Partial<Omit<ModelCapabilities, "input" | "output">> & {
      input?: Partial<ModelCapabilities["input"]>;
      output?: Partial<ModelCapabilities["output"]>;
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

    void this.cacheService.deleteByPrefix(AI_PROVIDER_LIST_CACHE_PREFIX);
    return model;
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

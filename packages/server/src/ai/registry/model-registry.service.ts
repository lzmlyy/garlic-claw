import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { JsonObject } from '../../common/types/json-value';
import { ModelCapabilitiesStorage } from '../config/model-capabilities.storage';
import {
  filterRegisteredModels,
  makeModelRegistryKey,
  mergeModelCapabilities,
  normalizeRegisteredModelConfig,
  type ModelCapabilitiesUpdate,
  type ModelRegistryFilter,
} from './model-registry.helpers';
import {
  createDefaultCapabilities,
  type ModelCapabilities,
  type ModelConfig,
  type ModelId,
  type ProviderId,
} from '../types';

/**
 * 模型注册表服务。
 *
 * 输入:
 * - 模型配置
 * - provider / model 查询条件
 * - 能力覆盖项
 *
 * 输出:
 * - 已注册模型
 * - provider 下的模型列表
 * - 模型能力查询与更新结果
 *
 * 预期行为:
 * - 统一管理所有已注册模型
 * - 持久化并回放模型能力覆盖
 * - 不再通过历史实验代码暴露旧类型
 */
@Injectable()
export class ModelRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ModelRegistryService.name);
  private readonly models = new Map<string, ModelConfig>();
  private readonly providerModels = new Map<ProviderId, Set<ModelId>>();

  constructor(
    private readonly capabilitiesStorage: ModelCapabilitiesStorage,
  ) {}

  /**
   * 模块初始化时预热持久化能力配置。
   */
  onModuleInit(): void {
    const savedCapabilities = this.capabilitiesStorage.getAllCapabilities();
    if (savedCapabilities.length > 0) {
      this.logger.log(`从配置文件加载 ${savedCapabilities.length} 个模型能力配置`);
    }
  }

  /**
   * 注册单个模型。
   * @param config 模型配置
   */
  registerModel(config: ModelConfig): void {
    const providerId =
      typeof config.providerId === 'string'
        ? (config.providerId as ProviderId)
        : config.providerId;
    const modelId =
      typeof config.id === 'string'
        ? (config.id as ModelId)
        : config.id;
    const key = makeModelRegistryKey(providerId, modelId);

    if (this.models.has(key)) {
      this.logger.warn(`Model "${key}" already registered, overwriting`);
    }

    const savedCapabilities = this.capabilitiesStorage.loadCapabilities(
      providerId as string,
      modelId as string,
    );
    const fullConfig = normalizeRegisteredModelConfig(config, savedCapabilities);
    if (savedCapabilities) {
      this.logger.debug(`使用持久化的能力配置: ${key}`);
    }

    this.models.set(key, fullConfig);

    if (!this.providerModels.has(providerId)) {
      this.providerModels.set(providerId, new Set());
    }
    this.providerModels.get(providerId)?.add(modelId);

    this.logger.log(
      `Registered model: ${String(config.id)} (provider: ${String(config.providerId)})`,
    );
  }

  /**
   * 批量注册模型。
   * @param configs 模型配置数组
   */
  registerModels(configs: ModelConfig[]): void {
    for (const config of configs) {
      this.registerModel(config);
    }
  }

  /**
   * 获取单个模型配置。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @returns 模型配置或 `undefined`
   */
  getModel(
    providerId: ProviderId | string,
    modelId: ModelId | string,
  ): ModelConfig | undefined {
    const key = makeModelRegistryKey(providerId, modelId);
    return this.models.get(key);
  }

  /**
   * 获取模型能力。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @returns 已注册能力，未命中时返回默认能力
   */
  getModelCapabilities(
    providerId: ProviderId | string,
    modelId: ModelId | string,
  ): ModelCapabilities {
    const model = this.getModel(providerId, modelId);
    return model?.capabilities ?? createDefaultCapabilities();
  }

  /**
   * 列出 provider 下所有模型。
   * @param providerId provider ID
   * @returns 模型配置列表
   */
  listModels(providerId: ProviderId | string): ModelConfig[] {
    const modelIds = this.providerModels.get(providerId as ProviderId);
    if (!modelIds) {
      return [];
    }

    return Array.from(modelIds)
      .map((modelId) => this.getModel(providerId, modelId))
      .filter((config): config is ModelConfig => config !== undefined);
  }

  /**
   * 列出所有已注册模型。
   * @returns 模型配置列表
   */
  listAllModels(): ModelConfig[] {
    return Array.from(this.models.values());
  }

  /**
   * 判断模型是否存在。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @returns 是否存在
   */
  hasModel(
    providerId: ProviderId | string,
    modelId: ModelId | string,
  ): boolean {
    const key = makeModelRegistryKey(providerId, modelId);
    return this.models.has(key);
  }

  /**
   * 判断模型是否支持某种输入模态。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @param modality 输入模态
   * @returns 是否支持
   */
  isModalitySupported(
    providerId: ProviderId | string,
    modelId: ModelId | string,
    modality: keyof ModelCapabilities['input'],
  ): boolean {
    return this.getModelCapabilities(providerId, modelId).input[modality] ?? false;
  }

  /**
   * 判断模型是否支持工具调用。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @returns 是否支持
   */
  isToolCallSupported(
    providerId: ProviderId | string,
    modelId: ModelId | string,
  ): boolean {
    return this.getModelCapabilities(providerId, modelId).toolCall;
  }

  /**
   * 判断模型是否支持 reasoning。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @returns 是否支持
   */
  isReasoningSupported(
    providerId: ProviderId | string,
    modelId: ModelId | string,
  ): boolean {
    return this.getModelCapabilities(providerId, modelId).reasoning;
  }

  /**
   * 获取推理变体配置。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @returns 推理变体映射
   */
  getReasoningVariants(
    providerId: ProviderId | string,
    modelId: ModelId | string,
  ): Record<string, JsonObject> {
    const model = this.getModel(providerId, modelId);
    return model?.variants ?? {};
  }

  /**
   * 注销单个模型。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @returns 是否删除成功
   */
  unregisterModel(providerId: ProviderId, modelId: ModelId): boolean {
    const key = makeModelRegistryKey(providerId, modelId);
    const deleted = this.models.delete(key);

    if (deleted) {
      const modelSet = this.providerModels.get(providerId);
      if (modelSet) {
        modelSet.delete(modelId);
        if (modelSet.size === 0) {
          this.providerModels.delete(providerId);
        }
      }
      this.logger.log(`Unregistered model: ${key}`);
    }

    return deleted;
  }

  /**
   * 注销 provider 下所有模型。
   * @param providerId provider ID
   * @returns 删除数量
   */
  unregisterProviderModels(providerId: ProviderId): number {
    const modelIds = this.providerModels.get(providerId);
    if (!modelIds) {
      return 0;
    }

    const count = modelIds.size;
    for (const modelId of modelIds) {
      const key = makeModelRegistryKey(providerId, modelId);
      this.models.delete(key);
    }
    this.providerModels.delete(providerId);

    this.logger.log(`Unregistered ${count} models for provider: ${providerId}`);
    return count;
  }

  clearProviderModels(providerId: ProviderId): number {
    return this.unregisterProviderModels(providerId);
  }

  register(config: ModelConfig): void {
    this.registerModel(config);
  }

  getModelCount(): number {
    return this.models.size;
  }

  /**
   * 按能力过滤模型。
   * @param filter 过滤条件
   * @returns 匹配的模型配置列表
   */
  filterModels(filter: ModelRegistryFilter): ModelConfig[] {
    return filterRegisteredModels(this.listAllModels(), filter);
  }

  /**
   * 更新模型能力。
   * @param providerId provider ID
   * @param modelId 模型 ID
   * @param capabilities 能力覆盖项
   * @returns 是否更新成功
   */
  updateModelCapabilities(
    providerId: ProviderId | string,
    modelId: ModelId | string,
    capabilities: ModelCapabilitiesUpdate,
  ): boolean {
    const key = makeModelRegistryKey(providerId, modelId);
    const model = this.models.get(key);

    if (!model) {
      this.logger.warn(`Model "${key}" not found, cannot update capabilities`);
      return false;
    }

    model.capabilities = mergeModelCapabilities(model.capabilities, capabilities);

    this.capabilitiesStorage.saveCapabilities(
      providerId as string,
      modelId as string,
      model.capabilities,
    );

    this.logger.log(`Updated capabilities for model: ${key}`);
    return true;
  }
}

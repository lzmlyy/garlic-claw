/**
 * AI 运行时统一门面
 *
 * 输入:
 * - provider ID
 * - model ID
 * - 配置文件中的官方 / 兼容 provider 配置
 *
 * 输出:
 * - 对应的语言模型实例
 * - 统一的模型配置与能力描述
 *
 * 预期行为:
 * - 官方 provider 可以有很多，并统一走各自官方 SDK
 * - 兼容 provider 只保留 openai / anthropic / gemini 三种请求格式
 * - 聊天运行时只读取 config/ai-settings.json 中的 provider / model / capability 配置
 */

import type { LanguageModel } from 'ai';
import { Injectable, Logger } from '@nestjs/common';
import {
  buildRuntimeModelConfig,
  buildRuntimeProviderRegistration,
  getCompatibleProviderNpm,
  type RuntimeProviderInput,
  type RuntimeProviderRegistration,
} from './ai-provider.helpers';
import {
  ConfigManagerService,
  type StoredAiProviderConfig,
} from './config/config-manager.service';
import {
  COMPATIBLE_PROVIDER_DRIVERS,
  getOfficialProviderCatalogItem,
  type CompatibleProviderDriver,
  type OfficialProviderDriver,
} from './official-provider-catalog';
import { ModelRegistryService } from './registry/model-registry.service';
import type { ModelConfig } from './types/provider.types';

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private readonly providers = new Map<string, RuntimeProviderRegistration>();
  private configuredProvidersSnapshot = '';
  private configuredProviderIds = new Set<string>();

  constructor(
    private readonly configManager: ConfigManagerService,
    private readonly modelRegistry: ModelRegistryService,
  ) {
    this.syncProviders();
  }

  /**
   * 获取语言模型实例。
   * @param provider 指定 provider，可选
   * @param model 指定模型，可选
   * @returns 语言模型实例
   */
  getModel(provider?: string, model?: string): LanguageModel {
    this.syncProviders();
    const registration = this.getRegistration(provider);
    return registration.createModel(model ?? registration.defaultModel);
  }

  /**
   * 获取统一的模型配置。
   * @param provider 指定 provider，可选
   * @param model 指定模型，可选
   * @returns 推断后的模型配置
   */
  getModelConfig(provider?: string, model?: string): ModelConfig {
    this.syncProviders();
    const registration = this.getRegistration(provider);
    const modelId = model ?? registration.defaultModel;
    const registered = this.modelRegistry.getModel(registration.id, modelId);

    if (registered) {
      return registered;
    }

    const built = this.buildModelConfig(registration, modelId);
    this.modelRegistry.register(built);
    return this.modelRegistry.getModel(registration.id, modelId) ?? built;
  }

  /**
   * 列出当前可用 provider。
   * @returns provider ID 列表
   */
  getAvailableProviders(): string[] {
    this.syncProviders();
    return Array.from(this.providers.keys());
  }

  /**
   * 同步配置文件中的 provider 到运行时。
   */
  private syncProviders(): void {
    const configuredProviders = this.configManager.listProviders();
    const snapshot = JSON.stringify(configuredProviders);

    if (snapshot === this.configuredProvidersSnapshot) {
      return;
    }

    const nextConfiguredProviderIds = new Set(
      configuredProviders.map((provider) => provider.id),
    );
    for (const providerId of this.configuredProviderIds) {
      if (!nextConfiguredProviderIds.has(providerId)) {
        this.modelRegistry.clearProviderModels(providerId as never);
      }
    }

    this.providers.clear();

    for (const provider of configuredProviders) {
      this.registerConfiguredProvider(provider);
    }

    this.configuredProvidersSnapshot = snapshot;
    this.configuredProviderIds = nextConfiguredProviderIds;
  }

  /**
   * 注册配置文件驱动的 provider。
   * @param provider 持久化的 provider 配置
   */
  private registerConfiguredProvider(provider: StoredAiProviderConfig): void {
    if (provider.mode === 'official') {
      const catalogItem = getOfficialProviderCatalogItem(provider.driver);
      const apiKey = provider.apiKey;

      if (!catalogItem || !apiKey) {
        this.logger.debug(`跳过未就绪的官方 provider: ${provider.id}`);
        return;
      }

      this.registerRuntimeProvider({
        id: provider.id,
        driver: catalogItem.id,
        apiKey,
        baseUrl: provider.baseUrl ?? catalogItem.defaultBaseUrl,
        modelFactoryPreference: 'default',
        defaultModel:
          provider.defaultModel ?? provider.models[0] ?? catalogItem.defaultModel,
        npm: catalogItem.npm,
      });
      return;
    }

    if (!COMPATIBLE_PROVIDER_DRIVERS.includes(provider.driver as CompatibleProviderDriver)) {
      this.logger.warn(`忽略不支持的兼容 provider 格式: ${provider.driver}`);
      return;
    }

    if (!provider.apiKey) {
      this.logger.debug(`跳过未配置 API key 的兼容 provider: ${provider.id}`);
      return;
    }

    const baseCatalog = getOfficialProviderCatalogItem(provider.driver);
    this.registerRuntimeProvider({
      id: provider.id,
      driver: provider.driver as CompatibleProviderDriver,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl ?? baseCatalog?.defaultBaseUrl ?? '',
      modelFactoryPreference: provider.driver === 'openai' ? 'chat' : 'default',
      defaultModel:
        provider.defaultModel ?? provider.models[0] ?? baseCatalog?.defaultModel ?? '',
      npm: baseCatalog?.npm ?? getCompatibleProviderNpm(provider.driver),
    });
  }

  /**
   * 向运行时注册 provider。
   * @param input provider 注册输入
   */
  private registerRuntimeProvider(input: {
    id: string;
    driver: OfficialProviderDriver | CompatibleProviderDriver;
    apiKey: string;
    baseUrl: string;
    modelFactoryPreference: 'default' | 'chat';
    defaultModel: string;
    npm: string;
  }): void {
    this.providers.set(
      input.id,
      buildRuntimeProviderRegistration(input as RuntimeProviderInput),
    );
  }

  /**
   * 获取已注册 provider。
   * @param provider 指定 provider，可选
   * @returns 运行时 provider 注册信息
   */
  private getRegistration(provider?: string): RuntimeProviderRegistration {
    const fallbackProvider = this.providers.keys().next().value as string | undefined;
    const providerId = provider ?? fallbackProvider;
    const registration = providerId ? this.providers.get(providerId) : undefined;

    if (!registration) {
      throw new Error(
        `AI provider "${providerId ?? 'unset'}" is not configured. Available providers: ${this.getAvailableProviders().join(', ')}`,
      );
    }

    return registration;
  }

  /**
   * 构建统一的模型配置。
   * @param registration provider 注册信息
   * @param modelId 模型 ID
   * @returns 统一模型配置
   */
  private buildModelConfig(
    registration: RuntimeProviderRegistration,
    modelId: string,
  ): ModelConfig {
    return buildRuntimeModelConfig(registration, modelId);
  }
}

/**
 * 自定义供应商服务
 *
 * 输入:
 * - 自定义供应商配置
 * - 自定义模型配置
 *
 * 输出:
 * - 注册后的供应商配置
 * - 注册后的模型配置
 *
 * 预期行为:
 * - 只支持 openai / anthropic / gemini 三种兼容请求格式
 * - 为自定义供应商注册统一的 provider factory 和模型配置
 * - 为未显式提供能力的模型做基础能力推断
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ModelRegistryService } from '../registry/model-registry.service';
import { ProviderRegistryService } from '../registry/provider-registry.service';
import type {
  ModelConfig,
  ProviderConfig,
  ProviderId,
  ProviderInstance,
  ProviderOptions,
} from '../types';
import { createProviderId } from '../types';
import {
  discoverCompatibleModels,
  getCompatibleProviderFormatMetadata,
} from './custom-provider.helpers';
import {
  createCustomModelConfig,
  createCustomProviderConfig,
  createDiscoveredModelConfig,
  inferCustomProviderCapabilities,
} from './custom-provider-model.helpers';
import type {
  CompatibleProviderFormat,
  CustomModelDto,
  RegisterCustomProviderDto,
} from './custom-provider.types';

/**
 * 自定义供应商服务。
 */
@Injectable()
export class CustomProviderService {
  private readonly logger = new Logger(CustomProviderService.name);
  private readonly customProviderIds = new Set<ProviderId>();

  constructor(
    private readonly configService: ConfigService,
    private readonly providerRegistry: ProviderRegistryService,
    private readonly modelRegistry: ModelRegistryService,
  ) {}

  /**
   * 注册自定义供应商。
   * @param dto 注册请求
   * @returns 注册后的供应商配置
   */
  async registerProvider(dto: RegisterCustomProviderDto): Promise<ProviderConfig> {
    const providerId = createProviderId(dto.id);
    const format = dto.format ?? 'openai';
    const metadata = getCompatibleProviderFormatMetadata(format);

    if (this.providerRegistry.hasProvider(providerId)) {
      this.logger.warn(`供应商 ${providerId} 已存在，将覆盖注册`);
    }

    const config = createCustomProviderConfig(providerId, dto, metadata.npm, format);

    this.providerRegistry.registerProvider(
      config,
      this.createProviderFactory(dto, format),
    );
    this.customProviderIds.add(providerId);

    const models = dto.models?.length
      ? dto.models.map((modelDto) =>
          createCustomModelConfig(providerId, modelDto, dto.baseUrl, metadata.npm),
        )
      : (
          await discoverCompatibleModels({
            dto,
            format,
            resolveApiKey: (item) => this.resolveApiKey(item),
            logDebug: (message) => this.logger.debug(message),
          })
        ).map((item) =>
          createDiscoveredModelConfig(providerId, item, dto.baseUrl, metadata.npm),
        );

    for (const model of models) {
      this.modelRegistry.register(model);
    }

    this.logger.log(`已注册自定义供应商 ${providerId}，格式 ${format}`);
    return config;
  }

  /**
   * 注销自定义供应商。
   * @param providerId 供应商 ID
   * @returns 是否注销成功
   */
  unregisterProvider(providerId: ProviderId): boolean {
    if (!this.customProviderIds.has(providerId)) {
      this.logger.warn(`供应商 ${providerId} 不是自定义供应商`);
      return false;
    }

    const removed = this.providerRegistry.unregisterProvider(providerId);
    if (!removed) {
      return false;
    }

    this.customProviderIds.delete(providerId);
    this.modelRegistry.clearProviderModels(providerId);
    return true;
  }

  /**
   * 获取所有自定义供应商 ID。
   * @returns 自定义供应商 ID 列表
   */
  getCustomProviderIds(): ProviderId[] {
    return Array.from(this.customProviderIds);
  }

  /**
   * 为已注册的自定义供应商添加模型。
   * @param providerId 供应商 ID
   * @param modelDto 模型配置
   * @returns 注册后的模型配置，失败返回 null
   */
  registerModel(
    providerId: ProviderId,
    modelDto: CustomModelDto,
  ): ModelConfig | null {
    if (!this.customProviderIds.has(providerId)) {
      this.logger.error(`供应商 ${providerId} 不是自定义供应商`);
      return null;
    }

    const config = this.providerRegistry.getProviderConfig(providerId);
    if (!config?.api || !config.npm) {
      return null;
    }

    const modelConfig = createCustomModelConfig(
      providerId,
      modelDto,
      config.api,
      config.npm,
    );
    this.modelRegistry.register(modelConfig);
    return modelConfig;
  }

  /**
   * 创建 provider factory。
   * @param dto 注册请求
   * @param format 兼容请求格式
   * @returns provider factory
   */
  private createProviderFactory(
    dto: RegisterCustomProviderDto,
    format: CompatibleProviderFormat,
  ): (options: ProviderOptions) => ProviderInstance {
    return (options: ProviderOptions): ProviderInstance => {
      const metadata = getCompatibleProviderFormatMetadata(format);
      const provider = metadata.createInstance(
        dto,
        options,
        (item) => this.resolveApiKey(item),
      );

      return {
        createModel: (modelId: string) => provider.chat(modelId),
        getModelCapabilities: (modelId: string) =>
          inferCustomProviderCapabilities(modelId, dto.models),
        getConfig: () => ({
          id: createProviderId(dto.id),
          name: dto.name,
          api: dto.baseUrl,
          npm: metadata.npm,
          env: dto.apiKeyEnv ? [dto.apiKeyEnv] : [],
          type: format,
          options: dto.options,
        }),
        getModelConfig: (modelId: string) =>
          this.modelRegistry.getModel(createProviderId(dto.id), modelId),
        listModels: () => this.modelRegistry.listModels(createProviderId(dto.id)),
        getReasoningVariants: () => ({}),
      };
    };
  }

  /**
   * 解析 API Key。
   * @param dto 注册请求
   * @returns 可用的 API Key，未找到时返回空字符串
   */
  private resolveApiKey(dto: RegisterCustomProviderDto): string {
    if (dto.apiKey) {
      return dto.apiKey;
    }

    if (dto.apiKeyEnv) {
      const envValue = this.configService.get<string>(dto.apiKeyEnv);
      if (envValue) {
        return envValue;
      }
    }

    for (const key of [
      `${dto.id.toUpperCase()}_API_KEY`,
      `${dto.id.toUpperCase()}_KEY`,
      'API_KEY',
    ]) {
      const value = this.configService.get<string>(key);
      if (value) {
        return value;
      }
    }

    return '';
  }
}

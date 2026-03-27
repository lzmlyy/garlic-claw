/**
 * AI provider 诊断服务
 *
 * 输入:
 * - 已保存的 provider 配置
 * - 可选的测试模型 ID
 *
 * 输出:
 * - 远程拉取到的模型列表
 * - 一次最小聊天请求的测试连接结果
 *
 * 预期行为:
 * - 按 provider 驱动构造正确的模型发现请求
 * - 对大量模型返回标准化后的轻量列表
 * - 测试连接时真实调用统一模型入口与文本生成链路
 */

import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toJsonValue } from '../common/utils/json-value';
import { AiProviderService } from './ai-provider.service';
import {
  type AiProviderConnectionTestResult,
  buildModelDiscoveryRequest,
  type DiscoveredAiModel,
  extractDiscoveredModels,
  getConfiguredModelsFallback,
} from './ai-provider-diagnostics.helpers';
import type { StoredAiProviderConfig } from './config/config-manager.service';
import { ConfigManagerService } from './config/config-manager.service';
import { runGenerateText } from './sdk-adapter';

@Injectable()
export class AiProviderDiagnosticsService {
  private static readonly TEST_CONNECTION_PROMPT = '请只回复 OK';
  private static readonly REQUEST_TIMEOUT_MS = 10000;

  constructor(
    private readonly configManager: ConfigManagerService,
    private readonly aiProvider: AiProviderService,
  ) {}

  /**
   * 拉取 provider 的远程模型列表。
   * @param providerId provider ID
   * @returns 标准化后的模型列表
   */
  async discoverModels(providerId: string): Promise<DiscoveredAiModel[]> {
    const provider = this.getProvider(providerId);
    const request = buildModelDiscoveryRequest(provider);

    try {
      const response = await fetch(request.url, {
        method: 'GET',
        headers: request.headers,
        signal: AbortSignal.timeout(AiProviderDiagnosticsService.REQUEST_TIMEOUT_MS),
      });

      if (!response.ok) {
        throw new BadGatewayException(
          `Failed to discover models for provider "${providerId}" (${response.status})`,
        );
      }

      const payload = toJsonValue(await response.json());
      const discovered = extractDiscoveredModels(payload);
      if (discovered.length > 0) {
        return discovered;
      }

      return getConfiguredModelsFallback(provider);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof BadGatewayException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      throw new BadGatewayException(
        `Failed to discover models for provider "${providerId}": ${String(error)}`,
      );
    }
  }

  /**
   * 对 provider 发起一次最小聊天请求，验证连接是否可用。
   * @param providerId provider ID
   * @param modelId 可选模型 ID
   * @returns 测试连接结果
   */
  async testConnection(
    providerId: string,
    modelId?: string,
  ): Promise<AiProviderConnectionTestResult> {
    const provider = this.getProvider(providerId);
    const resolvedModelId = await this.resolveTestModelId(provider, modelId);
    const model = this.aiProvider.getModel(providerId, resolvedModelId);
    const result = await runGenerateText({
      model,
      messages: [
        {
          role: 'user',
          content: AiProviderDiagnosticsService.TEST_CONNECTION_PROMPT,
        },
      ],
      maxOutputTokens: 32,
    });

    return {
      ok: true,
      providerId,
      modelId: resolvedModelId,
      text: result.text.trim(),
    };
  }

  /**
   * 获取 provider 配置。
   * @param providerId provider ID
   * @returns 已保存的 provider 配置
   */
  private getProvider(providerId: string): StoredAiProviderConfig {
    const provider = this.configManager.getProviderConfig(providerId);
    if (!provider) {
      throw new NotFoundException(`Provider "${providerId}" not found`);
    }

    return provider;
  }

  /**
   * 解析测试连接时要使用的模型 ID。
   * @param provider provider 配置
   * @param requestedModelId 手动指定的模型 ID
   * @returns 最终模型 ID
   */
  private async resolveTestModelId(
    provider: StoredAiProviderConfig,
    requestedModelId?: string,
  ): Promise<string> {
    const directModelId =
      requestedModelId ?? provider.defaultModel ?? provider.models[0];
    if (directModelId) {
      return directModelId;
    }

    const discovered = await this.discoverModels(provider.id);
    const fallbackModelId = discovered[0]?.id;
    if (fallbackModelId) {
      return fallbackModelId;
    }

    throw new BadRequestException(
      `Provider "${provider.id}" does not have any testable model`,
    );
  }
}

/**
 * 图片转文字服务
 *
 * 输入:
 * - 图片 data URL 或远程 URL
 * - 图片 MIME 类型
 *
 * 输出:
 * - 适合文本模型消费的图片描述
 *
 * 预期行为:
 * - 当开启视觉转述模型时，使用指定 provider/model 生成图片描述
 * - 未配置视觉转述模型时明确报错
 */

import { Injectable } from '@nestjs/common';
import type { VisionFallbackConfig } from '@garlic-claw/shared';
import { toAiSdkImageInput } from '../../common/utils/ai-sdk-image';
import { AiProviderService } from '../ai-provider.service';
import { ConfigManagerService } from '../config/config-manager.service';
import { runGenerateText } from '../sdk-adapter';

@Injectable()
export class ImageToTextService {
  private static readonly DEFAULT_PROMPT =
    '请简洁但完整地描述这张图片中的主体、场景、文字和重要细节，供另一个文本模型继续理解上下文。';

  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly configManager: ConfigManagerService,
  ) {}

  /**
   * 获取视觉转述配置。
   * @returns 当前视觉转述配置，未启用时返回 null
   */
  getConfig(): VisionFallbackConfig | null {
    const managedState = this.configManager.getVisionFallbackConfig();
    if (!managedState.enabled || !managedState.providerId || !managedState.modelId) {
      return null;
    }

    return {
      enabled: true,
      providerId: managedState.providerId,
      modelId: managedState.modelId,
      prompt: managedState.prompt,
      maxDescriptionLength: managedState.maxDescriptionLength,
    };
  }

  /**
   * 检查视觉转述是否可用。
   * @returns 当前是否存在可用的视觉转述配置
   */
  hasVisionFallback(): boolean {
    return this.getConfig() !== null;
  }

  /**
   * 将图片转为文本描述。
   * @param imageData 图片 data URL 或远程 URL
   * @param _mimeType 图片 MIME 类型，当前仅为调用侧保留接口
   * @returns 图片描述文本
   */
  async imageToText(
    imageData: string,
    _mimeType = 'image/png',
  ): Promise<string> {
    const config = this.getConfig();
    if (!config?.providerId || !config.modelId) {
      throw new Error('Vision fallback is not configured');
    }

    const model = this.aiProvider.getModel(config.providerId, config.modelId);
    const result = await runGenerateText({
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: config.prompt ?? ImageToTextService.DEFAULT_PROMPT,
            },
            {
              type: 'image',
              image: toAiSdkImageInput(imageData),
            } as never,
          ],
        },
      ],
      maxOutputTokens: 500,
    });

    const description = result.text.trim();
    if (config.maxDescriptionLength === 0) {
      return description;
    }

    const maxLength = config.maxDescriptionLength ?? 1000;
    if (description.length <= maxLength) {
      return description;
    }

    return `${description.slice(0, maxLength)}...`;
  }
}

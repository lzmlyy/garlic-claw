import type { ChatMessagePart } from '@garlic-claw/shared';
import { Injectable } from '@nestjs/common';
import { AiModelExecutionService } from '../ai/ai-model-execution.service';
import { AiProviderSettingsService } from '../ai-management/ai-provider-settings.service';

@Injectable()
export class AiVisionService {
  private static readonly DEFAULT_PROMPT =
    '请简洁但完整地描述这张图片中的主体、场景、文字和重要细节，供另一个文本模型继续理解上下文。';

  private readonly transcriptions = new Map<string, string>();

  constructor(
    private readonly aiModelExecutionService: AiModelExecutionService,
    private readonly aiProviderSettingsService: AiProviderSettingsService = new AiProviderSettingsService(),
  ) {}

  async resolveImageText(
    conversationId: string,
    image: string,
    mimeType = 'image/png',
  ) {
    const cacheKey = `${conversationId}:${image}`;
    const cached = this.transcriptions.get(cacheKey);
    if (cached) {
      return {
        source: 'cache',
        text: cached,
      };
    }

    const config = this.aiProviderSettingsService.getVisionFallbackConfig();
    if (!config.enabled || !config.providerId || !config.modelId) {
      return {
        source: null,
        text: null,
      };
    }

    const executed = await this.aiModelExecutionService.generateText({
      maxOutputTokens: 500,
      messages: [
        {
          content: [
            {
              text: config.prompt ?? AiVisionService.DEFAULT_PROMPT,
              type: 'text',
            },
            {
              image,
              mimeType,
              type: 'image',
            },
          ],
          role: 'user',
        },
      ],
      modelId: config.modelId,
      providerId: config.providerId,
    });
    const text = trimVisionText(
      executed.text,
      config.maxDescriptionLength,
    );
    this.transcriptions.set(cacheKey, text);

    return {
      source: 'generated',
      text,
    };
  }

  async resolveMessageParts(
    conversationId: string,
    parts: ChatMessagePart[],
  ): Promise<ChatMessagePart[]> {
    const descriptions = (await Promise.all(
      parts
        .filter((part): part is Extract<ChatMessagePart, { type: 'image' }> => part.type === 'image')
        .map(async (part) => {
          const resolved = await this.resolveImageText(conversationId, part.image, part.mimeType);
          return resolved.text
            ? {
                text: `图片说明：${resolved.text}`,
                type: 'text' as const,
              }
            : null;
        }),
    )).filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part !== null);

    return descriptions.length > 0 ? [...parts, ...descriptions] : parts;
  }
}

function trimVisionText(
  value: string,
  maxLength: number | undefined,
): string {
  const text = value.trim();
  if (!text || maxLength === 0 || maxLength === undefined || text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}...`;
}

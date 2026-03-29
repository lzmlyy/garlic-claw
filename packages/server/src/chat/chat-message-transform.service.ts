/**
 * 聊天消息降级转换服务
 *
 * 输入:
 * - 会话 ID
 * - 运行时消息列表
 * - 目标模型配置
 *
 * 输出:
 * - 可直接传给模型的降级后消息
 *
 * 预期行为:
 * - 模型支持图片时保留原始 image part
 * - 模型不支持图片时优先复用会话级转述缓存
 * - 无缓存时在已启用视觉转述的情况下生成文本描述
 */

import { Injectable } from '@nestjs/common';
import type { ModelConfig } from '../ai/types/provider.types';
import { ImageToTextService } from '../ai/vision/image-to-text.service';
import { ImageTranscriptionCacheService } from '../ai/vision/image-transcription-cache.service';
import type { ChatRuntimeMessage } from './chat-message-session';

interface VisionFallbackTraceEntry {
  text: string;
  source: 'cache' | 'generated';
}

export interface ChatMessageTransformResult {
  messages: ChatRuntimeMessage[];
  visionFallback: {
    entries: VisionFallbackTraceEntry[];
  } | null;
}

@Injectable()
export class ChatMessageTransformService {
  constructor(
    private readonly imageCache: ImageTranscriptionCacheService,
    private readonly imageToText: ImageToTextService,
  ) {}

  /**
   * 按模型能力转换消息列表。
   * @param conversationId 会话 ID
   * @param messages 运行时消息列表
   * @param model 模型配置
   * @returns 转换后的消息列表
   */
  async transformMessages(
    conversationId: string,
    messages: ChatRuntimeMessage[],
    model: ModelConfig,
  ): Promise<ChatMessageTransformResult> {
    if (model.capabilities.input.image) {
      return {
        messages,
        visionFallback: null,
      };
    }

    const transformedMessages: ChatRuntimeMessage[] = [];
    const visionFallbackEntries: VisionFallbackTraceEntry[] = [];
    const latestUserMessageIndex = findLatestUserMessageIndex(messages);

    for (const [messageIndex, message] of messages.entries()) {
      if (message.role !== 'user' || typeof message.content === 'string') {
        transformedMessages.push(message);
        continue;
      }

      const transformedContent = [];

      for (const part of message.content) {
        if (part.type !== 'image') {
          transformedContent.push(part);
          continue;
        }

        const transformedPart = await this.transformImagePart(
          conversationId,
          part.image,
          part.mimeType,
        );
        transformedContent.push(transformedPart.part);
        if (transformedPart.trace && messageIndex === latestUserMessageIndex) {
          visionFallbackEntries.push(transformedPart.trace);
        }
      }

      transformedMessages.push({
        ...message,
        content: transformedContent,
      });
    }

    return {
      messages: transformedMessages,
      visionFallback: visionFallbackEntries.length > 0
        ? {
          entries: visionFallbackEntries,
        }
        : null,
    };
  }

  /**
   * 将图片 part 转换为文本描述 part。
   * @param conversationId 会话 ID
   * @param image 图片内容
   * @param mimeType 图片 MIME 类型
   * @returns 文本描述 part
   */
  private async transformImagePart(
    conversationId: string,
    image: string,
    mimeType?: string,
  ): Promise<{
    part: { type: 'text'; text: string };
    trace: VisionFallbackTraceEntry | null;
  }> {
    const cached = await this.imageCache.findTranscription(conversationId, image);
    if (cached) {
      return {
        part: {
          type: 'text',
          text: `[图片描述: ${cached}]`,
        },
        trace: {
          text: cached,
          source: 'cache',
        },
      };
    }

    if (!this.imageToText.hasVisionFallback()) {
      return {
        part: {
          type: 'text',
          text: '[用户上传了一个图片]',
        },
        trace: null,
      };
    }

    const transcription = await this.imageToText.imageToText(
      image,
      mimeType ?? 'image/png',
    );

    await this.imageCache.saveTranscription({
      conversationId,
      image,
      mimeType,
      transcription,
    });

    return {
      part: {
        type: 'text',
        text: `[图片描述: ${transcription}]`,
      },
      trace: {
        text: transcription,
        source: 'generated',
      },
    };
  }
}

function findLatestUserMessageIndex(messages: ChatRuntimeMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return index;
    }
  }

  return -1;
}

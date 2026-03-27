/**
 * 图片转述缓存服务
 *
 * 输入:
 * - 会话 ID
 * - 图片 data URL 或远程 URL
 * - 图片 MIME 类型与转述文本
 *
 * 输出:
 * - 缓存命中的转述文本
 * - 写入数据库的缓存记录
 *
 * 预期行为:
 * - 同会话同图片映射到稳定的 hash
 * - 使用 upsert 持久化转述结果，避免重复写入
 */

import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 保存图片转述时所需的参数。
 */
export interface SaveImageTranscriptionInput {
  /** 会话 ID。 */
  conversationId: string;
  /** 图片 data URL 或远程 URL。 */
  image: string;
  /** 图片 MIME 类型。 */
  mimeType?: string;
  /** 图片转述文本。 */
  transcription: string;
}

@Injectable()
export class ImageTranscriptionCacheService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 查询同会话同图片的转述缓存。
   * @param conversationId 会话 ID
   * @param image 图片内容
   * @returns 命中的转述文本，未命中则返回 null
   */
  async findTranscription(
    conversationId: string,
    image: string,
  ): Promise<string | null> {
    const imageHash = this.computeImageHash(image);
    const entry = await this.prisma.conversationImageTranscription.findUnique({
      where: {
        conversationId_imageHash: {
          conversationId,
          imageHash,
        },
      },
    });

    return entry?.transcription ?? null;
  }

  /**
   * 保存或更新图片转述缓存。
   * @param input 写入缓存所需的参数
   * @returns upsert 后的缓存记录
   */
  async saveTranscription(input: SaveImageTranscriptionInput) {
    const imageHash = this.computeImageHash(input.image);

    return this.prisma.conversationImageTranscription.upsert({
      where: {
        conversationId_imageHash: {
          conversationId: input.conversationId,
          imageHash,
        },
      },
      create: {
        conversationId: input.conversationId,
        imageHash,
        mimeType: input.mimeType,
        transcription: input.transcription,
      },
      update: {
        mimeType: input.mimeType,
        transcription: input.transcription,
      },
    });
  }

  /**
   * 计算图片稳定 hash。
   * @param image 图片 data URL 或远程 URL
   * @returns SHA-256 hash
   */
  private computeImageHash(image: string): string {
    const normalizedImage = image.startsWith('data:')
      ? image.replace(/^data:[^;]+;base64,/, '')
      : image;

    return createHash('sha256').update(normalizedImage).digest('hex');
  }
}

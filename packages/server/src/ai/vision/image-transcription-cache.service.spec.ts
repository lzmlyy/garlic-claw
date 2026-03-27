/**
 * 图片转述缓存服务测试
 *
 * 输入:
 * - 会话 ID
 * - 图片 data URL
 * - 图片转述文本
 *
 * 输出:
 * - 断言缓存查询使用稳定 hash
 * - 断言缓存写入使用会话 + hash 的唯一键
 *
 * 预期行为:
 * - 同一图片在同一会话中命中相同缓存键
 * - 写入时使用 upsert，避免重复记录
 */

import { createHash } from 'node:crypto';
import { ImageTranscriptionCacheService } from './image-transcription-cache.service';

describe('ImageTranscriptionCacheService', () => {
  const prisma = {
    conversationImageTranscription: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
  };

  let service: ImageTranscriptionCacheService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ImageTranscriptionCacheService(prisma as never);
  });

  it('reads and writes transcription cache entries with a stable conversation/image hash key', async () => {
    prisma.conversationImageTranscription.findUnique.mockResolvedValue({
      transcription: '图片里是一只猫',
    });
    prisma.conversationImageTranscription.upsert.mockResolvedValue({
      id: 'cache-1',
    });

    const image = 'data:image/png;base64,abc123';
    const expectedHash = createHash('sha256').update('abc123').digest('hex');

    await expect(
      service.findTranscription('conversation-1', image),
    ).resolves.toBe('图片里是一只猫');

    expect(prisma.conversationImageTranscription.findUnique).toHaveBeenCalledWith(
      {
        where: {
          conversationId_imageHash: {
            conversationId: 'conversation-1',
            imageHash: expectedHash,
          },
        },
      },
    );

    await service.saveTranscription({
      conversationId: 'conversation-1',
      image,
      mimeType: 'image/png',
      transcription: '图片里是一只猫',
    });

    expect(prisma.conversationImageTranscription.upsert).toHaveBeenCalledWith({
      where: {
        conversationId_imageHash: {
          conversationId: 'conversation-1',
          imageHash: expectedHash,
        },
      },
      create: {
        conversationId: 'conversation-1',
        imageHash: expectedHash,
        mimeType: 'image/png',
        transcription: '图片里是一只猫',
      },
      update: {
        mimeType: 'image/png',
        transcription: '图片里是一只猫',
      },
    });
  });
});

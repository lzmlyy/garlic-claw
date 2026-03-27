/**
 * 聊天消息降级转换服务测试
 *
 * 输入:
 * - 会话 ID
 * - 包含图片的用户消息
 * - 不支持图片输入的模型配置
 *
 * 输出:
 * - 断言图片会先查缓存，未命中时调用视觉转述
 * - 断言转述结果会被替换为文本并写入缓存
 *
 * 预期行为:
 * - 同会话图片降级时复用缓存
 * - 不支持图片的模型不会直接收到 image part
 */

import type { ModelConfig } from '../ai/types/provider.types';
import { ChatMessageTransformService } from './chat-message-transform.service';

describe('ChatMessageTransformService', () => {
  const imageCache = {
    findTranscription: jest.fn(),
    saveTranscription: jest.fn(),
  };

  const imageToText = {
    hasVisionFallback: jest.fn(),
    imageToText: jest.fn(),
  };

  let service: ChatMessageTransformService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ChatMessageTransformService(
      imageCache as never,
      imageToText as never,
    );
  });

  it('replaces unsupported image parts with cached or generated descriptions', async () => {
    const model = {
      id: 'text-only-model',
      providerId: 'openai',
      name: 'Text Only',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: false,
        toolCall: true,
      },
      api: {
        id: 'text-only-model',
        url: 'https://example.com',
        npm: '@ai-sdk/openai',
      },
    } satisfies ModelConfig;

    imageCache.findTranscription.mockResolvedValueOnce(null);
    imageToText.hasVisionFallback.mockReturnValue(true);
    imageToText.imageToText.mockResolvedValue('图片里是一只猫');

    const transformed = await service.transformMessages('conversation-1', [
      {
        role: 'user',
        content: [
          { type: 'text', text: '请描述这张图片' },
          {
            type: 'image',
            image: 'data:image/png;base64,abc123',
            mimeType: 'image/png',
          },
        ],
      },
    ], model);

    expect(imageCache.findTranscription).toHaveBeenCalledWith(
      'conversation-1',
      'data:image/png;base64,abc123',
    );
    expect(imageToText.imageToText).toHaveBeenCalledWith(
      'data:image/png;base64,abc123',
      'image/png',
    );
    expect(imageCache.saveTranscription).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      image: 'data:image/png;base64,abc123',
      mimeType: 'image/png',
      transcription: '图片里是一只猫',
    });
    expect(transformed).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: '请描述这张图片' },
          { type: 'text', text: '[图片描述: 图片里是一只猫]' },
        ],
      },
    ]);
  });

  it('preserves the original transcription error when vision transcription fails', async () => {
    const model = {
      id: 'text-only-model',
      providerId: 'openai',
      name: 'Text Only',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: false,
        toolCall: true,
      },
      api: {
        id: 'text-only-model',
        url: 'https://example.com',
        npm: '@ai-sdk/openai',
      },
    } satisfies ModelConfig;

    imageCache.findTranscription.mockResolvedValueOnce(null);
    imageToText.hasVisionFallback.mockReturnValue(true);
    imageToText.imageToText.mockRejectedValue(new Error('vision provider unavailable'));

    await expect(
      service.transformMessages(
        'conversation-1',
        [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: 'data:image/png;base64,abc123',
                mimeType: 'image/png',
              },
            ],
          },
        ],
        model,
      ),
    ).rejects.toThrow('vision provider unavailable');
    expect(imageCache.saveTranscription).not.toHaveBeenCalled();
  });
});

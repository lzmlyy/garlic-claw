/**
 * 聊天运行时消息转 AI SDK 消息测试
 *
 * 输入:
 * - 包含 data URL 图片的运行时消息
 *
 * 输出:
 * - AI SDK 可消费的消息列表
 *
 * 预期行为:
 * - data URL 图片在进入 AI SDK 前会转成二进制
 * - 远程 URL 仍保留字符串形式
 */

import { toAiSdkMessages } from './sdk-message-converter';

describe('sdk-message-converter', () => {
  it('converts data url images to binary content before calling the AI SDK', () => {
    const messages = toAiSdkMessages([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: 'data:image/png;base64,QUJDRA==',
            mimeType: 'image/png',
          },
        ],
      },
    ]);

    expect(messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: expect.any(ArrayBuffer),
            mimeType: 'image/png',
          },
        ],
      },
    ]);
  });
});

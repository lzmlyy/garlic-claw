/**
 * 聊天消息会话载荷测试
 *
 * 输入:
 * - 历史持久化消息
 * - 新的用户文本/图片 parts
 *
 * 输出:
 * - 可写入数据库的纯文本摘要与 parts JSON
 * - 可传给模型的结构化消息列表
 *
 * 预期行为:
 * - 历史 parts 会恢复为结构化消息
 * - 新消息会同时生成写库载荷和模型消息
 */

import { prepareSendMessagePayload } from './chat-message-session';

describe('chat-message-session', () => {
  it('prepares persisted payload and model messages from structured parts', () => {
    const payload = prepareSendMessagePayload({
      history: [
        {
          role: 'user',
          content: '历史图片消息',
          partsJson: JSON.stringify([
            { type: 'text', text: '之前发过这张图' },
            {
              type: 'image',
              image: 'data:image/png;base64,history',
              mimeType: 'image/png',
            },
          ]),
        },
      ],
      input: {
        parts: [
          { type: 'text', text: '帮我看看这张图' },
          {
            type: 'image',
            image: 'data:image/png;base64,current',
            mimeType: 'image/png',
          },
        ],
      },
    });

    expect(payload.persistedMessage).toEqual({
      content: '帮我看看这张图',
      partsJson: JSON.stringify([
        { type: 'text', text: '帮我看看这张图' },
        {
          type: 'image',
          image: 'data:image/png;base64,current',
          mimeType: 'image/png',
        },
      ]),
    });

    expect(payload.searchableContent).toBe('帮我看看这张图');
    expect(payload.modelMessages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: '之前发过这张图' },
          {
            type: 'image',
            image: 'data:image/png;base64,history',
            mimeType: 'image/png',
          },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: '帮我看看这张图' },
          {
            type: 'image',
            image: 'data:image/png;base64,current',
            mimeType: 'image/png',
          },
        ],
      },
    ]);
  });
});

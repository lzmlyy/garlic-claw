/**
 * 聊天消息 parts 工具测试
 *
 * 输入:
 * - 纯文本 content
 * - 结构化 parts
 *
 * 输出:
 * - 标准化后的文本/图片 parts
 * - 可持久化的纯文本摘要和 JSON 字符串
 *
 * 预期行为:
 * - 纯文本输入会被归一化为 text part
 * - text/image 混合输入会保留原顺序
 * - 空输入会被拒绝
 */

import {
  deserializeMessageParts,
  normalizeUserMessageInput,
  serializeMessageParts,
} from './message-parts';

describe('message-parts', () => {
  it('normalizes plain text content into a single text part', () => {
    const normalized = normalizeUserMessageInput({
      content: 'Hello world',
    });

    expect(normalized.parts).toEqual([
      { type: 'text', text: 'Hello world' },
    ]);
    expect(normalized.content).toBe('Hello world');
    expect(normalized.hasImages).toBe(false);
  });

  it('preserves mixed text and image parts while deriving plain text content', () => {
    const normalized = normalizeUserMessageInput({
      parts: [
        { type: 'text', text: 'Look at this image' },
        { type: 'image', image: 'data:image/png;base64,abc', mimeType: 'image/png' },
        { type: 'text', text: 'And describe it' },
      ],
    });

    expect(normalized.parts).toEqual([
      { type: 'text', text: 'Look at this image' },
      { type: 'image', image: 'data:image/png;base64,abc', mimeType: 'image/png' },
      { type: 'text', text: 'And describe it' },
    ]);
    expect(normalized.content).toBe('Look at this image\nAnd describe it');
    expect(normalized.hasImages).toBe(true);
  });

  it('drops blank text parts but keeps non-text parts', () => {
    const normalized = normalizeUserMessageInput({
      parts: [
        { type: 'text', text: '   ' },
        { type: 'image', image: 'data:image/png;base64,abc' },
      ],
    });

    expect(normalized.parts).toEqual([
      { type: 'image', image: 'data:image/png;base64,abc' },
    ]);
    expect(normalized.content).toBe('');
    expect(normalized.hasImages).toBe(true);
  });

  it('serializes and deserializes message parts for persistence', () => {
    const parts = [
      { type: 'text', text: 'Stored text' },
      { type: 'image', image: 'data:image/png;base64,abc', mimeType: 'image/png' },
    ] as const;

    const serialized = serializeMessageParts(parts);
    const deserialized = deserializeMessageParts(serialized);

    expect(deserialized).toEqual(parts);
  });

  it('rejects empty content and empty parts', () => {
    expect(() =>
      normalizeUserMessageInput({
        content: '   ',
        parts: [],
      }),
    ).toThrow('Message content is empty');
  });
});

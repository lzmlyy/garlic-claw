/**
 * 聊天运行时消息转 AI SDK 消息工具
 *
 * 输入:
 * - 聊天运行时消息
 *
 * 输出:
 * - AI SDK 可消费的消息
 *
 * 预期行为:
 * - 保留文本 part
 * - 将 data URL 图片在最后一层转成二进制
 */

import type { AiSdkMessage } from '../ai/sdk-adapter';
import { toAiSdkImageInput } from '../common/utils/ai-sdk-image';
import type { ChatRuntimeMessage } from './chat-message-session';

/**
 * 将聊天运行时消息转换为 AI SDK 消息。
 * @param messages 聊天运行时消息
 * @returns AI SDK 可消费的消息数组
 */
export function toAiSdkMessages(
  messages: ChatRuntimeMessage[],
): AiSdkMessage[] {
  return messages.map((message) => ({
    role: message.role,
    content:
      typeof message.content === 'string'
        ? message.content
        : message.content.map((part) =>
            part.type === 'text'
              ? {
                  type: 'text',
                  text: part.text,
                }
              : {
                  type: 'image',
                  image: toAiSdkImageInput(part.image),
                  mimeType: part.mimeType,
                },
          ),
  }));
}

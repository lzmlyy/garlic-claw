import {
  restoreModelMessageContent,
  type UserMessageInput,
} from '@garlic-claw/shared';
import type { ChatRuntimeMessage } from './chat-message-session';
import type { SendMessagePartDto } from './dto/chat.dto';
import { DEFAULT_PERSONA_PROMPT } from '../persona/default-persona';

export const CHAT_SYSTEM_PROMPT = DEFAULT_PERSONA_PROMPT;

/**
 * 将 DTO 中的文本/图片输入映射为领域层消息输入。
 * @param parts 结构化消息 part DTO
 * @param content 纯文本兜底内容
 * @returns 可被消息层消费的用户输入
 */
export function toUserMessageInput(
  parts: SendMessagePartDto[] | undefined,
  content?: string,
): UserMessageInput {
  return {
    content,
    parts: parts ? mapDtoParts(parts) : undefined,
  };
}

/**
 * 将 DTO part 映射为领域层 part。
 * @param parts DTO parts
 * @returns 领域层可消费的 part 数组
 */
export function mapDtoParts(parts: SendMessagePartDto[]) {
  return parts.map((part) =>
    part.type === 'text'
      ? { type: 'text' as const, text: part.text ?? '' }
      : {
          type: 'image' as const,
          image: part.image ?? '',
          mimeType: part.mimeType,
        },
  );
}

/**
 * 从历史消息恢复运行时消息列表。
 * @param messages 已持久化的历史消息
 * @returns 可直接送入模型转换链路的运行时消息
 */
export function toRuntimeMessages(
  messages: Array<{ role: string; content: string | null; partsJson: string | null }>,
): ChatRuntimeMessage[] {
  return messages.map((message) => ({
    role: normalizeMessageRole(message.role),
    content: restoreModelMessageContent(message),
  }));
}

/**
 * 判断当前对话里是否仍有未结束的 assistant 消息。
 * @param messages 对话消息列表
 * @returns 是否存在 pending/streaming 的 assistant 消息
 */
export function hasActiveAssistantMessage(
  messages: Array<{ role: string; status: string }>,
): boolean {
  return messages.some(
    (message) =>
      message.role === 'assistant' &&
      (message.status === 'pending' || message.status === 'streaming'),
  );
}

/**
 * 归一化消息角色，避免异常角色进入模型链路。
 * @param role 原始角色
 * @returns 受支持的角色
 */
export function normalizeMessageRole(role: string): ChatRuntimeMessage['role'] {
  return role === 'assistant' || role === 'system' || role === 'tool'
    ? role
    : 'user';
}

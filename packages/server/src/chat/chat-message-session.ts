/**
 * 聊天消息会话载荷工具
 *
 * 输入:
 * - 历史持久化消息
 * - 新的用户文本或结构化 parts 输入
 *
 * 输出:
 * - 供数据库写入的消息载荷
 * - 供模型调用的消息列表
 * - 供记忆检索使用的纯文本摘要
 *
 * 预期行为:
 * - 恢复历史消息中的结构化 parts
 * - 保留新消息的原始 parts JSON
 * - 为聊天服务提供稳定的会话消息准备逻辑
 */

import type { ChatImagePart, ChatTextPart, PersistedChatMessage, UserMessageInput } from './message-parts';
import {
  normalizeUserMessageInput,
  restoreModelMessageContent,
  serializeMessageParts,
  toModelMessageContent,
} from './message-parts';

/**
 * 运行时可消费的聊天消息内容。
 */
export type ChatRuntimeMessageContent =
  | string
  | Array<ChatTextPart | ChatImagePart>;

/**
 * 运行时聊天消息。
 */
export interface ChatRuntimeMessage {
  /** 消息角色。 */
  role: 'user' | 'assistant' | 'system' | 'tool';
  /** 消息内容。 */
  content: ChatRuntimeMessageContent;
}

/**
 * 历史消息最小形状。
 */
export interface PersistedConversationMessage extends PersistedChatMessage {
  /** 消息角色。 */
  role: string;
}

/**
 * 发送消息前准备好的会话载荷。
 */
export interface PreparedSendMessagePayload {
  /** 供数据库写入的消息数据。 */
  persistedMessage: {
    content: string;
    partsJson: string;
  };
  /** 供模型调用的消息列表。 */
  modelMessages: ChatRuntimeMessage[];
  /** 供记忆检索使用的纯文本摘要。 */
  searchableContent: string;
}

/**
 * 构建发送消息前需要的写库载荷与模型消息。
 * @param params 历史消息和新输入
 * @returns 准备好的消息载荷
 */
export function prepareSendMessagePayload(params: {
  history: PersistedConversationMessage[];
  input: UserMessageInput;
}): PreparedSendMessagePayload {
  const normalizedInput = normalizeUserMessageInput(params.input);

  return {
    persistedMessage: {
      content: normalizedInput.content,
      partsJson: serializeMessageParts(normalizedInput.parts),
    },
    modelMessages: [
      ...params.history.map((message) => ({
        role: normalizeRole(message.role),
        content: restoreModelMessageContent(message),
      })),
      {
        role: 'user',
        content: toModelMessageContent(
          normalizedInput.parts,
          normalizedInput.content,
        ),
      },
    ],
    searchableContent: normalizedInput.content,
  };
}

/**
 * 归一化消息角色，避免异常角色进入模型调用链。
 * @param role 原始角色
 * @returns 受支持的角色
 */
function normalizeRole(
  role: string,
): 'user' | 'assistant' | 'system' | 'tool' {
  if (
    role === 'user' ||
    role === 'assistant' ||
    role === 'system' ||
    role === 'tool'
  ) {
    return role;
  }

  return 'user';
}

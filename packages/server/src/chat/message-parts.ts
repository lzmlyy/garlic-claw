import type {
  ChatImagePart,
  ChatMessagePart,
  ChatTextPart,
} from '@garlic-claw/shared';

/**
 * 聊天消息 parts 工具
 *
 * 输入:
 * - 纯文本 content
 * - 结构化消息 parts
 *
 * 输出:
 * - 标准化后的消息 parts
 * - 纯文本摘要
 * - 可持久化的 JSON 字符串
 *
 * 预期行为:
 * - 将文本和图片输入统一成稳定的数据结构
 * - 为数据库持久化和消息转换提供公共基础能力
 */
export type {
  ChatImagePart,
  ChatMessagePart,
  ChatTextPart,
} from '@garlic-claw/shared';

/**
 * 用户消息输入。
 */
export interface UserMessageInput {
  /** 兼容纯文本输入。 */
  content?: string | null;
  /** 结构化消息 parts。 */
  parts?: ChatMessagePart[] | null;
}

/**
 * 标准化后的用户消息。
 */
export interface NormalizedUserMessageInput {
  /** 提取出的纯文本摘要。 */
  content: string;
  /** 标准化后的 parts。 */
  parts: ChatMessagePart[];
  /** 是否包含图片。 */
  hasImages: boolean;
}

/**
 * 已持久化的聊天消息最小形状。
 */
export interface PersistedChatMessage {
  /** 文本摘要。 */
  content?: string | null;
  /** 持久化的结构化 parts JSON。 */
  partsJson?: string | null;
}

/**
 * assistant 最终回复输入。
 */
export interface AssistantMessageOutputInput {
  /** 纯文本回复。 */
  content?: string | null;
  /** 结构化回复 parts。 */
  parts?: ChatMessagePart[] | null;
}

/**
 * 标准化后的 assistant 最终回复。
 */
export interface NormalizedAssistantMessageOutput {
  /** 纯文本摘要。 */
  content: string;
  /** 标准化后的结构化 parts。 */
  parts: ChatMessagePart[];
}

/**
 * 归一化用户消息输入。
 * @param input 用户输入
 * @returns 标准化后的消息结构
 */
export function normalizeUserMessageInput(
  input: UserMessageInput,
): NormalizedUserMessageInput {
  const normalizedParts = normalizeParts(input);
  if (normalizedParts.length === 0) {
    throw new Error('Message content is empty');
  }

  const content = deriveTextContentFromParts(normalizedParts);

  return {
    content,
    parts: normalizedParts,
    hasImages: normalizedParts.some((part) => part.type === 'image'),
  };
}

/**
 * 序列化消息 parts 以便持久化。
 * @param parts 标准化后的消息 parts
 * @returns JSON 字符串
 */
export function serializeMessageParts(parts: readonly ChatMessagePart[]): string {
  return JSON.stringify(parts);
}

/**
 * 反序列化已持久化的消息 parts。
 * @param value JSON 字符串
 * @returns 结构化消息 parts
 */
export function deserializeMessageParts(
  value?: string | null,
): ChatMessagePart[] {
  if (!value) {
    return [];
  }

  return JSON.parse(value) as ChatMessagePart[];
}

/**
 * 从结构化 parts 中提取纯文本摘要。
 * @param parts 标准化后的结构化 parts
 * @returns 提取出的纯文本内容
 */
export function deriveTextContentFromParts(
  parts: readonly ChatMessagePart[],
): string {
  return parts
    .filter((part): part is ChatTextPart => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}

/**
 * 标准化 assistant 最终回复。
 * @param input assistant 最终回复输入
 * @returns 可持久化、可传播的统一结果
 */
export function normalizeAssistantMessageOutput(
  input: AssistantMessageOutputInput,
): NormalizedAssistantMessageOutput {
  const normalizedParts = input.parts
    ? input.parts.flatMap((part) => normalizePart(part))
    : [];

  if (normalizedParts.length > 0) {
    return {
      content: deriveTextContentFromParts(normalizedParts),
      parts: normalizedParts,
    };
  }

  const text = input.content?.trim() ?? '';
  if (!text) {
    return {
      content: '',
      parts: [],
    };
  }

  return {
    content: text,
    parts: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

/**
 * 将结构化 parts 转为 AI SDK 可消费的消息内容。
 * @param parts 标准化后的消息 parts
 * @param fallbackContent 纯文本兜底内容
 * @returns 字符串或结构化内容数组
 */
export function toModelMessageContent(
  parts: readonly ChatMessagePart[],
  fallbackContent = '',
): string | Array<ChatTextPart | ChatImagePart> {
  if (parts.length === 0) {
    return fallbackContent;
  }

  const hasImages = parts.some((part) => part.type === 'image');
  if (!hasImages) {
    return deriveTextContentFromParts(parts);
  }

  return parts.map((part) =>
    part.type === 'text'
      ? { type: 'text', text: part.text }
      : {
          type: 'image',
          image: part.image,
          mimeType: part.mimeType,
        },
  );
}

/**
 * 从持久化记录恢复模型消息内容。
 * @param message 已持久化的消息记录
 * @returns 供模型调用的消息内容
 */
export function restoreModelMessageContent(
  message: PersistedChatMessage,
): string | Array<ChatTextPart | ChatImagePart> {
  const parts = deserializeMessageParts(message.partsJson);
  if (parts.length === 0) {
    return message.content || '';
  }

  return toModelMessageContent(parts, message.content || '');
}

/**
 * 将输入转换为标准化 parts。
 * @param input 用户输入
 * @returns 标准化后的 parts
 */
function normalizeParts(input: UserMessageInput): ChatMessagePart[] {
  if (input.parts && input.parts.length > 0) {
    return input.parts.flatMap((part) => normalizePart(part));
  }

  const text = input.content?.trim();
  if (!text) {
    return [];
  }

  return [{ type: 'text', text }];
}

/**
 * 归一化单个 part。
 * @param part 输入 part
 * @returns 标准化后的 part 数组
 */
function normalizePart(part: ChatMessagePart): ChatMessagePart[] {
  if (part.type === 'text') {
    const text = part.text.trim();
    return text ? [{ type: 'text', text }] : [];
  }

  return [part];
}

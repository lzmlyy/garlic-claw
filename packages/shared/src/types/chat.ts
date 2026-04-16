import type { JsonValue } from './json';

/**
 * 文本消息 part。
 */
export interface ChatTextPart {
  /** part 类型。 */
  type: 'text';
  /** 文本内容。 */
  text: string;
}

/**
 * 图片消息 part。
 */
export interface ChatImagePart {
  /** part 类型。 */
  type: 'image';
  /** 图片数据，支持 data URL 或远程 URL。 */
  image: string;
  /** 图片 MIME 类型。 */
  mimeType?: string;
}

/**
 * 聊天消息 part 联合类型。
 */
export type ChatMessagePart = ChatTextPart | ChatImagePart;

/**
 * 聊天消息状态。
 */
export type ChatMessageStatus =
  | 'pending'
  | 'streaming'
  | 'completed'
  | 'stopped'
  | 'error';

/**
 * 图像转述来源。
 */
export type ChatVisionFallbackEntrySource = 'cache' | 'generated';

/**
 * 单条图像转述结果。
 */
export interface ChatVisionFallbackEntry {
  /** 转述文本。 */
  text: string;
  /** 转述来源。 */
  source: ChatVisionFallbackEntrySource;
}

/**
 * 一条消息关联的图像转述元数据。
 */
export interface ChatVisionFallbackMetadata {
  /** 当前图像转述状态。 */
  state: 'transcribing' | 'completed';
  /** 已产生的转述列表。 */
  entries: ChatVisionFallbackEntry[];
}

/**
 * 聊天消息元数据。
 */
export interface ChatMessageMetadata {
  /** 本条消息关联的图像转述信息。 */
  visionFallback?: ChatVisionFallbackMetadata;
}

/**
 * 会话级宿主服务开关。
 */
export interface ConversationHostServices {
  /** 当前会话宿主服务总开关。 */
  sessionEnabled: boolean;
  /** 当前会话是否允许 LLM 自动回复。 */
  llmEnabled: boolean;
  /** 为未来 TTS 预留的会话级开关。 */
  ttsEnabled: boolean;
}

/**
 * 对话中的消息数量统计。
 */
export interface ConversationCount {
  /** 消息数量。 */
  messages: number;
}

/**
 * 对话摘要。
 */
export interface Conversation {
  /** 对话 ID。 */
  id: string;
  /** 对话标题。 */
  title: string;
  /** 创建时间。 */
  createdAt: string;
  /** 更新时间。 */
  updatedAt: string;
  /** 消息数量统计。 */
  _count?: ConversationCount;
}

/**
 * 聊天消息。
 */
export interface Message {
  /** 消息 ID。 */
  id: string;
  /** 角色。 */
  role: string;
  /** 纯文本摘要。 */
  content: string | null;
  /** 结构化 parts 的 JSON。 */
  partsJson: string | null;
  /** 工具调用的 JSON。 */
  toolCalls: string | null;
  /** 工具结果的 JSON。 */
  toolResults: string | null;
  /** 运行时元数据 JSON。 */
  metadataJson?: string | null;
  /** 实际使用的 provider。 */
  provider: string | null;
  /** 实际使用的模型。 */
  model: string | null;
  /** 当前状态。 */
  status: ChatMessageStatus;
  /** 错误信息。 */
  error: string | null;
  /** 创建时间。 */
  createdAt: string;
  /** 更新时间。 */
  updatedAt: string;
}

/**
 * 对话详情。
 */
export interface ConversationDetail extends Conversation {
  /** 对话消息列表。 */
  messages: Message[];
}

/**
 * 聊天 SSE 事件。
 */
export type SSEEvent =
  | {
      type: 'message-start';
      userMessage?: Message;
      assistantMessage: Message;
    }
  | {
      type: 'status';
      messageId: string;
      status: ChatMessageStatus;
      error?: string;
    }
  | {
      type: 'text-delta';
      messageId: string;
      text: string;
    }
  | {
      type: 'tool-call';
      messageId: string;
      toolName: string;
      input: JsonValue;
    }
  | {
      type: 'tool-result';
      messageId: string;
      toolName: string;
      output: JsonValue;
    }
  | {
      type: 'message-patch';
      messageId: string;
      content: string;
      parts?: ChatMessagePart[];
    }
  | {
      type: 'finish';
      messageId: string;
      status: ChatMessageStatus;
    }
  | {
      type: 'error';
      error: string;
    };

/**
 * 发送消息载荷。
 */
export interface SendMessagePayload {
  /** 纯文本内容。 */
  content?: string;
  /** 结构化消息 parts。 */
  parts?: ChatMessagePart[];
  /** provider 覆盖。 */
  provider?: string;
  /** model 覆盖。 */
  model?: string;
}

/**
 * 修改消息载荷。
 */
export interface UpdateMessagePayload {
  /** 纯文本内容。 */
  content?: string;
  /** 结构化消息 parts。 */
  parts?: ChatMessagePart[];
}

/**
 * 重试消息载荷。
 */
export interface RetryMessagePayload {
  /** provider 覆盖。 */
  provider?: string;
  /** model 覆盖。 */
  model?: string;
}

/**
 * 更新会话级宿主服务开关时的请求载荷。
 */
export type UpdateConversationHostServicesPayload =
  Partial<ConversationHostServices>;

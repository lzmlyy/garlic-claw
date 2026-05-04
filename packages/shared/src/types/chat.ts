import type { JsonValue } from './json';
import type { AiModelUsage } from './ai';
import type {
  RuntimePermissionReplyResult,
  RuntimePermissionRequest,
} from './runtime-permission';

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
 * 对话消息角色。
 * `display` 仅用于前端展示，不应直接进入默认送模上下文。
 */
export type ChatMessageRole =
  | 'assistant'
  | 'user'
  | 'system'
  | 'display';

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
 * 自定义扩展块状态。
 */
export type ChatMessageCustomBlockState = 'streaming' | 'done';

/**
 * 自定义扩展块来源。
 */
export interface ChatMessageCustomBlockSource {
  /** provider 标识。 */
  providerId?: string;
  /** 原始来源。 */
  origin?: string;
  /** 原始字段名。 */
  key?: string;
}

interface ChatMessageCustomBlockBase {
  /** 扩展块唯一 ID。 */
  id: string;
  /** 扩展块标题。 */
  title: string;
  /** 扩展块状态。 */
  state?: ChatMessageCustomBlockState;
  /** 来源信息。 */
  source?: ChatMessageCustomBlockSource;
}

/**
 * 文本类扩展块。
 */
export interface ChatMessageTextBlock extends ChatMessageCustomBlockBase {
  /** 扩展块类型。 */
  kind: 'text';
  /** 文本内容。 */
  text: string;
}

/**
 * JSON 类扩展块。
 */
export interface ChatMessageJsonBlock extends ChatMessageCustomBlockBase {
  /** 扩展块类型。 */
  kind: 'json';
  /** JSON 内容。 */
  data: JsonValue;
}

/**
 * 聊天消息自定义扩展块。
 */
export type ChatMessageCustomBlock =
  | ChatMessageTextBlock
  | ChatMessageJsonBlock;

/**
 * 通用消息注解。
 */
export interface ChatMessageAnnotation {
  /** 注解类型。 */
  type: string;
  /** 注解 owner。 */
  owner: string;
  /** 注解版本。 */
  version: string;
  /** 注解负载。 */
  data?: JsonValue;
}

/**
 * 聊天消息元数据。
 */
export interface ChatMessageMetadata {
  /** 本条消息关联的图像转述信息。 */
  visionFallback?: ChatVisionFallbackMetadata;
  /** provider 自定义扩展块。 */
  customBlocks?: ChatMessageCustomBlock[];
  /** 任意插件可写入的通用注解。 */
  annotations?: ChatMessageAnnotation[];
}

/**
 * 对话中的消息数量统计。
 */
export interface ConversationCount {
  /** 消息数量。 */
  messages: number;
}

/**
 * 会话待办状态。
 */
export type ConversationTodoStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

/**
 * 会话待办优先级。
 */
export type ConversationTodoPriority =
  | 'high'
  | 'medium'
  | 'low';

/**
 * 对话类型。
 */
export type ConversationKind =
  | 'main'
  | 'subagent';

/**
 * 子代理运行状态。
 */
export type ConversationSubagentStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'error'
  | 'interrupted'
  | 'closed';

/**
 * 子代理会话元数据。
 */
export interface ConversationSubagentState {
  /** 子代理名称。 */
  name?: string;
  /** 子代理所属插件 ID。 */
  pluginId: string;
  /** 插件显示名。 */
  pluginDisplayName?: string;
  /** runtime 类型。 */
  runtimeKind: 'local' | 'remote';
  /** 当前状态。 */
  status: ConversationSubagentStatus;
  /** 简短描述。 */
  description?: string;
  /** 子代理类型 ID。 */
  subagentType?: string;
  /** 子代理类型展示名。 */
  subagentTypeName?: string;
  /** 最近一次请求摘要。 */
  requestPreview: string;
  /** 最近一次结果摘要。 */
  resultPreview?: string;
  /** 当前活跃的 assistant 消息 ID。 */
  activeAssistantMessageId?: string;
  /** provider ID。 */
  providerId?: string;
  /** model ID。 */
  modelId?: string;
  /** system prompt。 */
  system?: string;
  /** 允许工具列表。 */
  toolNames?: string[];
  /** 模型变体。 */
  variant?: string;
  /** provider 额外参数。 */
  providerOptions?: JsonValue;
  /** 自定义请求头。 */
  headers?: Record<string, string>;
  /** 输出 token 上限。 */
  maxOutputTokens?: number;
  /** 错误信息。 */
  error?: string;
  /** 发起时间。 */
  requestedAt: string;
  /** 开始时间。 */
  startedAt: string | null;
  /** 完成时间。 */
  finishedAt: string | null;
  /** 关闭时间。 */
  closedAt: string | null;
}

/**
 * 单条会话待办项。
 */
export interface ConversationTodoItem {
  /** 待办内容。 */
  content: string;
  /** 当前状态。 */
  status: ConversationTodoStatus;
  /** 优先级。 */
  priority: ConversationTodoPriority;
}

/**
 * 对话摘要。
 */
export interface Conversation {
  /** 对话 ID。 */
  id: string;
  /** 父对话 ID。 */
  parentId?: string;
  /** 对话类型。 */
  kind?: ConversationKind;
  /** 对话标题。 */
  title: string;
  /** 创建时间。 */
  createdAt: string;
  /** 更新时间。 */
  updatedAt: string;
  /** 子代理元数据。 */
  subagent?: ConversationSubagentState;
  /** 当前是否仍有运行中的主任务或子代理任务。 */
  isRunning?: boolean;
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
  role: ChatMessageRole;
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
 * 一次自动重试中的运行态信息。
 */
export interface ChatRetryState {
  /** 当前是第几次自动重试。 */
  attempt: number;
  /** 当前可见的重试原因摘要。 */
  message: string;
  /** 下一次自动重试的时间戳（毫秒）。 */
  next: number;
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
      type: 'retry';
      messageId: string;
      attempt: number;
      message: string;
      next: number;
    }
  | {
      type: 'text-delta';
      messageId: string;
      text: string;
    }
  | {
      type: 'tool-call';
      messageId: string;
      toolCallId: string;
      toolName: string;
      input: JsonValue;
    }
  | {
      type: 'tool-result';
      messageId: string;
      toolCallId: string;
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
      type: 'message-metadata';
      messageId: string;
      metadata: ChatMessageMetadata;
    }
  | {
      type: 'todo-updated';
      conversationId: string;
      todos: ConversationTodoItem[];
    }
  | {
      type: 'permission-request';
      messageId: string;
      request: RuntimePermissionRequest;
    }
  | {
      type: 'permission-resolved';
      messageId: string;
      result: RuntimePermissionReplyResult;
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
 * 会话当前送模窗口预览。
 */
export interface ConversationContextWindowPreview {
  /** 上下文治理当前是否生效。 */
  enabled: boolean;
  /** 当前治理策略。 */
  strategy: 'sliding' | 'summary';
  /** 当前仍会进入模型上下文的消息 ID。 */
  includedMessageIds: string[];
  /** 当前不会进入模型上下文的消息 ID。 */
  excludedMessageIds: string[];
  /** 当前窗口的估算 token 数。 */
  estimatedTokens: number;
  /** token 数来源。 */
  source: AiModelUsage['source'];
  /** 当前模型总上下文长度。 */
  contextLength: number;
  /** 无论何种策略都保留的最近消息数；允许为 0。 */
  keepRecentMessages: number;
  /** 前端本地最多缓存的最近消息数。 */
  frontendMessageWindowSize: number;
  /** sliding 策略下使用的窗口百分比。 */
  slidingWindowUsagePercent: number;
}

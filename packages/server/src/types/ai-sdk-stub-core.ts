import type { JsonObject, JsonValue } from '../common/types/json-value';

/**
 * 导出 JSON 值别名，便于边界层复用。
 */
export type JSONValue = JsonValue;

/**
 * 语言模型最小契约。
 */
export interface LanguageModel {
  /** 模型所属 provider。 */
  readonly provider: string;
  /** 模型 ID。 */
  readonly modelId: string;
  /** SDK 规格版本。 */
  readonly specificationVersion?: string;
}

/**
 * 消息角色。
 */
export type CoreMessageRole = 'system' | 'user' | 'assistant' | 'tool';

/**
 * 文本消息 part。
 */
export interface TextPart {
  /** part 类型。 */
  type: 'text';
  /** 文本内容。 */
  text: string;
}

/**
 * 图片消息 part。
 */
export interface ImagePart {
  /** part 类型。 */
  type: 'image';
  /** 图片内容。 */
  image: string | URL | ArrayBuffer;
  /** 兼容字段。 */
  mimeType?: string;
  /** 兼容字段。 */
  mediaType?: string;
}

/**
 * 工具调用消息 part。
 */
export interface ToolCallPart {
  /** part 类型。 */
  type: 'tool-call';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名。 */
  toolName: string;
  /** 工具输入。 */
  args: JsonObject;
}

/**
 * 工具结果消息 part。
 */
export interface ToolResultPart {
  /** part 类型。 */
  type: 'tool-result';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名。 */
  toolName: string;
  /** 工具输出。 */
  result: JsonValue;
}

/**
 * 当前聊天链路可见的消息 part。
 */
export type MessagePart = TextPart | ImagePart | ToolCallPart | ToolResultPart;

/**
 * 消息内容。
 */
export type CoreMessageContent = string | MessagePart[];

/**
 * 核心消息。
 */
export interface CoreMessage {
  /** 消息角色。 */
  role: CoreMessageRole;
  /** 消息内容。 */
  content: CoreMessageContent;
}

/**
 * 模型消息别名。
 */
export type ModelMessage = CoreMessage;

/**
 * 工具注册后的轻量对象。
 */
export interface Tool {
  /** 工具描述。 */
  description?: string;
  /** 工具输入 schema。 */
  inputSchema?: object;
  /** 兼容旧字段。 */
  parameters?: object;
}

/**
 * 工具定义输入。
 */
export interface ToolOptions<TArgs = never, TResult = JsonValue> extends Tool {
  /** 工具执行函数。 */
  execute?: (args: TArgs) => Promise<TResult> | TResult;
}

/**
 * 流式结果中的文本增量。
 */
export interface TextDeltaPart {
  /** part 类型。 */
  type: 'text-delta';
  /** 文本片段。 */
  text: string;
}

/**
 * 流式结果中的工具调用。
 */
export interface StreamToolCallPart {
  /** part 类型。 */
  type: 'tool-call';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名。 */
  toolName: string;
  /** 工具输入。 */
  input: JsonValue;
}

/**
 * 流式结果中的工具结果。
 */
export interface StreamToolResultPart {
  /** part 类型。 */
  type: 'tool-result';
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名。 */
  toolName: string;
  /** 工具输出。 */
  output: JsonValue;
}

/**
 * 流结束信号。
 */
export interface FinishPart {
  /** part 类型。 */
  type: 'finish';
}

/**
 * 流式输出 part。
 */
export type StreamPart =
  | TextDeltaPart
  | StreamToolCallPart
  | StreamToolResultPart
  | FinishPart;

/**
 * 停止条件。
 */
export interface StopCondition {
  /** 条件类型。 */
  type: 'step-count';
  /** 最大步数。 */
  count: number;
}

/**
 * `streamText` 轻量输入。
 */
export interface StreamTextOptions {
  /** 目标模型。 */
  model: LanguageModel;
  /** 历史消息。 */
  messages: ModelMessage[];
  /** 系统提示词。 */
  system?: string;
  /** 可调用工具。 */
  tools?: Record<string, Tool>;
  /** 停止条件。 */
  stopWhen?: StopCondition;
  /** 最大输出 token。 */
  maxOutputTokens?: number;
}

/**
 * `streamText` 轻量输出。
 */
export interface StreamTextResult {
  /** 聚合后的文本。 */
  text: string;
  /** 文本流。 */
  textStream: AsyncIterable<string>;
  /** 完整流。 */
  fullStream: AsyncIterable<StreamPart>;
  /** 兼容字段。 */
  usage: Promise<{ promptTokens: number; completionTokens: number }>;
  /** 兼容字段。 */
  finishReason: Promise<string>;
  /** 兼容字段。 */
  response: Promise<Response>;
  /** 兼容字段。 */
  steps: Promise<JsonValue[]>;
  /** 兼容字段。 */
  warnings: Promise<JsonValue[]>;
}

/**
 * `generateText` 轻量输入。
 */
export interface GenerateTextOptions {
  /** 目标模型。 */
  model: LanguageModel;
  /** 历史消息。 */
  messages: ModelMessage[];
  /** 最大输出 token。 */
  maxOutputTokens?: number;
}

/**
 * `generateText` 轻量输出。
 */
export interface GenerateTextResult {
  /** 聚合后的文本。 */
  text: string;
  /** 用量统计。 */
  usage: { promptTokens: number; completionTokens: number };
  /** 完成原因。 */
  finishReason: string;
  /** 原始响应。 */
  response: Response;
  /** 兼容字段。 */
  steps?: JsonValue[];
  /** 兼容字段。 */
  warnings?: JsonValue[];
}

/**
 * 语言模型 V1 兼容别名。
 */
export type LanguageModelV1 = LanguageModel;

/**
 * provider 兼容最小形状。
 */
export interface ProviderV1 {
  /** provider 名。 */
  provider: string;
}

/**
 * 兼容旧代码的配置载入类型。
 */
export interface LoadSetting {
  /** 初始值。 */
  initialValue?: JsonValue;
}

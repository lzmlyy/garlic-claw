import type { JsonValue } from '../common/types/json-value';
import type { ChatMessageStatus } from '@garlic-claw/shared';
export type { ChatMessageStatus } from '@garlic-claw/shared';

/**
 * 持久化的工具调用记录。
 */
export interface PersistedToolCall {
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名。 */
  toolName: string;
  /** 工具输入。 */
  input: JsonValue;
}

/**
 * 持久化的工具结果记录。
 */
export interface PersistedToolResult {
  /** 工具调用 ID。 */
  toolCallId: string;
  /** 工具名。 */
  toolName: string;
  /** 工具输出。 */
  output: JsonValue;
}

/**
 * 聊天任务流片段。
 */
export type ChatTaskStreamPart =
  | {
      type: 'text-delta';
      text: string;
    }
  | {
      type: 'tool-call';
      toolCallId: string;
      toolName: string;
      input: JsonValue;
    }
  | {
      type: 'tool-result';
      toolCallId: string;
      toolName: string;
      output: JsonValue;
    }
  | {
      type: 'finish';
    }
  | {
      type: string;
    };

/**
 * 聊天后台任务可消费的流源。
 */
export interface ChatTaskStreamSource {
  /** 可被后台任务迭代消费的完整流。 */
  fullStream: AsyncIterable<ChatTaskStreamPart>;
}

/**
 * 聊天任务对外广播的事件。
 */
export type ChatTaskEvent =
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
      type: 'finish';
      messageId: string;
      status: ChatMessageStatus;
    };

/**
 * 判断给定状态是否已进入终态。
 * @param status 消息状态
 * @returns 是否为 completed/stopped/error
 */
export function isTerminalChatMessageStatus(
  status: ChatMessageStatus,
): boolean {
  return (
    status === 'completed' ||
    status === 'stopped' ||
    status === 'error'
  );
}

/**
 * 判断片段是否为文本增量。
 * @param part 流片段
 * @returns 是否携带 text 字段
 */
export function isTextDeltaPart(
  part: ChatTaskStreamPart,
): part is Extract<ChatTaskStreamPart, { type: 'text-delta' }> {
  return part.type === 'text-delta' && 'text' in part;
}

/**
 * 判断片段是否为工具调用。
 * @param part 流片段
 * @returns 是否携带工具调用字段
 */
export function isToolCallPart(
  part: ChatTaskStreamPart,
): part is Extract<ChatTaskStreamPart, { type: 'tool-call' }> {
  return (
    part.type === 'tool-call' &&
    'toolCallId' in part &&
    'toolName' in part &&
    'input' in part
  );
}

/**
 * 判断片段是否为工具结果。
 * @param part 流片段
 * @returns 是否携带工具结果字段
 */
export function isToolResultPart(
  part: ChatTaskStreamPart,
): part is Extract<ChatTaskStreamPart, { type: 'tool-result' }> {
  return (
    part.type === 'tool-result' &&
    'toolCallId' in part &&
    'toolName' in part &&
    'output' in part
  );
}

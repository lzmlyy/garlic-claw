import type { ChatRuntimeMessage } from './chat-message-session';
import type { SendMessagePartDto } from './dto/chat.dto';
import {
  restoreModelMessageContent,
  type UserMessageInput,
} from './message-parts';
import { DEFAULT_PERSONA_PROMPT } from '../persona/default-persona';
import { ToolRegistryService } from '../tool/tool-registry.service';

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
 * 读取历史中最近一条用户文本摘要。
 * @param messages 已持久化消息列表
 * @returns 最近一条用户消息的纯文本摘要
 */
export function findLatestUserContent(
  messages: Array<{ role: string; content: string | null }>,
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      return messages[index]?.content ?? '';
    }
  }

  return '';
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
 * 按需构造聊天工具集合。
 * @param supportsToolCall 模型是否支持工具调用
 * @param pluginRuntime 统一插件运行时
 * @param userId 当前用户 ID
 * @param conversationId 当前对话 ID
 * @returns 工具集合；模型不支持时返回 undefined
 */
export async function buildChatToolSet(params: {
  supportsToolCall: boolean;
  toolRegistry: ToolRegistryService;
  userId: string;
  conversationId: string;
  activeProviderId: string;
  activeModelId: string;
  activePersonaId?: string;
  allowedToolNames?: string[];
}) {
  if (!params.supportsToolCall) {
    return undefined;
  }

  return params.toolRegistry.buildToolSet({
    context: {
      userId: params.userId,
      conversationId: params.conversationId,
      source: 'chat-tool',
      activeProviderId: params.activeProviderId,
      activeModelId: params.activeModelId,
      activePersonaId: params.activePersonaId,
    },
    allowedToolNames: params.allowedToolNames,
  });
}

/**
 * 列出聊天模型前 Hook 可见的工具摘要。
 * @param pluginRuntime 统一插件运行时
 * @param userId 当前用户 ID
 * @param conversationId 当前对话 ID
 * @param activeProviderId 当前 provider ID
 * @param activeModelId 当前 model ID
 * @returns 当前聊天链路可见的工具摘要列表
 */
export async function listChatAvailableTools(params: {
  toolRegistry: ToolRegistryService;
  userId: string;
  conversationId: string;
  activeProviderId: string;
  activeModelId: string;
  activePersonaId?: string;
}) {
  return params.toolRegistry.listAvailableToolSummaries({
    context: {
      userId: params.userId,
      conversationId: params.conversationId,
      source: 'chat-tool',
      activeProviderId: params.activeProviderId,
      activeModelId: params.activeModelId,
      activePersonaId: params.activePersonaId,
    },
  });
}

/**
 * 归一化消息角色，避免异常角色进入模型链路。
 * @param role 原始角色
 * @returns 受支持的角色
 */
function normalizeMessageRole(role: string): ChatRuntimeMessage['role'] {
  return role === 'assistant' || role === 'system' || role === 'tool'
    ? role
    : 'user';
}

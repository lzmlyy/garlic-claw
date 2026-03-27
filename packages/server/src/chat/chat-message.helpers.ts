import {
  getAutomationTools,
  getBuiltinTools,
  getMemoryTools,
  getPluginTools,
} from '../ai/tools';
import { AutomationService } from '../automation/automation.service';
import { MemoryService } from '../memory/memory.service';
import { PluginGateway } from '../plugin/plugin.gateway';
import type { ChatRuntimeMessage } from './chat-message-session';
import type { SendMessagePartDto } from './dto/chat.dto';
import {
  restoreModelMessageContent,
  type UserMessageInput,
} from './message-parts';

export const CHAT_SYSTEM_PROMPT = `你是一个乐于助人的 AI 助手，名为 Garlic Claw（蒜蓉龙虾）。你可以帮助用户完成各种任务。
你可以使用工具来获取信息和执行操作。
一些工具让你可以控制连接的设备（PC、手机、IoT）。设备工具以设备名称为前缀。
你可以使用 save_memory 将重要信息保存到长期记忆中，并使用 recall_memory 回忆过去的信息。
你可以使用 create_automation 创建自动化任务（支持计划间隔如 "5m"、"1h"）。
当用户分享个人偏好或重要事实时，主动将它们保存到记忆中。
始终保持乐于助人、简洁和友好的态度。使用用户使用的语言回复。`;

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
 * @param pluginGateway 插件网关
 * @param memoryService 记忆服务
 * @param automationService 自动化服务
 * @param userId 当前用户 ID
 * @returns 工具集合；模型不支持时返回 undefined
 */
export function buildChatToolSet(params: {
  supportsToolCall: boolean;
  pluginGateway: PluginGateway;
  memoryService: MemoryService;
  automationService: AutomationService;
  userId: string;
}) {
  if (!params.supportsToolCall) {
    return undefined;
  }

  return {
    ...getBuiltinTools(),
    ...getPluginTools(params.pluginGateway),
    ...getMemoryTools(params.memoryService, params.userId),
    ...getAutomationTools(params.automationService, params.userId),
  };
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

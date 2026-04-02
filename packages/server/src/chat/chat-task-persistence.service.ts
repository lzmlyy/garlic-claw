import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { touchConversationTimestamp } from './chat-message-common.helpers';
import { normalizeAssistantMessageOutput, serializeMessageParts } from './message-parts';
import type {
  CompletedChatTaskResult,
  StartChatTaskInput,
} from './chat-task.service';
import type {
  ChatMessageStatus,
  PersistedToolCall,
  PersistedToolResult,
} from './chat.types';

export interface ChatTaskMutableState {
  /** 当前累计文本。 */
  content: string;
  /** 累计工具调用。 */
  toolCalls: PersistedToolCall[];
  /** 累计工具结果。 */
  toolResults: PersistedToolResult[];
}

type PersistableChatTaskInput = Pick<
  StartChatTaskInput,
  'assistantMessageId' | 'conversationId' | 'providerId' | 'modelId'
>;

@Injectable()
export class ChatTaskPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  /** 将当前任务状态写回消息与会话。 */
  async persistMessageState(
    input: PersistableChatTaskInput,
    state: ChatTaskMutableState,
    status: ChatMessageStatus,
    error: string | null,
  ): Promise<void> {
    await this.prisma.message.update({
      where: { id: input.assistantMessageId },
      data: {
        content: state.content,
        provider: input.providerId,
        model: input.modelId,
        status,
        error,
        toolCalls: state.toolCalls.length
          ? JSON.stringify(state.toolCalls)
          : null,
        toolResults: state.toolResults.length
          ? JSON.stringify(state.toolResults)
          : null,
      },
    });
    await touchConversationTimestamp(this.prisma, input.conversationId);
  }

  /**
   * 根据当前任务状态构造完成回调可消费的最终快照。
   * @param input 任务启动输入
   * @param state 当前累计状态
   * @returns assistant 完成快照
   */
  buildCompletedTaskResult(
    input: PersistableChatTaskInput,
    state: ChatTaskMutableState,
  ): CompletedChatTaskResult {
    const normalizedAssistant = normalizeAssistantMessageOutput({
      content: state.content,
    });

    return {
      assistantMessageId: input.assistantMessageId,
      conversationId: input.conversationId,
      providerId: input.providerId,
      modelId: input.modelId,
      content: normalizedAssistant.content,
      parts: normalizedAssistant.parts,
      toolCalls: [...state.toolCalls],
      toolResults: [...state.toolResults],
    };
  }

  /**
   * 把补丁后的完成态结果再次持久化到消息表。
   * @param result 补丁后的最终 assistant 快照
   * @returns 无返回值
   */
  async persistCompletedResult(
    result: CompletedChatTaskResult,
  ): Promise<void> {
    await this.prisma.message.update({
      where: { id: result.assistantMessageId },
      data: {
        content: result.content,
        partsJson: result.parts.length
          ? serializeMessageParts(result.parts)
          : null,
        provider: result.providerId,
        model: result.modelId,
        status: 'completed',
        error: null,
        toolCalls: result.toolCalls.length
          ? JSON.stringify(result.toolCalls)
          : null,
        toolResults: result.toolResults.length
          ? JSON.stringify(result.toolResults)
          : null,
      },
    });
    await touchConversationTimestamp(this.prisma, result.conversationId);
  }

  /**
   * 判断完成回调是否真的改写了最终 assistant 快照。
   * @param original 原始完成态结果
   * @param patched 回调返回的补丁结果
   * @returns 是否存在可见变更
   */
  hasCompletedResultPatch(
    original: CompletedChatTaskResult,
    patched: CompletedChatTaskResult,
  ): boolean {
    return original.content !== patched.content
      || JSON.stringify(original.parts) !== JSON.stringify(patched.parts)
      || original.providerId !== patched.providerId
      || original.modelId !== patched.modelId
      || JSON.stringify(original.toolCalls) !== JSON.stringify(patched.toolCalls)
      || JSON.stringify(original.toolResults) !== JSON.stringify(patched.toolResults);
  }
}

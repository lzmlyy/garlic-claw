import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ChatMessageStatus,
  type ChatTaskEvent,
  type ChatTaskStreamSource,
  type PersistedToolCall,
  type PersistedToolResult,
  isTextDeltaPart,
  isToolCallPart,
  isToolResultPart,
} from './chat.types';

/** 聊天后台任务启动参数。 */
export interface StartChatTaskInput {
  /** assistant 消息 ID。 */
  assistantMessageId: string;
  /** 所属会话 ID。 */
  conversationId: string;
  /** 实际使用的 provider ID。 */
  providerId: string;
  /** 实际使用的模型 ID。 */
  modelId: string;
  /**
   * 根据任务内部的 abortSignal 创建流。
   * 输入:
   * - abortSignal: 主动停止时会触发的信号
   * 输出:
   * - 可迭代消费的流源
   */
  createStream: (abortSignal: AbortSignal) => ChatTaskStreamSource;
}

type ChatTaskSubscriber = (event: ChatTaskEvent) => void;

interface ActiveChatTask {
  /** 中止控制器。 */
  abortController: AbortController;
  /** 事件订阅者集合。 */
  subscribers: Set<ChatTaskSubscriber>;
  /** 任务完成 Promise。 */
  completion: Promise<void>;
}

interface MutableTaskState {
  /** 当前累计文本。 */
  content: string;
  /** 累计工具调用。 */
  toolCalls: PersistedToolCall[];
  /** 累计工具结果。 */
  toolResults: PersistedToolResult[];
}

@Injectable()
export class ChatTaskService implements OnModuleInit {
  private readonly logger = new Logger(ChatTaskService.name);
  private readonly tasks = new Map<string, ActiveChatTask>();

  constructor(private readonly prisma: PrismaService) {}

  /** 启动模块时清理由旧进程遗留下来的非终态消息。 */
  async onModuleInit(): Promise<void> {
    await this.prisma.message.updateMany({
      where: {
        role: 'assistant',
        status: {
          in: ['pending', 'streaming'],
        },
      },
      data: {
        status: 'error',
        error: '服务已重启，本次生成已中断',
      },
    });
  }

  /** 启动一个后台聊天任务。 */
  startTask(input: StartChatTaskInput): void {
    if (this.tasks.has(input.assistantMessageId)) {
      throw new Error(`Chat task already exists for message ${input.assistantMessageId}`);
    }

    const task: ActiveChatTask = {
      abortController: new AbortController(),
      subscribers: new Set<ChatTaskSubscriber>(),
      completion: Promise.resolve(),
    };

    task.completion = new Promise<void>((resolve, reject) => {
      setTimeout(() => {
        void this.runTask(task, input)
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.tasks.delete(input.assistantMessageId);
          });
      }, 0);
    });
    this.tasks.set(input.assistantMessageId, task);
  }

  /** 订阅指定消息的后台任务事件，并返回取消订阅函数。 */
  subscribe(messageId: string, subscriber: ChatTaskSubscriber): () => void {
    const task = this.tasks.get(messageId);
    if (!task) {
      return () => undefined;
    }

    task.subscribers.add(subscriber);
    return () => {
      task.subscribers.delete(subscriber);
    };
  }

  /** 等待指定任务结束。 */
  async waitForTask(messageId: string): Promise<void> {
    const task = this.tasks.get(messageId);
    if (!task) {
      return;
    }

    await task.completion;
  }

  /** 主动停止一个运行中的后台任务，并返回是否真的停止了活动任务。 */
  async stopTask(messageId: string): Promise<boolean> {
    const task = this.tasks.get(messageId);
    if (!task) {
      return false;
    }

    task.abortController.abort(new Error('用户主动停止了本次生成'));
    await task.completion;
    return true;
  }

  hasActiveTask(messageId: string): boolean {
    return this.tasks.has(messageId);
  }

  /** 执行后台任务并持续写回数据库。 */
  private async runTask(
    task: ActiveChatTask,
    input: StartChatTaskInput,
  ): Promise<void> {
    const state: MutableTaskState = {
      content: '',
      toolCalls: [],
      toolResults: [],
    };

    await this.persistMessageState(input, state, 'streaming', null);
    this.emit(task, {
      type: 'status',
      messageId: input.assistantMessageId,
      status: 'streaming',
    });

    try {
      const stream = input.createStream(task.abortController.signal);

      for await (const part of stream.fullStream) {
        if (isTextDeltaPart(part)) {
          state.content += part.text;
          await this.persistMessageState(input, state, 'streaming', null);
          this.emit(task, {
            type: 'text-delta',
            messageId: input.assistantMessageId,
            text: part.text,
          });
          continue;
        }

        if (isToolCallPart(part)) {
          state.toolCalls.push({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            input: part.input,
          });
          await this.persistMessageState(input, state, 'streaming', null);
          this.emit(task, {
            type: 'tool-call',
            messageId: input.assistantMessageId,
            toolName: part.toolName,
            input: part.input,
          });
          continue;
        }

        if (isToolResultPart(part)) {
          state.toolResults.push({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            output: part.output,
          });
          await this.persistMessageState(input, state, 'streaming', null);
          this.emit(task, {
            type: 'tool-result',
            messageId: input.assistantMessageId,
            toolName: part.toolName,
            output: part.output,
          });
          continue;
        }
      }

      if (task.abortController.signal.aborted) {
        await this.persistMessageState(input, state, 'stopped', null);
        this.emit(task, {
          type: 'status',
          messageId: input.assistantMessageId,
          status: 'stopped',
        });
        this.emit(task, {
          type: 'finish',
          messageId: input.assistantMessageId,
          status: 'stopped',
        });
        return;
      }

      await this.persistMessageState(input, state, 'completed', null);
      this.emit(task, {
        type: 'finish',
        messageId: input.assistantMessageId,
        status: 'completed',
      });
    } catch (error) {
      if (task.abortController.signal.aborted) {
        await this.persistMessageState(input, state, 'stopped', null);
        this.emit(task, {
          type: 'status',
          messageId: input.assistantMessageId,
          status: 'stopped',
        });
        this.emit(task, {
          type: 'finish',
          messageId: input.assistantMessageId,
          status: 'stopped',
        });
        return;
      }

      const errorMessage =
        error instanceof Error ? error.message : '未知错误';
      this.logger.error(
        `聊天任务执行失败: ${input.assistantMessageId} - ${errorMessage}`,
      );
      await this.persistMessageState(input, state, 'error', errorMessage);
      this.emit(task, {
        type: 'status',
        messageId: input.assistantMessageId,
        status: 'error',
        error: errorMessage,
      });
      this.emit(task, {
        type: 'finish',
        messageId: input.assistantMessageId,
        status: 'error',
      });
    }
  }

  /** 将当前任务状态写回消息与会话。 */
  private async persistMessageState(
    input: StartChatTaskInput,
    state: MutableTaskState,
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
    await this.prisma.conversation.update({
      where: { id: input.conversationId },
      data: {
        updatedAt: new Date(),
      },
    });
  }

  /** 向所有订阅者广播事件。 */
  private emit(task: ActiveChatTask, event: ChatTaskEvent): void {
    for (const subscriber of task.subscribers) {
      subscriber(event);
    }
  }
}

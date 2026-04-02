import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  type ChatMessagePart,
  type ChatTaskEvent,
  type ChatTaskStreamSource,
  type PersistedToolCall,
  type PersistedToolResult,
  isTextDeltaPart,
  isToolCallPart,
  isToolResultPart,
} from './chat.types';
import {
  ChatTaskPersistenceService,
  type ChatTaskMutableState,
} from './chat-task-persistence.service';

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
   * - 实际使用的 provider/model 与可迭代消费的流源
   */
  createStream: (abortSignal: AbortSignal) => ResolvedChatTaskStreamSource;
  /**
   * 在 assistant 成功完成后执行的回调。
   * 输入:
   * - 最终 assistant 内容与工具调用快照
   * 输出:
   * - 可选返回一份补丁后的最终 assistant 快照
   */
  onComplete?: (
    result: CompletedChatTaskResult,
  ) => Promise<CompletedChatTaskResult | void> | CompletedChatTaskResult | void;
  /**
   * 在最终回复完成发送后执行的回调。
   * 输入:
   * - 已持久化、已发送的最终 assistant 快照
   * 输出:
   * - 无返回值
   */
  onSent?: (
    result: CompletedChatTaskResult,
  ) => Promise<void> | void;
}

/** 聊天任务完成后的最终 assistant 快照。 */
export interface CompletedChatTaskResult {
  /** assistant 消息 ID。 */
  assistantMessageId: string;
  /** 所属会话 ID。 */
  conversationId: string;
  /** 实际使用的 provider ID。 */
  providerId: string;
  /** 实际使用的模型 ID。 */
  modelId: string;
  /** 最终完整文本。 */
  content: string;
  /** 最终结构化 parts。 */
  parts: ChatMessagePart[];
  /** 累计工具调用。 */
  toolCalls: PersistedToolCall[];
  /** 累计工具结果。 */
  toolResults: PersistedToolResult[];
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

interface ResolvedChatTaskStreamSource {
  /** 实际使用的 provider ID。 */
  providerId: string;
  /** 实际使用的模型 ID。 */
  modelId: string;
  /** 可消费的流源。 */
  stream: ChatTaskStreamSource;
}

@Injectable()
export class ChatTaskService implements OnModuleInit {
  private readonly logger = new Logger(ChatTaskService.name);
  private readonly tasks = new Map<string, ActiveChatTask>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly taskPersistence: ChatTaskPersistenceService,
  ) {}

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
    const state: ChatTaskMutableState = {
      content: '',
      toolCalls: [],
      toolResults: [],
    };
    let resolvedInput = input;

    try {
      const streamSource = input.createStream(task.abortController.signal);
      resolvedInput = {
        ...input,
        providerId: streamSource.providerId,
        modelId: streamSource.modelId,
      };

      await this.taskPersistence.persistMessageState(
        resolvedInput,
        state,
        'streaming',
        null,
      );
      this.emit(task, {
        type: 'status',
        messageId: input.assistantMessageId,
        status: 'streaming',
      });

      for await (const part of streamSource.stream.fullStream) {
        if (isTextDeltaPart(part)) {
          state.content += part.text;
          await this.taskPersistence.persistMessageState(
            resolvedInput,
            state,
            'streaming',
            null,
          );
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
          await this.taskPersistence.persistMessageState(
            resolvedInput,
            state,
            'streaming',
            null,
          );
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
          await this.taskPersistence.persistMessageState(
            resolvedInput,
            state,
            'streaming',
            null,
          );
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
        await this.taskPersistence.persistMessageState(
          resolvedInput,
          state,
          'stopped',
          null,
        );
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

      await this.taskPersistence.persistMessageState(
        resolvedInput,
        state,
        'completed',
        null,
      );
      const completedResult = this.taskPersistence.buildCompletedTaskResult(
        resolvedInput,
        state,
      );
      let finalResult = completedResult;
      if (input.onComplete) {
        try {
          const patchedResult = await input.onComplete(completedResult);
          if (
            patchedResult
            && this.taskPersistence.hasCompletedResultPatch(
              completedResult,
              patchedResult,
            )
          ) {
            finalResult = patchedResult;
            await this.taskPersistence.persistCompletedResult(patchedResult);
            this.emit(task, {
              type: 'message-patch',
              messageId: patchedResult.assistantMessageId,
              content: patchedResult.content,
              ...(patchedResult.parts.length > 0
                ? { parts: patchedResult.parts }
                : {}),
            });
          } else if (patchedResult) {
            finalResult = patchedResult;
          }
        } catch (error) {
          this.logger.warn(
            `聊天完成回调执行失败: ${input.assistantMessageId} - ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      this.emit(task, {
        type: 'finish',
        messageId: input.assistantMessageId,
        status: 'completed',
      });
      if (input.onSent) {
        try {
          await input.onSent(finalResult);
        } catch (error) {
          this.logger.warn(
            `聊天发送后回调执行失败: ${input.assistantMessageId} - ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    } catch (error) {
      if (task.abortController.signal.aborted) {
        await this.taskPersistence.persistMessageState(
          resolvedInput,
          state,
          'stopped',
          null,
        );
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
      await this.taskPersistence.persistMessageState(
        resolvedInput,
        state,
        'error',
        errorMessage,
      );
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

  /** 向所有订阅者广播事件。 */
  private emit(task: ActiveChatTask, event: ChatTaskEvent): void {
    for (const subscriber of task.subscribers) {
      subscriber(event);
    }
  }
}

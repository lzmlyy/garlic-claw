/**
 * 聊天后台任务服务测试
 *
 * 输入:
 * - 预创建的 assistant 消息 ID
 * - 一个可流式产出片段的生成任务工厂
 *
 * 输出:
 * - 断言任务会把增量内容写回数据库
 * - 断言主动停止时消息状态会变为 stopped
 *
 * 预期行为:
 * - 生成任务不依赖当前 SSE 连接也能继续执行
 * - 主动停止不会把消息错误地标记成 error
 */

import {
  ChatTaskService,
} from './chat-task.service';
import type { ChatTaskEvent, ChatTaskStreamPart } from './chat.types';

describe('ChatTaskService', () => {
  const prisma = {
    message: {
      update: jest.fn(),
    },
    conversation: {
      update: jest.fn(),
    },
  };

  let service: ChatTaskService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.message.update.mockResolvedValue(null);
    prisma.conversation.update.mockResolvedValue(null);
    service = new ChatTaskService(prisma as never);
  });

  it('persists streamed text and completes the assistant message', async () => {
    const events: ChatTaskEvent[] = [];

    service.startTask({
      assistantMessageId: 'assistant-1',
      conversationId: 'conversation-1',
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      createStream: () => ({
        fullStream: createStream([
          { type: 'text-delta', text: '你' },
          { type: 'text-delta', text: '好' },
          { type: 'tool-call', toolCallId: 'tool-1', toolName: 'search', input: { q: 'test' } },
          { type: 'tool-result', toolCallId: 'tool-1', toolName: 'search', output: { ok: true } },
          { type: 'finish' },
        ]),
      }),
    });

    const unsubscribe = service.subscribe('assistant-1', (event: ChatTaskEvent) => {
      events.push(event);
    });

    await service.waitForTask('assistant-1');
    unsubscribe();

    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'status', messageId: 'assistant-1', status: 'streaming' },
        { type: 'text-delta', messageId: 'assistant-1', text: '你' },
        { type: 'text-delta', messageId: 'assistant-1', text: '好' },
        {
          type: 'tool-call',
          messageId: 'assistant-1',
          toolName: 'search',
          input: { q: 'test' },
        },
        {
          type: 'tool-result',
          messageId: 'assistant-1',
          toolName: 'search',
          output: { ok: true },
        },
        { type: 'finish', messageId: 'assistant-1', status: 'completed' },
      ]),
    );

    expect(prisma.message.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'assistant-1' },
        data: expect.objectContaining({
          status: 'streaming',
        }),
      }),
    );
    expect(prisma.message.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'assistant-1' },
        data: expect.objectContaining({
          content: '你好',
          status: 'completed',
          provider: 'openai',
          model: 'gpt-4o-mini',
          error: null,
          toolCalls: JSON.stringify([
            { toolCallId: 'tool-1', toolName: 'search', input: { q: 'test' } },
          ]),
          toolResults: JSON.stringify([
            { toolCallId: 'tool-1', toolName: 'search', output: { ok: true } },
          ]),
        }),
      }),
    );
  });

  it('marks the task as stopped when stopTask is called', async () => {
    const events: ChatTaskEvent[] = [];

    service.startTask({
      assistantMessageId: 'assistant-2',
      conversationId: 'conversation-2',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      createStream: (abortSignal: AbortSignal) => ({
        fullStream: createAbortAwareStream(abortSignal),
      }),
    });
    const unsubscribe = service.subscribe('assistant-2', (event: ChatTaskEvent) => {
      events.push(event);
    });

    await waitForNextTick();
    await expect(service.stopTask('assistant-2')).resolves.toBe(true);
    unsubscribe();

    expect(events).toEqual(
      expect.arrayContaining([
        { type: 'status', messageId: 'assistant-2', status: 'streaming' },
        { type: 'text-delta', messageId: 'assistant-2', text: '正在生成' },
        { type: 'status', messageId: 'assistant-2', status: 'stopped' },
        { type: 'finish', messageId: 'assistant-2', status: 'stopped' },
      ]),
    );
    expect(prisma.message.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'assistant-2' },
        data: expect.objectContaining({
          content: '正在生成',
          status: 'stopped',
          error: null,
        }),
      }),
    );
  });

  it('still marks the task as stopped when the stream ends cleanly after abort', async () => {
    service.startTask({
      assistantMessageId: 'assistant-3',
      conversationId: 'conversation-3',
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      createStream: (abortSignal: AbortSignal) => ({
        fullStream: createGracefulAbortStream(abortSignal),
      }),
    });

    await waitForNextTick();
    await expect(service.stopTask('assistant-3')).resolves.toBe(true);

    expect(prisma.message.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 'assistant-3' },
        data: expect.objectContaining({
          status: 'stopped',
          error: null,
        }),
      }),
    );
  });
});

/**
 * 根据给定片段构造一个稳定的异步流。
 * @param parts 要产出的流片段
 * @returns 可被任务服务消费的异步迭代器
 */
async function* createStream(
  parts: ChatTaskStreamPart[],
): AsyncIterable<ChatTaskStreamPart> {
  for (const part of parts) {
    await waitForNextTick();
    yield part;
  }
}

/**
 * 构造一个会等待中止信号的流。
 * @param abortSignal 中止信号
 * @returns 可用于 stopTask 测试的异步流
 */
async function* createAbortAwareStream(
  abortSignal: AbortSignal,
): AsyncIterable<ChatTaskStreamPart> {
  yield { type: 'text-delta', text: '正在生成' };

  while (!abortSignal.aborted) {
    await waitForNextTick();
  }

  throw new Error('abort requested');
}

/**
 * 等待一次微任务与定时器切换，便于异步流推进。
 * @returns 一个在下一拍完成的 Promise
 */
function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

/**
 * 构造一个在中止后安静结束的流。
 * @param abortSignal 中止信号
 * @returns 模拟“未抛错但已被停止”的异步流
 */
async function* createGracefulAbortStream(
  abortSignal: AbortSignal,
): AsyncIterable<ChatTaskStreamPart> {
  while (!abortSignal.aborted) {
    await waitForNextTick();
  }
}

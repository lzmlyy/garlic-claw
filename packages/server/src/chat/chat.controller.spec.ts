/**
 * 聊天控制器 SSE 行为测试
 *
 * 输入:
 * - 新的消息创建结果
 * - 后台任务广播的状态与文本事件
 *
 * 输出:
 * - 断言控制器会先下发 message-start，再转发后台事件
 * - 断言早期失败仍会通过 SSE 返回原始错误文本
 *
 * 预期行为:
 * - 控制器只负责建连和转发，不再自己消费完整模型流
 * - 发送失败不会回落成裸 HTTP 500
 */

import { ChatController } from './chat.controller';
import type { ChatTaskEvent } from './chat.types';

describe('ChatController', () => {
  const chatService = {
    createConversation: jest.fn(),
    listConversations: jest.fn(),
    getConversation: jest.fn(),
    deleteConversation: jest.fn(),
  };

  const chatMessageService = {
    startMessageGeneration: jest.fn(),
    updateMessage: jest.fn(),
    deleteMessage: jest.fn(),
    stopMessageGeneration: jest.fn(),
    retryMessageGeneration: jest.fn(),
  };

  const chatTaskService = {
    subscribe: jest.fn(),
    waitForTask: jest.fn(),
  };

  let controller: ChatController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ChatController(
      chatService as never,
      chatMessageService as never,
      chatTaskService as never,
    );
  });

  it('writes message-start and forwarded task events over SSE', async () => {
    const response = createResponseStub();
    let subscriber: ((event: ChatTaskEvent) => void) | null = null;

    chatMessageService.startMessageGeneration.mockResolvedValue({
      userMessage: { id: 'user-1', role: 'user', content: '你好' },
      assistantMessage: { id: 'assistant-1', role: 'assistant', content: '' },
    });
    chatTaskService.subscribe.mockImplementation(
      (_messageId: string, listener: (event: ChatTaskEvent) => void) => {
        subscriber = listener;
        return jest.fn();
      },
    );
    chatTaskService.waitForTask.mockImplementation(async () => {
      subscriber?.({
        type: 'status',
        messageId: 'assistant-1',
        status: 'streaming',
      });
      subscriber?.({
        type: 'text-delta',
        messageId: 'assistant-1',
        text: '你好',
      });
      subscriber?.({
        type: 'finish',
        messageId: 'assistant-1',
        status: 'completed',
      });
    });

    await expect(
      controller.sendMessage(
        'user-1',
        'conversation-1',
        {} as never,
        response as never,
      ),
    ).resolves.toBeUndefined();

    expect(response.write).toHaveBeenNthCalledWith(
      1,
      `data: ${JSON.stringify({
        type: 'message-start',
        userMessage: { id: 'user-1', role: 'user', content: '你好' },
        assistantMessage: { id: 'assistant-1', role: 'assistant', content: '' },
      })}\n\n`,
    );
    expect(response.write).toHaveBeenCalledWith(
      `data: ${JSON.stringify({
        type: 'text-delta',
        messageId: 'assistant-1',
        text: '你好',
      })}\n\n`,
    );
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
    expect(response.end).toHaveBeenCalled();
  });

  it('returns the original early error over SSE', async () => {
    const response = createResponseStub();

    chatMessageService.startMessageGeneration.mockRejectedValue(
      new Error('vision provider unavailable'),
    );

    await expect(
      controller.sendMessage(
        'user-1',
        'conversation-1',
        {} as never,
        response as never,
      ),
    ).resolves.toBeUndefined();

    expect(response.write).toHaveBeenCalledWith(
      `data: ${JSON.stringify({
        type: 'error',
        error: 'vision provider unavailable',
      })}\n\n`,
    );
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
    expect(response.end).toHaveBeenCalled();
  });
});

/**
 * 创建最小 SSE 响应对象桩。
 * @returns 可断言写入顺序的响应对象
 */
function createResponseStub() {
  return {
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    writableEnded: false,
    destroyed: false,
  };
}

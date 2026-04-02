import { ChatTaskPersistenceService } from './chat-task-persistence.service';
import type { CompletedChatTaskResult } from './chat-task.service';

describe('ChatTaskPersistenceService', () => {
  const prisma = {
    message: {
      update: jest.fn(),
    },
    conversation: {
      update: jest.fn(),
    },
  };

  let service: ChatTaskPersistenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.message.update.mockResolvedValue(null);
    prisma.conversation.update.mockResolvedValue(null);
    service = new ChatTaskPersistenceService(prisma as never);
  });

  it('persists streamed task state and touches the conversation timestamp', async () => {
    await service.persistMessageState(
      {
        assistantMessageId: 'assistant-1',
        conversationId: 'conversation-1',
        providerId: 'openai',
        modelId: 'gpt-4o-mini',
      },
      {
        content: '你好',
        toolCalls: [
          { toolCallId: 'tool-1', toolName: 'search', input: { q: 'test' } },
        ],
        toolResults: [
          { toolCallId: 'tool-1', toolName: 'search', output: { ok: true } },
        ],
      },
      'streaming',
      null,
    );

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'assistant-1' },
      data: {
        content: '你好',
        provider: 'openai',
        model: 'gpt-4o-mini',
        status: 'streaming',
        error: null,
        toolCalls: JSON.stringify([
          { toolCallId: 'tool-1', toolName: 'search', input: { q: 'test' } },
        ]),
        toolResults: JSON.stringify([
          { toolCallId: 'tool-1', toolName: 'search', output: { ok: true } },
        ]),
      },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: {
        updatedAt: expect.any(Date),
      },
    });
  });

  it('builds the normalized completed assistant snapshot', () => {
    expect(
      service.buildCompletedTaskResult(
        {
          assistantMessageId: 'assistant-1',
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-4o-mini',
        },
        {
          content: '你好',
          toolCalls: [
            { toolCallId: 'tool-1', toolName: 'search', input: { q: 'test' } },
          ],
          toolResults: [
            { toolCallId: 'tool-1', toolName: 'search', output: { ok: true } },
          ],
        },
      ),
    ).toEqual({
      assistantMessageId: 'assistant-1',
      conversationId: 'conversation-1',
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      content: '你好',
      parts: [
        { type: 'text', text: '你好' },
      ],
      toolCalls: [
        { toolCallId: 'tool-1', toolName: 'search', input: { q: 'test' } },
      ],
      toolResults: [
        { toolCallId: 'tool-1', toolName: 'search', output: { ok: true } },
      ],
    });
  });

  it('persists the patched completed result with partsJson', async () => {
    await service.persistCompletedResult(createCompletedResult());

    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'assistant-1' },
      data: {
        content: '插件润色后的最终回复',
        partsJson: JSON.stringify([
          { type: 'image', image: 'https://example.com/final.png' },
          { type: 'text', text: '插件润色后的最终回复' },
        ]),
        provider: 'openai',
        model: 'gpt-4o-mini',
        status: 'completed',
        error: null,
        toolCalls: JSON.stringify([
          { toolCallId: 'tool-1', toolName: 'search', input: { q: 'test' } },
        ]),
        toolResults: JSON.stringify([
          { toolCallId: 'tool-1', toolName: 'search', output: { ok: true } },
        ]),
      },
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: { id: 'conversation-1' },
      data: {
        updatedAt: expect.any(Date),
      },
    });
  });

  it('detects whether the completion callback changed the assistant snapshot', () => {
    const original = createCompletedResult();

    expect(service.hasCompletedResultPatch(original, original)).toBe(false);
    expect(
      service.hasCompletedResultPatch(original, {
        ...original,
        content: '新的最终回复',
      }),
    ).toBe(true);
  });
});

function createCompletedResult(): CompletedChatTaskResult {
  return {
    assistantMessageId: 'assistant-1',
    conversationId: 'conversation-1',
    providerId: 'openai',
    modelId: 'gpt-4o-mini',
    content: '插件润色后的最终回复',
    parts: [
      { type: 'image', image: 'https://example.com/final.png' },
      { type: 'text', text: '插件润色后的最终回复' },
    ],
    toolCalls: [
      { toolCallId: 'tool-1', toolName: 'search', input: { q: 'test' } },
    ],
    toolResults: [
      { toolCallId: 'tool-1', toolName: 'search', output: { ok: true } },
    ],
  };
}

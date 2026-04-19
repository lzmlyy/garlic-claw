import { RuntimeHostConversationMessageService } from '../../src/runtime/host/runtime-host-conversation-message.service';
import {
  RuntimeHostConversationRecordService,
  serializeConversationMessage,
} from '../../src/runtime/host/runtime-host-conversation-record.service';
import { ConversationTaskService, type ConversationTaskEvent } from '../../src/conversation/conversation-task.service';

describe('ConversationTaskService', () => {
  let conversationId: string;
  let runtimeHostConversationRecordService: RuntimeHostConversationRecordService;
  let runtimeHostConversationMessageService: RuntimeHostConversationMessageService;
  let service: ConversationTaskService;

  beforeEach(() => {
    runtimeHostConversationRecordService = new RuntimeHostConversationRecordService();
    runtimeHostConversationMessageService = new RuntimeHostConversationMessageService(runtimeHostConversationRecordService);
    service = new ConversationTaskService(runtimeHostConversationMessageService);
    conversationId = (runtimeHostConversationRecordService.createConversation({ title: 'Conversation conversation-1' }) as { id: string }).id;
  });

  it('streams task events, persists completion patches, and stores tool activity on the assistant message', async () => {
    const assistantMessage = createAssistantMessage(runtimeHostConversationMessageService);
    const events: ConversationTaskEvent[] = [];
    const onSent = jest.fn();

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield rawCustomFieldChunk('reasoning_content', '先检查');
            yield rawCustomFieldChunk('reasoning_content', '上下文');
            yield delta('模型');
            yield toolCall();
            yield toolResult();
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      onComplete: async (result) => ({ ...result, content: '最终回复', parts: [{ text: '最终回复', type: 'text' }] }),
      onSent,
      providerId: 'openai',
    });
    service.subscribe(String(assistantMessage.id), (event) => events.push(event));
    await service.waitForTask(String(assistantMessage.id));

    expect(events).toEqual([
      { messageId: String(assistantMessage.id), status: 'streaming', type: 'status' },
      {
        messageId: String(assistantMessage.id),
        metadata: {
          customBlocks: [
            {
              id: 'custom-field:reasoning_content',
              kind: 'text',
              source: {
                key: 'reasoning_content',
                origin: 'ai-sdk.raw',
                providerId: 'openai',
              },
              state: 'streaming',
              text: '先检查',
              title: 'Reasoning Content',
            },
          ],
        },
        type: 'message-metadata',
      },
      {
        messageId: String(assistantMessage.id),
        metadata: {
          customBlocks: [
            {
              id: 'custom-field:reasoning_content',
              kind: 'text',
              source: {
                key: 'reasoning_content',
                origin: 'ai-sdk.raw',
                providerId: 'openai',
              },
              state: 'streaming',
              text: '先检查上下文',
              title: 'Reasoning Content',
            },
          ],
        },
        type: 'message-metadata',
      },
      { messageId: String(assistantMessage.id), text: '模型', type: 'text-delta' },
      { input: { city: 'Shanghai' }, messageId: String(assistantMessage.id), toolName: 'weather.search', type: 'tool-call' },
      { messageId: String(assistantMessage.id), output: { temp: 20 }, toolName: 'weather.search', type: 'tool-result' },
      { content: '最终回复', messageId: String(assistantMessage.id), parts: [{ text: '最终回复', type: 'text' }], type: 'message-patch' },
      { messageId: String(assistantMessage.id), status: 'completed', type: 'finish' },
    ]);

    const conversation = runtimeHostConversationRecordService.requireConversation(conversationId);
    expect(conversation.messages[0]).toMatchObject({
      content: '最终回复',
      metadataJson: JSON.stringify({
        customBlocks: [
          {
            id: 'custom-field:reasoning_content',
            kind: 'text',
            source: {
              key: 'reasoning_content',
              origin: 'ai-sdk.raw',
              providerId: 'openai',
            },
            state: 'done',
            text: '先检查上下文',
            title: 'Reasoning Content',
          },
        ],
      }),
      model: 'gpt-5.4',
      provider: 'openai',
      role: 'assistant',
      status: 'completed',
      toolCalls: [toolCallRecord()],
      toolResults: [toolResultRecord()],
    });
    expect(serializeConversationMessage(conversation.messages[0] as never)).toMatchObject({
      content: '最终回复',
      metadataJson: JSON.stringify({
        customBlocks: [
          {
            id: 'custom-field:reasoning_content',
            kind: 'text',
            source: {
              key: 'reasoning_content',
              origin: 'ai-sdk.raw',
              providerId: 'openai',
            },
            state: 'done',
            text: '先检查上下文',
            title: 'Reasoning Content',
          },
        ],
      }),
      toolCalls: JSON.stringify([toolCallRecord()]),
      toolResults: JSON.stringify([toolResultRecord()]),
    });
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ content: '最终回复' }));
  });

  it('stops an active task and leaves the assistant message in stopped state', async () => {
    const assistantMessage = createAssistantMessage(runtimeHostConversationMessageService);
    const events: ConversationTaskEvent[] = [];

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async (abortSignal) => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield delta('片段');
            await new Promise<void>((resolve) => abortSignal.addEventListener('abort', () => resolve(), { once: true }));
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    service.subscribe(String(assistantMessage.id), (event) => events.push(event));

    await new Promise((resolve) => setTimeout(resolve, 0));
    await service.stopTask(String(assistantMessage.id));

    expect(runtimeHostConversationRecordService.requireConversation(conversationId).messages[0]).toMatchObject({
      content: '片段',
      role: 'assistant',
      status: 'stopped',
    });
    expect(events).toEqual(expect.arrayContaining([
      { messageId: String(assistantMessage.id), status: 'stopped', type: 'status' },
      { messageId: String(assistantMessage.id), status: 'stopped', type: 'finish' },
    ]));
  });
});

function createAssistantMessage(runtimeHostConversationMessageService: RuntimeHostConversationMessageService) {
  const conversationId = (((runtimeHostConversationMessageService as unknown as {
    runtimeHostConversationRecordService: RuntimeHostConversationRecordService;
  }).runtimeHostConversationRecordService.listConversations() as Array<{ id: string }>)[0]).id;
  return runtimeHostConversationMessageService.createMessage(conversationId, {
    content: '',
    model: 'gpt-5.4',
    parts: [],
    provider: 'openai',
    role: 'assistant',
    status: 'pending',
  });
}

function delta(text: string) {
  return { text, type: 'text-delta' as const };
}

function rawCustomFieldChunk(key: string, value: string) {
  return {
    rawValue: {
      choices: [
        {
          delta: {
            [key]: value,
          },
          index: 0,
        },
      ],
      id: 'raw-chunk-1',
      model: 'deepseek-reasoner',
      object: 'chat.completion.chunk',
    },
    type: 'raw' as const,
  };
}

function toolCallRecord() {
  return { input: { city: 'Shanghai' }, toolCallId: 'tool-call-1', toolName: 'weather.search' };
}

function toolResultRecord() {
  return { output: { temp: 20 }, toolCallId: 'tool-call-1', toolName: 'weather.search' };
}

function toolCall() {
  return { ...toolCallRecord(), type: 'tool-call' as const };
}

function toolResult() {
  return { ...toolResultRecord(), type: 'tool-result' as const };
}

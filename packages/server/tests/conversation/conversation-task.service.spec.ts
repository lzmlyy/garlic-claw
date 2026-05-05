import { createConversationHistorySignatureFromHistoryMessages } from '../../src/modules/conversation/conversation-history-signature';
import { ConversationMessageService } from '../../src/modules/runtime/host/conversation-message.service';
import {
  ConversationStoreService,
  serializeConversationMessage,
} from '../../src/modules/runtime/host/conversation-store.service';
import { ConversationTodoService } from '../../src/modules/runtime/host/conversation-todo.service';
import { ConversationTaskService, type ConversationTaskEvent } from '../../src/modules/conversation/conversation-task.service';
import { RuntimeToolPermissionService } from '../../src/modules/execution/runtime/runtime-tool-permission.service';
import { APICallError } from '@ai-sdk/provider';

describe('ConversationTaskService', () => {
  let conversationId: string;
  let conversationStore: ConversationStoreService;
  let conversationMessages: ConversationMessageService;
  let conversationTodos: ConversationTodoService;
  let runtimeToolPermissionService: RuntimeToolPermissionService;
  let service: ConversationTaskService;

  beforeEach(() => {
    conversationStore = new ConversationStoreService();
    conversationMessages = new ConversationMessageService(conversationStore);
    conversationTodos = new ConversationTodoService(conversationStore);
    runtimeToolPermissionService = new RuntimeToolPermissionService();
    service = new ConversationTaskService(conversationMessages, conversationStore, runtimeToolPermissionService, conversationTodos);
    conversationId = (conversationStore.createConversation({ title: 'Conversation conversation-1' }) as { id: string }).id;
  });

  it('streams task events, persists completion patches, and stores tool activity on the assistant message', async () => {
    const assistantMessage = createAssistantMessage(conversationMessages, conversationStore);
    const events: ConversationTaskEvent[] = [];
    const onSent = jest.fn();

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        requestHistorySignature: 'history-signature-1',
        stream: {
          fullStream: (async function* () {
            yield rawCustomFieldChunk('reasoning_content', '先检查');
            yield rawCustomFieldChunk('reasoning_content', '上下文');
            yield delta('模型');
            yield toolCall();
            yield wrappedToolResult();
          })(),
          usage: Promise.resolve({
            inputTokens: 21,
            outputTokens: 9,
            source: 'provider',
            totalTokens: 30,
          }),
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
      { input: { city: 'Shanghai' }, messageId: String(assistantMessage.id), toolCallId: 'tool-call-1', toolName: 'weather.search', type: 'tool-call' },
      {
        messageId: String(assistantMessage.id),
        output: { kind: 'tool:json', value: { temp: 20 } },
        toolCallId: 'tool-call-1',
        toolName: 'weather.search',
        type: 'tool-result',
      },
      { content: '最终回复', messageId: String(assistantMessage.id), parts: [{ text: '最终回复', type: 'text' }], type: 'message-patch' },
      {
        messageId: String(assistantMessage.id),
        metadata: {
          annotations: [
            {
              data: {
                inputTokens: 21,
                modelId: 'gpt-5.4',
                outputTokens: 9,
                providerId: 'openai',
                requestHistorySignature: 'history-signature-1',
                responseHistorySignature: expect.any(String),
                source: 'provider',
                totalTokens: 30,
              },
              owner: 'conversation.model-usage',
              type: 'model-usage',
              version: '1',
            },
          ],
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
        },
        type: 'message-metadata',
      },
      { messageId: String(assistantMessage.id), status: 'completed', type: 'finish' },
    ]);

    const conversation = conversationStore.requireConversation(conversationId);
    const persistedMetadata = JSON.parse(String(conversation.messages[0].metadataJson));
    const responseHistorySignature = createConversationHistorySignatureFromHistoryMessages(
      (conversationStore.readConversationHistory(conversationId) as unknown as {
        messages: Parameters<typeof createConversationHistorySignatureFromHistoryMessages>[0];
      }).messages,
    );
    expect(conversation.messages[0]).toMatchObject({
      content: '最终回复',
      model: 'gpt-5.4',
      provider: 'openai',
      role: 'assistant',
      status: 'completed',
      toolCalls: [toolCallRecord()],
      toolResults: [compactToolResultRecord()],
    });
    expect(persistedMetadata).toEqual({
      annotations: [
        {
          data: {
            inputTokens: 21,
            modelId: 'gpt-5.4',
            outputTokens: 9,
            providerId: 'openai',
            requestHistorySignature: 'history-signature-1',
            responseHistorySignature,
            source: 'provider',
            totalTokens: 30,
          },
          owner: 'conversation.model-usage',
          type: 'model-usage',
          version: '1',
        },
      ],
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
    });
    expect(serializeConversationMessage(conversation.messages[0] as never)).toMatchObject({
      content: '最终回复',
      metadataJson: JSON.stringify(persistedMetadata),
      toolCalls: JSON.stringify([toolCallRecord()]),
      toolResults: JSON.stringify([compactToolResultRecord()]),
    });
    expect(onSent).toHaveBeenCalledWith(expect.objectContaining({ content: '最终回复' }));
  });

  it('keeps the assistant message completed when onSent fails after the reply has finished', async () => {
    const assistantMessage = createAssistantMessage(conversationMessages, conversationStore);
    const events: ConversationTaskEvent[] = [];

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield delta('回复已完成');
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      onSent: async () => {
        throw new Error('after-send 失败');
      },
      providerId: 'openai',
    });
    service.subscribe(String(assistantMessage.id), (event) => events.push(event));

    await service.waitForTask(String(assistantMessage.id));

    expect(conversationStore.requireConversation(conversationId).messages[0]).toMatchObject({
      content: '回复已完成',
      error: null,
      role: 'assistant',
      status: 'completed',
    });
    expect(events).toEqual([
      { messageId: String(assistantMessage.id), status: 'streaming', type: 'status' },
      { messageId: String(assistantMessage.id), text: '回复已完成', type: 'text-delta' },
      { messageId: String(assistantMessage.id), status: 'completed', type: 'finish' },
    ]);
  });

  it('stops an active task and leaves the assistant message in stopped state', async () => {
    const assistantMessage = createAssistantMessage(conversationMessages, conversationStore);
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

    expect(conversationStore.requireConversation(conversationId).messages[0]).toMatchObject({
      content: '片段',
      role: 'assistant',
      status: 'stopped',
    });
    expect(events).toEqual(expect.arrayContaining([
      { messageId: String(assistantMessage.id), status: 'stopped', type: 'status' },
      { messageId: String(assistantMessage.id), status: 'stopped', type: 'finish' },
    ]));
  });

  it('forces a stuck task into stopped state when the stream ignores abort', async () => {
    const assistantMessage = createAssistantMessage(conversationMessages, conversationStore);
    let returnCalled = false;
    let yieldedFirstChunk = false;
    const stuckIterator: AsyncIterableIterator<unknown> = {
      async next() {
        if (!yieldedFirstChunk) {
          yieldedFirstChunk = true;
          return { done: false, value: delta('卡住前的片段') };
        }
        return await new Promise<IteratorResult<unknown>>(() => undefined);
      },
      async return() {
        returnCalled = true;
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: stuckIterator,
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    await expect(Promise.race([
      service.stopTask(String(assistantMessage.id)),
      new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 50)),
    ])).resolves.toBe(true);

    expect(conversationStore.requireConversation(conversationId).messages[0]).toMatchObject({
      content: '卡住前的片段',
      role: 'assistant',
      status: 'stopped',
    });
    expect(returnCalled).toBe(true);
    expect(service.hasTask(String(assistantMessage.id))).toBe(false);
    expect(readRuntimePermissionListenerCount(runtimeToolPermissionService, conversationId)).toBe(0);
    expect(readConversationTodoListenerCount(conversationTodos, conversationId)).toBe(0);
  });

  it('normalizes tool-error parts into persisted tool results', async () => {
    const assistantMessage = createAssistantMessage(conversationMessages, conversationStore);

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield {
              error: 'request timeout',
              input: {
                city: 'Shanghai',
              },
              toolCallId: 'tool-call-2',
              toolName: 'weather.search',
              type: 'tool-error' as const,
            };
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    await service.waitForTask(String(assistantMessage.id));

    expect(conversationStore.requireConversation(conversationId).messages[0]).toMatchObject({
      role: 'assistant',
      status: 'completed',
      toolResults: [
        {
          output: {
            error: 'request timeout',
            inputText: JSON.stringify({
              city: 'Shanghai',
            }, null, 2),
            phase: 'execute',
            recovered: true,
            tool: 'weather.search',
            type: 'invalid-tool-result',
          },
          toolCallId: 'tool-call-2',
          toolName: 'weather.search',
        },
      ],
    });
  });

  it('forwards runtime permission request and resolution events into the task stream', async () => {
    const assistantMessage = createAssistantMessage(conversationMessages, conversationStore);
    const events: ConversationTaskEvent[] = [];

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            await runtimeToolPermissionService.review({
              backend: {
                capabilities: {
                  networkAccess: true,
                  persistentFilesystem: true,
                  persistentShellState: false,
                  shellExecution: true,
                  workspaceRead: true,
                  workspaceWrite: true,
                },
                kind: 'just-bash',
                permissionPolicy: {
                  networkAccess: 'allow',
                  persistentFilesystem: 'allow',
                  persistentShellState: 'deny',
                  shellExecution: 'ask',
                  workspaceRead: 'allow',
                  workspaceWrite: 'allow',
                },
              },
              conversationId,
              messageId: String(assistantMessage.id),
              requiredOperations: ['command.execute'],
              summary: '执行测试 bash 命令',
              toolName: 'bash',
            });
            yield delta('权限已通过');
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    service.subscribe(String(assistantMessage.id), (event) => events.push(event));

    await new Promise((resolve) => setTimeout(resolve, 0));
    const [pendingRequest] = runtimeToolPermissionService.listPendingRequests(conversationId);
    expect(pendingRequest).toMatchObject({
      operations: ['command.execute'],
      messageId: String(assistantMessage.id),
      toolName: 'bash',
    });

    const replyResult = runtimeToolPermissionService.reply(conversationId, pendingRequest.id, 'once');
    expect(replyResult).toEqual({
      requestId: pendingRequest.id,
      resolution: 'approved',
    });
    await service.waitForTask(String(assistantMessage.id));

    expect(events).toEqual(expect.arrayContaining([
      {
        messageId: String(assistantMessage.id),
        request: expect.objectContaining({
          id: pendingRequest.id,
          summary: '执行测试 bash 命令',
        }),
        type: 'permission-request',
      },
      {
        messageId: String(assistantMessage.id),
        result: {
          requestId: pendingRequest.id,
          resolution: 'approved',
        },
        type: 'permission-resolved',
      },
    ]));
  });

  it('forwards todo owner updates into the task stream without parsing tool text output', async () => {
    const assistantMessage = createAssistantMessage(conversationMessages, conversationStore);
    const events: ConversationTaskEvent[] = [];

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            conversationTodos.replaceSessionTodo(conversationId, [
              { content: '同步 todo 面板', priority: 'high', status: 'in_progress' },
            ]);
            yield delta('todo 已更新');
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    service.subscribe(String(assistantMessage.id), (event) => events.push(event));

    await service.waitForTask(String(assistantMessage.id));

    expect(events).toEqual(expect.arrayContaining([
      {
        conversationId,
        todos: [
          { content: '同步 todo 面板', priority: 'high', status: 'in_progress' },
        ],
        type: 'todo-updated',
      },
    ]));
  });

  it('keeps running and persists the assistant message after the listener unsubscribes', async () => {
    const assistantMessage = createAssistantMessage(conversationMessages, conversationStore);
    const continueStreamRef: { current: null | (() => void) } = { current: null };

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream: async () => ({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield delta('前端断开后');
            await new Promise<void>((resolve) => {
              continueStreamRef.current = resolve;
            });
            yield delta('继续完成');
          })(),
        },
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    const unsubscribe = service.subscribe(String(assistantMessage.id), () => undefined);

    await new Promise((resolve) => setTimeout(resolve, 0));
    unsubscribe();
    if (continueStreamRef.current) {
      continueStreamRef.current();
    }
    await service.waitForTask(String(assistantMessage.id));

    expect(conversationStore.requireConversation(conversationId).messages[0]).toMatchObject({
      content: '前端断开后继续完成',
      role: 'assistant',
      status: 'completed',
    });
  });

  it('marks the assistant message as error when stream consumption fails and does not leak rejected stream promises', async () => {
    const assistantMessage = createAssistantMessage(conversationMessages, conversationStore);
    const unhandledErrors: unknown[] = [];
    const handleUnhandledRejection = (reason: unknown) => {
      unhandledErrors.push(reason);
    };
    process.on('unhandledRejection', handleUnhandledRejection);

    try {
      service.startTask({
        assistantMessageId: String(assistantMessage.id),
        conversationId,
        createStream: async () => {
          const streamFailure = new Error('invalid x-api-key');
          return {
            modelId: 'claude-3-5-sonnet-20241022',
            providerId: 'anthropic',
            stream: {
              finishReason: Promise.reject(streamFailure),
              fullStream: (async function* () {
                yield delta('部分输出');
                throw streamFailure;
              })(),
              usage: Promise.reject(streamFailure),
            },
          };
        },
        modelId: 'claude-3-5-sonnet-20241022',
        providerId: 'anthropic',
      });

      await service.waitForTask(String(assistantMessage.id));
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(conversationStore.requireConversation(conversationId).messages[0]).toMatchObject({
        content: '部分输出',
        error: 'invalid x-api-key',
        model: 'claude-3-5-sonnet-20241022',
        provider: 'anthropic',
        role: 'assistant',
        status: 'error',
      });
      expect(unhandledErrors).toEqual([]);
    } finally {
      process.off('unhandledRejection', handleUnhandledRejection);
    }
  });

  it('retries retryable stream failures and resets the assistant snapshot before the next attempt', async () => {
    service = new ConversationTaskService(
      conversationMessages,
      conversationStore,
      runtimeToolPermissionService,
      conversationTodos,
      {
        getHostModelRoutingConfig: () => ({
          chatAutoRetry: {
            backoffFactor: 2,
            enabled: true,
            initialDelayMs: 0,
            maxDelayMs: 0,
            maxRetries: 1,
          },
          fallbackChatModels: [],
          utilityModelRoles: {},
        }),
      } as never,
    );
    const assistantMessage = createAssistantMessage(conversationMessages, conversationStore);
    const events: Array<ConversationTaskEvent | { [key: string]: unknown }> = [];
    const overloaded = new APICallError({
      message: 'Provider is overloaded',
      requestBodyValues: {},
      responseHeaders: {},
      statusCode: 429,
      url: 'https://example.com/v1/chat/completions',
    });
    const createStream = jest
      .fn()
      .mockResolvedValueOnce({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield delta('第一次');
            throw overloaded;
          })(),
          usage: Promise.reject(overloaded).catch(() => undefined),
        },
      })
      .mockResolvedValueOnce({
        modelId: 'gpt-5.4',
        providerId: 'openai',
        stream: {
          fullStream: (async function* () {
            yield delta('第二次成功');
          })(),
        },
      });

    service.startTask({
      assistantMessageId: String(assistantMessage.id),
      conversationId,
      createStream,
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    service.subscribe(String(assistantMessage.id), (event) => events.push(event));

    await service.waitForTask(String(assistantMessage.id));

    expect(createStream).toHaveBeenCalledTimes(2);
    expect(events).toEqual(expect.arrayContaining([
      { messageId: String(assistantMessage.id), status: 'streaming', type: 'status' },
      expect.objectContaining({
        assistantMessage: expect.objectContaining({
          content: '',
          error: null,
          id: String(assistantMessage.id),
          status: 'pending',
        }),
        type: 'message-start',
      }),
      expect.objectContaining({
        attempt: 1,
        message: 'Provider is overloaded',
        messageId: String(assistantMessage.id),
        next: expect.any(Number),
        type: 'retry',
      }),
      { messageId: String(assistantMessage.id), status: 'completed', type: 'finish' },
    ]));
    expect(conversationStore.requireConversation(conversationId).messages[0]).toMatchObject({
      content: '第二次成功',
      error: null,
      role: 'assistant',
      status: 'completed',
    });
  });
});

function createAssistantMessage(
  conversationMessages: ConversationMessageService,
  conversationStore: ConversationStoreService,
) {
  const conversationId = ((conversationStore.listConversations() as Array<{ id: string }>)[0]).id;
  return conversationMessages.createMessage(conversationId, {
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
  return {
    output: {
      data: {
        backendKind: 'native-shell',
        stdout: 'temp=20',
      },
      kind: 'tool:json',
      value: { temp: 20 },
    },
    toolCallId: 'tool-call-1',
    toolName: 'weather.search',
  };
}

function compactToolResultRecord() {
  return {
    output: {
      kind: 'tool:json',
      value: { temp: 20 },
    },
    toolCallId: 'tool-call-1',
    toolName: 'weather.search',
  };
}

function toolCall() {
  return { ...toolCallRecord(), type: 'tool-call' as const };
}

function wrappedToolResult() {
  return { ...toolResultRecord(), type: 'tool-result' as const };
}

function readRuntimePermissionListenerCount(
  runtimeToolPermissionService: RuntimeToolPermissionService,
  conversationId: string,
) {
  return (
    (runtimeToolPermissionService as unknown as {
      listeners?: Map<string, Set<unknown>>;
    }).listeners?.get(conversationId)?.size ?? 0
  );
}

function readConversationTodoListenerCount(
  conversationTodos: ConversationTodoService,
  conversationId: string,
) {
  return (
    (conversationTodos as unknown as {
      listeners?: Map<string, Set<unknown>>;
    }).listeners?.get(conversationId)?.size ?? 0
  );
}

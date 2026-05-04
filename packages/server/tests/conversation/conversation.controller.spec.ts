import * as fs from 'node:fs';
import * as path from 'node:path';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  activateBufferedEventGateLive,
  ConversationController,
  createBufferedEventGate,
  synchronizeBufferedTaskStart,
} from '../../src/modules/conversation/conversation.controller';

describe('ConversationController', () => {
  const conversationId = '11111111-1111-4111-8111-111111111111';
  const assistantMessageId = '22222222-2222-4222-8222-222222222222';
  const conversationMessagePlanningService = { getContextWindowPreview: jest.fn() };
  const conversationMessageLifecycleService = { retryMessageGeneration: jest.fn(), startMessageGeneration: jest.fn(), stopMessageGeneration: jest.fn() };
  const conversationTaskService = { hasTask: jest.fn(), stopTask: jest.fn(), subscribe: jest.fn(), waitForTask: jest.fn() };
  const runtimeToolPermissionService = { listPendingRequests: jest.fn(), reply: jest.fn() };
  const conversationMessages = { deleteMessage: jest.fn(), updateMessage: jest.fn() };
  const conversationTodos = { deleteSessionTodo: jest.fn(), readSessionTodo: jest.fn(), replaceSessionTodo: jest.fn() };
  const subagentRunner = { interruptSubagent: jest.fn(), sendInputSubagent: jest.fn(), subscribe: jest.fn(), waitSubagent: jest.fn() };
  const conversationStore = {
    createConversation: jest.fn(),
    deleteConversation: jest.fn(),
    getConversation: jest.fn(),
    listChildSubagentConversations: jest.fn(),
    listConversationTreeRecords: jest.fn(),
    listConversations: jest.fn(),
    requireConversation: jest.fn(),
  };
  let controller: ConversationController;

  beforeEach(() => {
    jest.clearAllMocks();
    subagentRunner.subscribe.mockReturnValue(() => undefined);
    conversationTaskService.hasTask.mockReturnValue(false);
    conversationStore.requireConversation.mockReturnValue({
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'main',
      messages: [],
      title: 'New Chat',
      updatedAt: '2026-04-11T00:00:00.000Z',
    });
    controller = new ConversationController(
      conversationMessagePlanningService as never,
      conversationMessageLifecycleService as never,
      conversationTaskService as never,
      runtimeToolPermissionService as never,
      conversationMessages as never,
      conversationStore as never,
      conversationTodos as never,
      subagentRunner as never,
    );
  });

  it('marks chat routes with jwt auth guard metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ConversationController) as Array<{ name?: string }> | undefined;
    expect(guards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
  });

  it('keeps UUID route param validation on conversation and message routes', () => {
    const source = fs.readFileSync(
      path.join(__dirname, '../../src/modules/conversation/conversation.controller.ts'),
      'utf8',
    );

    expect(source).toContain("@Get('conversations/:id')");
    expect(source).toContain("const routeUuidPipe = new ParseUUIDPipe({ version: '7' });");
    expect(source).toContain("@Param('id', routeUuidPipe) id: string");
    expect(source).toContain("@Patch('conversations/:id/messages/:messageId')");
    expect(source).toContain("@Param('messageId', routeUuidPipe) messageId: string");
  });

  it('re-reads attach start snapshots while buffered events keep arriving', () => {
    const response = createResponseStub();
    const gate = createBufferedEventGate();
    let readCount = 0;
    response.write.mockImplementation((chunk: string) => {
      if (chunk.includes('"assistant-1"') && readCount === 1) {
        gate.buffer({ messageId: 'assistant-1', toolCallId: 'tool-call-1', toolName: 'read', type: 'tool-call' });
      }
      return true;
    });

    const synchronized = synchronizeBufferedTaskStart(
      response as never,
      gate,
      () => {
        readCount += 1;
        return {
          assistantMessageId: 'assistant-1',
          startPayload: {
            assistantMessage: { id: 'assistant-1', role: 'assistant', status: 'streaming' },
            type: 'message-start',
          },
        };
      },
    );

    expect(synchronized.nextTask?.assistantMessageId).toBe('assistant-1');
    expect(synchronized.consumedBufferedEvents).toEqual([
      expect.objectContaining({
        messageId: 'assistant-1',
        toolCallId: 'tool-call-1',
        toolName: 'read',
        type: 'tool-call',
      }),
    ]);
    expect(readCount).toBe(2);
    expect(response.write).toHaveBeenCalledTimes(2);
  });

  it('flushes attach events buffered after the last stable snapshot to SSE when live activates', () => {
    const response = createResponseStub();
    const gate = createBufferedEventGate();

    expect(gate.takeBufferedEvents()).toEqual([]);

    const lateBufferedEvent = {
      messageId: 'assistant-1',
      toolCallId: 'tool-call-1',
      toolName: 'read',
      type: 'tool-call',
    };
    gate.buffer(lateBufferedEvent);

    activateBufferedEventGateLive(response as never, gate);

    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('"tool-call-1"'));
    expect(gate.shouldBuffer()).toBe(false);
    expect(gate.takeBufferedEvents()).toEqual([]);
  });

  it('creates, lists, reads and deletes conversations through user-owned conversation APIs', async () => {
    const overview = { _count: { messages: 0 }, createdAt: '2026-04-11T00:00:00.000Z', id: conversationId, title: '新的对话', updatedAt: '2026-04-11T00:00:00.000Z' };
    conversationStore.createConversation.mockReturnValue(overview);
    conversationStore.listConversations.mockReturnValue([overview]);
    conversationStore.getConversation.mockReturnValue({ ...overview, messages: [] });
    conversationStore.listConversationTreeRecords.mockReturnValue([
      {
        id: conversationId,
        kind: 'main',
        messages: [
          { id: assistantMessageId, role: 'assistant', status: 'streaming' },
          { id: '55555555-5555-4555-8555-555555555555', role: 'display', status: 'pending' },
          { id: '66666666-6666-4666-8666-666666666666', role: 'assistant', status: 'completed' },
        ],
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        kind: 'subagent',
        messages: [
          { id: '44444444-4444-4444-8444-444444444444', role: 'assistant', status: 'pending' },
        ],
        subagent: { pluginId: 'plugin-a', status: 'running' },
      },
    ]);
    conversationStore.deleteConversation.mockResolvedValue({ message: 'Conversation deleted' });

    expect(controller.createConversation('user-1', { title: '新的对话' } as never)).toEqual(overview);
    expect(conversationStore.createConversation).toHaveBeenCalledWith({ title: '新的对话', userId: 'user-1' });
    expect(controller.listConversations('user-1')).toEqual([overview]);
    expect(conversationStore.listConversations).toHaveBeenCalledWith('user-1');
    expect(controller.getConversation('user-1', conversationId)).toEqual({ ...overview, isRunning: false, messages: [] });
    expect(conversationStore.getConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    await expect(controller.deleteConversation('user-1', conversationId)).resolves.toEqual({ message: 'Conversation deleted' });
    expect(conversationStore.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(conversationStore.listConversationTreeRecords).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(conversationTaskService.stopTask).toHaveBeenCalledTimes(3);
    expect(conversationTaskService.stopTask).toHaveBeenNthCalledWith(1, assistantMessageId);
    expect(conversationTaskService.stopTask).toHaveBeenNthCalledWith(2, '55555555-5555-4555-8555-555555555555');
    expect(conversationTaskService.stopTask).toHaveBeenNthCalledWith(3, '44444444-4444-4444-8444-444444444444');
    expect(subagentRunner.interruptSubagent).toHaveBeenCalledWith('plugin-a', '33333333-3333-4333-8333-333333333333', 'user-1');
    expect(conversationStore.deleteConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(conversationStore.requireConversation.mock.invocationCallOrder[0]).toBeLessThan(
      conversationStore.listConversationTreeRecords.mock.invocationCallOrder[0],
    );
    expect(conversationStore.listConversationTreeRecords.mock.invocationCallOrder[0]).toBeLessThan(
      conversationTaskService.stopTask.mock.invocationCallOrder[0],
    );
    expect(conversationTaskService.stopTask.mock.invocationCallOrder[2]).toBeLessThan(
      subagentRunner.interruptSubagent.mock.invocationCallOrder[0],
    );
    expect(subagentRunner.interruptSubagent.mock.invocationCallOrder[0]).toBeLessThan(
      conversationStore.deleteConversation.mock.invocationCallOrder[0],
    );
    expect(conversationTodos.deleteSessionTodo).not.toHaveBeenCalled();
  });

  it('interrupts queued subagent conversations before deleting the conversation tree', async () => {
    conversationStore.listConversationTreeRecords.mockReturnValue([
      {
        id: conversationId,
        kind: 'main',
        messages: [],
      },
      {
        id: '77777777-7777-4777-8777-777777777777',
        kind: 'subagent',
        messages: [
          { id: '88888888-8888-4888-8888-888888888888', role: 'assistant', status: 'pending' },
        ],
        subagent: { pluginId: 'plugin-b', status: 'queued' },
      },
    ]);
    conversationStore.deleteConversation.mockResolvedValue({ message: 'Conversation deleted' });

    await expect(controller.deleteConversation('user-1', conversationId)).resolves.toEqual({ message: 'Conversation deleted' });

    expect(conversationTaskService.stopTask).toHaveBeenCalledWith('88888888-8888-4888-8888-888888888888');
    expect(subagentRunner.interruptSubagent).toHaveBeenCalledWith(
      'plugin-b',
      '77777777-7777-4777-8777-777777777777',
      'user-1',
    );
  });

  it('reads conversation context window through owned conversation APIs', async () => {
    const preview = {
      contextLength: 256,
      enabled: true,
      estimatedTokens: 120,
      excludedMessageIds: ['message-1'],
      frontendMessageWindowSize: 200,
      includedMessageIds: ['message-2', 'message-3'],
      keepRecentMessages: 2,
      source: 'estimated' as const,
      slidingWindowUsagePercent: 50,
      strategy: 'sliding' as const,
    };
    conversationMessagePlanningService.getContextWindowPreview.mockResolvedValue(preview);

    await expect(controller.getConversationContextWindow('user-1', conversationId, 'openai', 'gpt-5.4')).resolves.toEqual(preview);
    expect(conversationStore.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(conversationMessagePlanningService.getContextWindowPreview).toHaveBeenCalledWith({
      conversationId,
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    });
  });

  it('reads and updates session todo through owned conversation APIs', () => {
    const todos = [{ content: '实现 todo 工具', priority: 'high', status: 'in_progress' }];
    conversationTodos.readSessionTodo.mockReturnValue(todos);
    conversationTodos.replaceSessionTodo.mockReturnValue(todos);

    expect(controller.getSessionTodo('user-1', conversationId)).toEqual(todos);
    expect(conversationTodos.readSessionTodo).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(controller.updateSessionTodo('user-1', conversationId, { todos } as never)).toEqual(todos);
    expect(conversationTodos.replaceSessionTodo).toHaveBeenCalledWith(conversationId, todos, 'user-1');
  });

  it('lists only subagent child conversations for the conversation tabs API', () => {
    const subagentChildren = [
      { id: '33333333-3333-4333-8333-333333333333', kind: 'subagent', title: 'Subagent Child' },
    ];
    conversationStore.listChildSubagentConversations.mockReturnValue(subagentChildren);

    expect(controller.listConversationSubagents('user-1', conversationId)).toEqual(subagentChildren);
    expect(conversationStore.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(conversationStore.listChildSubagentConversations).toHaveBeenCalledWith(conversationId, 'user-1');
  });

  it('lists and replies runtime permission requests through owned conversation APIs', () => {
    const pending = [
      {
        backendKind: 'just-bash',
        operations: ['command.execute'],
        conversationId,
        createdAt: '2026-04-20T00:00:00.000Z',
        id: 'permission-1',
        summary: '执行 bash 命令',
        toolName: 'bash',
      },
    ];
    runtimeToolPermissionService.listPendingRequests.mockReturnValue(pending);
    runtimeToolPermissionService.reply.mockReturnValue({
      requestId: 'permission-1',
      resolution: 'approved',
    });

    expect(controller.listPendingRuntimePermissions('user-1', conversationId)).toEqual(pending);
    expect(runtimeToolPermissionService.listPendingRequests).toHaveBeenCalledWith(conversationId);
    expect(controller.replyRuntimePermission('user-1', conversationId, 'permission-1', { decision: 'always' } as never)).toEqual({
      requestId: 'permission-1',
      resolution: 'approved',
    });
    expect(runtimeToolPermissionService.reply).toHaveBeenCalledWith(conversationId, 'permission-1', 'always');
  });

  it('streams message-start and task events over SSE for sendMessage', async () => {
    const response = createResponseStub();
    let subscriber: ((event: { type: string }) => void) | null = null;
    const sendDto = { content: '你好', model: 'gpt-5.4', parts: [{ text: '你好', type: 'text' as const }], provider: 'openai' };
    const started = { assistantMessage: { id: assistantMessageId, role: 'assistant', content: '' }, userMessage: { id: '33333333-3333-4333-8333-333333333333', role: 'user', content: '你好' } };
    conversationMessageLifecycleService.startMessageGeneration.mockResolvedValue(started);
    conversationTaskService.subscribe.mockImplementation((_id: string, listener: (event: { type: string }) => void) => (subscriber = listener, jest.fn()));
    conversationTaskService.waitForTask.mockImplementation(async () => {
      subscriber?.({ messageId: assistantMessageId, status: 'streaming', type: 'status' } as never);
      subscriber?.({ messageId: assistantMessageId, text: '你好', type: 'text-delta' } as never);
      subscriber?.({ messageId: assistantMessageId, status: 'completed', type: 'finish' } as never);
    });

    await controller.sendMessage('user-1', conversationId, sendDto as never, response as never);

    expect(conversationStore.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(conversationMessageLifecycleService.startMessageGeneration).toHaveBeenCalledWith(conversationId, sendDto, 'user-1');
    expect(response.write).toHaveBeenNthCalledWith(1, sse({ assistantMessage: started.assistantMessage, type: 'message-start', userMessage: started.userMessage }));
    expect(response.write).toHaveBeenCalledWith(sse({ messageId: assistantMessageId, text: '你好', type: 'text-delta' }));
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
  });

  it('streams live task events for an already running main conversation', async () => {
    const response = createResponseStub();
    const initialConversation = {
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'main',
      messages: [
        { id: 'user-1', role: 'user', status: 'completed', content: '继续执行' },
        { id: assistantMessageId, role: 'assistant', status: 'streaming', content: '' },
      ],
      title: 'Main Chat',
      updatedAt: '2026-04-11T00:00:00.000Z',
    };
    const refreshedConversation = {
      ...initialConversation,
      messages: [
        initialConversation.messages[0],
        {
          ...initialConversation.messages[1],
          toolCalls: [{ input: { filePath: 'docs/plan.md' }, toolCallId: 'tool-call-1', toolName: 'read' }],
        },
      ],
    };
    conversationStore.requireConversation
      .mockReturnValueOnce(initialConversation)
      .mockReturnValueOnce(refreshedConversation)
      .mockReturnValue(refreshedConversation);
    conversationTaskService.subscribe.mockImplementation((_id: string, listener: (event: { type: string }) => void) => {
      listener({ input: { filePath: 'docs/plan.md' }, messageId: assistantMessageId, toolCallId: 'tool-call-1', toolName: 'read', type: 'tool-call' } as never);
      return jest.fn();
    });
    conversationTaskService.waitForTask.mockResolvedValue(undefined);

    await controller.streamConversationEvents('user-1', conversationId, response as never);

    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('"type":"message-start"'));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('"toolCalls":"['));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('tool-call-1'));
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
  });

  it('keeps attach alive across the main-conversation continuation gap before the next assistant exists', async () => {
    const response = createResponseStub();
    const continuationAssistantId = '33333333-3333-4333-8333-333333333333';
    const initialConversation = {
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'main',
      messages: [
        { id: 'user-1', role: 'user', status: 'completed', content: '继续执行' },
        { id: assistantMessageId, role: 'assistant', status: 'completed', content: '首轮完成' },
      ],
      title: 'Main Chat',
      updatedAt: '2026-04-11T00:00:00.000Z',
    };
    const continuationConversation = {
      ...initialConversation,
      messages: [
        initialConversation.messages[0],
        initialConversation.messages[1],
        {
          id: 'continue-user-1',
          role: 'user',
          status: 'completed',
          content: 'Continue if you have next steps',
          metadataJson: JSON.stringify({
            annotations: [
              {
                owner: 'conversation.context-governance',
                type: 'context-compaction',
                data: {
                  role: 'continue',
                  synthetic: true,
                  trigger: 'after-response',
                },
              },
            ],
          }),
        },
        {
          id: continuationAssistantId,
          role: 'assistant',
          status: 'streaming',
          content: '',
        },
      ],
    };
    const bufferedContinuationConversation = {
      ...continuationConversation,
      messages: [
        continuationConversation.messages[0],
        continuationConversation.messages[1],
        continuationConversation.messages[2],
        {
          ...continuationConversation.messages[3],
          toolCalls: [{ input: { filePath: 'docs/plan.md' }, toolCallId: 'tool-call-1', toolName: 'read' }],
        },
      ],
    };
    conversationTaskService.hasTask.mockImplementation((messageId: string) => messageId === assistantMessageId);
    conversationStore.requireConversation
      .mockReturnValueOnce(initialConversation)
      .mockReturnValueOnce(initialConversation)
      .mockReturnValueOnce(continuationConversation)
      .mockReturnValueOnce(continuationConversation)
      .mockReturnValue(bufferedContinuationConversation);
    conversationTaskService.subscribe.mockImplementation((messageId: string, listener: (event: { type: string }) => void) => {
      if (messageId === continuationAssistantId) {
        listener({ input: { filePath: 'docs/plan.md' }, messageId: continuationAssistantId, toolCallId: 'tool-call-1', toolName: 'read', type: 'tool-call' } as never);
      }
      return jest.fn();
    });
    conversationTaskService.waitForTask.mockResolvedValue(undefined);

    await controller.streamConversationEvents('user-1', conversationId, response as never);

    expect(conversationTaskService.subscribe).toHaveBeenNthCalledWith(1, assistantMessageId, expect.any(Function));
    expect(conversationTaskService.subscribe).toHaveBeenNthCalledWith(2, continuationAssistantId, expect.any(Function));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining(`"id":"${continuationAssistantId}"`));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('tool-call-1'));
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
  });

  it('flushes buffered tool events for the previous assistant before switching attach to the next assistant', async () => {
    const response = createResponseStub();
    const continuationAssistantId = '33333333-3333-4333-8333-333333333333';
    const initialConversation = {
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'main',
      messages: [
        { id: 'user-1', role: 'user', status: 'completed', content: '继续执行' },
        { id: assistantMessageId, role: 'assistant', status: 'streaming', content: '' },
      ],
      title: 'Main Chat',
      updatedAt: '2026-04-11T00:00:00.000Z',
    };
    const continuationConversation = {
      ...initialConversation,
      messages: [
        initialConversation.messages[0],
        {
          ...initialConversation.messages[1],
          status: 'completed',
        },
        {
          id: 'continue-user-1',
          role: 'user',
          status: 'completed',
          content: 'Continue if you have next steps',
          metadataJson: JSON.stringify({
            annotations: [
              {
                owner: 'conversation.context-governance',
                type: 'context-compaction',
                data: {
                  role: 'continue',
                  synthetic: true,
                  trigger: 'after-response',
                },
              },
            ],
          }),
        },
        {
          id: continuationAssistantId,
          role: 'assistant',
          status: 'streaming',
          content: '',
        },
      ],
      updatedAt: '2026-04-11T00:00:01.000Z',
    };
    conversationStore.requireConversation
      .mockReturnValueOnce(initialConversation)
      .mockReturnValueOnce(initialConversation)
      .mockReturnValueOnce(continuationConversation)
      .mockReturnValue(continuationConversation);
    conversationTaskService.subscribe.mockImplementation((messageId: string, listener: (event: { type: string }) => void) => {
      if (messageId === assistantMessageId) {
        listener({ input: { filePath: 'docs/plan.md' }, messageId: assistantMessageId, toolCallId: 'tool-call-1', toolName: 'read', type: 'tool-call' } as never);
      }
      return jest.fn();
    });
    conversationTaskService.waitForTask.mockResolvedValue(undefined);

    await controller.streamConversationEvents('user-1', conversationId, response as never);

    expect(response.write).toHaveBeenCalledWith(expect.stringContaining(`"messageId":"${assistantMessageId}"`));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('tool-call-1'));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining(`"id":"${continuationAssistantId}"`));
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
  });

  it('streams live task events for an already running subagent conversation', async () => {
    const response = createResponseStub();
    const initialConversation = {
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'subagent',
      messages: [
        { id: 'user-1', role: 'user', status: 'completed', content: '继续执行' },
        { id: 'assistant-1', role: 'assistant', status: 'streaming', content: '' },
      ],
      subagent: { activeAssistantMessageId: 'assistant-1', pluginId: 'plugin-a', status: 'running' },
      title: 'Subagent',
      updatedAt: '2026-04-11T00:00:00.000Z',
    };
    const refreshedConversation = {
      ...initialConversation,
      messages: [
        initialConversation.messages[0],
        {
          ...initialConversation.messages[1],
          toolCalls: [{ input: { filePath: 'docs/plan.md' }, toolCallId: 'tool-call-1', toolName: 'read' }],
        },
      ],
    };
    conversationStore.requireConversation
      .mockReturnValueOnce(initialConversation)
      .mockReturnValueOnce(refreshedConversation)
      .mockReturnValue(refreshedConversation);
    subagentRunner.subscribe.mockImplementation((_conversationId: string, next: (event: Record<string, unknown>) => void) => {
      next({ input: { filePath: 'docs/plan.md' }, messageId: 'assistant-1', toolCallId: 'tool-call-1', toolName: 'read', type: 'tool-call' });
      return jest.fn();
    });
    subagentRunner.waitSubagent.mockResolvedValue({ conversationId, result: '完成', status: 'completed' });

    await controller.streamConversationEvents('user-1', conversationId, response as never);

    expect(subagentRunner.waitSubagent).toHaveBeenCalledWith('plugin-a', { conversationId });
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('"type":"message-start"'));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('"toolCalls":"['));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('tool-call-1'));
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
  });

  it('keeps attach alive for a running subagent even before the next assistant message exists', async () => {
    const response = createResponseStub();
    let listener: ((event: Record<string, unknown>) => void) | null = null;
    const initialConversation = {
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'subagent',
      messages: [
        { id: 'user-1', role: 'user', status: 'completed', content: '继续执行' },
        { id: 'assistant-1', role: 'assistant', status: 'completed', content: '首轮完成' },
      ],
      subagent: { pluginId: 'plugin-a', status: 'running' },
      title: 'Subagent',
      updatedAt: '2026-04-11T00:00:00.000Z',
    };
    conversationStore.requireConversation.mockReturnValue(initialConversation);
    subagentRunner.subscribe.mockImplementation((_conversationId: string, next: (event: Record<string, unknown>) => void) => {
      listener = next;
      return jest.fn();
    });
    subagentRunner.waitSubagent.mockImplementation(async () => {
      listener?.({
        assistantMessage: { id: 'assistant-2', role: 'assistant', status: 'streaming', content: '' },
        type: 'message-start',
      });
      listener?.({
        input: { filePath: 'docs/plan.md' },
        messageId: 'assistant-2',
        toolCallId: 'tool-call-1',
        toolName: 'read',
        type: 'tool-call',
      });
      return { conversationId, result: '完成', status: 'completed' };
    });

    await controller.streamConversationEvents('user-1', conversationId, response as never);

    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('"type":"message-start"'));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('"assistant-2"'));
    expect(response.write).toHaveBeenCalledWith(expect.stringContaining('tool-call-1'));
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
  });

  it('streams main-conversation auto-compaction continuation tasks in the same SSE response', async () => {
    const response = createResponseStub();
    let firstSubscriber: ((event: { type: string }) => void) | null = null;
    let secondSubscriber: ((event: { type: string }) => void) | null = null;
    conversationStore.requireConversation
      .mockReturnValueOnce({
        createdAt: '2026-04-11T00:00:00.000Z',
        id: conversationId,
        kind: 'main',
        messages: [],
        title: 'Main Chat',
        updatedAt: '2026-04-11T00:00:00.000Z',
      })
      .mockReturnValueOnce({
        createdAt: '2026-04-11T00:00:00.000Z',
        id: conversationId,
        kind: 'main',
        messages: [
          {
            content: '先做第一轮',
            createdAt: '2026-04-11T00:00:01.000Z',
            id: 'user-1',
            partsJson: '[{"type":"text","text":"先做第一轮"}]',
            role: 'user',
            status: 'completed',
            updatedAt: '2026-04-11T00:00:01.000Z',
          },
          {
            content: '第一轮完成',
            createdAt: '2026-04-11T00:00:01.500Z',
            id: 'assistant-1',
            metadataJson: null,
            model: 'gpt-5.4',
            partsJson: '[{"type":"text","text":"第一轮完成"}]',
            provider: 'openai',
            role: 'assistant',
            status: 'completed',
            toolCalls: null,
            toolResults: null,
            updatedAt: '2026-04-11T00:00:02.000Z',
          },
          {
            content: '压缩摘要：保留目标、约束与下一步。',
            createdAt: '2026-04-11T00:00:02.050Z',
            id: 'summary-1',
            metadataJson: JSON.stringify({
              annotations: [
                {
                  data: {
                    afterPreview: { estimatedTokens: 320, messageCount: 1, source: 'estimated', textBytes: 1280 },
                    beforePreview: { estimatedTokens: 4096, messageCount: 2, source: 'provider', textBytes: 16000 },
                    compactionId: 'compaction-1',
                    coveredCount: 2,
                    createdAt: '2026-04-11T00:00:02.050Z',
                    modelId: 'gpt-5.4',
                    providerId: 'openai',
                    role: 'summary',
                    trigger: 'after-response',
                  },
                  owner: 'conversation.context-governance',
                  type: 'context-compaction',
                  version: '1',
                },
              ],
            }),
            model: 'gpt-5.4',
            partsJson: '[{"type":"text","text":"压缩摘要：保留目标、约束与下一步。"}]',
            provider: 'openai',
            role: 'display',
            status: 'completed',
            toolCalls: null,
            toolResults: null,
            updatedAt: '2026-04-11T00:00:02.050Z',
          },
          {
            content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
            createdAt: '2026-04-11T00:00:02.100Z',
            id: 'user-2',
            metadataJson: JSON.stringify({
              annotations: [
                {
                  data: { role: 'continue', synthetic: true, trigger: 'after-response' },
                  owner: 'conversation.context-governance',
                  type: 'context-compaction',
                  version: '1',
                },
              ],
            }),
            partsJson: '[{"type":"text","text":"Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."}]',
            role: 'user',
            status: 'completed',
            updatedAt: '2026-04-11T00:00:02.100Z',
          },
          {
            content: '',
            createdAt: '2026-04-11T00:00:02.200Z',
            id: 'assistant-2',
            metadataJson: null,
            model: 'gpt-5.4',
            partsJson: null,
            provider: 'openai',
            role: 'assistant',
            status: 'pending',
            toolCalls: null,
            toolResults: null,
            updatedAt: '2026-04-11T00:00:02.200Z',
          },
        ],
        title: 'Main Chat',
        updatedAt: '2026-04-11T00:00:02.200Z',
      })
      .mockReturnValue({
        createdAt: '2026-04-11T00:00:00.000Z',
        id: conversationId,
        kind: 'main',
        messages: [
          {
            content: '先做第一轮',
            createdAt: '2026-04-11T00:00:01.000Z',
            id: 'user-1',
            partsJson: '[{"type":"text","text":"先做第一轮"}]',
            role: 'user',
            status: 'completed',
            updatedAt: '2026-04-11T00:00:01.000Z',
          },
          {
            content: '第一轮完成',
            createdAt: '2026-04-11T00:00:01.500Z',
            id: 'assistant-1',
            metadataJson: null,
            model: 'gpt-5.4',
            partsJson: '[{"type":"text","text":"第一轮完成"}]',
            provider: 'openai',
            role: 'assistant',
            status: 'completed',
            toolCalls: null,
            toolResults: null,
            updatedAt: '2026-04-11T00:00:02.000Z',
          },
          {
            content: '压缩摘要：保留目标、约束与下一步。',
            createdAt: '2026-04-11T00:00:02.050Z',
            id: 'summary-1',
            metadataJson: JSON.stringify({
              annotations: [
                {
                  data: {
                    afterPreview: { estimatedTokens: 320, messageCount: 1, source: 'estimated', textBytes: 1280 },
                    beforePreview: { estimatedTokens: 4096, messageCount: 2, source: 'provider', textBytes: 16000 },
                    compactionId: 'compaction-1',
                    coveredCount: 2,
                    createdAt: '2026-04-11T00:00:02.050Z',
                    modelId: 'gpt-5.4',
                    providerId: 'openai',
                    role: 'summary',
                    trigger: 'after-response',
                  },
                  owner: 'conversation.context-governance',
                  type: 'context-compaction',
                  version: '1',
                },
              ],
            }),
            model: 'gpt-5.4',
            partsJson: '[{"type":"text","text":"压缩摘要：保留目标、约束与下一步。"}]',
            provider: 'openai',
            role: 'display',
            status: 'completed',
            toolCalls: null,
            toolResults: null,
            updatedAt: '2026-04-11T00:00:02.050Z',
          },
          {
            content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
            createdAt: '2026-04-11T00:00:02.100Z',
            id: 'user-2',
            metadataJson: JSON.stringify({
              annotations: [
                {
                  data: { role: 'continue', synthetic: true, trigger: 'after-response' },
                  owner: 'conversation.context-governance',
                  type: 'context-compaction',
                  version: '1',
                },
              ],
            }),
            partsJson: '[{"type":"text","text":"Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed."}]',
            role: 'user',
            status: 'completed',
            updatedAt: '2026-04-11T00:00:02.100Z',
          },
          {
            content: '第二轮继续完成',
            createdAt: '2026-04-11T00:00:02.200Z',
            id: 'assistant-2',
            metadataJson: null,
            model: 'gpt-5.4',
            partsJson: '[{"type":"text","text":"第二轮继续完成"}]',
            provider: 'openai',
            role: 'assistant',
            status: 'completed',
            toolCalls: null,
            toolResults: null,
            updatedAt: '2026-04-11T00:00:02.500Z',
          },
        ],
        title: 'Main Chat',
        updatedAt: '2026-04-11T00:00:02.500Z',
      });
    conversationMessageLifecycleService.startMessageGeneration.mockResolvedValue({
      assistantMessage: { id: 'assistant-1', role: 'assistant', content: '' },
      userMessage: { id: 'user-1', role: 'user', content: '先做第一轮' },
    });
    conversationTaskService.subscribe.mockImplementation((messageId: string, listener: (event: { type: string }) => void) => {
      if (messageId === 'assistant-1') {
        firstSubscriber = listener;
      }
      if (messageId === 'assistant-2') {
        secondSubscriber = listener;
      }
      return jest.fn();
    });
    conversationTaskService.waitForTask.mockImplementation(async (messageId: string) => {
      if (messageId === 'assistant-1') {
        firstSubscriber?.({ messageId: 'assistant-1', status: 'streaming', type: 'status' } as never);
        firstSubscriber?.({ messageId: 'assistant-1', text: '第一轮完成', type: 'text-delta' } as never);
        firstSubscriber?.({ messageId: 'assistant-1', status: 'completed', type: 'finish' } as never);
        return;
      }
      if (messageId === 'assistant-2') {
        secondSubscriber?.({ messageId: 'assistant-2', status: 'streaming', type: 'status' } as never);
        secondSubscriber?.({ messageId: 'assistant-2', text: '第二轮继续完成', type: 'text-delta' } as never);
        secondSubscriber?.({ messageId: 'assistant-2', status: 'completed', type: 'finish' } as never);
      }
    });

    await controller.sendMessage(
      'user-1',
      conversationId,
      { content: '先做第一轮' } as never,
      response as never,
    );

    const writes = response.write.mock.calls.map(([payload]) => payload);
    expect(writes.some((payload) => payload.includes('"type":"message-start"') && payload.includes('"id":"assistant-1"') && payload.includes('"id":"user-1"'))).toBe(true);
    expect(writes.some((payload) => payload.includes('"type":"message-start"') && payload.includes('"id":"assistant-2"') && payload.includes('"id":"user-2"'))).toBe(true);
    expect(writes).toContain(sse({ messageId: 'assistant-2', text: '第二轮继续完成', type: 'text-delta' }));
    expect(writes).toContain(sse({ messageId: 'assistant-2', status: 'completed', type: 'finish' }));
    expect(
      writes.findIndex((payload) => payload.includes('"messageId":"assistant-1"') && payload.includes('"type":"finish"')),
    ).toBeLessThan(
      writes.findIndex((payload) => payload.includes('"type":"message-start"') && payload.includes('"id":"assistant-2"')),
    );
  });

  it('unsubscribes the active task listener when SSE closes', async () => {
    const response = createResponseStub();
    let closeHandler: (() => void) | undefined;
    const unsubscribe = jest.fn();
    response.on.mockImplementation((event: string, handler: () => void) => {
      if (event === 'close') {
        closeHandler = handler;
      }
    });
    conversationMessageLifecycleService.startMessageGeneration.mockResolvedValue({
      assistantMessage: { id: assistantMessageId, role: 'assistant', content: '' },
      userMessage: { id: '33333333-3333-4333-8333-333333333333', role: 'user', content: '你好' },
    });
    conversationTaskService.subscribe.mockReturnValue(unsubscribe);
    conversationTaskService.waitForTask.mockResolvedValue(undefined);

    await controller.sendMessage('user-1', conversationId, { content: '你好' } as never, response as never);
    closeHandler?.();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('keeps waiting for task completion after SSE closes', async () => {
    const response = createResponseStub();
    let closeHandler: (() => void) | undefined;
    let resolveWaitForTask: (() => void) | undefined;
    let settled = false;
    const unsubscribe = jest.fn();
    response.on.mockImplementation((event: string, handler: () => void) => {
      if (event === 'close') {
        closeHandler = handler;
      }
    });
    conversationMessageLifecycleService.startMessageGeneration.mockResolvedValue({
      assistantMessage: { id: assistantMessageId, role: 'assistant', content: '' },
      userMessage: { id: '33333333-3333-4333-8333-333333333333', role: 'user', content: '你好' },
    });
    conversationTaskService.subscribe.mockReturnValue(unsubscribe);
    conversationTaskService.waitForTask.mockImplementation(() => new Promise<void>((resolve) => {
      resolveWaitForTask = resolve;
    }));

    const request = controller.sendMessage('user-1', conversationId, { content: '你好' } as never, response as never);
    request.then(() => {
      settled = true;
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(conversationTaskService.subscribe).toHaveBeenCalledTimes(1);
    closeHandler?.();
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);

    resolveWaitForTask?.();
    await request;

    expect(settled).toBe(true);
    expect(conversationMessageLifecycleService.stopMessageGeneration).not.toHaveBeenCalled();
  });

  it('streams retry events and forwards stop requests through owned conversation guard', async () => {
    const response = createResponseStub();
    conversationMessageLifecycleService.retryMessageGeneration.mockResolvedValue({ id: assistantMessageId, role: 'assistant', content: '重试后的回复' });
    conversationTaskService.subscribe.mockReturnValue(jest.fn());
    conversationTaskService.waitForTask.mockResolvedValue(undefined);
    conversationMessageLifecycleService.stopMessageGeneration.mockReturnValue({ message: 'Generation stopped' });

    await controller.retryMessage('user-1', conversationId, assistantMessageId, {} as never, response as never);
    expect(conversationStore.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    expect(controller.stopMessage('user-1', conversationId, assistantMessageId)).toEqual({ message: 'Generation stopped' });
    expect(conversationStore.requireConversation).toHaveBeenLastCalledWith(conversationId, 'user-1');
  });

  it('forwards main-conversation display result stop requests to the lifecycle service', () => {
    conversationMessageLifecycleService.stopMessageGeneration.mockReturnValue({ message: 'Generation stopped' });
    conversationStore.requireConversation.mockReturnValue({
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'main',
      messages: [
        {
          id: 'display-result-1',
          role: 'display',
          status: 'pending',
          metadata: {
            annotations: [
              {
                data: { variant: 'result' },
                owner: 'conversation.display-message',
                type: 'display-message',
                version: '1',
              },
            ],
          },
        },
      ],
      title: 'New Chat',
      updatedAt: '2026-04-11T00:00:00.000Z',
    });

    expect(controller.stopMessage('user-1', conversationId, 'display-result-1')).toEqual({ message: 'Generation stopped' });
    expect(conversationMessageLifecycleService.stopMessageGeneration).toHaveBeenCalledWith(
      conversationId,
      'display-result-1',
      'user-1',
    );
  });

  it('interrupts the current subagent run even if the frontend still targets a stale assistant message id', () => {
    conversationStore.requireConversation.mockReturnValue({
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'subagent',
      messages: [
        { id: 'old-assistant', role: 'assistant', status: 'completed' },
        {
          id: 'summary-1',
          metadata: {
            annotations: [
              {
                data: {
                  afterPreview: { estimatedTokens: 320, messageCount: 1, source: 'estimated', textBytes: 1280 },
                  beforePreview: { estimatedTokens: 4096, messageCount: 2, source: 'provider', textBytes: 16000 },
                  compactionId: 'compaction-1',
                  coveredCount: 2,
                  createdAt: '2026-04-11T00:00:02.050Z',
                  modelId: 'gpt-5.4',
                  providerId: 'openai',
                  role: 'summary',
                  trigger: 'after-response',
                },
                owner: 'conversation.context-governance',
                type: 'context-compaction',
                version: '1',
              },
            ],
          },
          role: 'display',
          status: 'completed',
        },
        {
          id: 'synthetic-continue',
          metadata: {
            annotations: [
              {
                data: { role: 'continue', synthetic: true, trigger: 'after-response' },
                owner: 'conversation.context-governance',
                type: 'context-compaction',
                version: '1',
              },
            ],
          },
          role: 'user',
          status: 'completed',
        },
        { id: 'active-assistant', role: 'assistant', status: 'streaming' },
        { id: 'user-message', role: 'user', status: 'completed' },
      ],
      subagent: { activeAssistantMessageId: 'active-assistant', pluginId: 'plugin-a', status: 'running' },
      title: 'Subagent',
      updatedAt: '2026-04-11T00:00:00.000Z',
    });
    subagentRunner.interruptSubagent.mockReturnValue({ message: 'stopped' });

    expect(controller.stopMessage('user-1', conversationId, 'old-assistant')).toEqual({ message: 'stopped' });
    expect(() => controller.stopMessage('user-1', conversationId, 'user-message')).toThrow('Only assistant messages can be stopped');
    expect(controller.stopMessage('user-1', conversationId, 'active-assistant')).toEqual({ message: 'stopped' });
    expect(subagentRunner.interruptSubagent).toHaveBeenCalledTimes(2);
    expect(subagentRunner.interruptSubagent).toHaveBeenCalledWith('plugin-a', conversationId, 'user-1');
  });

  it('does not interrupt the current subagent run when stop targets an older assistant outside the active auto-continue chain', () => {
    conversationStore.requireConversation.mockReturnValue({
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'subagent',
      messages: [
        { id: 'older-assistant', role: 'assistant', status: 'completed' },
        { id: 'older-user', role: 'user', status: 'completed' },
        { id: 'linked-assistant', role: 'assistant', status: 'completed' },
        {
          id: 'synthetic-continue',
          metadata: {
            annotations: [
              {
                data: { role: 'continue', synthetic: true, trigger: 'after-response' },
                owner: 'conversation.context-governance',
                type: 'context-compaction',
                version: '1',
              },
            ],
          },
          role: 'user',
          status: 'completed',
        },
        { id: 'active-assistant', role: 'assistant', status: 'streaming' },
      ],
      subagent: { activeAssistantMessageId: 'active-assistant', pluginId: 'plugin-a', status: 'running' },
      title: 'Subagent',
      updatedAt: '2026-04-11T00:00:00.000Z',
    });

    expect(controller.stopMessage('user-1', conversationId, 'older-assistant')).toEqual({ message: 'Generation stopped' });
    expect(subagentRunner.interruptSubagent).not.toHaveBeenCalled();
  });

  it('streams subagent auto-compaction continuation messages in the same SSE response', async () => {
    const response = createResponseStub();
    let listener: ((event: Record<string, unknown>) => void) | null = null;
    const initialConversation = {
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'subagent',
      messages: [],
      subagent: { pluginId: 'plugin-a', status: 'completed' },
      title: 'Subagent',
      updatedAt: '2026-04-11T00:00:00.000Z',
    };
    const afterSendConversation = {
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'subagent',
      messages: [
        {
          content: '先做第一轮',
          createdAt: '2026-04-11T00:00:01.000Z',
          id: 'user-1',
          parts: [{ text: '先做第一轮', type: 'text' }],
          role: 'user',
          status: 'completed',
          updatedAt: '2026-04-11T00:00:01.000Z',
        },
        {
          content: '',
          createdAt: '2026-04-11T00:00:01.500Z',
          id: 'assistant-1',
          model: 'gpt-5.4',
          parts: [],
          provider: 'openai',
          role: 'assistant',
          status: 'pending',
          updatedAt: '2026-04-11T00:00:01.500Z',
        },
      ],
      subagent: { activeAssistantMessageId: 'assistant-1', pluginId: 'plugin-a', status: 'running' },
      title: 'Subagent',
      updatedAt: '2026-04-11T00:00:01.500Z',
    };
    conversationStore.requireConversation
      .mockReturnValueOnce(initialConversation)
      .mockReturnValueOnce(afterSendConversation);
    subagentRunner.sendInputSubagent.mockResolvedValue(undefined);
    subagentRunner.subscribe.mockImplementation((_conversationId: string, next: (event: Record<string, unknown>) => void) => {
      listener = next;
      return () => {
        listener = null;
      };
    });
    subagentRunner.waitSubagent.mockImplementation(async () => {
      listener?.({ messageId: 'assistant-1', status: 'streaming', type: 'status' });
      listener?.({ input: { city: 'Hangzhou' }, messageId: 'assistant-1', toolCallId: 'tool-call-1', toolName: 'weather.search', type: 'tool-call' });
      listener?.({ output: { kind: 'tool:text', value: '晴' }, messageId: 'assistant-1', toolCallId: 'tool-call-1', toolName: 'weather.search', type: 'tool-result' });
      listener?.({ content: '第一轮工具完成', messageId: 'assistant-1', type: 'message-patch' });
      listener?.({ messageId: 'assistant-1', status: 'completed', type: 'status' });
      listener?.({ messageId: 'assistant-1', status: 'completed', type: 'finish' });
      listener?.({
        assistantMessage: {
          content: '',
          createdAt: '2026-04-11T00:00:02.200Z',
          error: null,
          id: 'assistant-2',
          metadataJson: null,
          model: 'gpt-5.4',
          partsJson: '[]',
          provider: 'openai',
          role: 'assistant',
          status: 'pending',
          toolCalls: null,
          toolResults: null,
          updatedAt: '2026-04-11T00:00:02.200Z',
        },
        type: 'message-start',
        userMessage: {
          content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
          createdAt: '2026-04-11T00:00:02.100Z',
          error: null,
          id: 'user-2',
          metadataJson: '{"annotations":[{"data":{"role":"continue","synthetic":true,"trigger":"after-response"},"owner":"conversation.context-governance","type":"context-compaction","version":"1"}]}',
          model: 'gpt-5.4',
          partsJson: '[{"text":"Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.","type":"text"}]',
          provider: 'openai',
          role: 'user',
          status: 'completed',
          toolCalls: null,
          toolResults: null,
          updatedAt: '2026-04-11T00:00:02.100Z',
        },
      });
      listener?.({ messageId: 'assistant-2', status: 'streaming', type: 'status' });
      listener?.({ content: '第二轮自动续跑完成', messageId: 'assistant-2', type: 'message-patch' });
      listener?.({ messageId: 'assistant-2', status: 'completed', type: 'status' });
      listener?.({ messageId: 'assistant-2', status: 'completed', type: 'finish' });
      return { conversationId, result: '第二轮自动续跑完成', status: 'completed' };
    });

    await controller.sendMessage(
      'user-1',
      conversationId,
      { content: '先做第一轮' } as never,
      response as never,
    );

    const writes = response.write.mock.calls.map(([payload]) => payload);
    expect(subagentRunner.subscribe).toHaveBeenCalledWith(conversationId, expect.any(Function));
    expect(writes.some((payload) => payload.includes('"type":"message-start"') && payload.includes('"id":"assistant-1"') && payload.includes('"id":"user-1"'))).toBe(true);
    expect(writes.some((payload) => payload.includes('"type":"message-start"') && payload.includes('"id":"assistant-2"') && payload.includes('"id":"user-2"'))).toBe(true);
    expect(writes).toContain(sse({
      input: { city: 'Hangzhou' },
      messageId: 'assistant-1',
      toolCallId: 'tool-call-1',
      toolName: 'weather.search',
      type: 'tool-call',
    }));
    expect(
      writes.some((payload) => (
        payload.includes('"type":"tool-result"')
        && payload.includes('"messageId":"assistant-1"')
        && payload.includes('"toolCallId":"tool-call-1"')
        && payload.includes('"toolName":"weather.search"')
        && payload.includes('"value":"晴"')
      )),
    ).toBe(true);
    expect(writes).toContain(sse({
      content: '第二轮自动续跑完成',
      messageId: 'assistant-2',
      type: 'message-patch',
    }));
    expect(writes).toContain(sse({
      messageId: 'assistant-2',
      status: 'completed',
      type: 'finish',
    }));
    expect(
      writes.findIndex((payload) => payload.includes('"messageId":"assistant-1"') && payload.includes('"type":"finish"')),
    ).toBeLessThan(
      writes.findIndex((payload) => payload.includes('"type":"message-start"') && payload.includes('"id":"assistant-2"')),
    );
  });

  it('returns SSE error instead of retrying a subagent user message', async () => {
    const response = createResponseStub();
    conversationStore.requireConversation.mockReturnValue({
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      kind: 'subagent',
      messages: [
        { content: '用户输入', id: 'user-message', role: 'user', status: 'completed' },
      ],
      subagent: { pluginId: 'plugin-a', status: 'completed' },
      title: 'Subagent',
      updatedAt: '2026-04-11T00:00:00.000Z',
    });

    await controller.retryMessage('user-1', conversationId, 'user-message', {} as never, response as never);

    expect(subagentRunner.sendInputSubagent).not.toHaveBeenCalled();
    expect(response.write).toHaveBeenCalledWith(sse({ error: 'Only assistant messages can be retried', type: 'error' }));
    expect(response.write).toHaveBeenLastCalledWith('data: [DONE]\n\n');
  });

  it('updates and deletes messages through the runtime conversation owner', async () => {
    const message = { content: '更新后的内容', createdAt: '2026-04-11T00:00:00.000Z', error: null, id: assistantMessageId, metadataJson: null, model: null, partsJson: null, provider: null, role: 'assistant', status: 'completed', toolCalls: null, toolResults: null, updatedAt: '2026-04-11T00:01:00.000Z' };
    conversationMessages.updateMessage.mockReturnValue(message);
    conversationMessages.deleteMessage.mockReturnValue({ success: true });

    await expect(controller.updateMessage('user-1', conversationId, assistantMessageId, { content: '更新后的内容' } as never)).resolves.toEqual(message);
    expect(conversationTaskService.stopTask).toHaveBeenCalledWith(assistantMessageId);
    expect(conversationStore.requireConversation).toHaveBeenCalledWith(conversationId, 'user-1');
    await expect(controller.deleteMessage('user-1', conversationId, assistantMessageId)).resolves.toEqual({ success: true });
    expect(conversationTaskService.stopTask).toHaveBeenLastCalledWith(assistantMessageId);
    expect(conversationStore.requireConversation).toHaveBeenLastCalledWith(conversationId, 'user-1');
  });

  it('returns conversation detail messages in shared Message contract shape', () => {
    const detail = {
      _count: { messages: 1 },
      createdAt: '2026-04-11T00:00:00.000Z',
      id: conversationId,
      messages: [{ content: '你好', createdAt: '2026-04-11T00:00:00.000Z', error: null, id: assistantMessageId, metadataJson: null, model: 'gpt-5.4', partsJson: '[{"type":"text","text":"你好"}]', provider: 'openai', role: 'assistant', status: 'completed', toolCalls: null, toolResults: null, updatedAt: '2026-04-11T00:00:01.000Z' }],
      title: '新的对话',
      updatedAt: '2026-04-11T00:00:01.000Z',
    };
    conversationStore.getConversation.mockReturnValue(detail);

    expect(controller.getConversation('user-1', conversationId)).toEqual({ ...detail, isRunning: false });
    expect(conversationStore.getConversation).toHaveBeenCalledWith(conversationId, 'user-1');
  });
});

function sse(payload: object) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function createResponseStub() {
  return { destroyed: false, end: jest.fn(), flushHeaders: jest.fn(), on: jest.fn(), setHeader: jest.fn(), writableEnded: false, write: jest.fn() };
}

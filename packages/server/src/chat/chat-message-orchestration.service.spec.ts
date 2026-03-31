import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';

describe('ChatMessageOrchestrationService', () => {
  const aiProvider = {
    getModelConfig: jest.fn(),
  };

  const pluginRuntime = {
    runChatBeforeModelHooks: jest.fn(),
    runChatWaitingModelHooks: jest.fn(),
    runChatAfterModelHooks: jest.fn(),
    runResponseBeforeSendHooks: jest.fn(),
    runResponseAfterSendHooks: jest.fn(),
  };

  const toolRegistry = {
    prepareToolSelection: jest.fn(),
  };

  const modelInvocation = {
    streamPrepared: jest.fn(),
  };

  let service: ChatMessageOrchestrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    toolRegistry.prepareToolSelection.mockResolvedValue({
      availableTools: [
        {
          name: 'recall_memory',
          description: '读取记忆',
          parameters: {
            query: {
              type: 'string',
              required: true,
            },
          },
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
        },
      ],
      buildToolSet: jest.fn().mockReturnValue({
        recall_memory: {
          description: '读取记忆',
        },
      }),
    });
    pluginRuntime.runChatBeforeModelHooks.mockImplementation(async ({ payload }) => ({
      action: 'continue',
      request: payload.request,
    }));
    pluginRuntime.runChatWaitingModelHooks.mockResolvedValue(undefined);
    pluginRuntime.runChatAfterModelHooks.mockImplementation(async ({ payload }) => payload);
    pluginRuntime.runResponseBeforeSendHooks.mockImplementation(async ({ payload }) => payload);
    pluginRuntime.runResponseAfterSendHooks.mockResolvedValue(undefined);
    modelInvocation.streamPrepared.mockReturnValue({
      modelConfig: {
        id: 'claude-3-7-sonnet',
        providerId: 'anthropic',
      },
      result: {
        fullStream: {},
      },
    });
    service = new ChatMessageOrchestrationService(
      aiProvider as never,
      pluginRuntime as never,
      toolRegistry as never,
      modelInvocation as never,
    );
  });

  it('prepares the before-model request through unified tool selection and hook mutation', async () => {
    aiProvider.getModelConfig.mockReturnValue({
      id: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      capabilities: {
        toolCall: true,
      },
    });
    pluginRuntime.runChatBeforeModelHooks.mockResolvedValue({
      action: 'continue',
      request: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        systemPrompt: '请先检查冲突命令',
        messages: [
          {
            role: 'user',
            content: '列出命令',
          },
        ],
        availableTools: [
          {
            name: 'recall_memory',
            description: '读取记忆',
            parameters: {},
            pluginId: 'builtin.memory-tools',
            runtimeKind: 'builtin',
          },
        ],
      },
    });

    const result = await service.applyChatBeforeModelHooks({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      systemPrompt: '你是 Garlic Claw',
      modelConfig: {
        providerId: 'openai',
        id: 'gpt-5.2',
      },
      messages: [
        {
          role: 'user',
          content: '列出命令',
        },
      ],
    });

    expect(result).toMatchObject({
      action: 'continue',
      request: expect.objectContaining({
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
      }),
      modelConfig: expect.objectContaining({
        providerId: 'anthropic',
        id: 'claude-3-7-sonnet',
      }),
    });
    expect(toolRegistry.prepareToolSelection).toHaveBeenCalledWith({
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
    });
  });

  it('builds a stream factory that dispatches waiting-model hooks before streaming', () => {
    const createStream = service.buildStreamFactory({
      assistantMessageId: 'assistant-message-1',
      userId: 'user-1',
      conversationId: 'conversation-1',
      request: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        systemPrompt: '请先检查冲突命令',
        messages: [],
        availableTools: [],
      },
      preparedInvocation: {
        modelConfig: {
          id: 'claude-3-7-sonnet',
          providerId: 'anthropic',
        },
        model: {},
        sdkMessages: [],
        sourceSdkMessages: [],
      } as never,
      activeProviderId: 'anthropic',
      activeModelId: 'claude-3-7-sonnet',
      activePersonaId: 'builtin.default-assistant',
      tools: undefined as never,
    });

    const abortController = new AbortController();
    const streamResult = createStream(abortController.signal);

    expect(pluginRuntime.runChatWaitingModelHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: expect.objectContaining({
        assistantMessageId: 'assistant-message-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
      }),
    });
    expect(modelInvocation.streamPrepared).toHaveBeenCalled();
    expect(streamResult).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      stream: {
        fullStream: {},
      },
    });
  });

  it('chains chat:after-model and response:before-send hooks into one final response pass', async () => {
    pluginRuntime.runChatAfterModelHooks.mockResolvedValue({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      assistantContent: 'after-model',
      assistantParts: [
        {
          type: 'text',
          text: 'after-model',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });
    pluginRuntime.runResponseBeforeSendHooks.mockResolvedValue({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      assistantContent: 'before-send',
      assistantParts: [
        {
          type: 'text',
          text: 'before-send',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });

    const result = await service.applyFinalResponseHooks({
      userId: 'user-1',
      conversationId: 'conversation-1',
      activePersonaId: 'builtin.default-assistant',
      responseSource: 'model',
      result: {
        assistantMessageId: 'assistant-message-1',
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        content: 'original',
        parts: [
          {
            type: 'text',
            text: 'original',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });

    expect(result).toMatchObject({
      content: 'before-send',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
    });
  });
});

import {
  createChatMessageSpecFixture,
  type ChatMessageSpecFixture,
} from './chat-message.spec-fixture';

describe('ChatMessageService model flow', () => {
  let service: ChatMessageSpecFixture['service'];
  let prisma: ChatMessageSpecFixture['prisma'];
  let chatService: ChatMessageSpecFixture['chatService'];
  let aiProvider: ChatMessageSpecFixture['aiProvider'];
  let personaService: ChatMessageSpecFixture['personaService'];
  let pluginRuntime: ChatMessageSpecFixture['pluginRuntime'];
  let toolRegistry: ChatMessageSpecFixture['toolRegistry'];
  let modelInvocation: ChatMessageSpecFixture['modelInvocation'];
  let chatTaskService: ChatMessageSpecFixture['chatTaskService'];

  beforeEach(() => {
    ({
      service,
      prisma,
      chatService,
      aiProvider,
      personaService,
      pluginRuntime,
      toolRegistry,
      modelInvocation,
      chatTaskService,
    } = createChatMessageSpecFixture());
  });

  it('applies strong chat:before-model mutations before preparing the stream call', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '帮我记住我喜欢咖啡',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '帮我记住我喜欢咖啡',
        },
      ]),
      status: 'completed',
    };
    const assistantMessage = {
      id: 'assistant-message-1',
      role: 'assistant',
      content: '',
      status: 'pending',
    };
    const modelConfig = {
      id: 'gpt-5.2',
      providerId: 'openai',
      name: 'GPT 5.2',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      api: {
        id: 'gpt-5.2',
        url: 'https://example.com/v1',
        npm: '@ai-sdk/openai',
      },
    };
    const routedModelConfig = {
      id: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      name: 'Claude 3.7 Sonnet',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      api: {
        id: 'claude-3-7-sonnet',
        url: 'https://example.com/v1',
        npm: '@ai-sdk/anthropic',
      },
    };

    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [],
    });
    aiProvider.getModelConfig
      .mockReturnValueOnce(modelConfig)
      .mockReturnValueOnce(modelConfig)
      .mockReturnValueOnce(routedModelConfig);
    personaService.getCurrentPersona.mockResolvedValue({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: '默认助手',
      prompt: '你是 Garlic Claw',
      isDefault: true,
    });
    prisma.message.create
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(assistantMessage);
    prisma.conversation.update.mockResolvedValue(null);
    modelInvocation.prepareResolved.mockResolvedValue({
      modelConfig: routedModelConfig,
      model: { provider: 'anthropic', modelId: 'claude-3-7-sonnet' },
      sdkMessages: [],
    });
    pluginRuntime.runChatBeforeModelHooks.mockResolvedValue({
      action: 'continue',
      request: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        systemPrompt: '你是一个更谨慎的总结助手',
        messages: [
          {
            role: 'system',
            content: '请先关注用户偏好再回答',
          },
          {
            role: 'user',
            content: '帮我记住我喜欢咖啡',
          },
        ],
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
          {
            name: 'create_automation',
            description: '创建自动化',
            parameters: {
              name: {
                type: 'string',
                required: true,
              },
              triggerType: {
                type: 'string',
                required: true,
              },
              actions: {
                type: 'array',
                required: true,
              },
            },
            pluginId: 'builtin.automation-tools',
            runtimeKind: 'builtin',
          },
        ],
        headers: {
          'x-router': 'enabled',
        },
        maxOutputTokens: 128,
      },
    });
    const recallMemoryTool = {
      execute: jest.fn().mockResolvedValue({
        saved: true,
      }),
    };
    const createAutomationTool = {
      execute: jest.fn().mockResolvedValue({
        saved: true,
      }),
    };
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([
      {
        name: 'save_memory',
        callName: 'save_memory',
        toolId: 'plugin:builtin.memory-tools:save_memory',
        description: '保存记忆',
        parameters: {
          content: {
            type: 'string',
            required: true,
          },
        },
        sourceKind: 'plugin',
        sourceId: 'builtin.memory-tools',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
      {
        name: 'recall_memory',
        callName: 'recall_memory',
        toolId: 'plugin:builtin.memory-tools:recall_memory',
        description: '读取记忆',
        parameters: {
          query: {
            type: 'string',
            required: true,
          },
        },
        sourceKind: 'plugin',
        sourceId: 'builtin.memory-tools',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
      {
        name: 'create_automation',
        callName: 'create_automation',
        toolId: 'plugin:builtin.automation-tools:create_automation',
        description: '创建自动化',
        parameters: {
          name: {
            type: 'string',
            required: true,
          },
          triggerType: {
            type: 'string',
            required: true,
          },
          actions: {
            type: 'array',
            required: true,
          },
        },
        sourceKind: 'plugin',
        sourceId: 'builtin.automation-tools',
        pluginId: 'builtin.automation-tools',
        runtimeKind: 'builtin',
      },
    ]);
    toolRegistry.buildToolSet.mockReturnValue({
      recall_memory: recallMemoryTool as never,
      create_automation: createAutomationTool as never,
    });
    modelInvocation.streamPrepared.mockReturnValue({
      modelConfig: routedModelConfig,
      result: {
        fullStream: (async function* () {
          yield { type: 'finish' } as const;
        })(),
      },
    });

    await service.startMessageGeneration('user-1', 'conversation-1', {
      content: '帮我记住我喜欢咖啡',
      parts: [
        {
          type: 'text',
          text: '帮我记住我喜欢咖啡',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
    } as never);

    expect(pluginRuntime.runChatBeforeModelHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        request: expect.objectContaining({
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '帮我记住我喜欢咖啡',
            },
          ],
          availableTools: expect.arrayContaining([
            expect.objectContaining({
              name: 'save_memory',
            }),
            expect.objectContaining({
              name: 'recall_memory',
            }),
            expect.objectContaining({
              name: 'create_automation',
            }),
          ]),
        }),
      },
    });

    const taskConfig = chatTaskService.startTask.mock.calls[0]?.[0];
    expect(taskConfig).toBeDefined();

    expect(modelInvocation.prepareResolved).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      modelConfig: routedModelConfig,
      messages: [
        {
          role: 'system',
          content: '请先关注用户偏好再回答',
        },
        {
          role: 'user',
          content: '帮我记住我喜欢咖啡',
        },
      ],
    });

    await taskConfig.createStream(new AbortController().signal);

    expect(toolRegistry.buildToolSet).toHaveBeenCalledWith({
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
        activePersonaId: 'builtin.default-assistant',
      },
      allowedToolNames: ['recall_memory', 'create_automation'],
    });

    expect(Object.keys(modelInvocation.streamPrepared.mock.calls[0][0].tools)).toEqual([
      'recall_memory',
      'create_automation',
    ]);

    await modelInvocation.streamPrepared.mock.calls[0][0].tools.recall_memory.execute({
      query: '咖啡',
    });
    await modelInvocation.streamPrepared.mock.calls[0][0].tools.create_automation.execute({
      name: '咖啡提醒',
      triggerType: 'manual',
      actions: [],
    });

    expect(recallMemoryTool.execute).toHaveBeenCalledWith({
      query: '咖啡',
    });
    expect(createAutomationTool.execute).toHaveBeenCalledWith({
      name: '咖啡提醒',
      triggerType: 'manual',
      actions: [],
    });

    expect(modelInvocation.streamPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        system: '你是一个更谨慎的总结助手',
        headers: {
          'x-router': 'enabled',
        },
        maxOutputTokens: 128,
        tools: expect.objectContaining({
          recall_memory: expect.any(Object),
        }),
      }),
    );
  });

  it('rejects new generation before creating any assistant placeholder when llm is disabled for the conversation', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      hostServicesJson: JSON.stringify({
        sessionEnabled: true,
        llmEnabled: false,
        ttsEnabled: true,
      }),
      messages: [],
    });

    await expect(
      service.startMessageGeneration('user-1', 'conversation-1', {
        content: '你好',
      } as never),
    ).rejects.toThrow('当前会话已关闭 LLM 自动回复');

    expect(prisma.message.create).not.toHaveBeenCalled();
    expect(chatTaskService.startTask).not.toHaveBeenCalled();
  });

  it('rejects retry before resetting the assistant message when the conversation session is disabled', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      hostServicesJson: JSON.stringify({
        sessionEnabled: false,
        llmEnabled: true,
        ttsEnabled: true,
      }),
      messages: [
        {
          id: 'assistant-message-1',
          role: 'assistant',
          provider: 'openai',
          model: 'gpt-5.2',
          status: 'error',
        },
      ],
    });

    await expect(
      service.retryMessageGeneration(
        'user-1',
        'conversation-1',
        'assistant-message-1',
        {} as never,
      ),
    ).rejects.toThrow('当前会话宿主服务已停用');

    expect(prisma.message.update).not.toHaveBeenCalled();
    expect(chatTaskService.startTask).not.toHaveBeenCalled();
  });

  it('short-circuits through message:received before scheduling a model task', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '/route 原始输入',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '/route 原始输入',
        },
      ]),
      status: 'completed',
    };
    const assistantMessage = {
      id: 'assistant-message-1',
      role: 'assistant',
      content: '',
      status: 'pending',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
    };
    const completedAssistantMessage = {
      ...assistantMessage,
      content: '命令已由插件直接处理。',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '命令已由插件直接处理。',
        },
      ]),
      status: 'completed',
      error: null,
      toolCalls: null,
      toolResults: null,
    };
    const defaultModelConfig = {
      id: 'gpt-5.2',
      providerId: 'openai',
      name: 'GPT 5.2',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      api: {
        id: 'gpt-5.2',
        url: 'https://example.com/v1',
        npm: '@ai-sdk/openai',
      },
    };
    const routedModelConfig = {
      id: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      name: 'Claude 3.7 Sonnet',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      api: {
        id: 'claude-3-7-sonnet',
        url: 'https://example.com/v1',
        npm: '@ai-sdk/anthropic',
      },
    };

    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [],
    });
    aiProvider.getModelConfig
      .mockReturnValueOnce(defaultModelConfig)
      .mockReturnValueOnce(routedModelConfig)
      .mockReturnValueOnce(routedModelConfig);
    prisma.message.create
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(assistantMessage);
    prisma.message.update.mockResolvedValueOnce(completedAssistantMessage);
    prisma.conversation.update.mockResolvedValue(null);
    pluginRuntime.runMessageReceivedHooks.mockResolvedValue({
      action: 'short-circuit',
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        conversationId: 'conversation-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        message: {
          role: 'user',
          content: '/route 原始输入',
          parts: [
            {
              type: 'text',
              text: '/route 原始输入',
            },
          ],
        },
        modelMessages: [
          {
            role: 'user',
            content: '/route 原始输入',
          },
        ],
      },
      assistantContent: '命令已由插件直接处理。',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
    });
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);

    await expect(
      service.startMessageGeneration('user-1', 'conversation-1', {
        content: '/route 原始输入',
        parts: [
          {
            type: 'text',
            text: '/route 原始输入',
          },
        ],
        provider: 'openai',
        model: 'gpt-5.2',
      } as never),
    ).resolves.toEqual({
      userMessage,
      assistantMessage: completedAssistantMessage,
    });

    expect(pluginRuntime.runMessageCreatedHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'anthropic',
          activeModelId: 'claude-3-7-sonnet',
          activePersonaId: 'builtin.default-assistant',
        },
        conversationId: 'conversation-1',
        message: {
          role: 'user',
          content: '/route 原始输入',
          parts: [
            {
              type: 'text',
              text: '/route 原始输入',
            },
          ],
          status: 'completed',
        },
        modelMessages: [
          {
            role: 'user',
            content: '/route 原始输入',
          },
        ],
      },
    });
    expect(prisma.message.create).toHaveBeenNthCalledWith(2, {
      data: {
        conversationId: 'conversation-1',
        role: 'assistant',
        content: '',
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        status: 'pending',
      },
    });
    expect(pluginRuntime.runChatBeforeModelHooks).not.toHaveBeenCalled();
    expect(pluginRuntime.runChatWaitingModelHooks).not.toHaveBeenCalled();
    expect(modelInvocation.prepareResolved).not.toHaveBeenCalled();
    expect(chatTaskService.startTask).not.toHaveBeenCalled();
  });

  it('dispatches chat:waiting-model only when the real model stream starts', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '帮我继续回答',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '帮我继续回答',
        },
      ]),
      status: 'completed',
    };
    const assistantMessage = {
      id: 'assistant-message-1',
      role: 'assistant',
      content: '',
      status: 'pending',
      provider: 'openai',
      model: 'gpt-5.2',
    };
    const modelConfig = {
      id: 'gpt-5.2',
      providerId: 'openai',
      name: 'GPT 5.2',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      api: {
        id: 'gpt-5.2',
        url: 'https://example.com/v1',
        npm: '@ai-sdk/openai',
      },
    };

    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [],
    });
    aiProvider.getModelConfig.mockReturnValue(modelConfig);
    prisma.message.create
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(assistantMessage);
    prisma.conversation.update.mockResolvedValue(null);
    modelInvocation.prepareResolved.mockResolvedValue({
      modelConfig,
      model: { provider: 'openai', modelId: 'gpt-5.2' },
      sdkMessages: [],
    });
    pluginRuntime.runChatBeforeModelHooks.mockResolvedValue({
      action: 'continue',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        systemPrompt: '你是 Garlic Claw',
        messages: [
          {
            role: 'user',
            content: '帮我继续回答',
          },
        ],
        availableTools: [],
      },
    });
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);
    modelInvocation.streamPrepared.mockReturnValue({
      modelConfig,
      result: {
        fullStream: (async function* () {
          yield { type: 'finish' } as const;
        })(),
      },
    });

    await service.startMessageGeneration('user-1', 'conversation-1', {
      content: '帮我继续回答',
      parts: [
        {
          type: 'text',
          text: '帮我继续回答',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
    } as never);

    const taskConfig = chatTaskService.startTask.mock.calls[0]?.[0];
    expect(taskConfig).toBeDefined();
    expect(pluginRuntime.runChatWaitingModelHooks).not.toHaveBeenCalled();

    await taskConfig.createStream(new AbortController().signal);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pluginRuntime.runChatWaitingModelHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        conversationId: 'conversation-1',
        assistantMessageId: 'assistant-message-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '帮我继续回答',
            },
          ],
          availableTools: [],
        },
      },
    });
    expect(
      pluginRuntime.runChatWaitingModelHooks.mock.invocationCallOrder[0],
    ).toBeGreaterThan(modelInvocation.streamPrepared.mock.invocationCallOrder[0]);
  });

  it('dispatches chat:waiting-model for retry flows when the new stream starts', async () => {
    const assistantMessage = {
      id: 'assistant-message-1',
      role: 'assistant',
      content: '',
      status: 'pending',
      provider: 'openai',
      model: 'gpt-5.2',
      error: null,
      toolCalls: null,
      toolResults: null,
    };
    const modelConfig = {
      id: 'gpt-5.2',
      providerId: 'openai',
      name: 'GPT 5.2',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      api: {
        id: 'gpt-5.2',
        url: 'https://example.com/v1',
        npm: '@ai-sdk/openai',
      },
    };

    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [
        {
          id: 'user-message-1',
          role: 'user',
          content: '上一条用户输入',
          partsJson: JSON.stringify([
            {
              type: 'text',
              text: '上一条用户输入',
            },
          ]),
          status: 'completed',
        },
        {
          id: 'assistant-message-1',
          role: 'assistant',
          content: '旧回复',
          partsJson: null,
          provider: 'openai',
          model: 'gpt-5.2',
          status: 'error',
        },
      ],
    });
    chatTaskService.stopTask.mockResolvedValue(false);
    aiProvider.getModelConfig.mockReturnValue(modelConfig);
    prisma.message.update.mockResolvedValue(assistantMessage);
    prisma.conversation.update.mockResolvedValue(null);
    modelInvocation.prepareResolved.mockResolvedValue({
      modelConfig,
      model: { provider: 'openai', modelId: 'gpt-5.2' },
      sdkMessages: [],
    });
    pluginRuntime.runChatBeforeModelHooks.mockResolvedValue({
      action: 'continue',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        systemPrompt: '你是 Garlic Claw',
        messages: [
          {
            role: 'user',
            content: '上一条用户输入',
          },
        ],
        availableTools: [],
      },
    });
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);
    modelInvocation.streamPrepared.mockReturnValue({
      modelConfig,
      result: {
        fullStream: (async function* () {
          yield { type: 'finish' } as const;
        })(),
      },
    });

    await service.retryMessageGeneration(
      'user-1',
      'conversation-1',
      'assistant-message-1',
      {} as never,
    );

    const taskConfig = chatTaskService.startTask.mock.calls[0]?.[0];
    expect(taskConfig).toBeDefined();
    expect(pluginRuntime.runChatWaitingModelHooks).not.toHaveBeenCalled();

    await taskConfig.createStream(new AbortController().signal);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(pluginRuntime.runChatWaitingModelHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        conversationId: 'conversation-1',
        assistantMessageId: 'assistant-message-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '上一条用户输入',
            },
          ],
          availableTools: [],
        },
      },
    });
  });

  it('short-circuits the model call when chat:before-model returns a final assistant reply', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '帮我快速回复',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '帮我快速回复',
        },
      ]),
      status: 'completed',
    };
    const assistantMessage = {
      id: 'assistant-message-1',
      role: 'assistant',
      content: '',
      status: 'pending',
      provider: 'openai',
      model: 'gpt-5.2',
    };
    const completedAssistantMessage = {
      ...assistantMessage,
      content: '插件已经直接回复。',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '插件已经直接回复。',
        },
      ]),
      status: 'completed',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      error: null,
      toolCalls: null,
      toolResults: null,
    };
    const modelConfig = {
      id: 'gpt-5.2',
      providerId: 'openai',
      name: 'GPT 5.2',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      api: {
        id: 'gpt-5.2',
        url: 'https://example.com/v1',
        npm: '@ai-sdk/openai',
      },
    };

    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [],
    });
    aiProvider.getModelConfig.mockReturnValue(modelConfig);
    personaService.getCurrentPersona.mockResolvedValue({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: '默认助手',
      prompt: '你是 Garlic Claw',
      isDefault: true,
    });
    prisma.message.create
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(assistantMessage);
    prisma.message.update.mockResolvedValue(completedAssistantMessage);
    prisma.conversation.update.mockResolvedValue(null);
    pluginRuntime.runChatBeforeModelHooks.mockResolvedValue({
      action: 'short-circuit',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        systemPrompt: '你是 Garlic Claw',
        messages: [
          {
            role: 'user',
            content: '帮我快速回复',
          },
        ],
        availableTools: [],
      },
      assistantContent: '插件已经直接回复。',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      reason: 'matched-rule',
    });
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);

    const result = await service.startMessageGeneration('user-1', 'conversation-1', {
      content: '帮我快速回复',
      parts: [
        {
          type: 'text',
          text: '帮我快速回复',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
    } as never);

    expect(modelInvocation.prepareResolved).not.toHaveBeenCalled();
    expect(modelInvocation.streamPrepared).not.toHaveBeenCalled();
    expect(chatTaskService.startTask).not.toHaveBeenCalled();
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: {
        id: 'assistant-message-1',
      },
      data: {
        content: '插件已经直接回复。',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '插件已经直接回复。',
          },
        ]),
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        status: 'completed',
        error: null,
        toolCalls: null,
        toolResults: null,
      },
    });
    expect(pluginRuntime.runChatAfterModelHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        assistantMessageId: 'assistant-message-1',
        assistantContent: '插件已经直接回复。',
        assistantParts: [
          {
            type: 'text',
            text: '插件已经直接回复。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });
    expect(result).toEqual({
      userMessage,
      assistantMessage: completedAssistantMessage,
    });
  });


  it('returns a patched completed assistant message when chat:after-model rewrites a short-circuited reply', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '帮我快速回复',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '帮我快速回复',
        },
      ]),
      status: 'completed',
    };
    const assistantMessage = {
      id: 'assistant-message-1',
      role: 'assistant',
      content: '',
      status: 'pending',
      provider: 'openai',
      model: 'gpt-5.2',
    };
    const completedAssistantMessage = {
      ...assistantMessage,
      content: '这是插件润色后的最终回复。',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '这是插件润色后的最终回复。',
        },
      ]),
      status: 'completed',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      error: null,
      toolCalls: null,
      toolResults: null,
    };
    const modelConfig = {
      id: 'gpt-5.2',
      providerId: 'openai',
      name: 'GPT 5.2',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      api: {
        id: 'gpt-5.2',
        url: 'https://example.com/v1',
        npm: '@ai-sdk/openai',
      },
    };

    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [],
    });
    aiProvider.getModelConfig.mockReturnValue(modelConfig);
    prisma.message.create
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(assistantMessage);
    prisma.message.update.mockResolvedValue(completedAssistantMessage);
    prisma.conversation.update.mockResolvedValue(null);
    pluginRuntime.runChatBeforeModelHooks.mockResolvedValue({
      action: 'short-circuit',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        systemPrompt: '你是 Garlic Claw',
        messages: [
          {
            role: 'user',
            content: '帮我快速回复',
          },
        ],
        availableTools: [],
      },
      assistantContent: '插件已经直接回复。',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
    });
    pluginRuntime.runChatAfterModelHooks.mockResolvedValue({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      assistantMessageId: 'assistant-message-1',
      assistantContent: '这是插件润色后的最终回复。',
      assistantParts: [
        {
          type: 'text',
          text: '这是插件润色后的最终回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);

    await expect(
      service.startMessageGeneration('user-1', 'conversation-1', {
        content: '帮我快速回复',
        parts: [
          {
            type: 'text',
            text: '帮我快速回复',
          },
        ],
        provider: 'openai',
        model: 'gpt-5.2',
      } as never),
    ).resolves.toEqual({
      userMessage,
      assistantMessage: completedAssistantMessage,
    });

    expect(prisma.message.update).toHaveBeenLastCalledWith({
      where: {
        id: 'assistant-message-1',
      },
      data: {
        content: '这是插件润色后的最终回复。',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '这是插件润色后的最终回复。',
          },
        ]),
        provider: 'anthropic',
        model: 'claude-3-7-sonnet',
        status: 'completed',
        error: null,
        toolCalls: null,
        toolResults: null,
      },
    });
  });

  it('applies response:* hooks to short-circuited replies before returning', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '帮我快速回复',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '帮我快速回复',
        },
      ]),
      status: 'completed',
    };
    const assistantMessage = {
      id: 'assistant-message-1',
      role: 'assistant',
      content: '',
      status: 'pending',
      provider: 'openai',
      model: 'gpt-5.2',
    };
    const completedAssistantMessage = {
      ...assistantMessage,
      content: '发送前统一包装后的回复。',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '发送前统一包装后的回复。',
        },
      ]),
      status: 'completed',
      provider: 'anthropic',
      model: 'claude-3-7-sonnet',
      error: null,
      toolCalls: null,
      toolResults: null,
    };
    const modelConfig = {
      id: 'gpt-5.2',
      providerId: 'openai',
      name: 'GPT 5.2',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
      api: {
        id: 'gpt-5.2',
        url: 'https://example.com/v1',
        npm: '@ai-sdk/openai',
      },
    };

    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [],
    });
    aiProvider.getModelConfig.mockReturnValue(modelConfig);
    prisma.message.create
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(assistantMessage);
    prisma.message.update.mockResolvedValue(completedAssistantMessage);
    prisma.conversation.update.mockResolvedValue(null);
    pluginRuntime.runChatBeforeModelHooks.mockResolvedValue({
      action: 'short-circuit',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        systemPrompt: '你是 Garlic Claw',
        messages: [
          {
            role: 'user',
            content: '帮我快速回复',
          },
        ],
        availableTools: [],
      },
      assistantContent: '插件已经直接回复。',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
    });
    pluginRuntime.runChatAfterModelHooks.mockResolvedValue({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      assistantMessageId: 'assistant-message-1',
      assistantContent: '插件已经直接回复。',
      assistantParts: [
        {
          type: 'text',
          text: '插件已经直接回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });
    pluginRuntime.runResponseBeforeSendHooks.mockResolvedValue({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
        activePersonaId: 'builtin.default-assistant',
      },
      responseSource: 'short-circuit',
      assistantMessageId: 'assistant-message-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      assistantContent: '发送前统一包装后的回复。',
      assistantParts: [
        {
          type: 'text',
          text: '发送前统一包装后的回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);

    await expect(
      service.startMessageGeneration('user-1', 'conversation-1', {
        content: '帮我快速回复',
        parts: [
          {
            type: 'text',
            text: '帮我快速回复',
          },
        ],
        provider: 'openai',
        model: 'gpt-5.2',
      } as never),
    ).resolves.toEqual({
      userMessage,
      assistantMessage: completedAssistantMessage,
    });

    expect(pluginRuntime.runResponseBeforeSendHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'anthropic',
          activeModelId: 'claude-3-7-sonnet',
          activePersonaId: 'builtin.default-assistant',
        },
        responseSource: 'short-circuit',
        assistantMessageId: 'assistant-message-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        assistantContent: '插件已经直接回复。',
        assistantParts: [
          {
            type: 'text',
            text: '插件已经直接回复。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });
    expect(pluginRuntime.runResponseAfterSendHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: expect.objectContaining({
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'anthropic',
          activeModelId: 'claude-3-7-sonnet',
          activePersonaId: 'builtin.default-assistant',
        },
        responseSource: 'short-circuit',
        assistantMessageId: 'assistant-message-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        assistantContent: '发送前统一包装后的回复。',
        assistantParts: [
          {
            type: 'text',
            text: '发送前统一包装后的回复。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      }),
    });
  });

});

import { ChatMessageService } from './chat-message.service';

describe('ChatMessageService', () => {
  const prisma = {
    message: {
      create: jest.fn(),
      update: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    conversation: {
      update: jest.fn(),
    },
  };

  const chatService = {
    getConversation: jest.fn(),
  };

  const aiProvider = {
    getModelConfig: jest.fn(),
  };

  const personaService = {
    getCurrentPersona: jest.fn(),
  };

  const pluginRuntime = {
    listTools: jest.fn(),
    executeTool: jest.fn(),
    runChatBeforeModelHooks: jest.fn(),
    runChatAfterModelHooks: jest.fn(),
  };

  const modelInvocation = {
    prepareResolved: jest.fn(),
    streamPrepared: jest.fn(),
  };

  const chatTaskService = {
    startTask: jest.fn(),
    stopTask: jest.fn(),
  };

  let service: ChatMessageService;

  beforeEach(() => {
    jest.clearAllMocks();
    personaService.getCurrentPersona.mockResolvedValue({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: 'Default Assistant',
      prompt: '你是 Garlic Claw',
      isDefault: true,
    });
    service = new ChatMessageService(
      prisma as never,
      chatService as never,
      aiProvider as never,
      personaService as never,
      pluginRuntime as never,
      modelInvocation as never,
      chatTaskService as never,
    );
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
      .mockReturnValueOnce(routedModelConfig);
    personaService.getCurrentPersona.mockResolvedValue({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: 'Default Assistant',
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
    pluginRuntime.listTools.mockReturnValue([
      {
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        tool: {
          name: 'save_memory',
          description: '保存记忆',
          parameters: {
            content: {
              type: 'string',
              required: true,
            },
          },
        },
      },
      {
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        tool: {
          name: 'recall_memory',
          description: '读取记忆',
          parameters: {
            query: {
              type: 'string',
              required: true,
            },
          },
        },
      },
      {
        pluginId: 'builtin.automation-tools',
        runtimeKind: 'builtin',
        tool: {
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
        },
      },
    ]);
    pluginRuntime.executeTool.mockResolvedValue({
      saved: true,
    });
    modelInvocation.streamPrepared.mockReturnValue({
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

    expect(pluginRuntime.listTools).toHaveBeenCalledWith({
      source: 'chat-tool',
      userId: 'user-1',
      conversationId: 'conversation-1',
      activeProviderId: 'anthropic',
      activeModelId: 'claude-3-7-sonnet',
      activePersonaId: 'builtin.default-assistant',
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

    expect(pluginRuntime.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-tools',
      toolName: 'recall_memory',
      params: {
        query: '咖啡',
      },
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
        activePersonaId: 'builtin.default-assistant',
      },
    });
    expect(pluginRuntime.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.automation-tools',
      toolName: 'create_automation',
      params: {
        name: '咖啡提醒',
        triggerType: 'manual',
        actions: [],
      },
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
        activePersonaId: 'builtin.default-assistant',
      },
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
      name: 'Default Assistant',
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
    pluginRuntime.listTools.mockReturnValue([]);

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
        toolCalls: [],
        toolResults: [],
      },
    });
    expect(result).toEqual({
      userMessage,
      assistantMessage: completedAssistantMessage,
    });
  });

  it('dispatches chat:after-model hooks after the assistant reply is completed', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '帮我起个标题',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '帮我起个标题',
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

    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [],
    });
    aiProvider.getModelConfig.mockReturnValue(modelConfig);
    personaService.getCurrentPersona.mockResolvedValue({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: 'Default Assistant',
      prompt: '你是 Garlic Claw',
      isDefault: true,
    });
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
            content: '帮我起个标题',
          },
        ],
        availableTools: [],
      },
    });

    await service.startMessageGeneration('user-1', 'conversation-1', {
      content: '帮我起个标题',
      parts: [
        {
          type: 'text',
          text: '帮我起个标题',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
    } as never);

    const taskConfig = chatTaskService.startTask.mock.calls[0]?.[0];
    expect(taskConfig).toBeDefined();

    await taskConfig.onComplete({
      assistantMessageId: 'assistant-message-1',
      conversationId: 'conversation-1',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      content: '咖啡偏好总结',
      toolCalls: [],
      toolResults: [],
    });

    expect(pluginRuntime.runChatAfterModelHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        assistantMessageId: 'assistant-message-1',
        assistantContent: '咖啡偏好总结',
        toolCalls: [],
        toolResults: [],
      },
    });
  });
});

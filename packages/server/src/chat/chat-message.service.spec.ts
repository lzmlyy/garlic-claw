import { ChatMessageOrchestrationService } from './chat-message-orchestration.service';
import { ChatMessageService } from './chat-message.service';

describe('ChatMessageService', () => {
  const prisma = {
    message: {
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      delete: jest.fn(),
      findUniqueOrThrow: jest.fn(),
    },
    conversation: {
      findUnique: jest.fn(),
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
    runMessageReceivedHooks: jest.fn(),
    runChatBeforeModelHooks: jest.fn(),
    runChatWaitingModelHooks: jest.fn(),
    runChatAfterModelHooks: jest.fn(),
    runMessageCreatedHooks: jest.fn(),
    runMessageUpdatedHooks: jest.fn(),
    runMessageDeletedHooks: jest.fn(),
    runResponseBeforeSendHooks: jest.fn(),
    runResponseAfterSendHooks: jest.fn(),
  };

  const toolRegistry = {
    prepareToolSelection: jest.fn(),
    buildToolSet: jest.fn(),
    listAvailableToolSummaries: jest.fn(),
  };

  const modelInvocation = {
    prepareResolved: jest.fn(),
    streamPrepared: jest.fn(),
  };

  const chatTaskService = {
    startTask: jest.fn(),
    stopTask: jest.fn(),
  };

  const skillSession = {
    getConversationSkillContext: jest.fn(),
  };

  const skillCommands = {
    tryHandleMessage: jest.fn(),
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
    pluginRuntime.runMessageReceivedHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => ({
        action: 'continue',
        payload,
      }),
    );
    pluginRuntime.runChatBeforeModelHooks.mockImplementation(
      async ({ payload }: { payload: { request: unknown } }) => ({
        action: 'continue',
        request: payload.request,
      }),
    );
    pluginRuntime.runChatWaitingModelHooks.mockResolvedValue(undefined);
    pluginRuntime.runChatAfterModelHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );
    pluginRuntime.runMessageCreatedHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );
    pluginRuntime.runMessageUpdatedHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );
    pluginRuntime.runMessageDeletedHooks.mockResolvedValue(undefined);
    pluginRuntime.runResponseBeforeSendHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );
    pluginRuntime.runResponseAfterSendHooks.mockResolvedValue(undefined);
    skillSession.getConversationSkillContext.mockResolvedValue({
      activeSkills: [],
      systemPrompt: '',
      allowedToolNames: null,
      deniedToolNames: [],
    });
    skillCommands.tryHandleMessage.mockResolvedValue(null);
    toolRegistry.buildToolSet.mockReturnValue(undefined);
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);
    toolRegistry.prepareToolSelection.mockImplementation(
      async (input: {
        context: {
          source: 'chat-tool';
          userId: string;
          conversationId: string;
          activeProviderId: string;
          activeModelId: string;
          activePersonaId?: string;
        };
      }) => ({
        availableTools: await toolRegistry.listAvailableToolSummaries(input),
        buildToolSet: ({
          context,
          allowedToolNames,
        }: {
          context: {
            source: 'chat-tool';
            userId: string;
            conversationId: string;
            activeProviderId: string;
            activeModelId: string;
            activePersonaId?: string;
          };
          allowedToolNames?: string[];
        }) => toolRegistry.buildToolSet({
          ...input,
          context,
          allowedToolNames,
        }),
      }),
    );
    const orchestration = new ChatMessageOrchestrationService(
      aiProvider as never,
      pluginRuntime as never,
      toolRegistry as never,
      modelInvocation as never,
      skillSession as never,
    );
    service = new ChatMessageService(
      prisma as never,
      chatService as never,
      aiProvider as never,
      personaService as never,
      pluginRuntime as never,
      modelInvocation as never,
      orchestration as never,
      chatTaskService as never,
      skillCommands as never,
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

  it('persists vision fallback metadata onto the current user and assistant messages', async () => {
    const userMessage = {
      id: 'user-message-vision-1',
      role: 'user',
      content: '请描述图片',
      partsJson: JSON.stringify([
        {
          type: 'image',
          image: 'data:image/png;base64,abc123',
          mimeType: 'image/png',
        },
      ]),
      status: 'completed',
      metadataJson: null,
    };
    const assistantMessage = {
      id: 'assistant-message-vision-1',
      role: 'assistant',
      content: '',
      provider: 'openai',
      model: 'gpt-4.1',
      status: 'pending',
      metadataJson: null,
    };
    const modelConfig = {
      id: 'gpt-4.1',
      providerId: 'openai',
      name: 'GPT 4.1',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: false,
        toolCall: true,
      },
      api: {
        id: 'gpt-4.1',
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
    prisma.message.updateMany.mockResolvedValue({ count: 2 });
    prisma.conversation.update.mockResolvedValue(null);
    modelInvocation.prepareResolved.mockResolvedValue({
      modelConfig,
      model: { provider: 'openai', modelId: 'gpt-4.1' },
      sdkMessages: [],
      transformResult: {
        messages: [],
        visionFallback: {
          entries: [
            {
              text: '图片里是一只趴着的橘猫。',
              source: 'generated',
            },
          ],
        },
      },
    });

    const result = await service.startMessageGeneration('user-1', 'conversation-1', {
      content: '请描述图片',
      parts: [
        {
          type: 'image',
          image: 'data:image/png;base64,abc123',
          mimeType: 'image/png',
        },
      ],
    });

    expect(prisma.message.updateMany).toHaveBeenCalledWith({
      where: {
        id: {
          in: ['user-message-vision-1', 'assistant-message-vision-1'],
        },
      },
      data: {
        metadataJson: JSON.stringify({
          visionFallback: {
            state: 'completed',
            entries: [
              {
                text: '图片里是一只趴着的橘猫。',
                source: 'generated',
              },
            ],
          },
        }),
      },
    });
    expect((result.userMessage as { metadataJson?: string | null }).metadataJson).toContain('图片里是一只趴着的橘猫。');
    expect((result.assistantMessage as { metadataJson?: string | null }).metadataJson).toContain('图片里是一只趴着的橘猫。');
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

  it('applies message:created mutations before persisting the user message draft', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '插件改写后的消息',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '插件改写后的消息',
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
    prisma.message.create
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(assistantMessage);
    prisma.conversation.update.mockResolvedValue(null);
    modelInvocation.prepareResolved.mockResolvedValue({
      modelConfig,
      model: { provider: 'openai', modelId: 'gpt-5.2' },
      sdkMessages: [],
    });
    pluginRuntime.runMessageCreatedHooks.mockResolvedValue({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      conversationId: 'conversation-1',
      message: {
        role: 'user',
        content: '插件改写后的消息',
        parts: [
          {
            type: 'text',
            text: '插件改写后的消息',
          },
        ],
        status: 'completed',
      },
      modelMessages: [
        {
          role: 'user',
          content: '插件改写后的消息',
        },
      ],
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
            content: '插件改写后的消息',
          },
        ],
        availableTools: [],
      },
    });
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);

    await service.startMessageGeneration('user-1', 'conversation-1', {
      content: '原始消息',
      parts: [
        {
          type: 'text',
          text: '原始消息',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
    } as never);

    expect(pluginRuntime.runMessageCreatedHooks).toHaveBeenCalledWith({
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
        message: {
          role: 'user',
          content: '原始消息',
          parts: [
            {
              type: 'text',
              text: '原始消息',
            },
          ],
          status: 'completed',
        },
        modelMessages: [
          {
            role: 'user',
            content: '原始消息',
          },
        ],
      },
    });
    expect(prisma.message.create).toHaveBeenNthCalledWith(1, {
      data: {
        conversationId: 'conversation-1',
        role: 'user',
        content: '插件改写后的消息',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '插件改写后的消息',
          },
        ]),
        status: 'completed',
      },
    });
    expect(pluginRuntime.runChatBeforeModelHooks).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          request: expect.objectContaining({
            messages: [
              {
                role: 'user',
                content: '插件改写后的消息',
              },
            ],
          }),
        }),
      }),
    );
  });

  it('applies message:received mutations before persisting the user draft and preparing the model call', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '/route 插件改写后的输入',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '/route 插件改写后的输入',
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
    prisma.conversation.update.mockResolvedValue(null);
    pluginRuntime.runMessageReceivedHooks.mockResolvedValue({
      action: 'continue',
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
          content: '/route 插件改写后的输入',
          parts: [
            {
              type: 'text',
              text: '/route 插件改写后的输入',
            },
          ],
        },
        modelMessages: [
          {
            role: 'user',
            content: '/route 插件改写后的输入',
          },
        ],
      },
    });
    pluginRuntime.runChatBeforeModelHooks.mockResolvedValue({
      action: 'continue',
      request: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        systemPrompt: '你是 Garlic Claw',
        messages: [
          {
            role: 'user',
            content: '/route 插件改写后的输入',
          },
        ],
        availableTools: [],
      },
    });
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);
    modelInvocation.prepareResolved.mockResolvedValue({
      modelConfig: routedModelConfig,
      model: { provider: 'anthropic', modelId: 'claude-3-7-sonnet' },
      sdkMessages: [],
    });

    await service.startMessageGeneration('user-1', 'conversation-1', {
      content: '原始输入',
      parts: [
        {
          type: 'text',
          text: '原始输入',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
    } as never);

    expect(pluginRuntime.runMessageReceivedHooks).toHaveBeenCalledWith({
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
        providerId: 'openai',
        modelId: 'gpt-5.2',
        message: {
          role: 'user',
          content: '原始输入',
          parts: [
            {
              type: 'text',
              text: '原始输入',
            },
          ],
        },
        modelMessages: [
          {
            role: 'user',
            content: '原始输入',
          },
        ],
      },
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
          content: '/route 插件改写后的输入',
          parts: [
            {
              type: 'text',
              text: '/route 插件改写后的输入',
            },
          ],
          status: 'completed',
        },
        modelMessages: [
          {
            role: 'user',
            content: '/route 插件改写后的输入',
          },
        ],
      },
    });
    expect(prisma.message.create).toHaveBeenNthCalledWith(1, {
      data: {
        conversationId: 'conversation-1',
        role: 'user',
        content: '/route 插件改写后的输入',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '/route 插件改写后的输入',
          },
        ]),
        status: 'completed',
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
    expect(modelInvocation.prepareResolved).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      modelConfig: routedModelConfig,
      messages: [
        {
          role: 'user',
          content: '/route 插件改写后的输入',
        },
      ],
    });
  });

  it('returns the current conversation as the current plugin message target', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      title: '当前会话',
      messages: [],
    });

    await expect(
      service.getCurrentPluginMessageTarget({
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      }),
    ).resolves.toEqual({
      type: 'conversation',
      id: 'conversation-1',
      label: '当前会话',
    });

    expect(chatService.getConversation).toHaveBeenCalledWith(
      'user-1',
      'conversation-1',
    );
  });

  it('sends a plugin message through the generic message target interface', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-2',
      title: 'Plugin Target',
      messages: [],
    });
    pluginRuntime.runMessageCreatedHooks.mockResolvedValue({
      context: {
        source: 'cron',
        userId: 'user-1',
        conversationId: 'conversation-2',
        activeProviderId: 'plugin-provider',
        activeModelId: 'plugin-model',
        activePersonaId: 'persona-1',
      },
      conversationId: 'conversation-2',
      message: {
        role: 'assistant',
        content: '插件补充回复',
        parts: [
          {
            type: 'text',
            text: '插件补充回复',
          },
        ],
        provider: 'plugin-provider',
        model: 'plugin-model',
        status: 'completed',
      },
      modelMessages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '插件补充回复',
            },
          ],
        },
      ],
    });
    prisma.message.create.mockResolvedValue({
      id: 'assistant-message-plugin-1',
      conversationId: 'conversation-2',
      role: 'assistant',
      content: '插件补充回复',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '插件补充回复',
        },
      ]),
      provider: 'plugin-provider',
      model: 'plugin-model',
      status: 'completed',
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
    });
    prisma.conversation.update.mockResolvedValue(null);

    await expect(
      service.sendPluginMessage({
        context: {
          source: 'cron',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'persona-1',
        },
        target: {
          type: 'conversation',
          id: 'conversation-2',
        },
        content: '插件补充回复',
        provider: 'plugin-provider',
        model: 'plugin-model',
      }),
    ).resolves.toEqual({
      id: 'assistant-message-plugin-1',
      target: {
        type: 'conversation',
        id: 'conversation-2',
        label: 'Plugin Target',
      },
      role: 'assistant',
      content: '插件补充回复',
      parts: [
        {
          type: 'text',
          text: '插件补充回复',
        },
      ],
      provider: 'plugin-provider',
      model: 'plugin-model',
      status: 'completed',
      createdAt: '2026-03-28T10:00:00.000Z',
      updatedAt: '2026-03-28T10:00:00.000Z',
    });

    expect(chatService.getConversation).toHaveBeenNthCalledWith(
      1,
      'user-1',
      'conversation-2',
    );
    expect(chatService.getConversation).toHaveBeenNthCalledWith(
      2,
      'user-1',
      'conversation-2',
    );
  });

  it('short-circuits /skill commands before plugin message:received hooks run', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '/skill use project/planner',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '/skill use project/planner',
        },
      ]),
      status: 'completed',
    };
    const assistantMessage = {
      id: 'assistant-message-1',
      role: 'assistant',
      content: '',
      status: 'pending',
      provider: 'system',
      model: 'skill-command',
    };
    const completedAssistantMessage = {
      ...assistantMessage,
      content: '已激活 1 个 skill：project/planner',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '已激活 1 个 skill：project/planner',
        },
      ]),
      status: 'completed',
      error: null,
      toolCalls: null,
      toolResults: null,
    };

    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [],
    });
    aiProvider.getModelConfig.mockReturnValue({
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
    });
    skillCommands.tryHandleMessage.mockResolvedValue({
      assistantContent: '已激活 1 个 skill：project/planner',
      assistantParts: [
        {
          type: 'text',
          text: '已激活 1 个 skill：project/planner',
        },
      ],
      providerId: 'system',
      modelId: 'skill-command',
    });
    prisma.message.create
      .mockResolvedValueOnce(userMessage)
      .mockResolvedValueOnce(assistantMessage);
    prisma.message.update.mockResolvedValueOnce(completedAssistantMessage);
    prisma.conversation.update.mockResolvedValue(null);

    await expect(
      service.startMessageGeneration('user-1', 'conversation-1', {
        content: '/skill use project/planner',
        parts: [
          {
            type: 'text',
            text: '/skill use project/planner',
          },
        ],
        provider: 'openai',
        model: 'gpt-5.2',
      } as never),
    ).resolves.toEqual({
      userMessage,
      assistantMessage: completedAssistantMessage,
    });

    expect(skillCommands.tryHandleMessage).toHaveBeenCalledWith({
      userId: 'user-1',
      conversationId: 'conversation-1',
      messageText: '/skill use project/planner',
    });
    expect(pluginRuntime.runMessageReceivedHooks).not.toHaveBeenCalled();
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
    ).toBeLessThan(modelInvocation.streamPrepared.mock.invocationCallOrder[0]);
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
      parts: [],
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
        assistantParts: [],
        toolCalls: [],
        toolResults: [],
      },
    });
  });

  it('returns a patched completion snapshot when chat:after-model rewrites the final assistant content', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '帮我润色回复',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '帮我润色回复',
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
            content: '帮我润色回复',
          },
        ],
        availableTools: [],
      },
    });
    pluginRuntime.runChatAfterModelHooks.mockResolvedValue({
      providerId: 'openai',
      modelId: 'gpt-5.2',
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

    await service.startMessageGeneration('user-1', 'conversation-1', {
      content: '帮我润色回复',
      parts: [
        {
          type: 'text',
          text: '帮我润色回复',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
    } as never);

    const taskConfig = chatTaskService.startTask.mock.calls[0]?.[0];
    expect(taskConfig).toBeDefined();

    await expect(
      taskConfig.onComplete({
        assistantMessageId: 'assistant-message-1',
        conversationId: 'conversation-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        content: '原始模型回复。',
        toolCalls: [],
        toolResults: [],
      }),
    ).resolves.toEqual({
      assistantMessageId: 'assistant-message-1',
      conversationId: 'conversation-1',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      content: '这是插件润色后的最终回复。',
      parts: [
        {
          type: 'text',
          text: '这是插件润色后的最终回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });
  });

  it('applies response:* hooks around the final streamed assistant reply', async () => {
    const userMessage = {
      id: 'user-message-1',
      role: 'user',
      content: '帮我统一包装回复',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '帮我统一包装回复',
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
            content: '帮我统一包装回复',
          },
        ],
        availableTools: [],
      },
    });
    pluginRuntime.runChatAfterModelHooks.mockResolvedValue({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      assistantMessageId: 'assistant-message-1',
      assistantContent: '模型后 Hook 润色后的回复。',
      assistantParts: [
        {
          type: 'text',
          text: '模型后 Hook 润色后的回复。',
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
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      responseSource: 'model',
      assistantMessageId: 'assistant-message-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      assistantContent: '发送前统一包装后的回复。',
      assistantParts: [
        {
          type: 'image',
          image: 'https://example.com/final.png',
        },
        {
          type: 'text',
          text: '发送前统一包装后的回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });

    await service.startMessageGeneration('user-1', 'conversation-1', {
      content: '帮我统一包装回复',
      parts: [
        {
          type: 'text',
          text: '帮我统一包装回复',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
    } as never);

    const taskConfig = chatTaskService.startTask.mock.calls[0]?.[0];
    expect(taskConfig).toBeDefined();

    await expect(
      taskConfig.onComplete({
        assistantMessageId: 'assistant-message-1',
        conversationId: 'conversation-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        content: '原始模型回复。',
        parts: [],
        toolCalls: [],
        toolResults: [],
      }),
    ).resolves.toEqual({
      assistantMessageId: 'assistant-message-1',
      conversationId: 'conversation-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      content: '发送前统一包装后的回复。',
      parts: [
        {
          type: 'image',
          image: 'https://example.com/final.png',
        },
        {
          type: 'text',
          text: '发送前统一包装后的回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });
    expect(pluginRuntime.runResponseBeforeSendHooks).toHaveBeenCalledWith({
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
        responseSource: 'model',
        assistantMessageId: 'assistant-message-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        assistantContent: '模型后 Hook 润色后的回复。',
        assistantParts: [
          {
            type: 'text',
            text: '模型后 Hook 润色后的回复。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });

    await taskConfig.onSent({
      assistantMessageId: 'assistant-message-1',
      conversationId: 'conversation-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      content: '发送前统一包装后的回复。',
      parts: [
        {
          type: 'image',
          image: 'https://example.com/final.png',
        },
        {
          type: 'text',
          text: '发送前统一包装后的回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
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
        responseSource: 'model',
        assistantMessageId: 'assistant-message-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        assistantContent: '发送前统一包装后的回复。',
        assistantParts: [
          {
            type: 'image',
            image: 'https://example.com/final.png',
          },
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
    prisma.message.update
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce(completedAssistantMessage);
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
    prisma.message.update
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce(completedAssistantMessage);
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

  it('applies message:updated mutations before persisting a user message edit', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [
        {
          id: 'message-1',
          role: 'user',
          content: '旧内容',
          partsJson: JSON.stringify([
            {
              type: 'text',
              text: '旧内容',
            },
          ]),
          status: 'completed',
        },
      ],
    });
    chatTaskService.stopTask.mockResolvedValue(false);
    pluginRuntime.runMessageUpdatedHooks.mockResolvedValue({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      conversationId: 'conversation-1',
      messageId: 'message-1',
      currentMessage: {
        id: 'message-1',
        role: 'user',
        content: '旧内容',
        parts: [
          {
            type: 'text',
            text: '旧内容',
          },
        ],
        status: 'completed',
      },
      nextMessage: {
        role: 'user',
        content: '插件改写后的新内容',
        parts: [
          {
            type: 'text',
            text: '插件改写后的新内容',
          },
        ],
        status: 'completed',
      },
    });
    prisma.message.update.mockResolvedValue({
      id: 'message-1',
      role: 'user',
      content: '插件改写后的新内容',
      partsJson: JSON.stringify([
        {
          type: 'text',
          text: '插件改写后的新内容',
        },
      ]),
      status: 'completed',
    });
    prisma.conversation.update.mockResolvedValue(null);

    await service.updateMessage('user-1', 'conversation-1', 'message-1', {
      content: '用户输入的新内容',
      parts: [
        {
          type: 'text',
          text: '用户输入的新内容',
        },
      ],
    } as never);

    expect(pluginRuntime.runMessageUpdatedHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        conversationId: 'conversation-1',
        messageId: 'message-1',
        currentMessage: {
          id: 'message-1',
          role: 'user',
          content: '旧内容',
          parts: [
            {
              type: 'text',
              text: '旧内容',
            },
          ],
          status: 'completed',
        },
        nextMessage: {
          role: 'user',
          content: '用户输入的新内容',
          parts: [
            {
              type: 'text',
              text: '用户输入的新内容',
            },
          ],
          status: 'completed',
        },
      },
    });
    expect(prisma.message.update).toHaveBeenCalledWith({
      where: { id: 'message-1' },
      data: {
        content: '插件改写后的新内容',
        partsJson: JSON.stringify([
          {
            type: 'text',
            text: '插件改写后的新内容',
          },
        ]),
        status: 'completed',
        error: null,
      },
    });
  });

  it('dispatches message:deleted hooks before deleting a message', async () => {
    chatService.getConversation.mockResolvedValue({
      id: 'conversation-1',
      messages: [
        {
          id: 'message-1',
          role: 'assistant',
          content: '待删除消息',
          partsJson: null,
          status: 'completed',
          provider: 'openai',
          model: 'gpt-5.2',
        },
      ],
    });
    chatTaskService.stopTask.mockResolvedValue(false);
    prisma.message.delete.mockResolvedValue({
      id: 'message-1',
    });
    prisma.conversation.update.mockResolvedValue(null);

    await service.deleteMessage('user-1', 'conversation-1', 'message-1');

    expect(pluginRuntime.runMessageDeletedHooks).toHaveBeenCalledWith({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        conversationId: 'conversation-1',
        messageId: 'message-1',
        message: {
          id: 'message-1',
          role: 'assistant',
          content: '待删除消息',
          parts: [],
          provider: 'openai',
          model: 'gpt-5.2',
          status: 'completed',
        },
      },
    });
  });
});

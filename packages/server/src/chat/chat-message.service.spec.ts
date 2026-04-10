import {
  createChatMessageSpecFixture,
  type ChatMessageSpecFixture,
} from './chat-message.spec-fixture';

describe('ChatMessageService', () => {
  let service: ChatMessageSpecFixture['service'];
  let prisma: ChatMessageSpecFixture['prisma'];
  let chatService: ChatMessageSpecFixture['chatService'];
  let aiProvider: ChatMessageSpecFixture['aiProvider'];
  let pluginRuntime: ChatMessageSpecFixture['pluginRuntime'];
  let toolRegistry: ChatMessageSpecFixture['toolRegistry'];
  let modelInvocation: ChatMessageSpecFixture['modelInvocation'];
  let chatTaskService: ChatMessageSpecFixture['chatTaskService'];
  let skillCommands: ChatMessageSpecFixture['skillCommands'];

  beforeEach(() => {
    ({
      service,
      prisma,
      chatService,
      aiProvider,
      pluginRuntime,
      toolRegistry,
      modelInvocation,
      chatTaskService,
      skillCommands,
    } = createChatMessageSpecFixture());
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

    expect(chatService.getConversation).toHaveBeenCalledTimes(1);
    expect(chatService.getConversation).toHaveBeenCalledWith(
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

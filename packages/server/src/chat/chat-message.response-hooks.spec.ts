import {
  createChatMessageSpecFixture,
  type ChatMessageSpecFixture,
} from './chat-message.spec-fixture';

describe('ChatMessageService response hooks', () => {
  let service: ChatMessageSpecFixture['service'];
  let prisma: ChatMessageSpecFixture['prisma'];
  let chatService: ChatMessageSpecFixture['chatService'];
  let aiProvider: ChatMessageSpecFixture['aiProvider'];
  let personaService: ChatMessageSpecFixture['personaService'];
  let pluginRuntime: ChatMessageSpecFixture['pluginRuntime'];
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
      modelInvocation,
      chatTaskService,
    } = createChatMessageSpecFixture());
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
      name: '默认助手',
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

});

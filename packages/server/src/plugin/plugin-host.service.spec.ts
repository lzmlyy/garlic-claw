import type { ChatMessagePart } from '@garlic-claw/shared';
import { PluginHostAiFacade } from './plugin-host-ai.facade';
import { PluginHostConversationFacade } from './plugin-host-conversation.facade';
import { PluginHostService } from './plugin-host.service';
import { PluginHostStateFacade } from './plugin-host-state.facade';
import { PluginStateService } from './plugin-state.service';

describe('PluginHostService', () => {
  const kbService = {
    listEntries: jest.fn(),
    searchEntries: jest.fn(),
    getEntry: jest.fn(),
  };

  const personaService = {
    getCurrentPersona: jest.fn(),
    listPersonas: jest.fn(),
    getPersona: jest.fn(),
    activateConversationPersona: jest.fn(),
  };

  const memoryService = {
    searchMemories: jest.fn(),
    saveMemory: jest.fn(),
  };

  const aiProviderService = {
    getModelConfig: jest.fn(),
  };

  const aiManagementService = {
    listProviders: jest.fn(),
    getProvider: jest.fn(),
    getProviderModel: jest.fn(),
  };

  const prisma = {
    conversation: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  };

  const pluginService = {
    getResolvedConfig: jest.fn(),
    getPluginStorage: jest.fn(),
    setPluginStorage: jest.fn(),
    deletePluginStorage: jest.fn(),
    listPluginStorage: jest.fn(),
    listPluginEvents: jest.fn(),
    getPluginSelfInfo: jest.fn(),
    recordPluginEvent: jest.fn(),
  };

  const aiModelExecution = {
    generateText: jest.fn(),
  };

  let stateService: PluginStateService;
  let hostAiFacade: PluginHostAiFacade;
  let hostConversationFacade: PluginHostConversationFacade;
  let hostStateFacade: PluginHostStateFacade;
  let service: PluginHostService;

  beforeEach(() => {
    jest.clearAllMocks();
    stateService = new PluginStateService();
    hostAiFacade = new PluginHostAiFacade(
      aiModelExecution as never,
      aiProviderService as never,
      aiManagementService as never,
    );
    hostConversationFacade = new PluginHostConversationFacade(
      memoryService as never,
      kbService as never,
      personaService as never,
      prisma as never,
    );
    hostStateFacade = new PluginHostStateFacade(
      pluginService as never,
      stateService,
    );
    service = new (PluginHostService as unknown as new (
      ...args: unknown[]
    ) => PluginHostService)(
      hostAiFacade,
      hostConversationFacade,
      hostStateFacade,
    );
  });

  it('lists, searches and reads knowledge base entries through kb host api', async () => {
    kbService.listEntries.mockResolvedValue([
      {
        id: 'kb-plugin-runtime',
        title: '统一插件运行时',
        excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        tags: ['plugin', 'runtime'],
        createdAt: '2026-03-28T02:00:00.000Z',
        updatedAt: '2026-03-28T02:00:00.000Z',
      },
    ]);
    kbService.searchEntries.mockResolvedValue([
      {
        id: 'kb-plugin-runtime',
        title: '统一插件运行时',
        excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        tags: ['plugin', 'runtime'],
        createdAt: '2026-03-28T02:00:00.000Z',
        updatedAt: '2026-03-28T02:00:00.000Z',
      },
    ]);
    kbService.getEntry.mockResolvedValue({
      id: 'kb-plugin-runtime',
      title: '统一插件运行时',
      excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
      content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
      tags: ['plugin', 'runtime'],
      createdAt: '2026-03-28T02:00:00.000Z',
      updatedAt: '2026-03-28T02:00:00.000Z',
    });

    await expect(
      service.call({
        pluginId: 'builtin.kb-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'kb.list' as never,
        params: {
          limit: 5,
        },
      }),
    ).resolves.toEqual([
      {
        id: 'kb-plugin-runtime',
        title: '统一插件运行时',
        excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        tags: ['plugin', 'runtime'],
        createdAt: '2026-03-28T02:00:00.000Z',
        updatedAt: '2026-03-28T02:00:00.000Z',
      },
    ]);
    await expect(
      service.call({
        pluginId: 'builtin.kb-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'kb.search' as never,
        params: {
          query: '插件运行时',
          limit: 3,
        },
      }),
    ).resolves.toEqual([
      {
        id: 'kb-plugin-runtime',
        title: '统一插件运行时',
        excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        tags: ['plugin', 'runtime'],
        createdAt: '2026-03-28T02:00:00.000Z',
        updatedAt: '2026-03-28T02:00:00.000Z',
      },
    ]);
    await expect(
      service.call({
        pluginId: 'builtin.kb-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'kb.get' as never,
        params: {
          entryId: 'kb-plugin-runtime',
        },
      }),
    ).resolves.toEqual({
      id: 'kb-plugin-runtime',
      title: '统一插件运行时',
      excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
      content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
      tags: ['plugin', 'runtime'],
      createdAt: '2026-03-28T02:00:00.000Z',
      updatedAt: '2026-03-28T02:00:00.000Z',
    });

    expect(kbService.listEntries).toHaveBeenCalledWith(5);
    expect(kbService.searchEntries).toHaveBeenCalledWith('插件运行时', 3);
    expect(kbService.getEntry).toHaveBeenCalledWith('kb-plugin-runtime');
  });

  it('returns the current persona context through persona.current.get', async () => {
    personaService.getCurrentPersona.mockResolvedValue({
      source: 'conversation',
      personaId: 'persona-writer',
      name: 'Writer',
      prompt: '你是一个偏文学表达的写作助手。',
      description: '更偏文学润色',
      isDefault: false,
    });

    await expect(
      service.call({
        pluginId: 'builtin.persona-router',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activePersonaId: 'persona-writer',
        } as never,
        method: 'persona.current.get' as never,
        params: {},
      }),
    ).resolves.toEqual({
      source: 'conversation',
      personaId: 'persona-writer',
      name: 'Writer',
      prompt: '你是一个偏文学表达的写作助手。',
      description: '更偏文学润色',
      isDefault: false,
    });

    expect(personaService.getCurrentPersona).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      activePersonaId: 'persona-writer',
    });
  });

  it('lists, reads and activates personas through persona host api', async () => {
    personaService.listPersonas.mockResolvedValue([
      {
        id: 'builtin.default-assistant',
        name: '默认助手',
        prompt: '你是 Garlic Claw',
        description: '默认通用助手',
        isDefault: true,
        createdAt: '2026-03-27T14:00:00.000Z',
        updatedAt: '2026-03-27T14:00:00.000Z',
      },
      {
        id: 'persona-writer',
        name: 'Writer',
        prompt: '你是一个偏文学表达的写作助手。',
        description: '更偏文学润色',
        isDefault: false,
        createdAt: '2026-03-27T14:01:00.000Z',
        updatedAt: '2026-03-27T14:01:00.000Z',
      },
    ]);
    personaService.getPersona.mockResolvedValue({
      id: 'persona-writer',
      name: 'Writer',
      prompt: '你是一个偏文学表达的写作助手。',
      description: '更偏文学润色',
      isDefault: false,
      createdAt: '2026-03-27T14:01:00.000Z',
      updatedAt: '2026-03-27T14:01:00.000Z',
    });
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      title: 'New Chat',
      userId: 'user-1',
      createdAt: new Date('2026-03-27T08:00:00.000Z'),
      updatedAt: new Date('2026-03-27T08:05:00.000Z'),
    });
    personaService.activateConversationPersona.mockResolvedValue({
      source: 'conversation',
      personaId: 'persona-writer',
      name: 'Writer',
      prompt: '你是一个偏文学表达的写作助手。',
      description: '更偏文学润色',
      isDefault: false,
    });

    await expect(
      service.call({
        pluginId: 'builtin.persona-router',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'persona.list' as never,
        params: {},
      }),
    ).resolves.toEqual([
      {
        id: 'builtin.default-assistant',
        name: '默认助手',
        prompt: '你是 Garlic Claw',
        description: '默认通用助手',
        isDefault: true,
        createdAt: '2026-03-27T14:00:00.000Z',
        updatedAt: '2026-03-27T14:00:00.000Z',
      },
      {
        id: 'persona-writer',
        name: 'Writer',
        prompt: '你是一个偏文学表达的写作助手。',
        description: '更偏文学润色',
        isDefault: false,
        createdAt: '2026-03-27T14:01:00.000Z',
        updatedAt: '2026-03-27T14:01:00.000Z',
      },
    ]);
    await expect(
      service.call({
        pluginId: 'builtin.persona-router',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'persona.get' as never,
        params: {
          personaId: 'persona-writer',
        },
      }),
    ).resolves.toEqual({
      id: 'persona-writer',
      name: 'Writer',
      prompt: '你是一个偏文学表达的写作助手。',
      description: '更偏文学润色',
      isDefault: false,
      createdAt: '2026-03-27T14:01:00.000Z',
      updatedAt: '2026-03-27T14:01:00.000Z',
    });
    await expect(
      service.call({
        pluginId: 'builtin.persona-router',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'persona.activate' as never,
        params: {
          personaId: 'persona-writer',
        },
      }),
    ).resolves.toEqual({
      source: 'conversation',
      personaId: 'persona-writer',
      name: 'Writer',
      prompt: '你是一个偏文学表达的写作助手。',
      description: '更偏文学润色',
      isDefault: false,
    });

    expect(personaService.getPersona).toHaveBeenCalledWith('persona-writer');
    expect(personaService.activateConversationPersona).toHaveBeenCalledWith(
      'conversation-1',
      'persona-writer',
    );
  });

  it('searches memories with the current user context', async () => {
    memoryService.searchMemories.mockResolvedValue([
      {
        id: 'memory-1',
        content: '用户喜欢美式咖啡',
        category: 'preference',
        createdAt: new Date('2026-03-27T08:00:00.000Z'),
      },
    ]);

    const result = await service.call({
      pluginId: 'memory-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'memory.search',
      params: {
        query: '咖啡',
        limit: 3,
      },
    });

    expect(memoryService.searchMemories).toHaveBeenCalledWith('user-1', '咖啡', 3);
    expect(result).toEqual([
      {
        id: 'memory-1',
        content: '用户喜欢美式咖啡',
        category: 'preference',
        createdAt: '2026-03-27T08:00:00.000Z',
      },
    ]);
  });

  it('stores plugin runtime state by plugin id', async () => {
    await service.call({
      pluginId: 'memory-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
      },
      method: 'state.set',
      params: {
        key: 'last-query',
        value: {
          query: '咖啡',
          count: 2,
        },
      },
    });

    const result = await service.call({
      pluginId: 'memory-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
      },
      method: 'state.get',
      params: {
        key: 'last-query',
      },
    });

    expect(result).toEqual({
      query: '咖啡',
      count: 2,
    });
  });

  it('isolates scoped runtime state by conversation and user context', async () => {
    await service.call({
      pluginId: 'memory-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'state.set',
      params: {
        scope: 'conversation',
        key: 'draft.step',
        value: 'collect-name',
      },
    });
    await service.call({
      pluginId: 'memory-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'state.set',
      params: {
        scope: 'user',
        key: 'profile.locale',
        value: 'zh-CN',
      },
    });

    await expect(
      service.call({
        pluginId: 'memory-tools',
        context: {
          source: 'chat-tool',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'state.list' as never,
        params: {
          scope: 'conversation',
        },
      }),
    ).resolves.toEqual([
      {
        key: 'draft.step',
        value: 'collect-name',
      },
    ]);
    await expect(
      service.call({
        pluginId: 'memory-tools',
        context: {
          source: 'chat-tool',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'state.list' as never,
        params: {
          scope: 'user',
        },
      }),
    ).resolves.toEqual([
      {
        key: 'profile.locale',
        value: 'zh-CN',
      },
    ]);
    await expect(
      service.call({
        pluginId: 'memory-tools',
        context: {
          source: 'chat-tool',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'state.delete' as never,
        params: {
          scope: 'conversation',
          key: 'draft.step',
        },
      }),
    ).resolves.toBe(true);
    await expect(
      service.call({
        pluginId: 'memory-tools',
        context: {
          source: 'chat-tool',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'state.get' as never,
        params: {
          scope: 'conversation',
          key: 'draft.step',
        },
      }),
    ).resolves.toBeNull();
  });

  it('returns conversation messages for the current invocation context', async () => {
    const parts: ChatMessagePart[] = [
      {
        type: 'text',
        text: '你好',
      },
    ];

    prisma.message.findMany.mockResolvedValue([
      {
        id: 'message-1',
        role: 'user',
        content: '你好',
        partsJson: JSON.stringify(parts),
        toolCalls: null,
        toolResults: null,
        provider: null,
        model: null,
        status: 'completed',
        error: null,
        createdAt: new Date('2026-03-27T08:01:00.000Z'),
        updatedAt: new Date('2026-03-27T08:01:00.000Z'),
      },
    ]);

    const result = await service.call({
      pluginId: 'memory-context',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.messages.list',
      params: {},
    });

    expect(prisma.message.findMany).toHaveBeenCalledWith({
      where: {
        conversationId: 'conversation-1',
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: expect.any(Object),
    });
    expect(result).toEqual([
      {
        id: 'message-1',
        role: 'user',
        content: '你好',
        parts: parts,
        status: 'completed',
        createdAt: '2026-03-27T08:01:00.000Z',
        updatedAt: '2026-03-27T08:01:00.000Z',
      },
    ]);
  });

  it('returns the resolved plugin config through config.get', async () => {
    pluginService.getResolvedConfig.mockResolvedValue({
      limit: 8,
      promptPrefix: '记忆摘要',
    });

    const result = await service.call({
      pluginId: 'memory-context',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
      },
      method: 'config.get',
      params: {},
    });

    expect(pluginService.getResolvedConfig).toHaveBeenCalledWith('memory-context');
    expect(result).toEqual({
      limit: 8,
      promptPrefix: '记忆摘要',
    });
  });

  it('returns a single resolved plugin config value when key is provided', async () => {
    pluginService.getResolvedConfig.mockResolvedValue({
      limit: 8,
      promptPrefix: '记忆摘要',
    });

    const result = await service.call({
      pluginId: 'memory-context',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
      },
      method: 'config.get',
      params: {
        key: 'limit',
      },
    });

    expect(result).toBe(8);
  });

  it('returns the current conversation summary through conversation.get', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      title: 'New Chat',
      userId: 'user-1',
      createdAt: new Date('2026-03-27T08:00:00.000Z'),
      updatedAt: new Date('2026-03-27T08:05:00.000Z'),
    });

    const result = await service.call({
      pluginId: 'conversation-title',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.get',
      params: {},
    });

    expect(result).toEqual({
      id: 'conversation-1',
      title: 'New Chat',
      createdAt: '2026-03-27T08:00:00.000Z',
      updatedAt: '2026-03-27T08:05:00.000Z',
    });
  });

  it('updates the current conversation title through conversation.title.set', async () => {
    prisma.conversation.findUnique.mockResolvedValue({
      id: 'conversation-1',
      title: 'New Chat',
      userId: 'user-1',
      createdAt: new Date('2026-03-27T08:00:00.000Z'),
      updatedAt: new Date('2026-03-27T08:05:00.000Z'),
    });
    prisma.conversation.update.mockResolvedValue({
      id: 'conversation-1',
      title: '咖啡偏好总结',
      createdAt: new Date('2026-03-27T08:00:00.000Z'),
      updatedAt: new Date('2026-03-27T08:06:00.000Z'),
    });

    const result = await service.call({
      pluginId: 'conversation-title',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.title.set',
      params: {
        title: '咖啡偏好总结',
      },
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith({
      where: {
        id: 'conversation-1',
      },
      data: {
        title: '咖啡偏好总结',
      },
    });
    expect(result).toEqual({
      id: 'conversation-1',
      title: '咖啡偏好总结',
      createdAt: '2026-03-27T08:00:00.000Z',
      updatedAt: '2026-03-27T08:06:00.000Z',
    });
  });

  it('generates text through llm.generate-text host api', async () => {
    aiModelExecution.generateText.mockResolvedValue({
      modelConfig: {
        providerId: 'openai',
        id: 'gpt-5.2',
      },
      result: {
        text: '咖啡偏好总结',
      },
    });

    const result = await service.call({
      pluginId: 'conversation-title',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'llm.generate-text',
      params: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        system: '你是标题生成器',
        prompt: '请为这段对话生成标题',
        maxOutputTokens: 32,
      },
    });

    expect(aiModelExecution.generateText).toHaveBeenCalledWith({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      system: '你是标题生成器',
      maxOutputTokens: 32,
      sdkMessages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请为这段对话生成标题',
            },
          ],
        },
      ],
    });
    expect(result).toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      text: '咖啡偏好总结',
    });
  });

  it('uses the conversationTitle utility role when the conversation title plugin omits provider/model', async () => {
    aiModelExecution.generateText.mockResolvedValue({
      modelConfig: {
        providerId: 'openai',
        id: 'gpt-4.1-mini',
      },
      result: {
        text: '咖啡偏好总结',
      },
    });

    await service.call({
      pluginId: 'builtin.conversation-title',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
      },
      method: 'llm.generate-text',
      params: {
        system: '你是标题生成器',
        prompt: '请为这段对话生成标题',
      },
    });

    expect(aiModelExecution.generateText).toHaveBeenCalledWith({
      utilityRole: 'conversationTitle',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      system: '你是标题生成器',
      sdkMessages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请为这段对话生成标题',
            },
          ],
        },
      ],
    });
  });

  it('returns the active provider context through provider.current.get', async () => {
    aiProviderService.getModelConfig.mockReturnValue({
      providerId: 'openai',
      id: 'gpt-5.2',
    });

    await expect(
      service.call({
        pluginId: 'builtin.provider-router',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        } as never,
        method: 'provider.current.get' as never,
        params: {},
      }),
    ).resolves.toEqual({
      source: 'context',
      providerId: 'openai',
      modelId: 'gpt-5.2',
    });
  });

  it('generates assistant output through llm.generate host api', async () => {
    aiModelExecution.generateText.mockResolvedValue({
      modelConfig: {
        providerId: 'anthropic',
        id: 'claude-3-7-sonnet',
      },
      result: {
        text: '当然可以，我来帮你总结。',
        finishReason: 'stop',
        usage: {
          inputTokens: 11,
          outputTokens: 8,
        },
      },
    });

    await expect(
      service.call({
        pluginId: 'builtin.provider-router',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'llm.generate' as never,
        params: {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
          system: '你是一个总结助手',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '请总结这段对话',
                },
              ],
            },
          ],
          maxOutputTokens: 64,
        },
      }),
    ).resolves.toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      text: '当然可以，我来帮你总结。',
      message: {
        role: 'assistant',
        content: '当然可以，我来帮你总结。',
      },
      finishReason: 'stop',
      usage: {
        inputTokens: 11,
        outputTokens: 8,
      },
    });

    expect(aiModelExecution.generateText).toHaveBeenCalledWith({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      system: '你是一个总结助手',
      maxOutputTokens: 64,
      sdkMessages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请总结这段对话',
            },
          ],
        },
      ],
    });
  });

  it('uses the pluginGenerateText utility role for generic plugin generation when provider/model are omitted', async () => {
    aiModelExecution.generateText.mockResolvedValue({
      modelConfig: {
        providerId: 'openai',
        id: 'gpt-4.1-mini',
      },
      result: {
        text: '当然可以，我来帮你总结。',
      },
    });

    await service.call({
      pluginId: 'builtin.memory-context',
      context: {
        source: 'plugin',
        userId: 'user-1',
      },
      method: 'llm.generate',
      params: {
        system: '你是一个总结助手',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请总结这段对话',
              },
            ],
          },
        ],
      },
    });

    expect(aiModelExecution.generateText).toHaveBeenCalledWith({
      utilityRole: 'pluginGenerateText',
      system: '你是一个总结助手',
      sdkMessages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: '请总结这段对话',
            },
          ],
        },
      ],
    });
  });

  it('reads and writes persistent plugin storage through storage host api', async () => {
    pluginService.setPluginStorage.mockResolvedValue('message-42');
    pluginService.getPluginStorage.mockResolvedValue('message-42');
    pluginService.listPluginStorage.mockResolvedValue([
      {
        key: 'cursor.lastMessageId',
        value: 'message-42',
      },
    ]);
    pluginService.deletePluginStorage.mockResolvedValue(true);

    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
        },
        method: 'storage.set' as never,
        params: {
          key: 'cursor.lastMessageId',
          value: 'message-42',
        },
      }),
    ).resolves.toBe('message-42');
    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
        },
        method: 'storage.get' as never,
        params: {
          key: 'cursor.lastMessageId',
        },
      }),
    ).resolves.toBe('message-42');
    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
        },
        method: 'storage.list' as never,
        params: {
          prefix: 'cursor.',
        },
      }),
    ).resolves.toEqual([
      {
        key: 'cursor.lastMessageId',
        value: 'message-42',
      },
    ]);
    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
        },
        method: 'storage.delete' as never,
        params: {
          key: 'cursor.lastMessageId',
        },
      }),
    ).resolves.toBe(true);

    expect(pluginService.setPluginStorage).toHaveBeenCalledWith(
      'memory-context',
      'cursor.lastMessageId',
      'message-42',
    );
    expect(pluginService.getPluginStorage).toHaveBeenCalledWith(
      'memory-context',
      'cursor.lastMessageId',
    );
    expect(pluginService.listPluginStorage).toHaveBeenCalledWith(
      'memory-context',
      'cursor.',
    );
    expect(pluginService.deletePluginStorage).toHaveBeenCalledWith(
      'memory-context',
      'cursor.lastMessageId',
    );
  });

  it('maps conversation scoped storage to namespaced host kv without leaking scoped keys', async () => {
    pluginService.setPluginStorage.mockResolvedValue('message-42');
    pluginService.getPluginStorage.mockResolvedValue('message-42');
    pluginService.listPluginStorage.mockResolvedValue([
      {
        key: '__gc_scope__:conversation:conversation-1:cursor.lastMessageId',
        value: 'message-42',
      },
      {
        key: 'plugin-only',
        value: 'ignored',
      },
    ]);
    pluginService.deletePluginStorage.mockResolvedValue(true);

    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'storage.set' as never,
        params: {
          scope: 'conversation',
          key: 'cursor.lastMessageId',
          value: 'message-42',
        },
      }),
    ).resolves.toBe('message-42');
    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'storage.get' as never,
        params: {
          scope: 'conversation',
          key: 'cursor.lastMessageId',
        },
      }),
    ).resolves.toBe('message-42');
    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'storage.list' as never,
        params: {
          scope: 'conversation',
        },
      }),
    ).resolves.toEqual([
      {
        key: 'cursor.lastMessageId',
        value: 'message-42',
      },
    ]);
    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'storage.delete' as never,
        params: {
          scope: 'conversation',
          key: 'cursor.lastMessageId',
        },
      }),
    ).resolves.toBe(true);

    expect(pluginService.setPluginStorage).toHaveBeenCalledWith(
      'memory-context',
      '__gc_scope__:conversation:conversation-1:cursor.lastMessageId',
      'message-42',
    );
    expect(pluginService.getPluginStorage).toHaveBeenCalledWith(
      'memory-context',
      '__gc_scope__:conversation:conversation-1:cursor.lastMessageId',
    );
    expect(pluginService.listPluginStorage).toHaveBeenCalledWith(
      'memory-context',
      '__gc_scope__:conversation:conversation-1:',
    );
    expect(pluginService.deletePluginStorage).toHaveBeenCalledWith(
      'memory-context',
      '__gc_scope__:conversation:conversation-1:cursor.lastMessageId',
    );
  });

  it('returns the current user summary through user.get', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'garlic',
      email: 'garlic@example.com',
      role: 'admin',
      createdAt: new Date('2026-03-27T08:00:00.000Z'),
      updatedAt: new Date('2026-03-27T08:05:00.000Z'),
    });

    await expect(
      service.call({
        pluginId: 'conversation-title',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'user.get' as never,
        params: {},
      }),
    ).resolves.toEqual({
      id: 'user-1',
      username: 'garlic',
      email: 'garlic@example.com',
      role: 'admin',
      createdAt: '2026-03-27T08:00:00.000Z',
      updatedAt: '2026-03-27T08:05:00.000Z',
    });
  });

  it('returns plugin self summary through plugin.self.get', async () => {
    pluginService.getPluginSelfInfo.mockResolvedValue({
      id: 'builtin.memory-context',
      name: '记忆上下文',
      runtimeKind: 'builtin',
      version: '1.0.0',
      permissions: ['config:read', 'storage:read'],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    });

    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
        },
        method: 'plugin.self.get' as never,
        params: {},
      }),
    ).resolves.toEqual({
      id: 'builtin.memory-context',
      name: '记忆上下文',
      runtimeKind: 'builtin',
      version: '1.0.0',
      permissions: ['config:read', 'storage:read'],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    });
  });

  it('records plugin-authored event logs through log.write', async () => {
    pluginService.recordPluginEvent.mockResolvedValue(undefined);

    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'log.write' as never,
        params: {
          level: 'warn',
          type: 'plugin:config',
          message: '缺少 limit 配置，已回退默认值',
          metadata: {
            field: 'limit',
          },
        },
      }),
    ).resolves.toBe(true);

    expect(pluginService.recordPluginEvent).toHaveBeenCalledWith(
      'memory-context',
      {
        level: 'warn',
        type: 'plugin:config',
        message: '缺少 limit 配置，已回退默认值',
        metadata: {
          field: 'limit',
        },
      },
    );
  });

  it('lists plugin-authored event logs through log.list', async () => {
    pluginService.listPluginEvents.mockResolvedValue({
      items: [
        {
          id: 'event-1',
          type: 'plugin:config',
          level: 'warn',
          message: '缺少 limit 配置，已回退默认值',
          metadata: {
            field: 'limit',
          },
          createdAt: '2026-04-01T08:00:00.000Z',
        },
      ],
      nextCursor: 'event-0',
    });

    await expect(
      service.call({
        pluginId: 'memory-context',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'log.list' as never,
        params: {
          limit: 20,
          level: 'warn',
          type: 'plugin:config',
          keyword: 'limit',
          cursor: 'event-2',
        },
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'event-1',
          type: 'plugin:config',
          level: 'warn',
          message: '缺少 limit 配置，已回退默认值',
          metadata: {
            field: 'limit',
          },
          createdAt: '2026-04-01T08:00:00.000Z',
        },
      ],
      nextCursor: 'event-0',
    });

    expect(pluginService.listPluginEvents).toHaveBeenCalledWith('memory-context', {
      limit: 20,
      level: 'warn',
      type: 'plugin:config',
      keyword: 'limit',
      cursor: 'event-2',
    });
  });
});

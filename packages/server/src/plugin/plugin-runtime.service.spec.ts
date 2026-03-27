import type {
  ChatAfterModelHookPayload,
  PluginCallContext,
  PluginConfigSchema,
  PluginManifest,
} from '@garlic-claw/shared';
import { PluginRuntimeService } from './plugin-runtime.service';

describe('PluginRuntimeService', () => {
  const pluginService = {
    registerPlugin: jest.fn(),
    setOffline: jest.fn(),
    getGovernanceSnapshot: jest.fn(),
    recordPluginSuccess: jest.fn(),
    recordPluginFailure: jest.fn(),
  };

  const hostService = {
    call: jest.fn(),
  };

  const cronService = {
    onPluginRegistered: jest.fn(),
    onPluginUnregistered: jest.fn(),
    registerCron: jest.fn(),
    listCronJobs: jest.fn(),
    deleteCron: jest.fn(),
  };

  const aiModelExecution = {
    resolveModelConfig: jest.fn(),
    prepareResolved: jest.fn(),
    streamPrepared: jest.fn(),
  };

  const automationService = {
    create: jest.fn(),
    findAllByUser: jest.fn(),
    toggle: jest.fn(),
    executeAutomation: jest.fn(),
  };

  const moduleRef = {
    get: jest.fn(),
  };

  const callContext: PluginCallContext = {
    source: 'chat-tool',
    userId: 'user-1',
    conversationId: 'conversation-1',
  };

  const builtinManifest: PluginManifest = {
    id: 'builtin.memory-tools',
    name: 'Memory Tools',
    version: '1.0.0',
    runtime: 'builtin',
    permissions: ['memory:read', 'memory:write', 'state:read', 'state:write'],
    tools: [
      {
        name: 'save_memory',
        description: '保存记忆',
        parameters: {
          content: {
            type: 'string',
            required: true,
          },
        },
      },
    ],
    hooks: [
      {
        name: 'chat:before-model',
      },
    ],
  };

  const memoryContextConfigSchema: PluginConfigSchema = {
    fields: [
      {
        key: 'limit',
        type: 'number',
        description: '记忆检索数量',
        defaultValue: 5,
      },
    ],
  };

  let service: PluginRuntimeService;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginService.registerPlugin.mockResolvedValue({
      configSchema: null,
      resolvedConfig: {},
      scope: {
        defaultEnabled: true,
        conversations: {},
      },
    });
    pluginService.getGovernanceSnapshot.mockResolvedValue({
      configSchema: null,
      resolvedConfig: {},
      scope: {
        defaultEnabled: true,
        conversations: {},
      },
    });
    cronService.onPluginRegistered.mockResolvedValue(undefined);
    cronService.onPluginUnregistered.mockResolvedValue(undefined);
    aiModelExecution.resolveModelConfig.mockReturnValue({
      id: 'gpt-5.2',
      providerId: 'openai',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
    });
    moduleRef.get.mockReturnValue(automationService);
    service = new PluginRuntimeService(
      pluginService as never,
      hostService as never,
      cronService as never,
      aiModelExecution as never,
      moduleRef as never,
    );
  });

  /**
   * 创建满足 runtime 约束的 transport 桩。
   * @param overrides 需要覆盖的执行方法
   * @returns 可直接注册到 runtime 的 transport
   */
  function createTransport(overrides?: {
    executeTool?: jest.Mock;
    invokeHook?: jest.Mock;
    invokeRoute?: jest.Mock;
  }) {
    return {
      executeTool: jest.fn(),
      invokeHook: jest.fn(),
      invokeRoute: jest.fn(),
      ...overrides,
    };
  }

  it('registers plugins and exposes their tool descriptors', async () => {
    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    expect(pluginService.registerPlugin).toHaveBeenCalledWith(
      'builtin.memory-tools',
      'builtin',
      builtinManifest,
    );
    expect(service.listTools()).toEqual([
      {
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        tool: builtinManifest.tools[0],
      },
    ]);
    expect(cronService.onPluginRegistered).toHaveBeenCalledWith(
      'builtin.memory-tools',
      [],
    );
  });

  it('syncs declared cron jobs on register and unregister', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.cron-heartbeat',
      tools: [],
      hooks: [
        {
          name: 'cron:tick',
        },
      ],
      crons: [
        {
          name: 'heartbeat',
          cron: '10s',
          description: '定时写入插件心跳',
        },
      ],
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });
    await service.unregisterPlugin('builtin.cron-heartbeat');

    expect(cronService.onPluginRegistered).toHaveBeenCalledWith(
      'builtin.cron-heartbeat',
      [
        {
          name: 'heartbeat',
          cron: '10s',
          description: '定时写入插件心跳',
        },
      ],
    );
    expect(cronService.onPluginUnregistered).toHaveBeenCalledWith(
      'builtin.cron-heartbeat',
    );
  });

  it('executes a tool through the owning transport with call context', async () => {
    const executeTool = jest.fn().mockResolvedValue({
      saved: true,
    });

    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        executeTool,
      }),
    });

    const result = await service.executeTool({
      pluginId: 'builtin.memory-tools',
      toolName: 'save_memory',
      params: {
        content: '记住我喜欢咖啡',
      },
      context: callContext,
    });

    expect(executeTool).toHaveBeenCalledWith({
      toolName: 'save_memory',
      params: {
        content: '记住我喜欢咖啡',
      },
      context: callContext,
    });
    expect(result).toEqual({
      saved: true,
    });
  });

  it('lists declared routes and invokes them through the owning transport', async () => {
    const invokeRoute = jest.fn().mockResolvedValue({
      status: 200,
      body: {
        ok: true,
      },
    });
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.route-inspector',
      permissions: ['conversation:read', 'user:read'],
      routes: [
        {
          path: 'inspect/context',
          methods: ['GET'],
        },
      ],
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeRoute,
      }),
    });

    expect(service.listRoutes()).toEqual([
      {
        pluginId: 'builtin.route-inspector',
        runtimeKind: 'builtin',
        route: {
          path: 'inspect/context',
          methods: ['GET'],
        },
      },
    ]);

    await expect(
      service.invokeRoute({
        pluginId: 'builtin.route-inspector',
        request: {
          path: 'inspect/context',
          method: 'GET',
          headers: {},
          query: {
            conversationId: 'conversation-1',
          },
          body: null,
        },
        context: {
          source: 'http-route',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      }),
    ).resolves.toEqual({
      status: 200,
      body: {
        ok: true,
      },
    });

    expect(invokeRoute).toHaveBeenCalledWith({
      request: {
        path: 'inspect/context',
        method: 'GET',
        headers: {},
        query: {
          conversationId: 'conversation-1',
        },
        body: null,
      },
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });
  });

  it('runs strong chat:before-model hooks sequentially and applies mutate/pass results', async () => {
    const mutatorManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.a-mutator',
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    };
    const observerManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.b-observer',
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    };
    const extraToolsManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.z-extra-tools',
      hooks: [],
      tools: [
        builtinManifest.tools[0],
        {
          name: 'recall_memory',
          description: '读取记忆',
          parameters: {
            query: {
              type: 'string',
              required: true,
            },
          },
        },
      ],
    };
    const mutateHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      modelId: 'gpt-5.2-mini',
      systemPrompt: '你是一个更谨慎的助手',
      toolNames: ['recall_memory'],
      headers: {
        'x-router': 'enabled',
      },
    });
    const passHook = jest.fn().mockResolvedValue({
      action: 'pass',
    });

    await service.registerPlugin({
      manifest: mutatorManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: mutateHook,
      }),
    });
    await service.registerPlugin({
      manifest: observerManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: passHook,
      }),
    });
    await service.registerPlugin({
      manifest: extraToolsManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    const result = await service.runChatBeforeModelHooks({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '今天我想喝咖啡',
            },
          ],
          availableTools: [
            {
              name: 'save_memory',
              description: '保存记忆',
              parameters: builtinManifest.tools[0].parameters,
              pluginId: 'builtin.z-extra-tools',
              runtimeKind: 'builtin',
            },
            {
              name: 'recall_memory',
              description: '读取记忆',
              parameters: {
                query: {
                  type: 'string',
                  required: true,
                },
              },
              pluginId: 'builtin.z-extra-tools',
              runtimeKind: 'builtin',
            },
          ],
        },
      } as never,
    });

    expect(mutateHook).toHaveBeenCalledWith({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      payload: expect.objectContaining({
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        request: expect.objectContaining({
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
        }),
      }),
    });
    expect(passHook).toHaveBeenCalledWith({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2-mini',
          systemPrompt: '你是一个更谨慎的助手',
          messages: [
            {
              role: 'user',
              content: '今天我想喝咖啡',
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
              pluginId: 'builtin.z-extra-tools',
              runtimeKind: 'builtin',
            },
          ],
          headers: {
            'x-router': 'enabled',
          },
        },
      },
    });
    expect(result).toEqual({
      action: 'continue',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2-mini',
        systemPrompt: '你是一个更谨慎的助手',
        messages: [
          {
            role: 'user',
            content: '今天我想喝咖啡',
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
            pluginId: 'builtin.z-extra-tools',
            runtimeKind: 'builtin',
          },
        ],
        headers: {
          'x-router': 'enabled',
        },
      },
    });
  });

  it('short-circuits chat:before-model and skips later hooks', async () => {
    const shortCircuitManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.a-short-circuit',
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    };
    const skippedManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.b-skipped',
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    };
    const shortCircuitHook = jest.fn().mockResolvedValue({
      action: 'short-circuit',
      assistantContent: '这轮直接返回，不调用模型。',
    });
    const skippedHook = jest.fn();

    await service.registerPlugin({
      manifest: shortCircuitManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: shortCircuitHook,
      }),
    });
    await service.registerPlugin({
      manifest: skippedManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: skippedHook,
      }),
    });

    await expect(
      service.runChatBeforeModelHooks({
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
          request: {
            providerId: 'openai',
            modelId: 'gpt-5.2',
            systemPrompt: '你是 Garlic Claw',
            messages: [],
            availableTools: [],
          },
        },
      } as never),
    ).resolves.toEqual({
      action: 'short-circuit',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        systemPrompt: '你是 Garlic Claw',
        messages: [],
        availableTools: [],
      },
      assistantContent: '这轮直接返回，不调用模型。',
      providerId: 'openai',
      modelId: 'gpt-5.2',
    });

    expect(shortCircuitHook).toHaveBeenCalledTimes(1);
    expect(skippedHook).not.toHaveBeenCalled();
  });

  it('dispatches chat:after-model hooks for completed assistant responses', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.conversation-title',
      permissions: ['conversation:read', 'conversation:write', 'llm:generate'],
      hooks: [
        {
          name: 'chat:after-model',
        },
      ],
    };
    const invokeHook = jest.fn().mockResolvedValue(null);

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook,
      }),
    });

    await service.runChatAfterModelHooks({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        assistantMessageId: 'assistant-1',
        assistantContent: '我已经帮你总结好了。',
        toolCalls: [],
        toolResults: [],
      } satisfies ChatAfterModelHookPayload,
    });

    expect(invokeHook).toHaveBeenCalledWith({
      hookName: 'chat:after-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        assistantMessageId: 'assistant-1',
        assistantContent: '我已经帮你总结好了。',
        toolCalls: [],
        toolResults: [],
      },
    });
  });

  it('filters scoped-out plugins from chat tool exposure', async () => {
    pluginService.registerPlugin.mockResolvedValueOnce({
      configSchema: null,
      resolvedConfig: {},
      scope: {
        defaultEnabled: true,
        conversations: {
          'conversation-1': false,
        },
      },
    });

    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    expect(
      service.listTools({
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      }),
    ).toEqual([]);
    expect(
      service.listTools({
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-2',
      }),
    ).toHaveLength(1);
  });

  it('blocks tool execution when the plugin is disabled in the current conversation', async () => {
    pluginService.registerPlugin.mockResolvedValueOnce({
      configSchema: null,
      resolvedConfig: {},
      scope: {
        defaultEnabled: true,
        conversations: {
          'conversation-1': false,
        },
      },
    });
    const executeTool = jest.fn();

    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        executeTool,
      }),
    });

    await expect(
      service.executeTool({
        pluginId: 'builtin.memory-tools',
        toolName: 'save_memory',
        params: {
          content: '记住我喜欢咖啡',
        },
        context: callContext,
      }),
    ).rejects.toThrow('插件 builtin.memory-tools 在当前作用域已禁用');
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('enforces host permissions before delegating to the host api', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.memory-context',
      permissions: ['config:read'],
      config: memoryContextConfigSchema,
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    hostService.call.mockResolvedValue({
      limit: 5,
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'memory.search',
        params: {
          query: '咖啡',
        },
      }),
    ).rejects.toThrow('插件 builtin.memory-context 缺少权限 memory:read');
    expect(hostService.call).not.toHaveBeenCalled();

    await expect(
      service.callHost({
        pluginId: 'builtin.memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'config.get',
        params: {},
      }),
    ).resolves.toEqual({
      limit: 5,
    });
    expect(hostService.call).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-context',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'config.get',
      params: {},
    });
  });

  it('enforces conversation write and llm generate permissions before host calls', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.conversation-title',
      permissions: ['conversation:read'],
      tools: [],
      hooks: [
        {
          name: 'chat:after-model',
        },
      ],
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.conversation-title',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'conversation.title.set',
        params: {
          title: '咖啡偏好总结',
        },
      }),
    ).rejects.toThrow('插件 builtin.conversation-title 缺少权限 conversation:write');
    await expect(
      service.callHost({
        pluginId: 'builtin.conversation-title',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'llm.generate-text',
        params: {
          prompt: '生成标题',
        },
      }),
    ).rejects.toThrow('插件 builtin.conversation-title 缺少权限 llm:generate');
    expect(hostService.call).not.toHaveBeenCalled();
  });

  it('enforces storage and user permissions before host calls', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.memory-context',
      permissions: ['config:read'],
      tools: [],
      hooks: [],
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
        },
        method: 'storage.get' as never,
        params: {
          key: 'cursor.lastMessageId',
        },
      }),
    ).rejects.toThrow('插件 builtin.memory-context 缺少权限 storage:read');
    await expect(
      service.callHost({
        pluginId: 'builtin.memory-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
        },
        method: 'user.get' as never,
        params: {},
      }),
    ).rejects.toThrow('插件 builtin.memory-context 缺少权限 user:read');
  });

  it('enforces provider read permission before provider host calls', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.provider-router',
      permissions: ['llm:generate'],
      tools: [],
      hooks: [],
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
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
    ).rejects.toThrow('插件 builtin.provider-router 缺少权限 provider:read');
  });

  it('enforces kb read permission before kb host calls', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.kb-context',
      permissions: ['config:read'],
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    hostService.call.mockResolvedValue([
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
      service.callHost({
        pluginId: 'builtin.kb-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'kb.list' as never,
        params: {
          limit: 3,
        },
      }),
    ).rejects.toThrow('插件 builtin.kb-context 缺少权限 kb:read');

    manifest.permissions = ['config:read', 'kb:read'];
    await service.unregisterPlugin('builtin.kb-context');
    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.kb-context',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'kb.list' as never,
        params: {
          limit: 3,
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

    expect(hostService.call).toHaveBeenCalledWith({
      pluginId: 'builtin.kb-context',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'kb.list',
      params: {
        limit: 3,
      },
    });
  });

  it('enforces subagent permission before subagent host calls', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.subagent-delegate',
      permissions: ['config:read'],
      tools: [],
      hooks: [],
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.subagent-delegate',
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'subagent.run' as never,
        params: {
          messages: [
            {
              role: 'user',
              content: '请帮我总结',
            },
          ],
        },
      }),
    ).rejects.toThrow('插件 builtin.subagent-delegate 缺少权限 subagent:run');
  });

  it('runs subagent calls through a tool loop with filtered visible tools', async () => {
    const callerManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.subagent-delegate',
      permissions: ['subagent:run'],
      tools: [
        {
          name: 'delegate_summary',
          description: '委托子代理总结',
          parameters: {
            prompt: {
              type: 'string',
              required: true,
            },
          },
        },
      ],
      hooks: [],
    };
    const memoryManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.memory-tools',
      permissions: ['memory:read'],
      tools: [
        {
          name: 'recall_memory',
          description: '读取记忆',
          parameters: {
            query: {
              type: 'string',
              required: true,
            },
          },
        },
      ],
      hooks: [],
    };
    const memoryToolTransport = createTransport({
      executeTool: jest.fn().mockResolvedValue({
        count: 1,
        memories: [
          {
            content: '用户喜欢咖啡',
          },
        ],
      }),
    });
    aiModelExecution.prepareResolved.mockReturnValue({
      modelConfig: {
        id: 'gpt-5.2',
        providerId: 'openai',
        capabilities: {
          input: { text: true, image: false },
          output: { text: true, image: false },
          reasoning: true,
          toolCall: true,
        },
      },
      model: {
        provider: 'openai',
        modelId: 'gpt-5.2',
      },
      sdkMessages: [],
    });
    aiModelExecution.streamPrepared.mockReturnValue({
      result: {
        fullStream: (async function* () {
          yield {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'recall_memory',
            input: {
              query: '咖啡',
            },
          } as const;
          yield {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'recall_memory',
            output: {
              count: 1,
            },
          } as const;
          yield {
            type: 'text-delta',
            text: '已完成总结',
          } as const;
          yield { type: 'finish' } as const;
        })(),
        finishReason: Promise.resolve('stop'),
      },
    });

    await service.registerPlugin({
      manifest: callerManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });
    await service.registerPlugin({
      manifest: memoryManifest,
      runtimeKind: 'builtin',
      transport: memoryToolTransport,
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.subagent-delegate',
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        method: 'subagent.run' as never,
        params: {
          messages: [
            {
              role: 'user',
              content: '请结合记忆帮我总结',
            },
          ],
          toolNames: ['recall_memory'],
          maxSteps: 4,
        },
      }),
    ).resolves.toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      text: '已完成总结',
      message: {
        role: 'assistant',
        content: '已完成总结',
      },
      finishReason: 'stop',
      toolCalls: [
        {
          toolCallId: 'call-1',
          toolName: 'recall_memory',
          input: {
            query: '咖啡',
          },
        },
      ],
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'recall_memory',
          output: {
            count: 1,
          },
        },
      ],
    });

    expect(Object.keys(aiModelExecution.streamPrepared.mock.calls[0][0].tools)).toEqual([
      'recall_memory',
    ]);

    await aiModelExecution.streamPrepared.mock.calls[0][0].tools.recall_memory.execute({
      query: '咖啡',
    });

    expect(memoryToolTransport.executeTool).toHaveBeenCalledWith({
      toolName: 'recall_memory',
      params: {
        query: '咖啡',
      },
      context: {
        source: 'subagent',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
    });
  });

  it('enforces persona permissions before persona host calls', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.persona-router',
      permissions: ['persona:read'],
      tools: [],
      hooks: [],
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    hostService.call.mockResolvedValue({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: 'Default Assistant',
      prompt: '你是 Garlic Claw',
      isDefault: true,
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.persona-router',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activePersonaId: 'builtin.default-assistant',
        } as never,
        method: 'persona.current.get' as never,
        params: {},
      }),
    ).resolves.toEqual({
      source: 'default',
      personaId: 'builtin.default-assistant',
      name: 'Default Assistant',
      prompt: '你是 Garlic Claw',
      isDefault: true,
    });
    await expect(
      service.callHost({
        pluginId: 'builtin.persona-router',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        } as never,
        method: 'persona.activate' as never,
        params: {
          personaId: 'persona-writer',
        },
      }),
    ).rejects.toThrow('插件 builtin.persona-router 缺少权限 persona:write');

    expect(hostService.call).toHaveBeenCalledWith({
      pluginId: 'builtin.persona-router',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
      },
      method: 'persona.current.get',
      params: {},
    });
  });

  it('enforces cron permissions and delegates cron host calls', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.cron-heartbeat',
      permissions: ['cron:read', 'cron:write'],
      tools: [],
      hooks: [
        {
          name: 'cron:tick',
        },
      ],
    };

    cronService.registerCron.mockResolvedValue({
      id: 'cron-job-1',
      pluginId: 'builtin.cron-heartbeat',
      name: 'heartbeat',
      cron: '10s',
      description: '定时写入插件心跳',
      source: 'host',
      enabled: true,
      data: {
        channel: 'default',
      },
      lastRunAt: null,
      lastError: null,
      lastErrorAt: null,
      createdAt: '2026-03-27T13:00:00.000Z',
      updatedAt: '2026-03-27T13:00:00.000Z',
    });
    cronService.listCronJobs.mockResolvedValue([
      {
        id: 'cron-job-1',
        pluginId: 'builtin.cron-heartbeat',
        name: 'heartbeat',
        cron: '10s',
        description: '定时写入插件心跳',
        source: 'manifest',
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        createdAt: '2026-03-27T13:00:00.000Z',
        updatedAt: '2026-03-27T13:00:00.000Z',
      },
    ]);
    cronService.deleteCron.mockResolvedValue(true);

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.cron-heartbeat',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'cron.register' as never,
        params: {
          name: 'heartbeat',
          cron: '10s',
          description: '定时写入插件心跳',
          data: {
            channel: 'default',
          },
        },
      }),
    ).resolves.toEqual({
      id: 'cron-job-1',
      pluginId: 'builtin.cron-heartbeat',
      name: 'heartbeat',
      cron: '10s',
      description: '定时写入插件心跳',
      source: 'host',
      enabled: true,
      data: {
        channel: 'default',
      },
      lastRunAt: null,
      lastError: null,
      lastErrorAt: null,
      createdAt: '2026-03-27T13:00:00.000Z',
      updatedAt: '2026-03-27T13:00:00.000Z',
    });
    await expect(
      service.callHost({
        pluginId: 'builtin.cron-heartbeat',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'cron.list' as never,
        params: {},
      }),
    ).resolves.toEqual([
      {
        id: 'cron-job-1',
        pluginId: 'builtin.cron-heartbeat',
        name: 'heartbeat',
        cron: '10s',
        description: '定时写入插件心跳',
        source: 'manifest',
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        createdAt: '2026-03-27T13:00:00.000Z',
        updatedAt: '2026-03-27T13:00:00.000Z',
      },
    ]);
    await expect(
      service.callHost({
        pluginId: 'builtin.cron-heartbeat',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'cron.delete' as never,
        params: {
          jobId: 'cron-job-1',
        },
      }),
    ).resolves.toBe(true);

    expect(cronService.registerCron).toHaveBeenCalledWith(
      'builtin.cron-heartbeat',
      {
        name: 'heartbeat',
        cron: '10s',
        description: '定时写入插件心跳',
        data: {
          channel: 'default',
        },
      },
    );
    expect(cronService.listCronJobs).toHaveBeenCalledWith(
      'builtin.cron-heartbeat',
    );
    expect(cronService.deleteCron).toHaveBeenCalledWith(
      'builtin.cron-heartbeat',
      'cron-job-1',
    );
  });

  it('enforces automation permissions and delegates automation host calls', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.automation-tools',
      permissions: ['automation:read', 'automation:write'],
      tools: [
        {
          name: 'create_automation',
          description: '创建自动化',
          parameters: {
            name: {
              type: 'string',
              required: true,
            },
          },
        },
      ],
      hooks: [],
    };

    automationService.create.mockResolvedValue({
      id: 'automation-1',
      name: '咖啡提醒',
      trigger: { type: 'cron', cron: '5m' },
      actions: [
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          params: {
            content: '提醒喝咖啡',
          },
        },
      ],
      enabled: true,
      lastRunAt: null,
      createdAt: '2026-03-27T15:00:00.000Z',
      updatedAt: '2026-03-27T15:00:00.000Z',
    });
    automationService.findAllByUser.mockResolvedValue([
      {
        id: 'automation-1',
        name: '咖啡提醒',
        trigger: { type: 'cron', cron: '5m' },
        actions: [],
        enabled: true,
        lastRunAt: null,
        createdAt: '2026-03-27T15:00:00.000Z',
        updatedAt: '2026-03-27T15:00:00.000Z',
      },
    ]);
    automationService.toggle.mockResolvedValue({
      id: 'automation-1',
      enabled: false,
    });
    automationService.executeAutomation.mockResolvedValue({
      status: 'success',
      results: [
        {
          action: 'device_command',
          plugin: 'builtin.memory-tools',
        },
      ],
    });

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.automation-tools',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'automation.create' as never,
        params: {
          name: '咖啡提醒',
          trigger: {
            type: 'cron',
            cron: '5m',
          },
          actions: [
            {
              type: 'device_command',
              plugin: 'builtin.memory-tools',
              capability: 'save_memory',
              params: {
                content: '提醒喝咖啡',
              },
            },
          ],
        },
      }),
    ).resolves.toEqual({
      id: 'automation-1',
      name: '咖啡提醒',
      trigger: { type: 'cron', cron: '5m' },
      actions: [
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          params: {
            content: '提醒喝咖啡',
          },
        },
      ],
      enabled: true,
      lastRunAt: null,
      createdAt: '2026-03-27T15:00:00.000Z',
      updatedAt: '2026-03-27T15:00:00.000Z',
    });
    await expect(
      service.callHost({
        pluginId: 'builtin.automation-tools',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'automation.list' as never,
        params: {},
      }),
    ).resolves.toEqual([
      {
        id: 'automation-1',
        name: '咖啡提醒',
        trigger: { type: 'cron', cron: '5m' },
        actions: [],
        enabled: true,
        lastRunAt: null,
        createdAt: '2026-03-27T15:00:00.000Z',
        updatedAt: '2026-03-27T15:00:00.000Z',
      },
    ]);
    await expect(
      service.callHost({
        pluginId: 'builtin.automation-tools',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'automation.toggle' as never,
        params: {
          automationId: 'automation-1',
        },
      }),
    ).resolves.toEqual({
      id: 'automation-1',
      enabled: false,
    });
    await expect(
      service.callHost({
        pluginId: 'builtin.automation-tools',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'automation.run' as never,
        params: {
          automationId: 'automation-1',
        },
      }),
    ).resolves.toEqual({
      status: 'success',
      results: [
        {
          action: 'device_command',
          plugin: 'builtin.memory-tools',
        },
      ],
    });

    expect(automationService.create).toHaveBeenCalledWith(
      'user-1',
      '咖啡提醒',
      {
        type: 'cron',
        cron: '5m',
      },
      [
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          params: {
            content: '提醒喝咖啡',
          },
        },
      ],
    );
    expect(automationService.findAllByUser).toHaveBeenCalledWith('user-1');
    expect(automationService.toggle).toHaveBeenCalledWith('automation-1', 'user-1');
    expect(automationService.executeAutomation).toHaveBeenCalledWith('automation-1', 'user-1');
  });

  it('records plugin failures when tool execution throws and keeps later hooks running', async () => {
    const brokenHookManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.broken-hook',
      permissions: ['conversation:read'],
      tools: [],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
    };

    await service.registerPlugin({
      manifest: brokenHookManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        executeTool: jest.fn().mockRejectedValue(new Error('tool exploded')),
        invokeHook: jest.fn().mockRejectedValue(new Error('hook exploded')),
      }),
    });
    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: jest.fn().mockResolvedValue({
          action: 'mutate',
          systemPrompt: '仍然继续执行后续 Hook',
        }),
      }),
    });

    await expect(
      service.executeTool({
        pluginId: 'builtin.broken-hook',
        toolName: 'save_memory',
        params: {
          content: '记住我喜欢咖啡',
        },
        context: callContext,
      }),
    ).rejects.toThrow('tool exploded');
    await expect(
      service.runChatBeforeModelHooks({
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
          request: {
            providerId: 'openai',
            modelId: 'gpt-5.2',
            systemPrompt: '你是 Garlic Claw',
            messages: [],
            availableTools: [],
          },
        } as never,
      }),
    ).resolves.toEqual({
      action: 'continue',
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        systemPrompt: '仍然继续执行后续 Hook',
        messages: [],
        availableTools: [],
      },
    });

    expect(pluginService.recordPluginFailure).toHaveBeenCalledWith(
      'builtin.broken-hook',
      expect.objectContaining({
        type: 'tool:error',
      }),
    );
    expect(pluginService.recordPluginFailure).toHaveBeenCalledWith(
      'builtin.broken-hook',
      expect.objectContaining({
        type: 'hook:error',
      }),
    );
  });
});

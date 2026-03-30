import type {
  ChatAfterModelHookPayload,
  PluginCallContext,
  PluginConfigSchema,
  PluginManifest,
  ResponseAfterSendHookPayload,
} from '@garlic-claw/shared';
import { createAutomationRecorderPlugin } from './builtin/automation-recorder.plugin';
import { BuiltinPluginTransport } from './builtin/builtin-plugin.transport';
import { createMessageEntryRecorderPlugin } from './builtin/message-entry-recorder.plugin';
import { createMessageLifecycleRecorderPlugin } from './builtin/message-lifecycle-recorder.plugin';
import { createPluginGovernanceRecorderPlugin } from './builtin/plugin-governance-recorder.plugin';
import { createResponseRecorderPlugin } from './builtin/response-recorder.plugin';
import { createToolAuditPlugin } from './builtin/tool-audit.plugin';
import { PluginRuntimeService } from './plugin-runtime.service';
import { ChatMessageService } from '../chat/chat-message.service';
import { ToolRegistryService } from '../tool/tool-registry.service';

describe('PluginRuntimeService', () => {
  const pluginService = {
    registerPlugin: jest.fn(),
    setOffline: jest.fn(),
    heartbeat: jest.fn(),
    getGovernanceSnapshot: jest.fn(),
    recordPluginEvent: jest.fn(),
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
    emitEvent: jest.fn(),
  };

  const chatMessageService = {
    getCurrentPluginMessageTarget: jest.fn(),
    sendPluginMessage: jest.fn(),
  };

  const toolRegistry = {
    buildToolSet: jest.fn(),
    listAvailableToolSummaries: jest.fn(),
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
    name: '记忆工具',
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
    moduleRef.get.mockImplementation((token: unknown) => {
      if (token === ChatMessageService) {
        return chatMessageService;
      }
      if (token === ToolRegistryService) {
        return toolRegistry;
      }
      return automationService;
    });
    toolRegistry.buildToolSet.mockResolvedValue(undefined);
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([]);
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
    reload?: jest.Mock;
    reconnect?: jest.Mock;
    checkHealth?: jest.Mock;
    listSupportedActions?: jest.Mock;
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

  it('surfaces transport-declared governance actions in runtime plugin listings', async () => {
    const listSupportedActions = jest.fn().mockReturnValue([
      'health-check',
      'reload',
      'reconnect',
    ]);

    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        listSupportedActions,
      }),
    });

    expect(service.listPlugins()).toEqual([
      expect.objectContaining({
        pluginId: 'builtin.memory-tools',
        supportedActions: ['health-check', 'reload', 'reconnect'],
      }),
    ]);
  });

  it('returns plugin self summaries with runtime-declared governance actions through plugin.self.get', async () => {
    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        listSupportedActions: jest.fn().mockReturnValue([
          'health-check',
          'reload',
        ]),
      }),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.memory-tools',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'plugin.self.get' as never,
        params: {},
      }),
    ).resolves.toEqual({
      id: 'builtin.memory-tools',
      name: '记忆工具',
      runtimeKind: 'builtin',
      version: '1.0.0',
      permissions: ['memory:read', 'memory:write', 'state:read', 'state:write'],
      hooks: [
        {
          name: 'chat:before-model',
        },
      ],
      routes: [],
      supportedActions: ['health-check', 'reload'],
    });
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

  it('applies tool:* hooks around unified tool execution', async () => {
    const beforeHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      params: {
        content: '插件改写后的参数',
      },
    });
    const afterHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      output: {
        saved: true,
        normalized: true,
      },
    });
    const executeTool = jest.fn().mockResolvedValue({
      saved: true,
    });

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-tool-before',
        tools: [],
        hooks: [
          {
            name: 'tool:before-call',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: beforeHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-tool-after',
        tools: [],
        hooks: [
          {
            name: 'tool:after-call',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: afterHook,
      }),
    });
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
          content: '原始参数',
        },
        context: callContext,
      }),
    ).resolves.toEqual({
      saved: true,
      normalized: true,
    });

    expect(executeTool).toHaveBeenCalledWith({
      toolName: 'save_memory',
      params: {
        content: '插件改写后的参数',
      },
      context: callContext,
    });
    expect(afterHook).toHaveBeenCalledWith({
      hookName: 'tool:after-call',
      context: callContext,
      payload: {
        context: callContext,
        source: {
          kind: 'plugin',
          id: 'builtin.memory-tools',
          label: '记忆工具',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
        },
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        tool: {
          ...builtinManifest.tools[0],
          toolId: 'plugin:builtin.memory-tools:save_memory',
          callName: 'save_memory',
        },
        params: {
          content: '插件改写后的参数',
        },
        output: {
          saved: true,
        },
      },
    });
  });

  it('supports tool:before-call short-circuit and skips the target tool execution', async () => {
    const shortCircuitHook = jest.fn().mockResolvedValue({
      action: 'short-circuit',
      output: {
        saved: true,
        source: 'hook',
      },
    });
    const executeTool = jest.fn();

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-tool-short-circuit',
        tools: [],
        hooks: [
          {
            name: 'tool:before-call',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: shortCircuitHook,
      }),
    });
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
          content: '原始参数',
        },
        context: callContext,
      }),
    ).resolves.toEqual({
      saved: true,
      source: 'hook',
    });

    expect(executeTool).not.toHaveBeenCalled();
  });

  it('delegates governance reload and reconnect actions to the owning transport', async () => {
    const reload = jest.fn().mockResolvedValue(undefined);
    const reconnect = jest.fn().mockResolvedValue(undefined);

    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        reload,
        reconnect,
      }),
    });

    await expect(
      (service as any).runPluginAction({
        pluginId: 'builtin.memory-tools',
        action: 'reload',
      }),
    ).resolves.toBeUndefined();
    await expect(
      (service as any).runPluginAction({
        pluginId: 'builtin.memory-tools',
        action: 'reconnect',
      }),
    ).resolves.toBeUndefined();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('returns unhealthy when governance health checks fail or the plugin is offline', async () => {
    const checkHealth = jest.fn().mockResolvedValue({
      ok: false,
    });

    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        checkHealth,
      }),
    });

    await expect(
      (service as any).checkPluginHealth('builtin.memory-tools'),
    ).resolves.toEqual({
      ok: false,
    });
    await expect(
      (service as any).checkPluginHealth('builtin.missing-plugin'),
    ).resolves.toEqual({
      ok: false,
    });

    expect(checkHealth).toHaveBeenCalledTimes(2);
  });

  it('retries one more time when governance health checks fail transiently', async () => {
    const checkHealth = jest.fn()
      .mockRejectedValueOnce(new Error('temporary network error'))
      .mockResolvedValueOnce({
        ok: true,
      });

    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        checkHealth,
      }),
    });

    await expect(
      (service as any).checkPluginHealth('builtin.memory-tools'),
    ).resolves.toEqual({
      ok: true,
    });

    expect(checkHealth).toHaveBeenCalledTimes(2);
  });

  it('touches plugin heartbeat timestamps through the plugin service', async () => {
    pluginService.heartbeat.mockResolvedValue(undefined);

    await expect(
      (service as any).touchPluginHeartbeat('remote.pc-host'),
    ).resolves.toBeUndefined();

    expect(pluginService.heartbeat).toHaveBeenCalledWith('remote.pc-host');
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
      assistantParts: [
        {
          type: 'text',
          text: '这轮直接返回，不调用模型。',
        },
      ],
      providerId: 'openai',
      modelId: 'gpt-5.2',
    });

    expect(shortCircuitHook).toHaveBeenCalledTimes(1);
    expect(skippedHook).not.toHaveBeenCalled();
  });

  it('applies message:received filters and priority before later hooks observe the payload', async () => {
    const routerHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      content: '/route 插件改写后的输入',
      parts: [
        {
          type: 'text',
          text: '/route 插件改写后的输入',
        },
      ],
      modelMessages: [
        {
          role: 'user',
          content: '/route 插件改写后的输入',
        },
      ],
    });
    const observerA = jest.fn().mockResolvedValue({
      action: 'pass',
    });
    const observerB = jest.fn().mockResolvedValue({
      action: 'pass',
    });
    const skippedHook = jest.fn();

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.z-message-router',
        tools: [],
        hooks: [
          {
            name: 'message:received',
            priority: -10,
            filter: {
              message: {
                commands: ['/route'],
              },
            },
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: routerHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-message-observer',
        tools: [],
        hooks: [
          {
            name: 'message:received',
            priority: 5,
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: observerA,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-message-observer',
        tools: [],
        hooks: [
          {
            name: 'message:received',
            priority: 5,
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: observerB,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.image-only-listener',
        tools: [],
        hooks: [
          {
            name: 'message:received',
            filter: {
              message: {
                messageKinds: ['image'],
              },
            },
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: skippedHook,
      }),
    });

    await expect(
      (service as any).runMessageReceivedHooks({
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
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
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
      }),
    ).resolves.toEqual({
      action: 'continue',
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
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

    expect(observerA).toHaveBeenCalledWith({
      hookName: 'message:received',
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
    expect(observerA.mock.invocationCallOrder[0]).toBeLessThan(
      observerB.mock.invocationCallOrder[0],
    );
    expect(skippedHook).not.toHaveBeenCalled();
  });

  it('short-circuits message:received and skips later hooks', async () => {
    const shortCircuitHook = jest.fn().mockResolvedValue({
      action: 'short-circuit',
      assistantContent: '命令已由插件直接处理。',
    });
    const skippedHook = jest.fn();

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-message-short-circuit',
        tools: [],
        hooks: [
          {
            name: 'message:received',
            filter: {
              message: {
                commands: ['/route'],
              },
            },
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: shortCircuitHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-message-skipped',
        tools: [],
        hooks: [
          {
            name: 'message:received',
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: skippedHook,
      }),
    });

    await expect(
      (service as any).runMessageReceivedHooks({
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
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
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
      }),
    ).resolves.toEqual({
      action: 'short-circuit',
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        conversationId: 'conversation-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
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
      assistantParts: [
        {
          type: 'text',
          text: '命令已由插件直接处理。',
        },
      ],
      providerId: 'openai',
      modelId: 'gpt-5.2',
    });

    expect(shortCircuitHook).toHaveBeenCalledTimes(1);
    expect(skippedHook).not.toHaveBeenCalled();
  });

  it('dispatches chat:waiting-model hooks without exposing a mutate contract', async () => {
    const waitingHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      providerId: 'anthropic',
    });

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.waiting-observer',
        tools: [],
        hooks: [
          {
            name: 'chat:waiting-model',
          } as never,
        ],
      } as never,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: waitingHook,
      }),
    });

    await expect(
      (service as any).runChatWaitingModelHooks({
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
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          request: {
            providerId: 'openai',
            modelId: 'gpt-5.2',
            systemPrompt: '你是 Garlic Claw',
            messages: [
              {
                role: 'user',
                content: '今天喝什么',
              },
            ],
            availableTools: [],
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(waitingHook).toHaveBeenCalledWith({
      hookName: 'chat:waiting-model',
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
        conversationId: 'conversation-1',
        assistantMessageId: 'assistant-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '今天喝什么',
            },
          ],
          availableTools: [],
        },
      },
    });
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

    await expect(
      service.runChatAfterModelHooks({
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
          assistantParts: [
            {
              type: 'text',
              text: '我已经帮你总结好了。',
            },
          ],
          toolCalls: [],
          toolResults: [],
        } satisfies ChatAfterModelHookPayload,
      }),
    ).resolves.toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      assistantMessageId: 'assistant-1',
      assistantContent: '我已经帮你总结好了。',
      assistantParts: [
        {
          type: 'text',
          text: '我已经帮你总结好了。',
        },
      ],
      toolCalls: [],
      toolResults: [],
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
        assistantParts: [
          {
            type: 'text',
            text: '我已经帮你总结好了。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });
  });

  it('applies chat:after-model assistant content mutations in sequence', async () => {
    const rewriteHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      assistantContent: '这是插件润色后的最终回复。',
    });
    const observeHook = jest.fn().mockResolvedValue(null);

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-rewrite-after-model',
        tools: [],
        hooks: [
          {
            name: 'chat:after-model',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: rewriteHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-observe-after-model',
        tools: [],
        hooks: [
          {
            name: 'chat:after-model',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: observeHook,
      }),
    });

    await expect(
      service.runChatAfterModelHooks({
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        payload: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          assistantMessageId: 'assistant-1',
          assistantContent: '原始回复。',
          assistantParts: [
            {
              type: 'text',
              text: '原始回复。',
            },
          ],
          toolCalls: [],
          toolResults: [],
        } satisfies ChatAfterModelHookPayload,
      }),
    ).resolves.toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      assistantMessageId: 'assistant-1',
      assistantContent: '这是插件润色后的最终回复。',
      assistantParts: [
        {
          type: 'text',
          text: '原始回复。',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });

    expect(observeHook).toHaveBeenCalledWith({
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
        assistantContent: '这是插件润色后的最终回复。',
        assistantParts: [
          {
            type: 'text',
            text: '原始回复。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      },
    });
  });

  it('dispatches conversation:created hooks after a conversation is created', async () => {
    const invokeHook = jest.fn().mockResolvedValue(null);

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.conversation-observer',
        tools: [],
        hooks: [
          {
            name: 'conversation:created',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook,
      }),
    });

    await expect(
      service.runConversationCreatedHooks({
        context: {
          source: 'http-route',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        payload: {
          context: {
            source: 'http-route',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          conversation: {
            id: 'conversation-1',
            title: '新的对话',
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(invokeHook).toHaveBeenCalledWith({
      hookName: 'conversation:created',
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        context: {
          source: 'http-route',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        conversation: {
          id: 'conversation-1',
          title: '新的对话',
          createdAt: '2026-03-28T10:00:00.000Z',
          updatedAt: '2026-03-28T10:00:00.000Z',
        },
      },
    });
  });

  it('dispatches plugin:loaded and plugin:unloaded hooks around runtime lifecycle', async () => {
    const invokeHook = jest.fn().mockResolvedValue(null);
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.lifecycle-observer',
      tools: [],
      hooks: [
        {
          name: 'plugin:loaded',
        },
        {
          name: 'plugin:unloaded',
        },
      ],
    };

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook,
      }),
    });

    expect(invokeHook).toHaveBeenNthCalledWith(1, {
      hookName: 'plugin:loaded',
      context: {
        source: 'plugin',
      },
      payload: {
        context: {
          source: 'plugin',
        },
        plugin: {
          id: 'builtin.lifecycle-observer',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          manifest,
        },
        loadedAt: expect.any(String),
      },
    });

    await service.unregisterPlugin('builtin.lifecycle-observer');

    expect(invokeHook).toHaveBeenNthCalledWith(2, {
      hookName: 'plugin:unloaded',
      context: {
        source: 'plugin',
      },
      payload: {
        context: {
          source: 'plugin',
        },
        plugin: {
          id: 'builtin.lifecycle-observer',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          manifest,
        },
        unloadedAt: expect.any(String),
      },
    });
  });

  it('applies message:created mutations in sequence', async () => {
    const rewriteHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      content: '插件改写后的输入',
      parts: [
        {
          type: 'text',
          text: '插件改写后的输入',
        },
      ],
      modelMessages: [
        {
          role: 'user',
          content: '插件改写后的输入',
        },
      ],
    });
    const observeHook = jest.fn().mockResolvedValue({
      action: 'pass',
    });

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-message-rewriter',
        tools: [],
        hooks: [
          {
            name: 'message:created',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: rewriteHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-message-observer',
        tools: [],
        hooks: [
          {
            name: 'message:created',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: observeHook,
      }),
    });

    await expect(
      service.runMessageCreatedHooks({
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
          conversationId: 'conversation-1',
          message: {
            role: 'user',
            content: '原始输入',
            parts: [
              {
                type: 'text',
                text: '原始输入',
              },
            ],
            status: 'completed',
          },
          modelMessages: [
            {
              role: 'user',
              content: '原始输入',
            },
          ],
        },
      } as never),
    ).resolves.toEqual({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      conversationId: 'conversation-1',
      message: {
        role: 'user',
        content: '插件改写后的输入',
        parts: [
          {
            type: 'text',
            text: '插件改写后的输入',
          },
        ],
        status: 'completed',
      },
      modelMessages: [
        {
          role: 'user',
          content: '插件改写后的输入',
        },
      ],
    });

    expect(observeHook).toHaveBeenCalledWith({
      hookName: 'message:created',
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
        conversationId: 'conversation-1',
        message: {
          role: 'user',
          content: '插件改写后的输入',
          parts: [
            {
              type: 'text',
              text: '插件改写后的输入',
            },
          ],
          status: 'completed',
        },
        modelMessages: [
          {
            role: 'user',
            content: '插件改写后的输入',
          },
        ],
      },
    });
  });

  it('supports automation:before-run short-circuit and applies automation:after-run mutations', async () => {
    const shortCircuitHook = jest.fn().mockResolvedValue({
      action: 'short-circuit',
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '直接完成',
        },
      ],
    });
    const afterRunHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      results: [
        {
          action: 'hook',
          result: '直接完成',
        },
        {
          action: 'summary',
          result: '插件补充了摘要',
        },
      ],
    });

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-automation-short-circuit',
        tools: [],
        hooks: [
          {
            name: 'automation:before-run',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: shortCircuitHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-automation-after-run',
        tools: [],
        hooks: [
          {
            name: 'automation:after-run',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: afterRunHook,
      }),
    });

    await expect(
      service.runAutomationBeforeRunHooks({
        context: {
          source: 'automation',
          userId: 'user-1',
          automationId: 'automation-1',
        },
        payload: {
          context: {
            source: 'automation',
            userId: 'user-1',
            automationId: 'automation-1',
          },
          automation: {
            id: 'automation-1',
            name: '测试自动化',
            trigger: {
              type: 'manual',
            },
            actions: [],
            enabled: true,
            lastRunAt: null,
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
          },
          actions: [],
        },
      } as never),
    ).resolves.toEqual({
      action: 'short-circuit',
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '直接完成',
        },
      ],
    });

    await expect(
      service.runAutomationAfterRunHooks({
        context: {
          source: 'automation',
          userId: 'user-1',
          automationId: 'automation-1',
        },
        payload: {
          context: {
            source: 'automation',
            userId: 'user-1',
            automationId: 'automation-1',
          },
          automation: {
            id: 'automation-1',
            name: '测试自动化',
            trigger: {
              type: 'manual',
            },
            actions: [],
            enabled: true,
            lastRunAt: null,
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
          },
          status: 'success',
          results: [
            {
              action: 'hook',
              result: '直接完成',
            },
          ],
        },
      } as never),
    ).resolves.toEqual({
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
      automation: {
        id: 'automation-1',
        name: '测试自动化',
        trigger: {
          type: 'manual',
        },
        actions: [],
        enabled: true,
        lastRunAt: null,
        createdAt: '2026-03-28T10:00:00.000Z',
        updatedAt: '2026-03-28T10:00:00.000Z',
      },
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '直接完成',
        },
        {
          action: 'summary',
          result: '插件补充了摘要',
        },
      ],
    });
  });

  it('applies response:before-send mutations and dispatches response:after-send hooks', async () => {
    const beforeSendHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      assistantContent: '发送前统一包装后的回复',
      assistantParts: [
        {
          type: 'image',
          image: 'https://example.com/final.png',
        },
        {
          type: 'text',
          text: '发送前统一包装后的回复',
        },
      ],
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
    });
    const afterSendHook = jest.fn().mockResolvedValue(null);

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.a-response-before-send',
        tools: [],
        hooks: [
          {
            name: 'response:before-send',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: beforeSendHook,
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.b-response-after-send',
        tools: [],
        hooks: [
          {
            name: 'response:after-send',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: afterSendHook,
      }),
    });

    await expect(
      service.runResponseBeforeSendHooks({
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
          responseSource: 'model',
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          assistantContent: '原始最终回复',
          assistantParts: [
            {
              type: 'text',
              text: '原始最终回复',
            },
          ],
          toolCalls: [],
          toolResults: [],
        },
      } as never),
    ).resolves.toEqual({
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      responseSource: 'model',
      assistantMessageId: 'assistant-1',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      assistantContent: '发送前统一包装后的回复',
      assistantParts: [
        {
          type: 'image',
          image: 'https://example.com/final.png',
        },
        {
          type: 'text',
          text: '发送前统一包装后的回复',
        },
      ],
      toolCalls: [],
      toolResults: [],
    });

    await expect(
      service.runResponseAfterSendHooks({
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'anthropic',
          activeModelId: 'claude-3-7-sonnet',
        },
        payload: {
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'anthropic',
            activeModelId: 'claude-3-7-sonnet',
          },
          responseSource: 'model',
          assistantMessageId: 'assistant-1',
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
          assistantContent: '发送前统一包装后的回复',
          assistantParts: [
            {
              type: 'image',
              image: 'https://example.com/final.png',
            },
            {
              type: 'text',
              text: '发送前统一包装后的回复',
            },
          ],
          toolCalls: [],
          toolResults: [],
          sentAt: '2026-03-28T18:30:00.000Z',
        },
      } as never),
    ).resolves.toBeUndefined();

    expect(afterSendHook).toHaveBeenCalledWith({
      hookName: 'response:after-send',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'anthropic',
        activeModelId: 'claude-3-7-sonnet',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'anthropic',
          activeModelId: 'claude-3-7-sonnet',
        },
        responseSource: 'model',
        assistantMessageId: 'assistant-1',
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
        assistantContent: '发送前统一包装后的回复',
        assistantParts: [
          {
            type: 'image',
            image: 'https://example.com/final.png',
          },
          {
            type: 'text',
            text: '发送前统一包装后的回复',
          },
        ],
        toolCalls: [],
        toolResults: [],
        sentAt: '2026-03-28T18:30:00.000Z',
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
      permissions: [],
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
        method: 'message.target.current.get' as never,
        params: {},
      }),
    ).rejects.toThrow('插件 builtin.conversation-title 缺少权限 conversation:read');
    await expect(
      service.callHost({
        pluginId: 'builtin.conversation-title',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'message.send' as never,
        params: {
          content: '插件补充回复',
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
        method: 'conversation.session.start' as never,
        params: {
          timeoutMs: 60000,
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
    expect(chatMessageService.getCurrentPluginMessageTarget).not.toHaveBeenCalled();
    expect(chatMessageService.sendPluginMessage).not.toHaveBeenCalled();
  });

  it('delegates message.target.current.get to the chat message service', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.response-recorder',
      permissions: ['conversation:read'],
      tools: [],
      hooks: [],
    };

    chatMessageService.getCurrentPluginMessageTarget.mockResolvedValue({
      type: 'conversation',
      id: 'conversation-1',
      label: '插件目标会话',
    });

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.response-recorder',
        context: {
          source: 'cron',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        method: 'message.target.current.get' as never,
        params: {},
      }),
    ).resolves.toEqual({
      type: 'conversation',
      id: 'conversation-1',
      label: '插件目标会话',
    });

    expect(chatMessageService.getCurrentPluginMessageTarget).toHaveBeenCalledWith({
      context: {
        source: 'cron',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
    });
    expect(hostService.call).not.toHaveBeenCalled();
  });

  it('delegates message.send to the chat message service', async () => {
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.response-recorder',
      permissions: ['conversation:write'],
      tools: [],
      hooks: [],
    };

    chatMessageService.sendPluginMessage.mockResolvedValue({
      id: 'assistant-message-plugin-1',
      target: {
        type: 'conversation',
        id: 'conversation-2',
        label: '插件目标会话',
      },
      role: 'assistant',
      content: '插件补充回复',
      parts: [
        {
          type: 'text',
          text: '插件补充回复',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
      status: 'completed',
      createdAt: '2026-03-28T10:00:00.000Z',
      updatedAt: '2026-03-28T10:00:00.000Z',
    });

    await service.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await expect(
      service.callHost({
        pluginId: 'builtin.response-recorder',
        context: {
          source: 'cron',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        method: 'message.send' as never,
        params: {
          target: {
            type: 'conversation',
            id: 'conversation-2',
          },
          content: '插件补充回复',
          parts: [
            {
              type: 'text',
              text: '插件补充回复',
            },
          ],
          provider: 'openai',
          model: 'gpt-5.2',
        },
      }),
    ).resolves.toEqual({
      id: 'assistant-message-plugin-1',
      target: {
        type: 'conversation',
        id: 'conversation-2',
        label: '插件目标会话',
      },
      role: 'assistant',
      content: '插件补充回复',
      parts: [
        {
          type: 'text',
          text: '插件补充回复',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
      status: 'completed',
      createdAt: '2026-03-28T10:00:00.000Z',
      updatedAt: '2026-03-28T10:00:00.000Z',
    });

    expect(chatMessageService.sendPluginMessage).toHaveBeenCalledWith({
      context: {
        source: 'cron',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      target: {
        type: 'conversation',
        id: 'conversation-2',
      },
      content: '插件补充回复',
      parts: [
        {
          type: 'text',
          text: '插件补充回复',
        },
      ],
      provider: 'openai',
      model: 'gpt-5.2',
    });
    expect(hostService.call).not.toHaveBeenCalled();
  });

  it('starts, keeps, reads, and finishes conversation sessions through host calls', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-28T12:00:00.000Z'));

    try {
      const manifest: PluginManifest = {
        ...builtinManifest,
        id: 'builtin.idiom-session',
        permissions: ['conversation:write'],
        tools: [],
        hooks: [
          {
            name: 'message:received',
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
          pluginId: 'builtin.idiom-session',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          method: 'conversation.session.start' as never,
          params: {
            timeoutMs: 60000,
            captureHistory: true,
            metadata: {
              flow: 'idiom',
            },
          },
        }),
      ).resolves.toEqual({
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 60000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:00.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
        metadata: {
          flow: 'idiom',
        },
      });

      jest.advanceTimersByTime(10000);

      await expect(
        service.callHost({
          pluginId: 'builtin.idiom-session',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          method: 'conversation.session.keep' as never,
          params: {
            timeoutMs: 30000,
            resetTimeout: false,
          },
        }),
      ).resolves.toEqual({
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 80000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:30.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
        metadata: {
          flow: 'idiom',
        },
      });

      await expect(
        service.callHost({
          pluginId: 'builtin.idiom-session',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          method: 'conversation.session.get' as never,
          params: {},
        }),
      ).resolves.toEqual({
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 80000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:30.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
        metadata: {
          flow: 'idiom',
        },
      });

      await expect(
        service.callHost({
          pluginId: 'builtin.idiom-session',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          method: 'conversation.session.finish' as never,
          params: {},
        }),
      ).resolves.toBe(true);

      await expect(
        service.callHost({
          pluginId: 'builtin.idiom-session',
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          method: 'conversation.session.get' as never,
          params: {},
        }),
      ).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('routes message:received through the active conversation session before later hooks', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-28T12:00:00.000Z'));

    try {
      const sessionHook = jest.fn().mockResolvedValue({
        action: 'mutate',
        content: '会话插件接管后的输入',
        parts: [
          {
            type: 'text',
            text: '会话插件接管后的输入',
          },
        ],
        modelMessages: [
          {
            role: 'user',
            content: '会话插件接管后的输入',
          },
        ],
      });
      const skippedHook = jest.fn();

      await service.registerPlugin({
        manifest: {
          ...builtinManifest,
          id: 'builtin.idiom-session',
          permissions: ['conversation:write'],
          tools: [],
          hooks: [
            {
              name: 'message:received',
            },
          ],
        } as never,
        runtimeKind: 'builtin',
        transport: createTransport({
          invokeHook: sessionHook,
        }),
      });
      await service.registerPlugin({
        manifest: {
          ...builtinManifest,
          id: 'builtin.message-observer',
          tools: [],
          hooks: [
            {
              name: 'message:received',
            },
          ],
        } as never,
        runtimeKind: 'builtin',
        transport: createTransport({
          invokeHook: skippedHook,
        }),
      });

      await service.callHost({
        pluginId: 'builtin.idiom-session',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'conversation.session.start' as never,
        params: {
          timeoutMs: 60000,
          captureHistory: true,
        },
      });

      await expect(
        (service as any).runMessageReceivedHooks({
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
            conversationId: 'conversation-1',
            providerId: 'openai',
            modelId: 'gpt-5.2',
            message: {
              role: 'user',
              content: '一马当先',
              parts: [
                {
                  type: 'text',
                  text: '一马当先',
                },
              ],
            },
            modelMessages: [
              {
                role: 'user',
                content: '一马当先',
              },
            ],
          },
        }),
      ).resolves.toEqual({
        action: 'continue',
        payload: {
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'openai',
            activeModelId: 'gpt-5.2',
          },
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          session: {
            pluginId: 'builtin.idiom-session',
            conversationId: 'conversation-1',
            timeoutMs: 60000,
            startedAt: '2026-03-28T12:00:00.000Z',
            expiresAt: '2026-03-28T12:01:00.000Z',
            lastMatchedAt: '2026-03-28T12:00:00.000Z',
            captureHistory: true,
            historyMessages: [
              {
                role: 'user',
                content: '一马当先',
                parts: [
                  {
                    type: 'text',
                    text: '一马当先',
                  },
                ],
              },
            ],
          },
          message: {
            role: 'user',
            content: '会话插件接管后的输入',
            parts: [
              {
                type: 'text',
                text: '会话插件接管后的输入',
              },
            ],
          },
          modelMessages: [
            {
              role: 'user',
              content: '会话插件接管后的输入',
            },
          ],
        },
      });

      expect(sessionHook).toHaveBeenCalledWith({
        hookName: 'message:received',
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
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          session: {
            pluginId: 'builtin.idiom-session',
            conversationId: 'conversation-1',
            timeoutMs: 60000,
            startedAt: '2026-03-28T12:00:00.000Z',
            expiresAt: '2026-03-28T12:01:00.000Z',
            lastMatchedAt: '2026-03-28T12:00:00.000Z',
            captureHistory: true,
            historyMessages: [
              {
                role: 'user',
                content: '一马当先',
                parts: [
                  {
                    type: 'text',
                    text: '一马当先',
                  },
                ],
              },
            ],
          },
          message: {
            role: 'user',
            content: '一马当先',
            parts: [
              {
                type: 'text',
                text: '一马当先',
              },
            ],
          },
          modelMessages: [
            {
              role: 'user',
              content: '一马当先',
            },
          ],
        },
      });
      expect(skippedHook).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('lists active conversation sessions for governance and can force-finish them by plugin ownership', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-28T12:00:00.000Z'));

    try {
      await service.registerPlugin({
        manifest: {
          ...builtinManifest,
          id: 'builtin.idiom-session',
          permissions: ['conversation:write'],
          tools: [],
          hooks: [
            {
              name: 'message:received',
            },
          ],
        } as never,
        runtimeKind: 'builtin',
        transport: createTransport(),
      });
      await service.registerPlugin({
        manifest: {
          ...builtinManifest,
          id: 'builtin.second-session',
          permissions: ['conversation:write'],
          tools: [],
          hooks: [
            {
              name: 'message:received',
            },
          ],
        } as never,
        runtimeKind: 'builtin',
        transport: createTransport(),
      });

      await service.callHost({
        pluginId: 'builtin.idiom-session',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        method: 'conversation.session.start' as never,
        params: {
          timeoutMs: 60000,
          captureHistory: true,
          metadata: {
            flow: 'idiom',
          },
        },
      });
      await service.callHost({
        pluginId: 'builtin.second-session',
        context: {
          source: 'chat-hook',
          userId: 'user-2',
          conversationId: 'conversation-2',
        },
        method: 'conversation.session.start' as never,
        params: {
          timeoutMs: 120000,
          captureHistory: false,
        },
      });

      expect((service as any).listConversationSessions('builtin.idiom-session')).toEqual([
        {
          pluginId: 'builtin.idiom-session',
          conversationId: 'conversation-1',
          timeoutMs: 60000,
          startedAt: '2026-03-28T12:00:00.000Z',
          expiresAt: '2026-03-28T12:01:00.000Z',
          lastMatchedAt: null,
          captureHistory: true,
          historyMessages: [],
          metadata: {
            flow: 'idiom',
          },
        },
      ]);
      expect((service as any).listConversationSessions()).toEqual([
        expect.objectContaining({
          pluginId: 'builtin.idiom-session',
          conversationId: 'conversation-1',
        }),
        expect.objectContaining({
          pluginId: 'builtin.second-session',
          conversationId: 'conversation-2',
        }),
      ]);

      expect(
        (service as any).finishConversationSessionForGovernance(
          'builtin.idiom-session',
          'conversation-1',
        ),
      ).toBe(true);
      expect((service as any).listConversationSessions('builtin.idiom-session')).toEqual([]);
      expect(
        (service as any).finishConversationSessionForGovernance(
          'builtin.idiom-session',
          'conversation-2',
        ),
      ).toBe(false);
    } finally {
      jest.useRealTimers();
    }
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

  it('enforces log write permission before log.write host calls', async () => {
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
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'log.write' as never,
        params: {
          level: 'info',
          message: '插件已启动',
        },
      }),
    ).rejects.toThrow('插件 builtin.memory-context 缺少权限 log:write');

    expect(hostService.call).not.toHaveBeenCalled();
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
    const recallMemoryTool = {
      description: '读取记忆',
      inputSchema: undefined,
      execute: jest.fn().mockImplementation((params) =>
        memoryToolTransport.executeTool({
          toolName: 'recall_memory',
          params,
          context: {
            source: 'subagent',
            userId: 'user-1',
            conversationId: 'conversation-1',
            activeProviderId: 'openai',
            activeModelId: 'gpt-5.2',
            activePersonaId: 'builtin.default-assistant',
          },
        })),
    };
    toolRegistry.buildToolSet.mockResolvedValue({
      recall_memory: recallMemoryTool,
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

  it('runs subagent lifecycle hooks around subagent.run and applies their mutations', async () => {
    const beforeHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      system: '你是更谨慎的子代理',
      toolNames: ['recall_memory'],
      maxSteps: 2,
    });
    const afterHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      text: '已被 after hook 改写',
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'recall_memory',
          output: {
            count: 2,
          },
        },
      ],
    });

    aiModelExecution.resolveModelConfig.mockReturnValue({
      id: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      capabilities: {
        input: { text: true, image: false },
        output: { text: true, image: false },
        reasoning: true,
        toolCall: true,
      },
    });
    aiModelExecution.prepareResolved.mockReturnValue({
      modelConfig: {
        id: 'claude-3-7-sonnet',
        providerId: 'anthropic',
        capabilities: {
          input: { text: true, image: false },
          output: { text: true, image: false },
          reasoning: true,
          toolCall: true,
        },
      },
      model: {
        provider: 'anthropic',
        modelId: 'claude-3-7-sonnet',
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
            text: '原始子代理回复',
          } as const;
          yield { type: 'finish' } as const;
        })(),
        finishReason: Promise.resolve('stop'),
      },
    });

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.subagent-observer',
        tools: [],
        hooks: [
          {
            name: 'subagent:before-run',
          },
          {
            name: 'subagent:after-run',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: jest.fn()
          .mockImplementationOnce(beforeHook)
          .mockImplementationOnce(afterHook),
      }),
    });
    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.subagent-delegate',
        permissions: ['subagent:run'],
        tools: [],
        hooks: [],
      },
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
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        method: 'subagent.run' as never,
        params: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          messages: [
            {
              role: 'user',
              content: '请帮我总结',
            },
          ],
          maxSteps: 4,
        },
      }),
    ).resolves.toEqual({
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      text: '已被 after hook 改写',
      message: {
        role: 'assistant',
        content: '已被 after hook 改写',
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
            count: 2,
          },
        },
      ],
    });

    expect(beforeHook).toHaveBeenCalledWith({
      hookName: 'subagent:before-run',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        pluginId: 'builtin.subagent-delegate',
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          messages: [
            {
              role: 'user',
              content: '请帮我总结',
            },
          ],
          maxSteps: 4,
        },
      },
    });
    expect(afterHook).toHaveBeenCalledWith({
      hookName: 'subagent:after-run',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        context: {
          source: 'plugin',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
          activePersonaId: 'builtin.default-assistant',
        },
        pluginId: 'builtin.subagent-delegate',
        request: {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
          system: '你是更谨慎的子代理',
          messages: [
            {
              role: 'user',
              content: '请帮我总结',
            },
          ],
          toolNames: ['recall_memory'],
          maxSteps: 2,
        },
        result: {
          providerId: 'anthropic',
          modelId: 'claude-3-7-sonnet',
          text: '原始子代理回复',
          message: {
            role: 'assistant',
            content: '原始子代理回复',
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
        },
      },
    });
    expect(aiModelExecution.resolveModelConfig).toHaveBeenCalledWith(
      'anthropic',
      'claude-3-7-sonnet',
    );
    expect(aiModelExecution.streamPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        system: '你是更谨慎的子代理',
        stopWhen: expect.anything(),
      }),
    );
  });

  it('builds subagent-visible tools through ToolRegistryService instead of the legacy plugin helper path', async () => {
    const recallMemoryTool = {
      description: '读取记忆',
      inputSchema: undefined,
      execute: jest.fn().mockResolvedValue({
        count: 1,
      }),
    };

    toolRegistry.buildToolSet.mockResolvedValue({
      recall_memory: recallMemoryTool,
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
      manifest: {
        ...builtinManifest,
        id: 'builtin.subagent-delegate',
        permissions: ['subagent:run'],
        tools: [
          {
            name: 'delegate_work',
            description: '委派工作',
            parameters: {},
          },
        ],
        hooks: [],
      },
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await service.callHost({
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
            content: '请结合工具帮我总结',
          },
        ],
        toolNames: ['recall_memory'],
      },
    });

    expect(toolRegistry.buildToolSet).toHaveBeenCalledWith({
      context: {
        source: 'subagent',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      allowedToolNames: ['recall_memory'],
      excludedSources: [
        {
          kind: 'plugin',
          id: 'builtin.subagent-delegate',
        },
      ],
    });

    expect(aiModelExecution.streamPrepared).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: {
          recall_memory: recallMemoryTool,
        },
      }),
    );
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
    automationService.emitEvent.mockResolvedValue({
      event: 'coffee.ready',
      matchedAutomationIds: ['automation-1'],
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
    await expect(
      service.callHost({
        pluginId: 'builtin.automation-tools',
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'automation.event.emit' as never,
        params: {
          event: 'coffee.ready',
        },
      }),
    ).resolves.toEqual({
      event: 'coffee.ready',
      matchedAutomationIds: ['automation-1'],
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
    expect(automationService.emitEvent).toHaveBeenCalledWith('coffee.ready', 'user-1');
  });

  it('records plugin failures when tool execution throws and keeps later hooks running', async () => {
    const brokenHookManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.broken-hook',
      permissions: [...builtinManifest.permissions],
      tools: [...builtinManifest.tools],
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

  it('dispatches plugin:error hooks after tool failures are recorded', async () => {
    const observeHook = jest.fn().mockResolvedValue(null);
    const brokenManifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.broken-tool',
      hooks: [],
    };

    await service.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.error-observer',
        tools: [],
        hooks: [
          {
            name: 'plugin:error',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook: observeHook,
      }),
    });
    await service.registerPlugin({
      manifest: brokenManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        executeTool: jest.fn().mockRejectedValue(new Error('tool exploded')),
      }),
    });

    await expect(
      service.executeTool({
        pluginId: 'builtin.broken-tool',
        toolName: 'save_memory',
        params: {
          content: '记住我喜欢咖啡',
        },
        context: callContext,
      }),
    ).rejects.toThrow('tool exploded');

    expect(observeHook).toHaveBeenCalledWith({
      hookName: 'plugin:error',
      context: callContext,
      payload: {
        context: callContext,
        plugin: {
          id: 'builtin.broken-tool',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          manifest: brokenManifest,
        },
        error: {
          type: 'tool:error',
          message: 'tool exploded',
          metadata: {
            toolName: 'save_memory',
          },
        },
        occurredAt: expect.any(String),
      },
    });
  });

  it('runs builtin automation:after-run consumers through the unified host api facade', async () => {
    const definition = createAutomationRecorderPlugin();
    const hookContext = {
      source: 'automation' as const,
      userId: 'user-1',
      automationId: 'automation-1',
    };
    const payload = {
      context: hookContext,
      automation: {
        id: 'automation-1',
        name: '咖啡提醒',
        trigger: {
          type: 'manual' as const,
        },
        actions: [],
        enabled: true,
        lastRunAt: null,
        createdAt: '2026-03-28T12:00:00.000Z',
        updatedAt: '2026-03-28T12:00:00.000Z',
      },
      status: 'success',
      results: [
        {
          action: 'device_command',
          plugin: 'builtin.memory-tools',
        },
      ],
    };

    hostService.call
      .mockResolvedValueOnce({
        automationId: 'automation-1',
        automationName: '咖啡提醒',
        status: 'success',
        triggerType: 'manual',
        resultCount: 1,
      })
      .mockResolvedValueOnce(true);

    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    await expect(
      service.runAutomationAfterRunHooks({
        context: hookContext,
        payload,
      }),
    ).resolves.toEqual(payload);

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.automation-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'automation.automation-1.last-run',
        value: {
          automationId: 'automation-1',
          automationName: '咖啡提醒',
          status: 'success',
          triggerType: 'manual',
          resultCount: 1,
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.automation-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'automation:observed',
        message: '自动化 咖啡提醒 执行完成：success',
        metadata: {
          automationId: 'automation-1',
          automationName: '咖啡提醒',
          status: 'success',
          triggerType: 'manual',
          resultCount: 1,
        },
      },
    });
  });

  it('runs builtin conversation/message lifecycle consumers through the unified host api facade', async () => {
    const definition = createMessageLifecycleRecorderPlugin();
    const conversationContext = {
      source: 'http-route' as const,
      userId: 'user-1',
      conversationId: 'conversation-1',
    };
    const messageContext = {
      source: 'chat-hook' as const,
      userId: 'user-1',
      conversationId: 'conversation-1',
      activeProviderId: 'openai',
      activeModelId: 'gpt-5.2',
    };

    hostService.call
      .mockResolvedValueOnce({
        conversationId: 'conversation-1',
        titleLength: 4,
        userId: 'user-1',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        eventType: 'message:created',
        conversationId: 'conversation-1',
        messageId: null,
        role: 'user',
        contentLength: 4,
        partsCount: 1,
        status: 'completed',
        userId: 'user-1',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        eventType: 'message:updated',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        role: 'assistant',
        contentLength: 6,
        partsCount: 1,
        status: 'completed',
        userId: 'user-1',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        eventType: 'message:deleted',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        role: 'assistant',
        contentLength: 6,
        partsCount: 1,
        status: 'completed',
        userId: 'user-1',
      })
      .mockResolvedValueOnce(true);

    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    await expect(
      service.runConversationCreatedHooks({
        context: conversationContext,
        payload: {
          context: conversationContext,
          conversation: {
            id: 'conversation-1',
            title: '新的对话',
            createdAt: '2026-03-28T12:00:00.000Z',
            updatedAt: '2026-03-28T12:00:00.000Z',
          },
        },
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.runMessageCreatedHooks({
        context: messageContext,
        payload: {
          context: messageContext,
          conversationId: 'conversation-1',
          message: {
            role: 'user',
            content: '原始输入',
            parts: [
              {
                type: 'text',
                text: '原始输入',
              },
            ],
            status: 'completed',
          },
          modelMessages: [
            {
              role: 'user',
              content: '原始输入',
            },
          ],
        },
      } as never),
    ).resolves.toEqual({
      context: messageContext,
      conversationId: 'conversation-1',
      message: {
        role: 'user',
        content: '原始输入',
        parts: [
          {
            type: 'text',
            text: '原始输入',
          },
        ],
        status: 'completed',
      },
      modelMessages: [
        {
          role: 'user',
          content: '原始输入',
        },
      ],
    });

    await expect(
      service.runMessageUpdatedHooks({
        context: messageContext,
        payload: {
          context: messageContext,
          conversationId: 'conversation-1',
          messageId: 'message-1',
          currentMessage: {
            id: 'message-1',
            role: 'assistant',
            content: '旧回复',
            parts: [
              {
                type: 'text',
                text: '旧回复',
              },
            ],
            status: 'completed',
          },
          nextMessage: {
            id: 'message-1',
            role: 'assistant',
            content: '更新后的回复',
            parts: [
              {
                type: 'text',
                text: '更新后的回复',
              },
            ],
            status: 'completed',
          },
        },
      } as never),
    ).resolves.toEqual({
      context: messageContext,
      conversationId: 'conversation-1',
      messageId: 'message-1',
      currentMessage: {
        id: 'message-1',
        role: 'assistant',
        content: '旧回复',
        parts: [
          {
            type: 'text',
            text: '旧回复',
          },
        ],
        status: 'completed',
      },
      nextMessage: {
        id: 'message-1',
        role: 'assistant',
        content: '更新后的回复',
        parts: [
          {
            type: 'text',
            text: '更新后的回复',
          },
        ],
        status: 'completed',
      },
    });

    await expect(
      service.runMessageDeletedHooks({
        context: messageContext,
        payload: {
          context: messageContext,
          conversationId: 'conversation-1',
          messageId: 'message-1',
          message: {
            id: 'message-1',
            role: 'assistant',
            content: '更新后的回复',
            parts: [
              {
                type: 'text',
                text: '更新后的回复',
              },
            ],
            status: 'completed',
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: conversationContext,
      method: 'storage.set',
      params: {
        key: 'conversation.conversation-1.last-created',
        value: {
          conversationId: 'conversation-1',
          titleLength: 4,
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: conversationContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'conversation:observed',
        message: '会话 conversation-1 已创建',
        metadata: {
          conversationId: 'conversation-1',
          titleLength: 4,
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'storage.set',
      params: {
        key: 'conversation.conversation-1.last-message-created',
        value: {
          eventType: 'message:created',
          conversationId: 'conversation-1',
          messageId: null,
          role: 'user',
          contentLength: 4,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'message:observed',
        message: '会话 conversation-1 已创建一条 user 消息',
        metadata: {
          eventType: 'message:created',
          conversationId: 'conversation-1',
          messageId: null,
          role: 'user',
          contentLength: 4,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(5, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'storage.set',
      params: {
        key: 'message.message-1.last-updated',
        value: {
          eventType: 'message:updated',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          role: 'assistant',
          contentLength: 6,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(6, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'message:observed',
        message: '消息 message-1 已更新',
        metadata: {
          eventType: 'message:updated',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          role: 'assistant',
          contentLength: 6,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(7, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'storage.set',
      params: {
        key: 'message.message-1.last-deleted',
        value: {
          eventType: 'message:deleted',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          role: 'assistant',
          contentLength: 6,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(8, {
      pluginId: 'builtin.message-lifecycle-recorder',
      context: messageContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'message:observed',
        message: '消息 message-1 已删除',
        metadata: {
          eventType: 'message:deleted',
          conversationId: 'conversation-1',
          messageId: 'message-1',
          role: 'assistant',
          contentLength: 6,
          partsCount: 1,
          status: 'completed',
          userId: 'user-1',
        },
      },
    });
  });

  it('runs builtin message entry consumers through the unified host api facade', async () => {
    const definition = createMessageEntryRecorderPlugin();
    const hookContext = {
      source: 'chat-hook' as const,
      userId: 'user-1',
      conversationId: 'conversation-1',
      activeProviderId: 'openai',
      activeModelId: 'gpt-5.2',
    };

    hostService.call.mockResolvedValue(true);

    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    hostService.call.mockReset();
    hostService.call.mockResolvedValue(true);

    await expect(
      (service as any).runMessageReceivedHooks({
        context: hookContext,
        payload: {
          context: hookContext,
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
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
      }),
    ).resolves.toEqual({
      action: 'continue',
      payload: {
        context: hookContext,
        conversationId: 'conversation-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
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
    });

    await expect(
      (service as any).runChatWaitingModelHooks({
        context: hookContext,
        payload: {
          context: hookContext,
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          request: {
            providerId: 'openai',
            modelId: 'gpt-5.2',
            systemPrompt: '你是 Garlic Claw',
            messages: [
              {
                role: 'user',
                content: '/route 原始输入',
              },
            ],
            availableTools: [
              {
                name: 'save_memory',
                description: '保存记忆',
                parameters: builtinManifest.tools[0].parameters,
                pluginId: 'builtin.memory-tools',
                runtimeKind: 'builtin',
              },
            ],
          },
        },
      }),
    ).resolves.toBeUndefined();

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.message-entry-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'message.received.last-entry',
        value: {
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          contentLength: 11,
          partsCount: 1,
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.message-entry-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'message:received:observed',
        message: '会话 conversation-1 收到一条待处理用户消息',
        metadata: {
          conversationId: 'conversation-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          contentLength: 11,
          partsCount: 1,
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.message-entry-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'message.waiting.last-model-request',
        value: {
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          messageCount: 1,
          toolCount: 1,
          userId: 'user-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.message-entry-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'chat:waiting-model:observed',
        message: '会话 conversation-1 即将进入模型调用',
        metadata: {
          conversationId: 'conversation-1',
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          messageCount: 1,
          toolCount: 1,
          userId: 'user-1',
        },
      },
    });
  });

  it('runs builtin tool:after-call consumers through the unified host api facade', async () => {
    const definition = createToolAuditPlugin();
    const payload = {
      context: callContext,
      source: {
        kind: 'plugin' as const,
        id: 'builtin.memory-tools',
        label: '记忆工具',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin' as const,
      },
      pluginId: 'builtin.memory-tools',
      runtimeKind: 'builtin' as const,
      tool: {
        ...builtinManifest.tools[0],
        toolId: 'plugin:builtin.memory-tools:save_memory',
        callName: 'save_memory',
      },
      params: {
        content: '记住我喜欢咖啡',
      },
      output: {
        saved: true,
      },
    };

    hostService.call
      .mockResolvedValueOnce({
        sourceKind: 'plugin',
        sourceId: 'builtin.memory-tools',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        toolId: 'plugin:builtin.memory-tools:save_memory',
        callName: 'save_memory',
        toolName: 'save_memory',
        callSource: 'chat-tool',
        paramKeys: ['content'],
        outputKind: 'object',
        userId: 'user-1',
        conversationId: 'conversation-1',
      })
      .mockResolvedValueOnce(true);

    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    await expect(
      service.runToolAfterCallHooks({
        context: callContext,
        payload,
      }),
    ).resolves.toEqual(payload);

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.tool-audit',
      context: callContext,
      method: 'storage.set',
      params: {
        key: 'tool.builtin.memory-tools.save_memory.last-call',
        value: {
          sourceKind: 'plugin',
          sourceId: 'builtin.memory-tools',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          toolId: 'plugin:builtin.memory-tools:save_memory',
          callName: 'save_memory',
          toolName: 'save_memory',
          callSource: 'chat-tool',
          paramKeys: ['content'],
          outputKind: 'object',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.tool-audit',
      context: callContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'tool:observed',
        message: '工具 builtin.memory-tools:save_memory 执行完成',
        metadata: {
          sourceKind: 'plugin',
          sourceId: 'builtin.memory-tools',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          toolId: 'plugin:builtin.memory-tools:save_memory',
          callName: 'save_memory',
          toolName: 'save_memory',
          callSource: 'chat-tool',
          paramKeys: ['content'],
          outputKind: 'object',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      },
    });
  });

  it('runs builtin response:after-send consumers through the unified host api facade', async () => {
    const definition = createResponseRecorderPlugin();
    const hookContext = {
      source: 'chat-hook' as const,
      userId: 'user-1',
      conversationId: 'conversation-1',
    };
    const payload: ResponseAfterSendHookPayload = {
      context: hookContext,
      responseSource: 'model' as const,
      assistantMessageId: 'assistant-1',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      assistantContent: 'Coffee saved.',
      toolCalls: [
        {
          toolCallId: 'call-1',
          toolName: 'save_memory',
          input: {
            content: '记住咖啡偏好',
          },
        },
      ],
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'save_memory',
          output: {
            saved: true,
          },
        },
      ],
      assistantParts: [
        {
          type: 'text',
          text: '咖啡偏好已保存。',
        },
      ],
      sentAt: '2026-03-28T12:34:56.000Z',
    };

    hostService.call
      .mockResolvedValueOnce({
        assistantMessageId: 'assistant-1',
        providerId: 'openai',
        modelId: 'gpt-5.2',
        responseSource: 'model',
        contentLength: 13,
        toolCallCount: 1,
        toolResultCount: 1,
        sentAt: '2026-03-28T12:34:56.000Z',
        userId: 'user-1',
        conversationId: 'conversation-1',
      })
      .mockResolvedValueOnce(true);

    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    await expect(
      service.runResponseAfterSendHooks({
        context: hookContext,
        payload,
      }),
    ).resolves.toBeUndefined();

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.response-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'response.assistant-1.last-sent',
        value: {
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          responseSource: 'model',
          contentLength: 13,
          toolCallCount: 1,
          toolResultCount: 1,
          sentAt: '2026-03-28T12:34:56.000Z',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.response-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'response:sent',
        message: '回复 assistant-1 已发送 (model)',
        metadata: {
          assistantMessageId: 'assistant-1',
          providerId: 'openai',
          modelId: 'gpt-5.2',
          responseSource: 'model',
          contentLength: 13,
          toolCallCount: 1,
          toolResultCount: 1,
          sentAt: '2026-03-28T12:34:56.000Z',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      },
    });
  });

  it('runs builtin plugin:* governance consumers through the unified host api facade', async () => {
    const definition = createPluginGovernanceRecorderPlugin();
    const hookContext = {
      source: 'plugin' as const,
    };

    hostService.call.mockResolvedValue(true);
    await service.registerPlugin({
      manifest: definition.manifest,
      runtimeKind: 'builtin',
      transport: new BuiltinPluginTransport(definition, {
        call: (input) => service.callHost(input),
      }),
    });

    hostService.call.mockReset();
    hostService.call
      .mockResolvedValueOnce({
        eventType: 'plugin:loaded',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        deviceType: 'builtin',
        errorType: null,
        errorMessage: null,
        occurredAt: '2026-03-28T12:00:00.000Z',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        eventType: 'plugin:unloaded',
        pluginId: 'remote.pc-host',
        runtimeKind: 'remote',
        deviceType: 'pc',
        errorType: null,
        errorMessage: null,
        occurredAt: '2026-03-28T12:05:00.000Z',
      })
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce({
        eventType: 'plugin:error',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        deviceType: 'builtin',
        errorType: 'tool:error',
        errorMessage: 'tool exploded',
        occurredAt: '2026-03-28T12:10:00.000Z',
      })
      .mockResolvedValueOnce(true);

    await expect(
      service.runPluginLoadedHooks({
        context: hookContext,
        payload: {
          context: hookContext,
          plugin: {
            id: 'builtin.memory-tools',
            runtimeKind: 'builtin',
            deviceType: 'builtin',
            manifest: builtinManifest,
          },
          loadedAt: '2026-03-28T12:00:00.000Z',
        },
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.runPluginUnloadedHooks({
        context: hookContext,
        payload: {
          context: hookContext,
          plugin: {
            id: 'remote.pc-host',
            runtimeKind: 'remote',
            deviceType: 'pc',
            manifest: null,
          },
          unloadedAt: '2026-03-28T12:05:00.000Z',
        },
      }),
    ).resolves.toBeUndefined();

    await expect(
      service.runPluginErrorHooks({
        context: hookContext,
        payload: {
          context: hookContext,
          plugin: {
            id: 'builtin.memory-tools',
            runtimeKind: 'builtin',
            deviceType: 'builtin',
            manifest: builtinManifest,
          },
          error: {
            type: 'tool:error',
            message: 'tool exploded',
            metadata: {
              toolName: 'save_memory',
            },
          },
          occurredAt: '2026-03-28T12:10:00.000Z',
        },
      }),
    ).resolves.toBeUndefined();

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'plugin.builtin.memory-tools.last-governance-event',
        value: {
          eventType: 'plugin:loaded',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          errorType: null,
          errorMessage: null,
          occurredAt: '2026-03-28T12:00:00.000Z',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'plugin:observed',
        message: '插件 builtin.memory-tools 已加载',
        metadata: {
          eventType: 'plugin:loaded',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          errorType: null,
          errorMessage: null,
          occurredAt: '2026-03-28T12:00:00.000Z',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'plugin.remote.pc-host.last-governance-event',
        value: {
          eventType: 'plugin:unloaded',
          pluginId: 'remote.pc-host',
          runtimeKind: 'remote',
          deviceType: 'pc',
          errorType: null,
          errorMessage: null,
          occurredAt: '2026-03-28T12:05:00.000Z',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'info',
        type: 'plugin:observed',
        message: '插件 remote.pc-host 已卸载',
        metadata: {
          eventType: 'plugin:unloaded',
          pluginId: 'remote.pc-host',
          runtimeKind: 'remote',
          deviceType: 'pc',
          errorType: null,
          errorMessage: null,
          occurredAt: '2026-03-28T12:05:00.000Z',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(5, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'storage.set',
      params: {
        key: 'plugin.builtin.memory-tools.last-governance-event',
        value: {
          eventType: 'plugin:error',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          errorType: 'tool:error',
          errorMessage: 'tool exploded',
          occurredAt: '2026-03-28T12:10:00.000Z',
        },
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(6, {
      pluginId: 'builtin.plugin-governance-recorder',
      context: hookContext,
      method: 'log.write',
      params: {
        level: 'warn',
        type: 'plugin:observed',
        message: '插件 builtin.memory-tools 发生失败：tool:error',
        metadata: {
          eventType: 'plugin:error',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          errorType: 'tool:error',
          errorMessage: 'tool exploded',
          occurredAt: '2026-03-28T12:10:00.000Z',
        },
      },
    });
  });

  it('rejects plugin tool calls when the runtime concurrency limit is reached and releases slots afterward', async () => {
    let resolveToolCall!: (value: { saved: boolean }) => void;
    const pendingToolCall = new Promise<{ saved: boolean }>((resolve) => {
      resolveToolCall = resolve;
    });
    let invocationCount = 0;
    const executeTool = jest.fn().mockImplementation(() => {
      invocationCount += 1;
      if (invocationCount === 1) {
        return pendingToolCall;
      }

      return Promise.resolve({
        saved: false,
      });
    });

    pluginService.registerPlugin.mockResolvedValueOnce({
      configSchema: null,
      resolvedConfig: {
        maxConcurrentExecutions: 1,
      },
      scope: {
        defaultEnabled: true,
        conversations: {},
      },
    });

    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        executeTool,
      }),
    });

    const firstCall = service.executeTool({
      pluginId: 'builtin.memory-tools',
      toolName: 'save_memory',
      params: {
        content: '先占住一个执行槽位',
      },
      context: callContext,
    });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    expect(service.listPlugins()).toEqual([
      expect.objectContaining({
        pluginId: 'builtin.memory-tools',
        runtimePressure: {
          activeExecutions: 1,
          maxConcurrentExecutions: 1,
        },
      }),
    ]);

    try {
      await expect(
        service.executeTool({
          pluginId: 'builtin.memory-tools',
          toolName: 'save_memory',
          params: {
            content: '第二次调用应被拒绝',
          },
          context: callContext,
        }),
      ).rejects.toThrow('插件 builtin.memory-tools 当前执行并发已达上限，请稍后重试');

      expect(pluginService.recordPluginEvent).toHaveBeenCalledWith(
        'builtin.memory-tools',
        expect.objectContaining({
          type: 'tool:overloaded',
          level: 'warn',
          metadata: expect.objectContaining({
            toolName: 'save_memory',
            activeExecutions: 1,
            maxConcurrentExecutions: 1,
          }),
        }),
      );
    } finally {
      resolveToolCall({
        saved: true,
      });
      await expect(firstCall).resolves.toEqual({
        saved: true,
      });
    }

    expect(service.listPlugins()).toEqual([
      expect.objectContaining({
        pluginId: 'builtin.memory-tools',
        runtimePressure: {
          activeExecutions: 0,
          maxConcurrentExecutions: 1,
        },
      }),
    ]);
  });
});

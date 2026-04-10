import type {
  PluginManifest,
} from '@garlic-claw/shared';
import {
  createPluginRuntimeSpecFixture,
  type PluginRuntimeSpecFixture,
} from './plugin-runtime.spec-fixture';

describe('PluginRuntimeService', () => {
  let service: PluginRuntimeSpecFixture['service'];
  let pluginService: PluginRuntimeSpecFixture['pluginService'];
  let callContext: PluginRuntimeSpecFixture['callContext'];
  let builtinManifest: PluginRuntimeSpecFixture['builtinManifest'];
  let createTransport: PluginRuntimeSpecFixture['createTransport'];

  beforeEach(() => {
    ({
      service,
      pluginService,
      callContext,
      builtinManifest,
      createTransport,
    } = createPluginRuntimeSpecFixture());
  });

  it('registers plugins and exposes their tool descriptors', async () => {
    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    expect(service.listTools()).toEqual([
      {
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
        tool: builtinManifest.tools[0],
      },
    ]);
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

  it('filters scoped-out plugins from chat tool exposure', async () => {
    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
      governance: {
        configSchema: null,
        resolvedConfig: {},
        scope: {
          defaultEnabled: true,
          conversations: {
            'conversation-1': false,
          },
        },
      },
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
    const executeTool = jest.fn();

    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        executeTool,
      }),
      governance: {
        configSchema: null,
        resolvedConfig: {},
        scope: {
          defaultEnabled: true,
          conversations: {
            'conversation-1': false,
          },
        },
      },
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
      service.runHook({
        hookName: 'chat:before-model',
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

    await service.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        executeTool,
      }),
      governance: {
        configSchema: null,
        resolvedConfig: {
          maxConcurrentExecutions: 1,
        },
        scope: {
          defaultEnabled: true,
          conversations: {},
        },
      },
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

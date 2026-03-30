import type { PluginCallContext } from '@garlic-claw/shared';
import { ToolGovernanceService } from './tool-governance.service';
import { ToolRegistryService } from './tool-registry.service';
import type { ToolProvider, ToolProviderTool } from './tool.types';

describe('ToolRegistryService', () => {
  const context: PluginCallContext = {
    source: 'chat-tool',
    userId: 'user-1',
    conversationId: 'conversation-1',
    activeProviderId: 'openai',
    activeModelId: 'gpt-5.2',
    activePersonaId: 'builtin.default-assistant',
  };

  function createProvider(
    kind: ToolProvider['kind'],
    tools: ToolProviderTool[],
    executeTool = jest.fn(),
  ): ToolProvider {
    return {
      kind,
      listSources: jest.fn().mockResolvedValue(
        [...new Map(
          tools.map((tool) => [
            `${tool.source.kind}:${tool.source.id}`,
            tool.source,
          ]),
        ).values()],
      ),
      listTools: jest.fn().mockResolvedValue(tools),
      executeTool,
    };
  }

  function createPluginRuntime() {
    return {
      runToolBeforeCallHooks: jest.fn().mockImplementation(async (input) => ({
        action: 'continue',
        payload: input.payload,
      })),
      runToolAfterCallHooks: jest.fn().mockImplementation(async (input) => input.payload),
    };
  }

  it('merges plugin and mcp tools into unified summaries with stable ids and call names', async () => {
    const pluginProvider = createProvider('plugin', [
      {
        source: {
          kind: 'plugin',
          id: 'builtin.memory-tools',
          label: '记忆工具',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T08:00:00.000Z',
        },
        name: 'save_memory',
        description: '保存记忆',
        parameters: {
          content: {
            type: 'string',
            required: true,
          },
        },
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
      {
        source: {
          kind: 'plugin',
          id: 'remote.pc-host',
          label: '电脑助手',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T08:01:00.000Z',
        },
        name: 'take_screenshot',
        description: '截图',
        parameters: {},
        pluginId: 'remote.pc-host',
        runtimeKind: 'remote',
      },
    ]);
    const mcpProvider = createProvider('mcp', [
      {
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T08:02:00.000Z',
        },
        name: 'get_forecast',
        description: '获取天气预报',
        parameters: {
          city: {
            type: 'string',
            required: true,
          },
        },
      },
    ]);
    const service = new ToolRegistryService(
      new ToolGovernanceService(),
      {
        getSourceEnabled: jest.fn(),
        getToolEnabled: jest.fn(),
      } as never,
      createPluginRuntime() as never,
      pluginProvider as never,
      mcpProvider as never,
    );

    await expect(
      service.listAvailableToolSummaries({
        context,
      }),
    ).resolves.toEqual([
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
        name: 'remote.pc-host__take_screenshot',
        callName: 'remote.pc-host__take_screenshot',
        toolId: 'plugin:remote.pc-host:take_screenshot',
        description: '[插件：remote.pc-host] 截图',
        parameters: {},
        sourceKind: 'plugin',
        sourceId: 'remote.pc-host',
        pluginId: 'remote.pc-host',
        runtimeKind: 'remote',
      },
      {
        name: 'mcp__weather__get_forecast',
        callName: 'mcp__weather__get_forecast',
        toolId: 'mcp:weather:get_forecast',
        description: '[MCP：weather] 获取天气预报',
        parameters: {
          city: {
            type: 'string',
            required: true,
          },
        },
        sourceKind: 'mcp',
        sourceId: 'weather',
      },
    ]);
  });

  it('builds filtered AI tool sets and executes through the owning provider', async () => {
    const pluginExecuteTool = jest.fn()
      .mockResolvedValueOnce({
        count: 1,
      });
    const mcpExecuteTool = jest.fn()
      .mockResolvedValueOnce({
        weather: 'sunny',
      });
    const pluginProvider = createProvider(
      'plugin',
      [
        {
          source: {
            kind: 'plugin',
            id: 'builtin.subagent-delegate',
            label: '子代理委派',
            enabled: true,
            health: 'healthy',
            lastError: null,
            lastCheckedAt: '2026-03-30T09:00:00.000Z',
          },
          name: 'delegate_work',
          description: '委派工作',
          parameters: {},
          pluginId: 'builtin.subagent-delegate',
          runtimeKind: 'builtin',
        },
        {
          source: {
            kind: 'plugin',
            id: 'builtin.memory-tools',
            label: '记忆工具',
            enabled: true,
            health: 'healthy',
            lastError: null,
            lastCheckedAt: '2026-03-30T09:01:00.000Z',
          },
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
      pluginExecuteTool,
    );
    const mcpProvider = createProvider(
      'mcp',
      [
        {
          source: {
            kind: 'mcp',
            id: 'weather',
            label: 'weather',
            enabled: true,
            health: 'healthy',
            lastError: null,
            lastCheckedAt: '2026-03-30T09:02:00.000Z',
          },
          name: 'get_forecast',
          description: '获取天气预报',
          parameters: {
            city: {
              type: 'string',
              required: true,
            },
          },
        },
      ],
      mcpExecuteTool,
    );
    const service = new ToolRegistryService(
      new ToolGovernanceService(),
      {
        getSourceEnabled: jest.fn(),
        getToolEnabled: jest.fn(),
      } as never,
      createPluginRuntime() as never,
      pluginProvider as never,
      mcpProvider as never,
    );

    const toolSet = await service.buildToolSet({
      context,
      allowedToolNames: ['recall_memory', 'mcp__weather__get_forecast'],
      excludedSources: [
        {
          kind: 'plugin',
          id: 'builtin.subagent-delegate',
        },
      ],
    });

    expect(toolSet).toBeDefined();
    expect(Object.keys(toolSet ?? {})).toEqual([
      'recall_memory',
      'mcp__weather__get_forecast',
    ]);
    const executableToolSet = toolSet as Record<string, { execute: (args: unknown) => Promise<unknown> }>;

    await executableToolSet.recall_memory.execute({
      query: '咖啡',
    });
    await executableToolSet.mcp__weather__get_forecast.execute({
      city: 'Shanghai',
    });

    expect(pluginExecuteTool).toHaveBeenCalledWith({
      tool: expect.objectContaining({
        name: 'recall_memory',
        pluginId: 'builtin.memory-tools',
      }),
      params: {
        query: '咖啡',
      },
      context,
      skipLifecycleHooks: true,
    });
    expect(mcpExecuteTool).toHaveBeenCalledWith({
      tool: expect.objectContaining({
        name: 'get_forecast',
        source: expect.objectContaining({
          kind: 'mcp',
          id: 'weather',
        }),
      }),
      params: {
        city: 'Shanghai',
      },
      context,
      skipLifecycleHooks: false,
    });
  });

  it('applies persisted source and tool enabled overrides to governance listings', async () => {
    const pluginProvider = createProvider('plugin', [
      {
        source: {
          kind: 'plugin',
          id: 'builtin.memory-tools',
          label: '记忆工具',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T13:00:00.000Z',
        },
        name: 'save_memory',
        description: '保存记忆',
        parameters: {},
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin',
      },
    ]);
    const service = new ToolRegistryService(
      new ToolGovernanceService(),
      {
        getSourceEnabled: jest.fn().mockImplementation((kind: string, id: string) =>
          kind === 'plugin' && id === 'builtin.memory-tools' ? false : undefined),
        getToolEnabled: jest.fn().mockImplementation((toolId: string) =>
          toolId === 'plugin:builtin.memory-tools:save_memory' ? false : undefined),
      } as never,
      createPluginRuntime() as never,
      pluginProvider as never,
      createProvider('mcp', []) as never,
    );

    await expect(service.listSources()).resolves.toEqual([
      expect.objectContaining({
        kind: 'plugin',
        id: 'builtin.memory-tools',
        enabled: false,
        totalTools: 1,
        enabledTools: 0,
      }),
    ]);
    await expect(service.listToolInfos()).resolves.toEqual([
      expect.objectContaining({
        toolId: 'plugin:builtin.memory-tools:save_memory',
        enabled: false,
      }),
    ]);
    await expect(
      service.listAvailableToolSummaries({
        context,
      }),
    ).resolves.toEqual([]);
  });

  it('runs unified tool lifecycle hooks around MCP tools through the registry', async () => {
    const mcpExecuteTool = jest.fn().mockResolvedValue({
      weather: 'sunny',
    });
    const pluginRuntime = createPluginRuntime();
    pluginRuntime.runToolBeforeCallHooks.mockImplementation(async (input) => ({
      action: 'continue',
      payload: {
        ...input.payload,
        params: {
          city: 'Suzhou',
        },
      },
    }));
    pluginRuntime.runToolAfterCallHooks.mockImplementation(async (input) => ({
      ...input.payload,
      output: {
        ...(input.payload.output as Record<string, unknown>),
        audited: true,
      },
    }));
    const service = new ToolRegistryService(
      new ToolGovernanceService(),
      {
        getSourceEnabled: jest.fn(),
        getToolEnabled: jest.fn(),
      } as never,
      pluginRuntime as never,
      createProvider('plugin', []) as never,
      createProvider('mcp', [
        {
          source: {
            kind: 'mcp',
            id: 'weather',
            label: 'weather',
            enabled: true,
            health: 'healthy',
            lastError: null,
            lastCheckedAt: '2026-03-30T17:00:00.000Z',
          },
          name: 'get_forecast',
          description: '获取天气预报',
          parameters: {
            city: {
              type: 'string',
              required: true,
            },
          },
        },
      ], mcpExecuteTool) as never,
    );

    const toolSet = await service.buildToolSet({
      context,
      allowedToolNames: ['mcp__weather__get_forecast'],
    });
    const executableToolSet = toolSet as Record<string, { execute: (args: unknown) => Promise<unknown> }>;

    await expect(
      executableToolSet.mcp__weather__get_forecast.execute({
        city: 'Shanghai',
      }),
    ).resolves.toEqual({
      weather: 'sunny',
      audited: true,
    });

    expect(pluginRuntime.runToolBeforeCallHooks).toHaveBeenCalledWith({
      context,
      payload: {
        context,
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
        },
        tool: {
          toolId: 'mcp:weather:get_forecast',
          callName: 'mcp__weather__get_forecast',
          name: 'get_forecast',
          description: '[MCP：weather] 获取天气预报',
          parameters: {
            city: {
              type: 'string',
              required: true,
            },
          },
        },
        params: {
          city: 'Shanghai',
        },
      },
    });
    expect(mcpExecuteTool).toHaveBeenCalledWith({
      tool: expect.objectContaining({
        name: 'get_forecast',
      }),
      params: {
        city: 'Suzhou',
      },
      context,
      skipLifecycleHooks: false,
    });
  });
});

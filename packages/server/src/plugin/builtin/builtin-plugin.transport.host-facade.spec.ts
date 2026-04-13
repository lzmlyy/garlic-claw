import { createAutomationToolsPlugin } from './automation-tools.plugin';
import { createSubagentDelegatePlugin } from './subagent-delegate.plugin';
import {
  BuiltinPluginTransport,
  type BuiltinPluginDefinition,
} from './builtin-plugin.transport';

describe('BuiltinPluginTransport host facade', () => {
  const hostService = {
    call: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exposes plugin log writing through the host facade', async () => {
    hostService.call.mockResolvedValue(true);

    const definition: BuiltinPluginDefinition = {
      manifest: {
        id: 'builtin.logger',
        name: 'Logger',
        version: '1.0.0',
        runtime: 'builtin',
        permissions: ['log:write' as never],
        tools: [
          {
            name: 'emit_log',
            description: '写入插件日志',
            parameters: {},
          },
        ],
      },
      tools: {
        emit_log: async (_params, { host }) =>
          (host as any).writeLog({
            level: 'warn',
            type: 'plugin:test',
            message: 'builtin logger emitted a warning',
            metadata: {
              source: 'emit_log',
            },
          }),
      },
    };

    const transport = new BuiltinPluginTransport(
      definition,
      hostService as never,
    );

    await expect(
      transport.executeTool({
        toolName: 'emit_log',
        params: {},
        context: {
          source: 'chat-tool',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      }),
    ).resolves.toBe(true);

    expect(hostService.call).toHaveBeenCalledWith({
      pluginId: 'builtin.logger',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'log.write',
      params: {
        level: 'warn',
        type: 'plugin:test',
        message: 'builtin logger emitted a warning',
        metadata: {
          source: 'emit_log',
        },
      },
    });
  });

  it('exposes plugin log listing through the host facade', async () => {
    hostService.call.mockResolvedValue({
      items: [
        {
          id: 'event-1',
          type: 'plugin:test',
          level: 'info',
          message: 'builtin logger listed logs',
          metadata: null,
          createdAt: '2026-04-01T08:10:00.000Z',
        },
      ],
      nextCursor: null,
    });

    const definition: BuiltinPluginDefinition = {
      manifest: {
        id: 'builtin.logger',
        name: 'Logger',
        version: '1.0.0',
        runtime: 'builtin',
        permissions: ['log:read' as never],
        tools: [
          {
            name: 'list_logs',
            description: '读取插件日志',
            parameters: {},
          },
        ],
      },
      tools: {
        list_logs: async (_params, { host }) =>
          (host as any).listLogs({
            limit: 10,
            level: 'info',
          }),
      },
    };

    const transport = new BuiltinPluginTransport(
      definition,
      hostService as never,
    );

    await expect(
      transport.executeTool({
        toolName: 'list_logs',
        params: {},
        context: {
          source: 'chat-tool',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'event-1',
          type: 'plugin:test',
          level: 'info',
          message: 'builtin logger listed logs',
          metadata: null,
          createdAt: '2026-04-01T08:10:00.000Z',
        },
      ],
      nextCursor: null,
    });

    expect(hostService.call).toHaveBeenCalledWith({
      pluginId: 'builtin.logger',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'log.list',
      params: {
        limit: 10,
        level: 'info',
      },
    });
  });

  it('exposes cron helpers through the host facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        id: 'cron-job-1',
        pluginId: 'builtin.cron-heartbeat',
        name: 'heartbeat',
        cron: '10s',
        description: '定时写入插件心跳',
        source: 'host',
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        createdAt: '2026-03-27T13:00:00.000Z',
        updatedAt: '2026-03-27T13:00:00.000Z',
      })
      .mockResolvedValueOnce([
        {
          id: 'cron-job-1',
          pluginId: 'builtin.cron-heartbeat',
          name: 'heartbeat',
          cron: '10s',
          description: '定时写入插件心跳',
          source: 'host',
          enabled: true,
          lastRunAt: null,
          lastError: null,
          lastErrorAt: null,
          createdAt: '2026-03-27T13:00:00.000Z',
          updatedAt: '2026-03-27T13:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce(true);

    const definition: BuiltinPluginDefinition = {
      manifest: {
        id: 'builtin.cron-heartbeat',
        name: '定时心跳',
        version: '1.0.0',
        runtime: 'builtin',
        permissions: ['cron:read', 'cron:write'],
        tools: [
          {
            name: 'manage_cron',
            description: '管理插件 cron',
            parameters: {},
          },
        ],
        hooks: [
          {
            name: 'cron:tick',
          },
        ],
      },
      tools: {
        manage_cron: async (_params, { host }) =>
          ({
            registered: await host.registerCron({
              name: 'heartbeat',
              cron: '10s',
              description: '定时写入插件心跳',
            }),
            jobs: await host.listCrons(),
            deleted: await host.deleteCron('cron-job-1'),
          }) as never,
      },
    };

    const transport = new BuiltinPluginTransport(
      definition,
      hostService as never,
    );

    const result = await transport.executeTool({
      toolName: 'manage_cron',
      params: {},
      context: {
        source: 'plugin',
        userId: 'user-1',
      },
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.cron-heartbeat',
      context: {
        source: 'plugin',
        userId: 'user-1',
      },
      method: 'cron.register',
      params: {
        name: 'heartbeat',
        cron: '10s',
        description: '定时写入插件心跳',
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.cron-heartbeat',
      context: {
        source: 'plugin',
        userId: 'user-1',
      },
      method: 'cron.list',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.cron-heartbeat',
      context: {
        source: 'plugin',
        userId: 'user-1',
      },
      method: 'cron.delete',
      params: {
        jobId: 'cron-job-1',
      },
    });
    expect(result).toEqual({
      registered: {
        id: 'cron-job-1',
        pluginId: 'builtin.cron-heartbeat',
        name: 'heartbeat',
        cron: '10s',
        description: '定时写入插件心跳',
        source: 'host',
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        createdAt: '2026-03-27T13:00:00.000Z',
        updatedAt: '2026-03-27T13:00:00.000Z',
      },
      jobs: [
        {
          id: 'cron-job-1',
          pluginId: 'builtin.cron-heartbeat',
          name: 'heartbeat',
          cron: '10s',
          description: '定时写入插件心跳',
          source: 'host',
          enabled: true,
          lastRunAt: null,
          lastError: null,
          lastErrorAt: null,
          createdAt: '2026-03-27T13:00:00.000Z',
          updatedAt: '2026-03-27T13:00:00.000Z',
        },
      ],
      deleted: true,
    });
  });

  it('exposes automation helpers through the host facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        id: 'automation-1',
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
          },
        ],
        enabled: true,
        lastRunAt: null,
        createdAt: '2026-03-27T15:00:00.000Z',
        updatedAt: '2026-03-27T15:00:00.000Z',
      })
      .mockResolvedValueOnce([
        {
          id: 'automation-1',
          name: '咖啡提醒',
          trigger: {
            type: 'cron',
            cron: '5m',
          },
          actions: [],
          enabled: true,
          lastRunAt: null,
          createdAt: '2026-03-27T15:00:00.000Z',
          updatedAt: '2026-03-27T15:00:00.000Z',
        },
      ])
      .mockResolvedValueOnce({
        id: 'automation-1',
        enabled: false,
      })
      .mockResolvedValueOnce({
        status: 'success',
        results: [
          {
            action: 'device_command',
            plugin: 'builtin.memory-tools',
          },
        ],
      })
      .mockResolvedValueOnce({
        event: 'coffee.ready',
        matchedAutomationIds: ['automation-1'],
      });

    const transport = new BuiltinPluginTransport(
      createAutomationToolsPlugin(),
      hostService as never,
    );

    const created = await transport.executeTool({
      toolName: 'create_automation',
      params: {
        name: '咖啡提醒',
        triggerType: 'cron',
        cronInterval: '5m',
        actions: [
          {
            type: 'device_command',
            plugin: 'builtin.memory-tools',
            capability: 'save_memory',
          },
        ],
      },
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });
    const listed = await transport.executeTool({
      toolName: 'list_automations',
      params: {},
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });
    const toggled = await transport.executeTool({
      toolName: 'toggle_automation',
      params: {
        automationId: 'automation-1',
      },
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });
    const ran = await transport.executeTool({
      toolName: 'run_automation',
      params: {
        automationId: 'automation-1',
      },
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });
    const emitted = await transport.executeTool({
      toolName: 'emit_automation_event',
      params: {
        event: 'coffee.ready',
      },
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.automation-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'automation.create',
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
          },
        ],
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.automation-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'automation.list',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.automation-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'automation.toggle',
      params: {
        automationId: 'automation-1',
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.automation-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'automation.run',
      params: {
        automationId: 'automation-1',
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(5, {
      pluginId: 'builtin.automation-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'automation.event.emit',
      params: {
        event: 'coffee.ready',
      },
    });
    expect(created).toEqual({
      created: true,
      id: 'automation-1',
      name: '咖啡提醒',
    });
    expect(listed).toEqual([
      {
        id: 'automation-1',
        name: '咖啡提醒',
        trigger: {
          type: 'cron',
          cron: '5m',
        },
        enabled: true,
        lastRunAt: null,
      },
    ]);
    expect(toggled).toEqual({
      id: 'automation-1',
      enabled: false,
    });
    expect(ran).toEqual({
      status: 'success',
      results: [
        {
          action: 'device_command',
          plugin: 'builtin.memory-tools',
        },
      ],
    });
    expect(emitted).toEqual({
      event: 'coffee.ready',
      matchedAutomationIds: ['automation-1'],
    });
  });

  it('exposes persona helpers through the host facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        source: 'conversation',
        personaId: 'persona-writer',
        name: 'Writer',
        prompt: '你是一个偏文学表达的写作助手。',
        description: '更偏文学润色',
        isDefault: false,
      })
      .mockResolvedValueOnce([
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
      ])
      .mockResolvedValueOnce({
        id: 'persona-writer',
        name: 'Writer',
        prompt: '你是一个偏文学表达的写作助手。',
        description: '更偏文学润色',
        isDefault: false,
        createdAt: '2026-03-27T14:01:00.000Z',
        updatedAt: '2026-03-27T14:01:00.000Z',
      })
      .mockResolvedValueOnce({
        source: 'conversation',
        personaId: 'persona-writer',
        name: 'Writer',
        prompt: '你是一个偏文学表达的写作助手。',
        description: '更偏文学润色',
        isDefault: false,
      });

    const definition: BuiltinPluginDefinition = {
      manifest: {
        id: 'builtin.persona-router',
        name: '人设路由',
        version: '1.0.0',
        runtime: 'builtin',
        permissions: ['persona:read', 'persona:write'],
        tools: [
          {
            name: 'inspect_persona',
            description: '读取并切换当前 persona',
            parameters: {},
          },
        ],
      },
      tools: {
        inspect_persona: async (_params, { host }) =>
          ({
            current: await host.getCurrentPersona(),
            personas: await host.listPersonas(),
            selected: await host.getPersona('persona-writer'),
            activated: await host.activatePersona('persona-writer'),
          }) as never,
      },
    };

    const transport = new BuiltinPluginTransport(
      definition,
      hostService as never,
    );

    const result = await transport.executeTool({
      toolName: 'inspect_persona',
      params: {},
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
      },
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.persona-router',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
      },
      method: 'persona.current.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.persona-router',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
      },
      method: 'persona.list',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.persona-router',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
      },
      method: 'persona.get',
      params: {
        personaId: 'persona-writer',
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.persona-router',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
      },
      method: 'persona.activate',
      params: {
        personaId: 'persona-writer',
      },
    });
    expect(result).toEqual({
      current: {
        source: 'conversation',
        personaId: 'persona-writer',
        name: 'Writer',
        prompt: '你是一个偏文学表达的写作助手。',
        description: '更偏文学润色',
        isDefault: false,
      },
      personas: [
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
      ],
      selected: {
        id: 'persona-writer',
        name: 'Writer',
        prompt: '你是一个偏文学表达的写作助手。',
        description: '更偏文学润色',
        isDefault: false,
        createdAt: '2026-03-27T14:01:00.000Z',
        updatedAt: '2026-03-27T14:01:00.000Z',
      },
      activated: {
        source: 'conversation',
        personaId: 'persona-writer',
        name: 'Writer',
        prompt: '你是一个偏文学表达的写作助手。',
        description: '更偏文学润色',
        isDefault: false,
      },
    });
  });

  it('exposes subagent helpers through the host facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        targetProviderId: 'openai',
        targetModelId: 'gpt-5.2-mini',
        allowedToolNames: 'recall_memory',
      })
      .mockResolvedValueOnce({
        providerId: 'openai',
        modelId: 'gpt-5.2-mini',
        text: '已完成子任务总结',
        message: {
          role: 'assistant',
          content: '已完成子任务总结',
        },
        finishReason: 'stop',
        toolCalls: [],
        toolResults: [],
      });

    const transport = new BuiltinPluginTransport(
      createSubagentDelegatePlugin(),
      hostService as never,
    );

    const result = await transport.executeTool({
      toolName: 'delegate_summary',
      params: {
        prompt: '请结合当前可用工具做一个简短总结',
      },
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.subagent-delegate',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'config.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.subagent-delegate',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'subagent.run',
      params: {
        providerId: 'openai',
        modelId: 'gpt-5.2-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请结合当前可用工具做一个简短总结',
              },
            ],
          },
        ],
        toolNames: ['recall_memory'],
        maxSteps: 4,
      },
    });
    expect(result).toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2-mini',
      text: '已完成子任务总结',
      toolCalls: [],
      toolResults: [],
      finishReason: 'stop',
    });
  });

  it('exposes background subagent task helpers through the host facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        targetProviderId: 'openai',
        targetModelId: 'gpt-5.2-mini',
      })
      .mockResolvedValueOnce({
        id: 'subagent-task-1',
        pluginId: 'builtin.subagent-delegate',
        runtimeKind: 'builtin',
        status: 'queued',
        requestPreview: '请后台处理这条任务',
        writeBackStatus: 'pending',
        requestedAt: '2026-04-03T10:00:00.000Z',
        startedAt: null,
        finishedAt: null,
      });

    const transport = new BuiltinPluginTransport(
      createSubagentDelegatePlugin(),
      hostService as never,
    );

    const result = await transport.executeTool({
      toolName: 'delegate_summary_background',
      params: {
        prompt: '请后台处理这条任务',
        writeBack: true,
      },
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.subagent-delegate',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'config.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.subagent-delegate',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'subagent.task.start',
      params: {
        providerId: 'openai',
        modelId: 'gpt-5.2-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请后台处理这条任务',
              },
            ],
          },
        ],
        maxSteps: 4,
        writeBack: {
          target: {
            type: 'conversation',
            id: 'conversation-1',
          },
        },
      },
    });
    expect(result).toEqual({
      id: 'subagent-task-1',
      pluginId: 'builtin.subagent-delegate',
      runtimeKind: 'builtin',
      status: 'queued',
      requestPreview: '请后台处理这条任务',
      writeBackStatus: 'pending',
      requestedAt: '2026-04-03T10:00:00.000Z',
      startedAt: null,
      finishedAt: null,
    });
  });

  it('exposes message.target.current.get and message.send through the builtin host facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        type: 'conversation',
        id: 'conversation-1',
        label: '当前会话',
      })
      .mockResolvedValueOnce({
        id: 'assistant-message-plugin-1',
        target: {
          type: 'conversation',
          id: 'conversation-2',
          label: '目标会话',
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

    const definition: BuiltinPluginDefinition = {
      manifest: {
        id: 'builtin.response-recorder',
        name: '回复记录器',
        version: '1.0.0',
        runtime: 'builtin',
        permissions: ['conversation:read', 'conversation:write'],
        tools: [
          {
            name: 'push_reply',
            description: '主动向目标发消息',
            parameters: {},
          },
        ],
      },
      tools: {
        push_reply: async (_params, { host }) => {
          const currentTarget = await host.getCurrentMessageTarget();
          const sentMessage = await host.sendMessage({
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

          return {
            currentTarget,
            sentMessage,
          } as never;
        },
      },
    };

    const transport = new BuiltinPluginTransport(
      definition,
      hostService as never,
    );

    const result = await transport.executeTool({
      toolName: 'push_reply',
      params: {},
      context: {
        source: 'cron',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.response-recorder',
      context: {
        source: 'cron',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'message.target.current.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.response-recorder',
      context: {
        source: 'cron',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'message.send',
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
    });
    expect(result).toEqual({
      currentTarget: {
        type: 'conversation',
        id: 'conversation-1',
        label: '当前会话',
      },
      sentMessage: {
        id: 'assistant-message-plugin-1',
        target: {
          type: 'conversation',
          id: 'conversation-2',
          label: '目标会话',
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
      },
    });
  });

  it('exposes conversation.session.* through the builtin host facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 60000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:00.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
      })
      .mockResolvedValueOnce({
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 60000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:00.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
      })
      .mockResolvedValueOnce({
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 90000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:30.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
      })
      .mockResolvedValueOnce(true);

    const definition: BuiltinPluginDefinition = {
      manifest: {
        id: 'builtin.idiom-session',
        name: 'Idiom Session',
        version: '1.0.0',
        runtime: 'builtin',
        permissions: ['conversation:write'],
        tools: [
          {
            name: 'control_session',
            description: '控制当前会话等待态',
            parameters: {},
          },
        ],
      },
      tools: {
        control_session: async (_params, { host }) =>
          ({
            started: await host.startConversationSession({
              timeoutMs: 60000,
              captureHistory: true,
            }),
            current: await host.getConversationSession(),
            kept: await host.keepConversationSession({
              timeoutMs: 30000,
              resetTimeout: false,
            }),
            finished: await host.finishConversationSession(),
          }) as never,
      },
    };

    const transport = new BuiltinPluginTransport(
      definition,
      hostService as never,
    );

    const result = await transport.executeTool({
      toolName: 'control_session',
      params: {},
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.idiom-session',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.session.start',
      params: {
        timeoutMs: 60000,
        captureHistory: true,
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.idiom-session',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.session.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.idiom-session',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.session.keep',
      params: {
        timeoutMs: 30000,
        resetTimeout: false,
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.idiom-session',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.session.finish',
      params: {},
    });
    expect(result).toEqual({
      started: {
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 60000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:00.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
      },
      current: {
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 60000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:00.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
      },
      kept: {
        pluginId: 'builtin.idiom-session',
        conversationId: 'conversation-1',
        timeoutMs: 90000,
        startedAt: '2026-03-28T12:00:00.000Z',
        expiresAt: '2026-03-28T12:01:30.000Z',
        lastMatchedAt: null,
        captureHistory: true,
        historyMessages: [],
      },
      finished: true,
    });
  });
});

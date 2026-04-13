import type { PluginManifest } from '@garlic-claw/shared';
import {
  createPluginRuntimeSpecFixture,
  type PluginRuntimeSpecFixture,
} from './plugin-runtime.spec-fixture';

describe('PluginRuntimeService host api', () => {
  let service: PluginRuntimeSpecFixture['service'];
  let hostService: PluginRuntimeSpecFixture['hostService'];
  let cronService: PluginRuntimeSpecFixture['cronService'];
  let automationService: PluginRuntimeSpecFixture['automationService'];
  let chatMessageService: PluginRuntimeSpecFixture['chatMessageService'];
  let builtinManifest: PluginRuntimeSpecFixture['builtinManifest'];
  let createTransport: PluginRuntimeSpecFixture['createTransport'];

  beforeEach(() => {
    ({
      service,
      hostService,
      cronService,
      automationService,
      chatMessageService,
      builtinManifest,
      createTransport,
    } = createPluginRuntimeSpecFixture());
  });

  it('enforces host permissions before delegating to the host api', async () => {
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

  it('enforces log read permission before log.list host calls', async () => {
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
        method: 'log.list' as never,
        params: {},
      }),
    ).rejects.toThrow('插件 builtin.memory-context 缺少权限 log:read');

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
      name: '默认助手',
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
      name: '默认助手',
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

    expect(cronService.registerCron).toHaveBeenCalledWith('builtin.cron-heartbeat', {
      name: 'heartbeat',
      cron: '10s',
      description: '定时写入插件心跳',
      data: {
        channel: 'default',
      },
    });
    expect(cronService.listCronJobs).toHaveBeenCalledWith('builtin.cron-heartbeat');
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
});

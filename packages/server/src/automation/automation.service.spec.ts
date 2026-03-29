import { AutomationService } from './automation.service';

describe('AutomationService', () => {
  const prisma = {
    automation: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    automationLog: {
      create: jest.fn(),
    },
  };

  const pluginRuntime = {
    executeTool: jest.fn(),
    runAutomationBeforeRunHooks: jest.fn(),
    runAutomationAfterRunHooks: jest.fn(),
  };
  const chatMessageService = {
    sendPluginMessage: jest.fn(),
  };

  let service: AutomationService;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginRuntime.runAutomationBeforeRunHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => ({
        action: 'continue',
        payload,
      }),
    );
    pluginRuntime.runAutomationAfterRunHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );
    service = new AutomationService(
      prisma as never,
      pluginRuntime as never,
      chatMessageService as never,
    );
  });

  it('routes device_command actions through the unified plugin runtime', async () => {
    prisma.automation.findUnique.mockResolvedValue({
      id: 'automation-1',
      userId: 'user-1',
      name: '记忆工具自动化',
      enabled: true,
      trigger: JSON.stringify({ type: 'manual' }),
      actions: JSON.stringify([
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          params: {
            content: '自动化保存的记忆',
          },
        },
      ]),
      lastRunAt: null,
      createdAt: new Date('2026-03-27T10:00:00.000Z'),
      updatedAt: new Date('2026-03-27T10:00:00.000Z'),
      logs: [],
    });
    pluginRuntime.executeTool.mockResolvedValue({
      saved: true,
      id: 'memory-1',
    });
    prisma.automationLog.create.mockResolvedValue(null);
    prisma.automation.update.mockResolvedValue(null);

    const result = await service.executeAutomation('automation-1');

    expect(pluginRuntime.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-tools',
      toolName: 'save_memory',
      params: {
        content: '自动化保存的记忆',
      },
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
    });
    expect(result).toEqual({
      status: 'success',
      results: [
        {
          action: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          result: {
            saved: true,
            id: 'memory-1',
          },
        },
      ],
    });
  });

  it('applies automation:before-run mutations before executing actions', async () => {
    prisma.automation.findUnique.mockResolvedValue({
      id: 'automation-1',
      userId: 'user-1',
      name: '自动化前置改写',
      enabled: true,
      trigger: JSON.stringify({ type: 'manual' }),
      actions: JSON.stringify([
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          params: {
            content: '原始内容',
          },
        },
      ]),
      lastRunAt: null,
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
      logs: [],
    });
    pluginRuntime.runAutomationBeforeRunHooks.mockResolvedValue({
      action: 'continue',
      payload: {
        context: {
          source: 'automation',
          userId: 'user-1',
          automationId: 'automation-1',
        },
        automation: {
          id: 'automation-1',
          name: '自动化前置改写',
          trigger: { type: 'manual' },
          actions: [
            {
              type: 'device_command',
              plugin: 'builtin.memory-tools',
              capability: 'save_memory',
              params: {
                content: '原始内容',
              },
            },
          ],
          enabled: true,
          lastRunAt: null,
          createdAt: '2026-03-28T10:00:00.000Z',
          updatedAt: '2026-03-28T10:00:00.000Z',
        },
        actions: [
          {
            type: 'device_command',
            plugin: 'builtin.memory-tools',
            capability: 'save_memory',
            params: {
              content: '插件改写后的内容',
            },
          },
        ],
      },
    });
    pluginRuntime.executeTool.mockResolvedValue({
      saved: true,
    });
    prisma.automationLog.create.mockResolvedValue(null);
    prisma.automation.update.mockResolvedValue(null);
    pluginRuntime.runAutomationAfterRunHooks.mockImplementation(
      async ({ payload }: { payload: unknown }) => payload,
    );

    await service.executeAutomation('automation-1');

    expect(pluginRuntime.runAutomationBeforeRunHooks).toHaveBeenCalledWith({
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
          name: '自动化前置改写',
          trigger: { type: 'manual' },
          actions: [
            {
              type: 'device_command',
              plugin: 'builtin.memory-tools',
              capability: 'save_memory',
              params: {
                content: '原始内容',
              },
            },
          ],
          enabled: true,
          lastRunAt: null,
          createdAt: '2026-03-28T10:00:00.000Z',
          updatedAt: '2026-03-28T10:00:00.000Z',
        },
        actions: [
          {
            type: 'device_command',
            plugin: 'builtin.memory-tools',
            capability: 'save_memory',
            params: {
              content: '原始内容',
            },
          },
        ],
      },
    });
    expect(pluginRuntime.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-tools',
      toolName: 'save_memory',
      params: {
        content: '插件改写后的内容',
      },
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
    });
  });

  it('supports automation:before-run short-circuit and skips action execution', async () => {
    prisma.automation.findUnique.mockResolvedValue({
      id: 'automation-1',
      userId: 'user-1',
      name: '自动化短路',
      enabled: true,
      trigger: JSON.stringify({ type: 'manual' }),
      actions: JSON.stringify([
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          params: {
            content: '原始内容',
          },
        },
      ]),
      lastRunAt: null,
      createdAt: new Date('2026-03-28T10:00:00.000Z'),
      updatedAt: new Date('2026-03-28T10:00:00.000Z'),
      logs: [],
    });
    pluginRuntime.runAutomationBeforeRunHooks.mockResolvedValue({
      action: 'short-circuit',
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '由插件直接完成',
        },
      ],
    });
    prisma.automationLog.create.mockResolvedValue(null);
    prisma.automation.update.mockResolvedValue(null);
    pluginRuntime.runAutomationAfterRunHooks.mockResolvedValue({
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
      automation: {
        id: 'automation-1',
        name: '自动化短路',
        trigger: { type: 'manual' },
        actions: [
          {
            type: 'device_command',
            plugin: 'builtin.memory-tools',
            capability: 'save_memory',
            params: {
              content: '原始内容',
            },
          },
        ],
        enabled: true,
        lastRunAt: null,
        createdAt: '2026-03-28T10:00:00.000Z',
        updatedAt: '2026-03-28T10:00:00.000Z',
      },
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '由插件直接完成',
        },
      ],
    });

    const result = await service.executeAutomation('automation-1');

    expect(pluginRuntime.executeTool).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'success',
      results: [
        {
          action: 'hook',
          result: '由插件直接完成',
        },
      ],
    });
  });

  it('routes ai_message actions through the unified message.send chain', async () => {
    prisma.automation.findUnique.mockResolvedValue({
      id: 'automation-1',
      userId: 'user-1',
      name: '自动化消息通知',
      enabled: true,
      trigger: JSON.stringify({ type: 'manual' }),
      actions: JSON.stringify([
        {
          type: 'ai_message',
          message: '咖啡已经煮好了',
          target: {
            type: 'conversation',
            id: 'conversation-1',
          },
        },
      ]),
      lastRunAt: null,
      createdAt: new Date('2026-03-29T15:00:00.000Z'),
      updatedAt: new Date('2026-03-29T15:00:00.000Z'),
      logs: [],
    });
    chatMessageService.sendPluginMessage.mockResolvedValue({
      id: 'message-1',
      target: {
        type: 'conversation',
        id: 'conversation-1',
        label: 'Coffee Chat',
      },
      role: 'assistant',
      content: '咖啡已经煮好了',
      parts: [
        {
          type: 'text',
          text: '咖啡已经煮好了',
        },
      ],
      status: 'completed',
      createdAt: '2026-03-29T15:00:00.000Z',
      updatedAt: '2026-03-29T15:00:00.000Z',
    });
    prisma.automationLog.create.mockResolvedValue(null);
    prisma.automation.update.mockResolvedValue(null);

    const result = await service.executeAutomation('automation-1');

    expect(chatMessageService.sendPluginMessage).toHaveBeenCalledWith({
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
      },
      target: {
        type: 'conversation',
        id: 'conversation-1',
      },
      content: '咖啡已经煮好了',
    });
    expect(result).toEqual({
      status: 'success',
      results: [
        {
          action: 'ai_message',
          target: {
            type: 'conversation',
            id: 'conversation-1',
            label: 'Coffee Chat',
          },
          result: {
            id: 'message-1',
            target: {
              type: 'conversation',
              id: 'conversation-1',
              label: 'Coffee Chat',
            },
            role: 'assistant',
            content: '咖啡已经煮好了',
            parts: [
              {
                type: 'text',
                text: '咖啡已经煮好了',
              },
            ],
            status: 'completed',
            createdAt: '2026-03-29T15:00:00.000Z',
            updatedAt: '2026-03-29T15:00:00.000Z',
          },
        },
      ],
    });
  });

  it('executes enabled event automations that match the emitted event name', async () => {
    prisma.automation.findMany.mockResolvedValue([
      {
        id: 'automation-event-1',
        userId: 'user-1',
        name: '咖啡准备完成提醒',
        enabled: true,
        trigger: JSON.stringify({ type: 'event', event: 'coffee.ready' }),
        actions: JSON.stringify([]),
        lastRunAt: null,
        createdAt: new Date('2026-03-29T14:00:00.000Z'),
        updatedAt: new Date('2026-03-29T14:00:00.000Z'),
      },
      {
        id: 'automation-event-2',
        userId: 'user-1',
        name: '茶准备完成提醒',
        enabled: true,
        trigger: JSON.stringify({ type: 'event', event: 'tea.ready' }),
        actions: JSON.stringify([]),
        lastRunAt: null,
        createdAt: new Date('2026-03-29T14:01:00.000Z'),
        updatedAt: new Date('2026-03-29T14:01:00.000Z'),
      },
      {
        id: 'automation-cron-1',
        userId: 'user-1',
        name: '定时提醒',
        enabled: true,
        trigger: JSON.stringify({ type: 'cron', cron: '5m' }),
        actions: JSON.stringify([]),
        lastRunAt: null,
        createdAt: new Date('2026-03-29T14:02:00.000Z'),
        updatedAt: new Date('2026-03-29T14:02:00.000Z'),
      },
    ]);
    const executeAutomation = jest
      .spyOn(service, 'executeAutomation')
      .mockResolvedValue({ status: 'success', results: [] });

    const result = await service.emitEvent('coffee.ready', 'user-1');

    expect(prisma.automation.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        enabled: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
    expect(executeAutomation).toHaveBeenCalledTimes(1);
    expect(executeAutomation).toHaveBeenCalledWith('automation-event-1', 'user-1');
    expect(result).toEqual({
      event: 'coffee.ready',
      matchedAutomationIds: ['automation-event-1'],
    });
  });
});

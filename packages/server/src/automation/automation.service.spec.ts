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
  };

  let service: AutomationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AutomationService(
      prisma as never,
      pluginRuntime as never,
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
});

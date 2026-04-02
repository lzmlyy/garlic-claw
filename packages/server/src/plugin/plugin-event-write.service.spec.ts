import { PluginEventWriteService } from './plugin-event-write.service';

describe('PluginEventWriteService', () => {
  const prisma = {
    plugin: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    pluginEvent: {
      create: jest.fn(),
    },
  };

  let service: PluginEventWriteService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginEventWriteService(prisma as never);
  });

  it('records plugin failures into health snapshot and event log', async () => {
    prisma.plugin.findUnique.mockResolvedValue({
      id: 'plugin-1',
      name: 'builtin.memory-context',
      status: 'online',
      healthStatus: 'healthy',
      failureCount: 1,
      consecutiveFailures: 0,
      lastSuccessAt: new Date('2026-03-27T11:58:00.000Z'),
      lastError: null,
      lastErrorAt: null,
      lastCheckedAt: new Date('2026-03-27T11:59:00.000Z'),
    });
    prisma.plugin.update.mockResolvedValue({
      id: 'plugin-1',
    });
    prisma.pluginEvent.create.mockResolvedValue({
      id: 'event-1',
    });

    await service.recordPluginFailure('builtin.memory-context', {
      type: 'tool:error',
      message: 'memory.search timeout',
      metadata: {
        toolName: 'memory.search',
      },
    });

    expect(prisma.plugin.update).toHaveBeenCalledWith({
      where: {
        name: 'builtin.memory-context',
      },
      data: expect.objectContaining({
        failureCount: 2,
        consecutiveFailures: 1,
        healthStatus: 'degraded',
        lastError: 'memory.search timeout',
        lastErrorAt: expect.any(Date),
      }),
    });
    expect(prisma.pluginEvent.create).toHaveBeenCalledWith({
      data: {
        pluginId: 'plugin-1',
        type: 'tool:error',
        level: 'error',
        message: 'memory.search timeout',
        metadataJson: JSON.stringify({
          toolName: 'memory.search',
        }),
      },
    });
  });

  it('routes health checks through success and failure persistence helpers', async () => {
    prisma.plugin.findUnique
      .mockResolvedValueOnce({
        id: 'plugin-1',
        name: 'builtin.memory-context',
        status: 'online',
        healthStatus: 'degraded',
        failureCount: 2,
        consecutiveFailures: 1,
        lastSuccessAt: null,
        lastError: 'old error',
        lastErrorAt: new Date('2026-03-27T12:00:00.000Z'),
        lastCheckedAt: new Date('2026-03-27T12:00:00.000Z'),
      })
      .mockResolvedValueOnce({
        id: 'plugin-1',
        name: 'builtin.memory-context',
        status: 'online',
        healthStatus: 'healthy',
        failureCount: 2,
        consecutiveFailures: 0,
        lastSuccessAt: new Date('2026-03-27T12:05:00.000Z'),
        lastError: null,
        lastErrorAt: null,
        lastCheckedAt: new Date('2026-03-27T12:05:00.000Z'),
      });
    prisma.plugin.update.mockResolvedValue({
      id: 'plugin-1',
    });
    prisma.pluginEvent.create.mockResolvedValue({
      id: 'event-1',
    });

    await service.recordHealthCheck('builtin.memory-context', {
      ok: true,
      message: 'health-check passed',
    });
    await service.recordHealthCheck('builtin.memory-context', {
      ok: false,
      message: 'health-check failed',
      metadata: {
        source: 'ping',
      },
    });

    expect(prisma.plugin.update).toHaveBeenNthCalledWith(1, {
      where: {
        name: 'builtin.memory-context',
      },
      data: expect.objectContaining({
        consecutiveFailures: 0,
        healthStatus: 'healthy',
        lastSuccessAt: expect.any(Date),
      }),
    });
    expect(prisma.plugin.update).toHaveBeenNthCalledWith(2, {
      where: {
        name: 'builtin.memory-context',
      },
      data: expect.objectContaining({
        healthStatus: 'degraded',
        lastError: 'health-check failed',
      }),
    });
  });
});

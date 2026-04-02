import { PluginCronSchedulerService } from './plugin-cron-scheduler.service';
import { PluginCronService } from './plugin-cron.service';

describe('PluginCronService', () => {
  const prisma = {
    pluginCronJob: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  const pluginService = {
    recordPluginSuccess: jest.fn(),
    recordPluginFailure: jest.fn(),
  };

  const runtime = {
    invokePluginHook: jest.fn(),
  };

  const moduleRef = {
    get: jest.fn(),
  };

  let service: PluginCronService;
  let scheduler: PluginCronSchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    moduleRef.get.mockReturnValue(runtime);
    prisma.pluginCronJob.deleteMany.mockResolvedValue({ count: 0 });
    scheduler = new PluginCronSchedulerService(
      prisma as never,
      pluginService as never,
      moduleRef as never,
    );
    service = new (PluginCronService as unknown as new (
      ...args: unknown[]
    ) => PluginCronService)(
      prisma as never,
      scheduler as never,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
  });

  it('syncs manifest cron jobs, schedules them, and dispatches cron:tick hooks', async () => {
    const jobRecord = createCronJobRecord({
      id: 'cron-job-1',
      pluginName: 'builtin.cron-heartbeat',
      name: 'heartbeat',
      cron: '10s',
      description: '定时写入插件心跳',
      source: 'manifest',
      dataJson: JSON.stringify({
        channel: 'default',
      }),
    });

    prisma.pluginCronJob.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([jobRecord]);
    prisma.pluginCronJob.upsert.mockResolvedValue(jobRecord);
    prisma.pluginCronJob.update.mockResolvedValue(
      createCronJobRecord({
        ...jobRecord,
        lastRunAt: new Date('2026-03-27T13:00:10.000Z'),
        updatedAt: new Date('2026-03-27T13:00:10.000Z'),
      }),
    );
    runtime.invokePluginHook.mockResolvedValue(null);

    await service.onPluginRegistered('builtin.cron-heartbeat', [
      {
        name: 'heartbeat',
        cron: '10s',
        description: '定时写入插件心跳',
        data: {
          channel: 'default',
        },
      },
    ]);

    await jest.advanceTimersByTimeAsync(10000);

    expect(prisma.pluginCronJob.upsert).toHaveBeenCalledWith({
      where: {
        pluginName_name_source: {
          pluginName: 'builtin.cron-heartbeat',
          name: 'heartbeat',
          source: 'manifest',
        },
      },
      create: {
        pluginName: 'builtin.cron-heartbeat',
        name: 'heartbeat',
        cron: '10s',
        description: '定时写入插件心跳',
        source: 'manifest',
        enabled: true,
        dataJson: JSON.stringify({
          channel: 'default',
        }),
      },
      update: {
        cron: '10s',
        description: '定时写入插件心跳',
        enabled: true,
        dataJson: JSON.stringify({
          channel: 'default',
        }),
      },
    });
    expect(runtime.invokePluginHook).toHaveBeenCalledWith({
      pluginId: 'builtin.cron-heartbeat',
      hookName: 'cron:tick',
      context: expect.objectContaining({
        source: 'cron',
        cronJobId: 'cron-job-1',
      }),
      payload: {
        job: {
          id: 'cron-job-1',
          pluginId: 'builtin.cron-heartbeat',
          name: 'heartbeat',
          cron: '10s',
          description: '定时写入插件心跳',
          source: 'manifest',
          enabled: true,
          data: {
            channel: 'default',
          },
          lastRunAt: null,
          lastError: null,
          lastErrorAt: null,
          createdAt: '2026-03-27T13:00:00.000Z',
          updatedAt: '2026-03-27T13:00:00.000Z',
        },
        tickedAt: expect.any(String),
      },
      recordFailure: false,
    });
    expect(prisma.pluginCronJob.update).toHaveBeenCalledWith({
      where: {
        id: 'cron-job-1',
      },
      data: expect.objectContaining({
        lastRunAt: expect.any(Date),
        lastError: null,
        lastErrorAt: null,
      }),
    });
    expect(pluginService.recordPluginSuccess).toHaveBeenCalledWith(
      'builtin.cron-heartbeat',
      expect.objectContaining({
        type: 'cron:tick',
        persistEvent: false,
        metadata: {
          jobId: 'cron-job-1',
          jobName: 'heartbeat',
          source: 'manifest',
        },
      }),
    );
  });

  it('registers host cron jobs and allows listing and deleting them', async () => {
    const jobRecord = createCronJobRecord({
      id: 'cron-job-2',
      pluginName: 'builtin.cron-heartbeat',
      name: 'cleanup',
      cron: '15m',
      description: '定时清理缓存',
      source: 'host',
      dataJson: JSON.stringify({
        limit: 3,
      }),
    });

    prisma.pluginCronJob.upsert.mockResolvedValue(jobRecord);
    prisma.pluginCronJob.findMany.mockResolvedValue([jobRecord]);
    prisma.pluginCronJob.findFirst.mockResolvedValue(jobRecord);
    prisma.pluginCronJob.delete.mockResolvedValue(jobRecord);

    await expect(
      service.registerCron('builtin.cron-heartbeat', {
        name: 'cleanup',
        cron: '15m',
        description: '定时清理缓存',
        data: {
          limit: 3,
        },
      }),
    ).resolves.toEqual({
      id: 'cron-job-2',
      pluginId: 'builtin.cron-heartbeat',
      name: 'cleanup',
      cron: '15m',
      description: '定时清理缓存',
      source: 'host',
      enabled: true,
      data: {
        limit: 3,
      },
      lastRunAt: null,
      lastError: null,
      lastErrorAt: null,
      createdAt: '2026-03-27T13:00:00.000Z',
      updatedAt: '2026-03-27T13:00:00.000Z',
    });
    await expect(
      service.listCronJobs('builtin.cron-heartbeat'),
    ).resolves.toEqual([
      {
        id: 'cron-job-2',
        pluginId: 'builtin.cron-heartbeat',
        name: 'cleanup',
        cron: '15m',
        description: '定时清理缓存',
        source: 'host',
        enabled: true,
        data: {
          limit: 3,
        },
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        createdAt: '2026-03-27T13:00:00.000Z',
        updatedAt: '2026-03-27T13:00:00.000Z',
      },
    ]);
    await expect(
      service.deleteCron('builtin.cron-heartbeat', 'cron-job-2'),
    ).resolves.toBe(true);

    expect(prisma.pluginCronJob.delete).toHaveBeenCalledWith({
      where: {
        id: 'cron-job-2',
      },
    });
  });

  it('falls back to undefined when persisted cron data json is malformed', async () => {
    const brokenJobRecord = createCronJobRecord({
      id: 'cron-job-broken',
      pluginName: 'builtin.cron-heartbeat',
      name: 'broken-data',
      cron: '15m',
      description: '损坏的 cron data',
      source: 'host',
      dataJson: '{not-json',
    });

    prisma.pluginCronJob.findMany.mockResolvedValue([brokenJobRecord]);

    await expect(
      service.listCronJobs('builtin.cron-heartbeat'),
    ).resolves.toEqual([
      {
        id: 'cron-job-broken',
        pluginId: 'builtin.cron-heartbeat',
        name: 'broken-data',
        cron: '15m',
        description: '损坏的 cron data',
        source: 'host',
        enabled: true,
        data: undefined,
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        createdAt: '2026-03-27T13:00:00.000Z',
        updatedAt: '2026-03-27T13:00:00.000Z',
      },
    ]);
  });

  it('records failures when cron:tick execution throws', async () => {
    const jobRecord = createCronJobRecord({
      id: 'cron-job-3',
      pluginName: 'builtin.cron-heartbeat',
      name: 'failing-heartbeat',
      cron: '10s',
      description: '定时触发失败',
      source: 'host',
    });

    prisma.pluginCronJob.upsert.mockResolvedValue(jobRecord);
    prisma.pluginCronJob.update.mockResolvedValue(
      createCronJobRecord({
        ...jobRecord,
        lastRunAt: new Date('2026-03-27T13:00:10.000Z'),
        lastError: 'cron exploded',
        lastErrorAt: new Date('2026-03-27T13:00:10.000Z'),
        updatedAt: new Date('2026-03-27T13:00:10.000Z'),
      }),
    );
    runtime.invokePluginHook.mockRejectedValue(new Error('cron exploded'));

    await service.registerCron('builtin.cron-heartbeat', {
      name: 'failing-heartbeat',
      cron: '10s',
      description: '定时触发失败',
    });

    await jest.advanceTimersByTimeAsync(10000);

    expect(pluginService.recordPluginFailure).toHaveBeenCalledWith(
      'builtin.cron-heartbeat',
      expect.objectContaining({
        type: 'cron:error',
        message: 'cron exploded',
        metadata: {
          jobId: 'cron-job-3',
          jobName: 'failing-heartbeat',
          source: 'host',
        },
      }),
    );
    expect(prisma.pluginCronJob.update).toHaveBeenCalledWith({
      where: {
        id: 'cron-job-3',
      },
      data: expect.objectContaining({
        lastRunAt: expect.any(Date),
        lastError: 'cron exploded',
        lastErrorAt: expect.any(Date),
      }),
    });
  });

  it('stops scheduled jobs after plugin unregisters', async () => {
    const jobRecord = createCronJobRecord({
      id: 'cron-job-4',
      pluginName: 'builtin.cron-heartbeat',
      name: 'stopped-heartbeat',
      cron: '10s',
      source: 'host',
    });

    prisma.pluginCronJob.upsert.mockResolvedValue(jobRecord);

    await service.registerCron('builtin.cron-heartbeat', {
      name: 'stopped-heartbeat',
      cron: '10s',
    });
    service.onPluginUnregistered('builtin.cron-heartbeat');

    await jest.advanceTimersByTimeAsync(10000);

    expect(runtime.invokePluginHook).not.toHaveBeenCalled();
  });
});

/**
 * 创建最小 cron job 记录桩。
 * @param overrides 需要覆盖的字段
 * @returns 与测试场景兼容的 cron job 记录
 */
function createCronJobRecord(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'cron-job-1',
    pluginName: 'builtin.cron-heartbeat',
    name: 'heartbeat',
    cron: '10s',
    description: '定时写入插件心跳',
    source: 'manifest',
    enabled: true,
    dataJson: null,
    lastRunAt: null,
    lastError: null,
    lastErrorAt: null,
    createdAt: new Date('2026-03-27T13:00:00.000Z'),
    updatedAt: new Date('2026-03-27T13:00:00.000Z'),
    ...overrides,
  };
}

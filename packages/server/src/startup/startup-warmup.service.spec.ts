import { StartupWarmupService } from './startup-warmup.service';

describe('StartupWarmupService', () => {
  const createService = () => {
    const mcpService = {
      warmupOnStartup: jest.fn().mockResolvedValue(undefined),
    };
    const automationService = {
      restoreCronJobsOnStartup: jest.fn().mockResolvedValue(undefined),
    };
    const bootstrapAdminService = {
      ensureBootstrapAdminOnStartup: jest.fn().mockResolvedValue(undefined),
    };

    const service = new StartupWarmupService(
      mcpService as never,
      automationService as never,
      bootstrapAdminService as never,
    );

    return {
      service,
      mcpService,
      automationService,
      bootstrapAdminService,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs post-listen warmups only once across repeated calls', async () => {
    let resolveMcpWarmup!: () => void;
    const mcpWarmupPromise = new Promise<void>((resolve) => {
      resolveMcpWarmup = resolve;
    });
    const {
      service,
      mcpService,
      automationService,
      bootstrapAdminService,
    } = createService();
    mcpService.warmupOnStartup.mockReturnValue(mcpWarmupPromise);

    const firstRun = service.runPostListenWarmups();
    const secondRun = service.runPostListenWarmups();

    expect(firstRun).toBe(secondRun);
    expect(mcpService.warmupOnStartup).toHaveBeenCalledTimes(1);
    expect(automationService.restoreCronJobsOnStartup).toHaveBeenCalledTimes(1);
    expect(bootstrapAdminService.ensureBootstrapAdminOnStartup).toHaveBeenCalledTimes(1);

    resolveMcpWarmup();
    await Promise.all([firstRun, secondRun]);

    await service.runPostListenWarmups();

    expect(mcpService.warmupOnStartup).toHaveBeenCalledTimes(1);
    expect(automationService.restoreCronJobsOnStartup).toHaveBeenCalledTimes(1);
    expect(bootstrapAdminService.ensureBootstrapAdminOnStartup).toHaveBeenCalledTimes(1);
  });

  it('swallows individual warmup failures so ready state stays up', async () => {
    const {
      service,
      mcpService,
      automationService,
      bootstrapAdminService,
    } = createService();
    const errorSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    mcpService.warmupOnStartup.mockRejectedValue(new Error('connect failed'));

    await expect(service.runPostListenWarmups()).resolves.toBeUndefined();

    expect(mcpService.warmupOnStartup).toHaveBeenCalledTimes(1);
    expect(automationService.restoreCronJobsOnStartup).toHaveBeenCalledTimes(1);
    expect(bootstrapAdminService.ensureBootstrapAdminOnStartup).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'MCP 运行时预热失败: connect failed',
    );
  });
});

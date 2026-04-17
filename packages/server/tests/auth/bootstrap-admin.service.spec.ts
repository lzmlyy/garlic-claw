import { BootstrapAdminService } from '../../src/auth/bootstrap-admin.service';
import { SINGLE_USER_EMAIL, SINGLE_USER_ID, SINGLE_USER_USERNAME } from '../../src/auth/single-user-auth';
import { getPrismaClient } from '../../src/infrastructure/prisma/prisma-client';

jest.mock('../../src/infrastructure/prisma/prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

describe('BootstrapAdminService', () => {
  const prisma = {
    user: {
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);
  });

  it('deletes incompatible legacy users and upserts the single system user', async () => {
    prisma.user.deleteMany.mockResolvedValue({ count: 2 });
    prisma.user.upsert.mockResolvedValue({ id: SINGLE_USER_ID });

    await new BootstrapAdminService().ensureSingleUserOnStartup();

    expect(prisma.user.deleteMany).toHaveBeenCalledWith({
      where: { id: { not: SINGLE_USER_ID } },
    });
    expect(prisma.user.upsert).toHaveBeenCalledWith({
      create: {
        id: SINGLE_USER_ID,
        username: SINGLE_USER_USERNAME,
        email: SINGLE_USER_EMAIL,
        passwordHash: 'single-secret-auth',
        role: 'local',
      },
      update: {
        email: SINGLE_USER_EMAIL,
        passwordHash: 'single-secret-auth',
        role: 'local',
        username: SINGLE_USER_USERNAME,
      },
      where: { id: SINGLE_USER_ID },
    });
  });

  it('still upserts the single system user when only current owner remains', async () => {
    prisma.user.deleteMany.mockResolvedValue({ count: 0 });
    prisma.user.upsert.mockResolvedValue({ id: SINGLE_USER_ID });

    await new BootstrapAdminService().ensureSingleUserOnStartup();

    expect(prisma.user.deleteMany).toHaveBeenCalled();
    expect(prisma.user.upsert).toHaveBeenCalled();
  });

  it('runs startup warmup only once across repeated calls', async () => {
    let resolveWarmup!: () => void;
    const service = new BootstrapAdminService();
    const warmupPromise = new Promise<void>((resolve) => {
      resolveWarmup = resolve;
    });
    jest.spyOn(service, 'ensureSingleUserOnStartup').mockReturnValue(warmupPromise);

    const firstRun = service.runStartupWarmup();
    const secondRun = service.runStartupWarmup();

    expect(firstRun).toBe(secondRun);
    expect(service.ensureSingleUserOnStartup).toHaveBeenCalledTimes(1);

    resolveWarmup();
    await Promise.all([firstRun, secondRun]);

    await service.runStartupWarmup();
    expect(service.ensureSingleUserOnStartup).toHaveBeenCalledTimes(1);
  });
});

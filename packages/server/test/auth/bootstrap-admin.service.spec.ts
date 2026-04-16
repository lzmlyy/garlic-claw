import * as bcrypt from 'bcrypt';
import { AdminIdentityService } from '../../src/auth/admin-identity.service';
import { BootstrapAdminService } from '../../src/auth/bootstrap-admin.service';
import { getPrismaClient } from '../../src/infrastructure/prisma/prisma-client';

jest.mock('bcrypt');
jest.mock('../../src/infrastructure/prisma/prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

describe('BootstrapAdminService', () => {
  const prisma = {
    user: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const createService = (env: Record<string, string | undefined>) => {
    const configService = {
      get: jest.fn((key: string) => env[key]),
    };
    return new BootstrapAdminService(
      new AdminIdentityService(configService as never),
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-admin-password');
  });

  it('creates the bootstrap admin when config is complete and the user is missing', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue({ id: 'bootstrap-user' });

    await createService({
      BOOTSTRAP_ADMIN_USERNAME: 'admin',
      BOOTSTRAP_ADMIN_PASSWORD: 'admin123',
      BOOTSTRAP_ADMIN_ROLE: 'super_admin',
    }).ensureBootstrapAdminOnStartup();

    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: {
        OR: [
          { username: 'admin' },
          { email: 'admin@bootstrap.local' },
        ],
      },
      select: { id: true },
    });
    expect(bcrypt.hash).toHaveBeenCalledWith('admin123', 12);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        username: 'admin',
        email: 'admin@bootstrap.local',
        passwordHash: 'hashed-admin-password',
        role: 'user',
      }),
    });
  });

  it('skips creation when username or password is missing', async () => {
    await createService({
      BOOTSTRAP_ADMIN_USERNAME: 'admin',
    }).ensureBootstrapAdminOnStartup();

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('skips creation when the bootstrap admin already exists', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing-admin' });

    await createService({
      BOOTSTRAP_ADMIN_USERNAME: 'admin',
      BOOTSTRAP_ADMIN_PASSWORD: 'admin123',
    }).ensureBootstrapAdminOnStartup();

    expect(prisma.user.findFirst).toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('runs startup warmup only once across repeated calls', async () => {
    let resolveWarmup!: () => void;
    const service = createService({});
    const warmupPromise = new Promise<void>((resolve) => {
      resolveWarmup = resolve;
    });
    jest.spyOn(service, 'ensureBootstrapAdminOnStartup').mockReturnValue(warmupPromise);

    const firstRun = service.runStartupWarmup();
    const secondRun = service.runStartupWarmup();

    expect(firstRun).toBe(secondRun);
    expect(service.ensureBootstrapAdminOnStartup).toHaveBeenCalledTimes(1);

    resolveWarmup();
    await Promise.all([firstRun, secondRun]);

    await service.runStartupWarmup();
    expect(service.ensureBootstrapAdminOnStartup).toHaveBeenCalledTimes(1);
  });

  it('swallows startup warmup failures so ready state stays up', async () => {
    const service = createService({});
    jest.spyOn(service, 'ensureBootstrapAdminOnStartup').mockRejectedValue(new Error('create failed'));
    const errorSpy = jest
      .spyOn(service['logger'], 'error')
      .mockImplementation(() => undefined);

    await expect(service.runStartupWarmup()).resolves.toBeUndefined();
    expect(service.ensureBootstrapAdminOnStartup).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      'Bootstrap 管理员补建失败: create failed',
    );
  });
});

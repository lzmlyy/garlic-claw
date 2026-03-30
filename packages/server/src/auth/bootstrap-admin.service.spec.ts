/**
 * 启动期管理员账号补建测试
 *
 * 输入:
 * - 环境变量中的 bootstrap 管理员配置
 * - 数据库现有用户查询结果
 *
 * 输出:
 * - 是否创建缺失的管理员账号
 *
 * 预期行为:
 * - 配置完整且数据库缺失时自动创建账号
 * - 配置不完整或账号已存在时跳过创建
 */

import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { BootstrapAdminService } from './bootstrap-admin.service';

jest.mock('bcrypt');

describe('BootstrapAdminService', () => {
  const createService = (
    env: Record<string, string | undefined>,
    existingUser: { id: string } | null = null,
  ) => {
    const prisma = {
      user: {
        findFirst: jest.fn().mockResolvedValue(existingUser),
        create: jest.fn().mockResolvedValue({
          id: 'bootstrap-user',
        }),
      },
    } as never as PrismaService;

    const configService = {
      get: jest.fn((key: string) => env[key]),
    } as never as ConfigService;

    const service = new BootstrapAdminService(prisma, configService);
    return { service, prisma };
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-admin-password');
  });

  it('creates the bootstrap admin when config is complete and the user is missing', async () => {
    const { service, prisma } = createService({
      BOOTSTRAP_ADMIN_USERNAME: 'admin',
      BOOTSTRAP_ADMIN_PASSWORD: 'admin123',
      BOOTSTRAP_ADMIN_ROLE: 'super_admin',
    });

    await service.ensureBootstrapAdminOnStartup();

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
      data: {
        username: 'admin',
        email: 'admin@bootstrap.local',
        passwordHash: 'hashed-admin-password',
        role: 'user',
      },
    });
  });

  it('skips creation when username or password is missing', async () => {
    const { service, prisma } = createService({
      BOOTSTRAP_ADMIN_USERNAME: 'admin',
    });

    await service.ensureBootstrapAdminOnStartup();

    expect(prisma.user.findFirst).not.toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  it('skips creation when the bootstrap admin already exists', async () => {
    const { service, prisma } = createService(
      {
        BOOTSTRAP_ADMIN_USERNAME: 'admin',
        BOOTSTRAP_ADMIN_PASSWORD: 'admin123',
      },
      { id: 'existing-admin' },
    );

    await service.ensureBootstrapAdminOnStartup();

    expect(prisma.user.findFirst).toHaveBeenCalled();
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});

/**
 * JWT 策略运行时角色覆盖测试
 *
 * 输入:
 * - JWT payload 中的用户 ID 和用户名
 * - 数据库中的用户记录
 * - 环境变量管理员解析结果
 *
 * 输出:
 * - request.user 中最终可用的角色
 *
 * 预期行为:
 * - validate 会读取数据库用户信息
 * - 返回值中的 role 使用环境变量覆盖后的角色
 */

import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminIdentityService } from '../admin-identity.service';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const configService = {
    get: jest.fn().mockReturnValue('jwt-secret'),
  } as never as ConfigService;

  it('returns the env-overridden admin role', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          username: 'owner',
          email: 'owner@example.com',
          role: 'user',
        }),
      },
    } as never as PrismaService;
    const adminIdentity = {
      resolveRole: jest.fn().mockReturnValue('super_admin'),
    } as never as AdminIdentityService;
    const strategy = new JwtStrategy(configService, prisma, adminIdentity);

    await expect(
      strategy.validate({
        sub: 'user-1',
        username: 'owner',
        role: 'user',
      }),
    ).resolves.toEqual({
      id: 'user-1',
      username: 'owner',
      email: 'owner@example.com',
      role: 'super_admin',
    });
  });

  it('throws UnauthorizedException when the database user no longer exists', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as never as PrismaService;
    const adminIdentity = {
      resolveRole: jest.fn(),
    } as never as AdminIdentityService;
    const strategy = new JwtStrategy(configService, prisma, adminIdentity);

    await expect(
      strategy.validate({
        sub: 'missing-user',
        username: 'ghost',
        role: 'user',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});

/**
 * 用户服务运行时角色覆盖测试
 *
 * 输入:
 * - 数据库中的用户记录
 * - 环境变量管理员解析服务
 *
 * 输出:
 * - API 返回给前端的最终角色
 *
 * 预期行为:
 * - findById 会返回覆盖后的角色
 * - findAll 也会对列表应用相同规则
 */

import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminIdentityService } from '../auth/admin-identity.service';
import { UserService } from './user.service';

describe('UserService', () => {
  it('returns the env-overridden role from findById', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          username: 'owner',
          email: 'owner@example.com',
          role: 'user',
          createdAt: new Date('2026-03-26T00:00:00.000Z'),
          updatedAt: new Date('2026-03-26T00:00:00.000Z'),
        }),
      },
    } as never as PrismaService;
    const adminIdentity = {
      resolveRole: jest.fn().mockReturnValue('super_admin'),
    } as never as AdminIdentityService;
    const service = new UserService(prisma, adminIdentity);

    await expect(service.findById('user-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'user-1',
        role: 'super_admin',
      }),
    );
  });

  it('throws NotFoundException when the user does not exist', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
    } as never as PrismaService;
    const adminIdentity = {
      resolveRole: jest.fn(),
    } as never as AdminIdentityService;
    const service = new UserService(prisma, adminIdentity);

    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });
});

import { NotFoundException } from '@nestjs/common';
import { getPrismaClient } from '../../src/infrastructure/prisma/prisma-client';
import { AdminIdentityService } from '../../src/auth/admin-identity.service';
import { UserService } from '../../src/user/user.service';

jest.mock('../../src/infrastructure/prisma/prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

describe('UserService', () => {
  const prisma = {
    user: {
      count: jest.fn(),
      delete: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const adminIdentity = {
    resolveRole: jest.fn((user: { role: string }) => user.role),
  } as never as AdminIdentityService;

  let service: UserService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);
    service = new UserService(adminIdentity);
  });

  it('returns the env-overridden role from findById', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'owner',
      email: 'owner@example.com',
      role: 'user',
      createdAt: new Date('2026-03-26T00:00:00.000Z'),
      updatedAt: new Date('2026-03-26T00:00:00.000Z'),
    });
    (adminIdentity.resolveRole as jest.Mock).mockReturnValue('super_admin');

    await expect(service.findById('user-1')).resolves.toEqual(
      expect.objectContaining({
        id: 'user-1',
        role: 'super_admin',
      }),
    );
  });

  it('throws NotFoundException when the user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.findById('missing')).rejects.toThrow(NotFoundException);
  });
});

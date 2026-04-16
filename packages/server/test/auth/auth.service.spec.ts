import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { getPrismaClient } from '../../src/infrastructure/prisma/prisma-client';
import { AdminIdentityService } from '../../src/auth/admin-identity.service';
import { AuthService } from '../../src/auth/auth.service';

jest.mock('bcrypt');
jest.mock('../../src/infrastructure/prisma/prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

describe('AuthService', () => {
  const prisma = {
    user: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_SECRET') return 'jwt-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
      if (key === 'NODE_ENV') return 'development';
      return undefined;
    }),
  } as never as ConfigService;
  const jwtService = {
    sign: jest.fn().mockReturnValue('mock-token'),
    verify: jest.fn(),
  } as never as JwtService;
  const adminIdentity = {
    resolveRole: jest.fn((user: { role: string }) => user.role),
  } as never as AdminIdentityService;

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);
    prisma.$transaction.mockImplementation(async (callback: (tx: typeof prisma) => unknown) => callback(prisma as never));
    (jwtService.sign as jest.Mock).mockReturnValue('mock-token');
    (adminIdentity.resolveRole as jest.Mock).mockImplementation(
      (user: { role: string }) => user.role,
    );
    service = new AuthService(configService, jwtService, adminIdentity);
  });

  it('signs login tokens with the env-overridden role', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'owner',
      email: 'owner@example.com',
      passwordHash: 'hashed',
      role: 'user',
    });
    (adminIdentity.resolveRole as jest.Mock).mockReturnValue('super_admin');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    await service.login({
      username: 'owner',
      password: 'admin123',
    });

    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'super_admin',
      }),
      expect.any(Object),
    );
  });

  it('throws ConflictException when register hits an existing user', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: 'existing-user' });

    await expect(
      service.register({
        username: 'owner',
        email: 'owner@example.com',
        password: 'admin12345',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('throws UnauthorizedException when login credentials are invalid', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'owner',
      email: 'owner@example.com',
      passwordHash: 'hashed',
      role: 'user',
    });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(
      service.login({
        username: 'owner',
        password: 'bad-password',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('falls back to the existing user when dev login races on username creation', async () => {
    prisma.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'bootstrap-user',
        username: 'owner',
        email: 'owner@example.com',
        passwordHash: 'hashed',
        role: 'user',
      });
    prisma.user.count.mockResolvedValue(1);
    prisma.user.create.mockRejectedValue({
      code: 'P2002',
      meta: {
        target: ['username'],
      },
    });
    prisma.user.update.mockResolvedValue({
      id: 'bootstrap-user',
      username: 'owner',
      email: 'owner@example.com',
      passwordHash: 'hashed',
      role: 'admin',
    });
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');

    await expect(service.devLogin(' owner ', 'admin')).resolves.toEqual({
      accessToken: 'mock-token',
      refreshToken: 'mock-token',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'bootstrap-user' },
      data: { role: 'admin' },
    });
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        username: 'owner',
        role: 'admin',
      }),
      expect.any(Object),
    );
  });
});

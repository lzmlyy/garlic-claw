import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { getPrismaClient } from '../../src/infrastructure/prisma/prisma-client';
import { AdminIdentityService } from '../../src/auth/admin-identity.service';
import { ApiKeyService } from '../../src/auth/api-key.service';
import { RequestAuthService } from '../../src/auth/request-auth.service';

jest.mock('../../src/infrastructure/prisma/prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

describe('RequestAuthService', () => {
  const prisma = {
    user: {
      findUnique: jest.fn(),
    },
  };
  const configService = {
    get: jest.fn((key: string) => (key === 'JWT_SECRET' ? 'jwt-secret' : undefined)),
  } as never as ConfigService;
  const jwtService = {
    verify: jest.fn(),
  };
  const adminIdentity = {
    resolveRole: jest.fn((user: { role: string }) => user.role),
  } as never as AdminIdentityService;
  const apiKeys = {
    authenticateToken: jest.fn(),
  };

  let service: RequestAuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);
    service = new RequestAuthService(
      configService,
      jwtService as never as JwtService,
      adminIdentity,
      apiKeys as never as ApiKeyService,
    );
  });

  it('delegates api key requests to ApiKeyService.authenticateToken', async () => {
    const authenticatedUser = {
      authType: 'api_key',
      id: 'user-1',
      username: 'route-bot',
      email: 'route-bot@example.com',
      role: 'admin',
      scopes: ['conversation.message.write'],
      apiKeyId: 'key-1',
      apiKeyName: 'Route Bot',
    };
    apiKeys.authenticateToken.mockResolvedValue(authenticatedUser);

    await expect(
      service.authenticateApiKeyRequest({
        headers: { 'x-api-key': 'gca_key_key-1_secret' },
      } as never as Request),
    ).resolves.toEqual(authenticatedUser);
    expect(apiKeys.authenticateToken).toHaveBeenCalledWith('gca_key_key-1_secret');
  });

  it('loads the jwt user from prisma and applies the env-overridden role', async () => {
    jwtService.verify.mockReturnValue({ sub: 'user-1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      username: 'owner',
      email: 'owner@example.com',
      role: 'user',
    });
    (adminIdentity.resolveRole as jest.Mock).mockReturnValue('super_admin');

    await expect(
      service.authenticateJwtRequest({
        headers: { authorization: 'Bearer jwt-token' },
      } as never as Request),
    ).resolves.toEqual({
      authType: 'jwt',
      id: 'user-1',
      username: 'owner',
      email: 'owner@example.com',
      role: 'super_admin',
      scopes: [],
    });
  });

  it('rejects jwt requests without a bearer token', async () => {
    await expect(service.authenticateJwtRequest({ headers: {} } as never as Request)).rejects.toThrow(UnauthorizedException);
  });
});

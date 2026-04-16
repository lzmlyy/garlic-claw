import { createHash } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { getPrismaClient } from '../../src/infrastructure/prisma/prisma-client';
import { AdminIdentityService } from '../../src/auth/admin-identity.service';
import { ApiKeyService } from '../../src/auth/api-key.service';

jest.mock('../../src/infrastructure/prisma/prisma-client', () => ({
  getPrismaClient: jest.fn(),
}));

describe('ApiKeyService', () => {
  const prisma = {
    apiKey: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const adminIdentity = {
    resolveRole: jest.fn((user: { role: string }) => user.role),
  } as never as AdminIdentityService;

  let service: ApiKeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    (getPrismaClient as jest.Mock).mockReturnValue(prisma);
    service = new ApiKeyService(adminIdentity);
  });

  it('updates lastUsedAt and resolves the runtime role when authenticating a key', async () => {
    const secret = 'very-secret';
    prisma.apiKey.findUnique.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Route Bot',
      secretHash: createHash('sha256').update(secret).digest('hex'),
      scopesJson: '["conversation.message.write"]',
      revokedAt: null,
      expiresAt: null,
      user: {
        id: 'user-1',
        username: 'owner',
        email: 'owner@example.com',
        role: 'user',
      },
    });
    prisma.apiKey.update.mockResolvedValue(undefined);
    (adminIdentity.resolveRole as jest.Mock).mockReturnValue('super_admin');

    const authenticated = await service.authenticateToken(
      `gca_11111111-1111-4111-8111-111111111111_${secret}`,
    );

    expect(prisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '11111111-1111-4111-8111-111111111111' },
        data: expect.objectContaining({
          lastUsedAt: expect.any(Date),
        }),
      }),
    );
    expect(authenticated).toEqual(
      expect.objectContaining({
        id: 'user-1',
        role: 'super_admin',
        apiKeyId: '11111111-1111-4111-8111-111111111111',
      }),
    );
  });

  it('rejects invalid api keys', async () => {
    prisma.apiKey.findUnique.mockResolvedValue(null);

    await expect(service.authenticateToken('gca_key_missing_secret')).rejects.toThrow(UnauthorizedException);
  });
});

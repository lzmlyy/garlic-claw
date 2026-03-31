import { UnauthorizedException } from '@nestjs/common';
import type { ApiKeyScope } from '@garlic-claw/shared';
import { ApiKeyService } from './api-key.service';

describe('ApiKeyService', () => {
  const prisma = {
    apiKey: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
  const adminIdentity = {
    resolveRole: jest.fn((user: { role: string }) => user.role),
  };

  let service: ApiKeyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApiKeyService(prisma as never, adminIdentity as never);
  });

  it('creates a scoped api key and stores only the hashed secret', async () => {
    prisma.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: data.id,
      userId: data.userId,
      name: data.name,
      keyPrefix: data.keyPrefix,
      scopesJson: data.scopesJson,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date('2026-03-31T08:00:00.000Z'),
      updatedAt: new Date('2026-03-31T08:00:00.000Z'),
    }));

    const result = await service.createKey('user-1', {
      name: 'Route Bot',
      scopes: ['plugin.route.invoke'],
    });

    expect(result.token).toMatch(
      /^gca_[0-9a-f-]{36}_[A-Za-z0-9_-]+$/,
    );
    const tokenMatch = /^gca_([0-9a-f-]{36})_[A-Za-z0-9_-]+$/.exec(result.token);
    expect(tokenMatch).not.toBeNull();
    expect(prisma.apiKey.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-1',
          name: 'Route Bot',
          keyPrefix: expect.stringMatching(/^gca_[0-9a-f]{8}$/),
          scopesJson: JSON.stringify(['plugin.route.invoke']),
          secretHash: expect.any(String),
        }),
      }),
    );
    expect(
      prisma.apiKey.create.mock.calls[0][0].data.secretHash as string,
    ).not.toContain(result.token);
    expect(result.scopes).toEqual(['plugin.route.invoke']);
  });

  it('authenticates a valid token and updates the last used timestamp', async () => {
    prisma.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: data.id,
      userId: data.userId,
      name: data.name,
      keyPrefix: data.keyPrefix,
      scopesJson: data.scopesJson,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date('2026-03-31T08:00:00.000Z'),
      updatedAt: new Date('2026-03-31T08:00:00.000Z'),
    }));
    const created = await service.createKey('user-1', {
      name: 'Route Bot',
      scopes: ['plugin.route.invoke', 'conversation.message.write'],
    });
    const tokenMatch = /^gca_([0-9a-f-]{36})_[A-Za-z0-9_-]+$/.exec(created.token);
    expect(tokenMatch).not.toBeNull();
    const storedData = prisma.apiKey.create.mock.calls[0][0].data as {
      id: string;
      name: string;
      secretHash: string;
      scopesJson: string;
    };
    prisma.apiKey.findUnique.mockResolvedValue({
      id: storedData.id,
      userId: 'user-1',
      name: storedData.name,
      secretHash: storedData.secretHash,
      scopesJson: storedData.scopesJson,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date('2026-03-31T08:00:00.000Z'),
      updatedAt: new Date('2026-03-31T08:00:00.000Z'),
      user: {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        role: 'user',
      },
    });
    prisma.apiKey.update.mockResolvedValue(null);

    await expect(service.authenticateToken(created.token)).resolves.toMatchObject({
      authType: 'api_key',
      id: 'user-1',
      username: 'alice',
      apiKeyId: storedData.id,
      scopes: [
        'conversation.message.write',
        'plugin.route.invoke',
      ] satisfies ApiKeyScope[],
    });
    expect(prisma.apiKey.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: tokenMatch?.[1],
        },
      }),
    );
    expect(prisma.apiKey.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: storedData.id,
        },
        data: {
          lastUsedAt: expect.any(Date),
        },
      }),
    );
  });

  it('rejects revoked api keys', async () => {
    prisma.apiKey.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: data.id,
      userId: data.userId,
      name: data.name,
      keyPrefix: data.keyPrefix,
      scopesJson: data.scopesJson,
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: new Date('2026-03-31T08:00:00.000Z'),
      updatedAt: new Date('2026-03-31T08:00:00.000Z'),
    }));
    const created = await service.createKey('user-1', {
      name: 'Route Bot',
      scopes: ['plugin.route.invoke'],
    });
    const tokenMatch = /^gca_([0-9a-f-]{36})_[A-Za-z0-9_-]+$/.exec(created.token);
    prisma.apiKey.findUnique.mockResolvedValue({
      id: tokenMatch?.[1],
      userId: 'user-1',
      name: 'Route Bot',
      secretHash: prisma.apiKey.create.mock.calls[0][0].data.secretHash,
      scopesJson: JSON.stringify(['plugin.route.invoke']),
      expiresAt: null,
      revokedAt: new Date('2026-03-31T09:00:00.000Z'),
      createdAt: new Date('2026-03-31T08:00:00.000Z'),
      updatedAt: new Date('2026-03-31T08:00:00.000Z'),
      user: {
        id: 'user-1',
        username: 'alice',
        email: 'alice@example.com',
        role: 'user',
      },
    });

    await expect(
      service.authenticateToken(created.token),
    ).rejects.toThrow(UnauthorizedException);
  });
});

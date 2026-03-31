import { ApiKeyController } from './api-key.controller';

describe('ApiKeyController', () => {
  const apiKeys = {
    listKeys: jest.fn(),
    createKey: jest.fn(),
    revokeKey: jest.fn(),
  };

  let controller: ApiKeyController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ApiKeyController(apiKeys as never);
  });

  it('lists api keys for the current user', async () => {
    apiKeys.listKeys.mockResolvedValue([
      {
        id: 'key-1',
        name: 'Route Bot',
        keyPrefix: 'gca_11111111',
        scopes: ['plugin.route.invoke'],
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: '2026-03-31T08:00:00.000Z',
        updatedAt: '2026-03-31T08:00:00.000Z',
      },
    ]);

    await expect(controller.listKeys('user-1')).resolves.toEqual([
      expect.objectContaining({
        id: 'key-1',
        scopes: ['plugin.route.invoke'],
      }),
    ]);
  });

  it('creates a new api key for the current user', async () => {
    apiKeys.createKey.mockResolvedValue({
      id: 'key-1',
      name: 'Route Bot',
      keyPrefix: 'gca_11111111',
      token: 'gca_11111111-1111-4111-8111-111111111111_secret',
      scopes: ['plugin.route.invoke'],
      lastUsedAt: null,
      expiresAt: null,
      revokedAt: null,
      createdAt: '2026-03-31T08:00:00.000Z',
      updatedAt: '2026-03-31T08:00:00.000Z',
    });

    await expect(
      controller.createKey('user-1', {
        name: 'Route Bot',
        scopes: ['plugin.route.invoke'],
      } as never),
    ).resolves.toEqual(
      expect.objectContaining({
        token: 'gca_11111111-1111-4111-8111-111111111111_secret',
      }),
    );
    expect(apiKeys.createKey).toHaveBeenCalledWith('user-1', {
      name: 'Route Bot',
      scopes: ['plugin.route.invoke'],
    });
  });

  it('revokes an api key owned by the current user', async () => {
    apiKeys.revokeKey.mockResolvedValue({
      id: 'key-1',
      revokedAt: '2026-03-31T09:00:00.000Z',
    });

    await expect(controller.revokeKey('user-1', 'key-1')).resolves.toEqual(
      expect.objectContaining({
        revokedAt: '2026-03-31T09:00:00.000Z',
      }),
    );
  });
});

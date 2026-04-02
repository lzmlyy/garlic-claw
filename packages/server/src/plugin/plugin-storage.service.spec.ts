import { PluginStorageService } from './plugin-storage.service';

describe('PluginStorageService', () => {
  const prisma = {
    plugin: {
      findUnique: jest.fn(),
    },
    pluginStorage: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  let service: PluginStorageService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginStorageService(prisma as never);
  });

  it('stores persistent plugin kv values and lists them by prefix', async () => {
    prisma.plugin.findUnique.mockResolvedValue({
      id: 'plugin-1',
      name: 'builtin.memory-context',
    });
    prisma.pluginStorage.upsert.mockResolvedValue({
      pluginId: 'plugin-1',
      key: 'cursor.lastMessageId',
      valueJson: JSON.stringify('message-42'),
    });
    prisma.pluginStorage.findUnique.mockResolvedValue({
      pluginId: 'plugin-1',
      key: 'cursor.lastMessageId',
      valueJson: JSON.stringify('message-42'),
    });
    prisma.pluginStorage.findMany.mockResolvedValue([
      {
        key: 'cursor.lastMessageId',
        valueJson: JSON.stringify('message-42'),
      },
      {
        key: 'cursor.offset',
        valueJson: JSON.stringify(3),
      },
    ]);
    prisma.pluginStorage.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      service.setPluginStorage(
        'builtin.memory-context',
        'cursor.lastMessageId',
        'message-42',
      ),
    ).resolves.toBe('message-42');
    await expect(
      service.getPluginStorage(
        'builtin.memory-context',
        'cursor.lastMessageId',
      ),
    ).resolves.toBe('message-42');
    await expect(
      service.listPluginStorage('builtin.memory-context', 'cursor.'),
    ).resolves.toEqual([
      {
        key: 'cursor.lastMessageId',
        value: 'message-42',
      },
      {
        key: 'cursor.offset',
        value: 3,
      },
    ]);
    await expect(
      service.deletePluginStorage(
        'builtin.memory-context',
        'cursor.lastMessageId',
      ),
    ).resolves.toBe(true);

    expect(prisma.pluginStorage.upsert).toHaveBeenCalledWith({
      where: {
        pluginId_key: {
          pluginId: 'plugin-1',
          key: 'cursor.lastMessageId',
        },
      },
      create: {
        pluginId: 'plugin-1',
        key: 'cursor.lastMessageId',
        valueJson: JSON.stringify('message-42'),
      },
      update: {
        valueJson: JSON.stringify('message-42'),
      },
    });
    expect(prisma.pluginStorage.findMany).toHaveBeenCalledWith({
      where: {
        pluginId: 'plugin-1',
        key: {
          startsWith: 'cursor.',
        },
      },
      orderBy: {
        key: 'asc',
      },
    });
    expect(prisma.pluginStorage.deleteMany).toHaveBeenCalledWith({
      where: {
        pluginId: 'plugin-1',
        key: 'cursor.lastMessageId',
      },
    });
  });

  it('returns warn-safe null fallback for malformed stored json values', async () => {
    prisma.plugin.findUnique.mockResolvedValue({
      id: 'plugin-2',
      name: 'builtin.broken-json',
    });
    prisma.pluginStorage.findUnique.mockResolvedValue({
      pluginId: 'plugin-2',
      key: 'broken.value',
      valueJson: '{bad-json',
    });
    prisma.pluginStorage.findMany.mockResolvedValue([
      {
        key: 'broken.value',
        valueJson: '{bad-json',
      },
    ]);

    await expect(
      service.getPluginStorage('builtin.broken-json', 'broken.value'),
    ).resolves.toBeNull();
    await expect(
      service.listPluginStorage('builtin.broken-json', 'broken.'),
    ).resolves.toEqual([
      {
        key: 'broken.value',
        value: null,
      },
    ]);
  });
});

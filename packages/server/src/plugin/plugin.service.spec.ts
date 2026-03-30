import { BadRequestException } from '@nestjs/common';
import type {
  PluginConfigSchema,
  PluginManifest,
} from '@garlic-claw/shared';
import { PluginService } from './plugin.service';

describe('PluginService', () => {
  const prisma = {
    plugin: {
      upsert: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    pluginStorage: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    pluginEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  const configSchema: PluginConfigSchema = {
    fields: [
      {
        key: 'limit',
        type: 'number',
        required: true,
        defaultValue: 5,
        description: '记忆检索数量',
      },
      {
        key: 'promptPrefix',
        type: 'string',
        defaultValue: '与此用户相关的记忆',
        description: '拼接到提示词前的前缀',
      },
    ],
  };

  const manifest: PluginManifest = {
    id: 'builtin.memory-context',
    name: '记忆上下文',
    version: '1.0.0',
    runtime: 'builtin',
    permissions: ['memory:read', 'config:read'],
    tools: [],
    hooks: [
      {
        name: 'chat:before-model',
      },
    ],
    routes: [
      {
        path: 'inspect/context',
        methods: ['GET'],
      },
    ],
    config: configSchema,
  };

  let service: PluginService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginService(prisma as never);
  });

  it('persists manifest governance metadata during plugin registration', async () => {
    prisma.plugin.upsert.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        runtimeKind: 'builtin',
        version: '1.0.0',
        permissions: JSON.stringify(['memory:read', 'config:read']),
        hooks: JSON.stringify([
          {
            name: 'chat:before-model',
          },
        ]),
        routes: JSON.stringify([
          {
            path: 'inspect/context',
            methods: ['GET'],
          },
        ]),
        configSchema: JSON.stringify(configSchema),
        config: JSON.stringify({
          limit: 8,
        }),
        defaultEnabled: true,
        conversationScopes: JSON.stringify({
          'conversation-1': false,
        }),
      }),
    );

    const snapshot = await service.registerPlugin(
      'builtin.memory-context',
      'builtin',
      manifest,
    );

    expect(prisma.plugin.upsert).toHaveBeenCalledWith({
      where: {
        name: 'builtin.memory-context',
      },
      create: expect.objectContaining({
        name: 'builtin.memory-context',
        deviceType: 'builtin',
        runtimeKind: 'builtin',
        version: '1.0.0',
        permissions: JSON.stringify(['memory:read', 'config:read']),
        hooks: JSON.stringify([
          {
            name: 'chat:before-model',
          },
        ]),
        routes: JSON.stringify([
          {
            path: 'inspect/context',
            methods: ['GET'],
          },
        ]),
        configSchema: JSON.stringify(configSchema),
      }),
      update: expect.objectContaining({
        deviceType: 'builtin',
        runtimeKind: 'builtin',
        version: '1.0.0',
        permissions: JSON.stringify(['memory:read', 'config:read']),
        hooks: JSON.stringify([
          {
            name: 'chat:before-model',
          },
        ]),
        routes: JSON.stringify([
          {
            path: 'inspect/context',
            methods: ['GET'],
          },
        ]),
        configSchema: JSON.stringify(configSchema),
      }),
    });
    expect(snapshot).toEqual({
      configSchema,
      resolvedConfig: {
        limit: 8,
        promptPrefix: '与此用户相关的记忆',
      },
      scope: {
        defaultEnabled: true,
        conversations: {
          'conversation-1': false,
        },
      },
    });
    expect(prisma.pluginEvent.create).toHaveBeenCalledWith({
      data: {
        pluginId: 'plugin-1',
        type: 'register',
        level: 'info',
        message: '插件已注册',
        metadataJson: null,
      },
    });
  });

  it('records lifecycle online instead of register when an existing plugin is reloaded', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        id: 'plugin-1',
        name: 'builtin.memory-context',
      }),
    );
    prisma.plugin.upsert.mockResolvedValue(
      createPluginRecord({
        id: 'plugin-1',
        name: 'builtin.memory-context',
        runtimeKind: 'builtin',
      }),
    );

    await service.registerPlugin('builtin.memory-context', 'builtin', manifest);

    expect(prisma.pluginEvent.create).toHaveBeenCalledWith({
      data: {
        pluginId: 'plugin-1',
        type: 'lifecycle:online',
        level: 'info',
        message: '插件已上线',
        metadataJson: null,
      },
    });
  });

  it('validates plugin config values against the declared schema', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        configSchema: JSON.stringify(configSchema),
        config: JSON.stringify({
          limit: 8,
        }),
      }),
    );

    await expect(
      service.updatePluginConfig('builtin.memory-context', {
        limit: 'oops' as never,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.plugin.update).not.toHaveBeenCalled();
  });

  it('updates plugin config and returns resolved values with defaults', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        configSchema: JSON.stringify(configSchema),
        config: JSON.stringify({
          limit: 8,
        }),
      }),
    );
    prisma.plugin.update.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        configSchema: JSON.stringify(configSchema),
        config: JSON.stringify({
          limit: 6,
          promptPrefix: '已知用户记忆',
        }),
      }),
    );

    const result = await service.updatePluginConfig('builtin.memory-context', {
      limit: 6,
      promptPrefix: '已知用户记忆',
    });

    expect(prisma.plugin.update).toHaveBeenCalledWith({
      where: {
        name: 'builtin.memory-context',
      },
      data: {
        config: JSON.stringify({
          limit: 6,
          promptPrefix: '已知用户记忆',
        }),
      },
    });
    expect(result).toEqual({
      schema: configSchema,
      values: {
        limit: 6,
        promptPrefix: '已知用户记忆',
      },
    });
  });

  it('stores plugin scope rules and returns the normalized result', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        runtimeKind: 'builtin',
      }),
    );
    prisma.plugin.update.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        defaultEnabled: false,
        conversationScopes: JSON.stringify({
          'conversation-1': true,
          'conversation-2': false,
        }),
      }),
    );

    const result = await service.updatePluginScope('builtin.memory-context', {
      defaultEnabled: false,
      conversations: {
        'conversation-1': true,
        'conversation-2': false,
      },
    });

    expect(prisma.plugin.update).toHaveBeenCalledWith({
      where: {
        name: 'builtin.memory-context',
      },
      data: {
        defaultEnabled: false,
        conversationScopes: JSON.stringify({
          'conversation-1': true,
          'conversation-2': false,
        }),
      },
    });
    expect(result).toEqual({
      defaultEnabled: false,
      conversations: {
        'conversation-1': true,
        'conversation-2': false,
      },
    });
  });

  it('rejects disabling a protected builtin plugin through the default scope switch', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.core-tools',
        runtimeKind: 'builtin',
      }),
    );

    await expect(
      service.updatePluginScope('builtin.core-tools', {
        defaultEnabled: false,
        conversations: {},
      }),
    ).rejects.toThrow('基础内建工具属于宿主必需插件，不能禁用。');

    expect(prisma.plugin.update).not.toHaveBeenCalled();
  });

  it('rejects per-conversation disable overrides for protected builtin plugins', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.core-tools',
        runtimeKind: 'builtin',
      }),
    );

    await expect(
      service.updatePluginScope('builtin.core-tools', {
        defaultEnabled: true,
        conversations: {
          'conversation-1': false,
        },
      }),
    ).rejects.toThrow('基础内建工具属于宿主必需插件，不能禁用。');

    expect(prisma.plugin.update).not.toHaveBeenCalled();
  });

  it('stores persistent plugin kv values and lists them by prefix', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        id: 'plugin-1',
        name: 'builtin.memory-context',
      }),
    );
    prisma.pluginStorage.upsert.mockResolvedValue(
      createPluginStorageRecord({
        pluginId: 'plugin-1',
        key: 'cursor.lastMessageId',
        valueJson: JSON.stringify('message-42'),
      }),
    );
    prisma.pluginStorage.findUnique.mockResolvedValue(
      createPluginStorageRecord({
        pluginId: 'plugin-1',
        key: 'cursor.lastMessageId',
        valueJson: JSON.stringify('message-42'),
      }),
    );
    prisma.pluginStorage.findMany.mockResolvedValue([
      createPluginStorageRecord({
        pluginId: 'plugin-1',
        key: 'cursor.lastMessageId',
        valueJson: JSON.stringify('message-42'),
      }),
      createPluginStorageRecord({
        pluginId: 'plugin-1',
        key: 'cursor.offset',
        valueJson: JSON.stringify(3),
      }),
    ]);
    prisma.pluginStorage.deleteMany.mockResolvedValue({ count: 1 });

    await expect(
      (service as any).setPluginStorage(
        'builtin.memory-context',
        'cursor.lastMessageId',
        'message-42',
      ),
    ).resolves.toBe('message-42');
    await expect(
      (service as any).getPluginStorage(
        'builtin.memory-context',
        'cursor.lastMessageId',
      ),
    ).resolves.toBe('message-42');
    await expect(
      (service as any).listPluginStorage('builtin.memory-context', 'cursor.'),
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
      (service as any).deletePluginStorage(
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

  it('records plugin failures into health snapshot and event log', async () => {
    prisma.plugin.findUnique
      .mockResolvedValueOnce(
      createPluginRecord({
        id: 'plugin-1',
        name: 'builtin.memory-context',
        status: 'online',
        healthStatus: 'healthy',
        failureCount: 1,
        consecutiveFailures: 0,
        lastSuccessAt: new Date('2026-03-27T11:58:00.000Z'),
        lastError: null,
        lastErrorAt: null,
        lastCheckedAt: new Date('2026-03-27T11:59:00.000Z'),
      }),
      )
      .mockResolvedValueOnce(
        createPluginRecord({
          id: 'plugin-1',
          name: 'builtin.memory-context',
          status: 'online',
          healthStatus: 'degraded',
          failureCount: 2,
          consecutiveFailures: 1,
          lastSuccessAt: new Date('2026-03-27T11:58:00.000Z'),
          lastError: 'memory.search timeout',
          lastErrorAt: new Date('2026-03-27T12:00:00.000Z'),
          lastCheckedAt: new Date('2026-03-27T12:00:00.000Z'),
        }),
      )
      .mockResolvedValueOnce(
        createPluginRecord({
          id: 'plugin-1',
          name: 'builtin.memory-context',
          status: 'online',
          healthStatus: 'degraded',
          failureCount: 2,
          consecutiveFailures: 1,
          lastSuccessAt: new Date('2026-03-27T11:58:00.000Z'),
          lastError: 'memory.search timeout',
          lastErrorAt: new Date('2026-03-27T12:00:00.000Z'),
          lastCheckedAt: new Date('2026-03-27T12:00:00.000Z'),
        }),
      );
    prisma.plugin.update.mockResolvedValue(
      createPluginRecord({
        id: 'plugin-1',
        name: 'builtin.memory-context',
        status: 'online',
        healthStatus: 'degraded',
        failureCount: 2,
        consecutiveFailures: 1,
        lastSuccessAt: new Date('2026-03-27T11:58:00.000Z'),
        lastError: 'memory.search timeout',
        lastErrorAt: new Date('2026-03-27T12:00:00.000Z'),
        lastCheckedAt: new Date('2026-03-27T12:00:00.000Z'),
      }),
    );
    prisma.pluginEvent.findMany.mockResolvedValue([
      createPluginEventRecord({
        pluginId: 'plugin-1',
        type: 'tool:error',
        level: 'error',
        message: 'memory.search timeout',
        metadataJson: JSON.stringify({
          toolName: 'memory.search',
        }),
      }),
    ]);

    await expect(
      (service as any).recordPluginFailure('builtin.memory-context', {
        type: 'tool:error',
        message: 'memory.search timeout',
        metadata: {
          toolName: 'memory.search',
        },
      }),
    ).resolves.toBeUndefined();
    await expect(
      (service as any).getPluginHealth('builtin.memory-context'),
    ).resolves.toEqual({
      status: 'degraded',
      failureCount: 2,
      consecutiveFailures: 1,
      lastError: 'memory.search timeout',
      lastErrorAt: '2026-03-27T12:00:00.000Z',
      lastSuccessAt: '2026-03-27T11:58:00.000Z',
      lastCheckedAt: '2026-03-27T12:00:00.000Z',
    });
    await expect(
      (service as any).listPluginEvents('builtin.memory-context', 10),
    ).resolves.toEqual({
      items: [
        {
          id: 'event-1',
          type: 'tool:error',
          level: 'error',
          message: 'memory.search timeout',
          metadata: {
            toolName: 'memory.search',
          },
          createdAt: '2026-03-27T12:00:00.000Z',
        },
      ],
      nextCursor: null,
    });

    expect(prisma.plugin.update).toHaveBeenCalledWith({
      where: {
        name: 'builtin.memory-context',
      },
      data: expect.objectContaining({
        healthStatus: 'degraded',
        failureCount: 2,
        consecutiveFailures: 1,
        lastError: 'memory.search timeout',
      }),
    });
    expect(prisma.pluginEvent.create).toHaveBeenCalledWith({
      data: {
        pluginId: 'plugin-1',
        type: 'tool:error',
        level: 'error',
        message: 'memory.search timeout',
        metadataJson: JSON.stringify({
          toolName: 'memory.search',
        }),
      },
    });
  });

  it('filters and paginates plugin event logs on the server side', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        id: 'plugin-1',
        name: 'builtin.memory-context',
      }),
    );
    prisma.pluginEvent.findMany.mockResolvedValue([
      createPluginEventRecord({
        id: 'event-3',
        pluginId: 'plugin-1',
        type: 'tool:error',
        level: 'error',
        message: 'memory.search timeout',
        metadataJson: JSON.stringify({
          toolName: 'memory.search',
        }),
        createdAt: new Date('2026-03-27T12:03:00.000Z'),
      }),
      createPluginEventRecord({
        id: 'event-2',
        pluginId: 'plugin-1',
        type: 'tool:error',
        level: 'error',
        message: 'memory.search timeout again',
        metadataJson: JSON.stringify({
          toolName: 'memory.search',
        }),
        createdAt: new Date('2026-03-27T12:02:00.000Z'),
      }),
      createPluginEventRecord({
        id: 'event-1',
        pluginId: 'plugin-1',
        type: 'tool:error',
        level: 'error',
        message: 'memory.search timeout older',
        metadataJson: JSON.stringify({
          toolName: 'memory.search',
        }),
        createdAt: new Date('2026-03-27T12:01:00.000Z'),
      }),
    ]);

    await expect(
      (service as any).listPluginEvents('builtin.memory-context', {
        limit: 2,
        level: 'error',
        type: 'tool:error',
        keyword: 'memory.search',
      }),
    ).resolves.toEqual({
      items: [
        {
          id: 'event-3',
          type: 'tool:error',
          level: 'error',
          message: 'memory.search timeout',
          metadata: {
            toolName: 'memory.search',
          },
          createdAt: '2026-03-27T12:03:00.000Z',
        },
        {
          id: 'event-2',
          type: 'tool:error',
          level: 'error',
          message: 'memory.search timeout again',
          metadata: {
            toolName: 'memory.search',
          },
          createdAt: '2026-03-27T12:02:00.000Z',
        },
      ],
      nextCursor: 'event-1',
    });

    expect(prisma.pluginEvent.findMany).toHaveBeenCalledWith({
      where: {
        pluginId: 'plugin-1',
        level: 'error',
        type: 'tool:error',
        OR: [
          {
            type: {
              contains: 'memory.search',
            },
          },
          {
            message: {
              contains: 'memory.search',
            },
          },
          {
            metadataJson: {
              contains: 'memory.search',
            },
          },
        ],
      },
      orderBy: [
        {
          createdAt: 'desc',
        },
        {
          id: 'desc',
        },
      ],
      take: 3,
    });
  });

  it('records plugin-authored event logs without mutating health snapshot', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        id: 'plugin-1',
        name: 'builtin.memory-context',
        status: 'online',
        healthStatus: 'degraded',
        failureCount: 2,
        consecutiveFailures: 1,
        lastSuccessAt: new Date('2026-03-27T11:58:00.000Z'),
        lastError: 'memory.search timeout',
        lastErrorAt: new Date('2026-03-27T12:00:00.000Z'),
        lastCheckedAt: new Date('2026-03-27T12:00:00.000Z'),
      }),
    );
    prisma.pluginEvent.create.mockResolvedValue(
      createPluginEventRecord({
        pluginId: 'plugin-1',
        type: 'plugin:config',
        level: 'warn',
        message: '缺少 limit 配置，已回退默认值',
        metadataJson: JSON.stringify({
          field: 'limit',
        }),
      }),
    );

    await expect(
      (service as any).recordPluginEvent('builtin.memory-context', {
        level: 'warn',
        type: 'plugin:config',
        message: '缺少 limit 配置，已回退默认值',
        metadata: {
          field: 'limit',
        },
      }),
    ).resolves.toBeUndefined();

    expect(prisma.plugin.update).not.toHaveBeenCalled();
    expect(prisma.pluginEvent.create).toHaveBeenCalledWith({
      data: {
        pluginId: 'plugin-1',
        type: 'plugin:config',
        level: 'warn',
        message: '缺少 limit 配置，已回退默认值',
        metadataJson: JSON.stringify({
          field: 'limit',
        }),
      },
    });
  });

  it('falls back to safe defaults when persisted plugin json is malformed', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.broken-json',
        permissions: '{not-json',
        hooks: '{not-json',
        routes: '{not-json',
        configSchema: '{not-json',
        config: '{not-json',
        conversationScopes: '{not-json',
      }),
    );
    prisma.pluginStorage.findUnique.mockResolvedValue(
      createPluginStorageRecord({
        pluginId: 'plugin-1',
        key: 'broken.value',
        valueJson: '{not-json',
      }),
    );
    prisma.pluginStorage.findMany.mockResolvedValue([
      createPluginStorageRecord({
        pluginId: 'plugin-1',
        key: 'broken.value',
        valueJson: '{not-json',
      }),
    ]);

    await expect(service.getPluginConfig('builtin.broken-json')).resolves.toEqual({
      schema: null,
      values: {},
    });
    await expect(service.getPluginScope('builtin.broken-json')).resolves.toEqual({
      defaultEnabled: true,
      conversations: {},
    });
    await expect(service.getPluginSelfInfo('builtin.broken-json')).resolves.toEqual({
      id: 'builtin.broken-json',
      name: 'builtin.broken-json',
      runtimeKind: 'builtin',
      version: '1.0.0',
      permissions: [],
      hooks: [],
      routes: [],
    });
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

/**
 * 创建最小 Prisma 插件记录桩。
 * @param overrides 需要覆盖的字段
 * @returns 与测试场景兼容的插件记录对象
 */
function createPluginRecord(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'plugin-1',
    name: 'builtin.memory-context',
    deviceType: 'builtin',
    runtimeKind: 'builtin',
    status: 'online',
    capabilities: '[]',
    version: '1.0.0',
    permissions: '[]',
    hooks: '[]',
    configSchema: null,
    config: null,
    defaultEnabled: true,
    conversationScopes: '{}',
    healthStatus: 'healthy',
    failureCount: 0,
    consecutiveFailures: 0,
    lastError: null,
    lastErrorAt: null,
    lastSuccessAt: null,
    lastCheckedAt: null,
    lastSeenAt: new Date('2026-03-27T12:00:00.000Z'),
    createdAt: new Date('2026-03-27T12:00:00.000Z'),
    updatedAt: new Date('2026-03-27T12:00:00.000Z'),
    ...overrides,
  };
}

/**
 * 创建最小 Prisma 插件存储记录桩。
 * @param overrides 需要覆盖的字段
 * @returns 与测试场景兼容的插件存储记录
 */
function createPluginStorageRecord(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'storage-1',
    pluginId: 'plugin-1',
    key: 'cursor.lastMessageId',
    valueJson: JSON.stringify('message-42'),
    createdAt: new Date('2026-03-27T12:00:00.000Z'),
    updatedAt: new Date('2026-03-27T12:00:00.000Z'),
    ...overrides,
  };
}

/**
 * 创建最小 Prisma 插件事件记录桩。
 * @param overrides 需要覆盖的字段
 * @returns 与测试场景兼容的插件事件记录
 */
function createPluginEventRecord(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  return {
    id: 'event-1',
    pluginId: 'plugin-1',
    type: 'tool:error',
    level: 'error',
    message: 'memory.search timeout',
    metadataJson: JSON.stringify({
      toolName: 'memory.search',
    }),
    createdAt: new Date('2026-03-27T12:00:00.000Z'),
    ...overrides,
  };
}

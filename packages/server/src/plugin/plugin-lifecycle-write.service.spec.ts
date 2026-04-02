import type { PluginManifest } from '@garlic-claw/shared';
import { BadRequestException } from '@nestjs/common';
import { serializePersistedPluginManifest } from './plugin-manifest.persistence';
import { PluginLifecycleWriteService } from './plugin-lifecycle-write.service';

describe('PluginLifecycleWriteService', () => {
  const prisma = {
    plugin: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    pluginEvent: {
      create: jest.fn(),
    },
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
    config: {
      fields: [
        {
          key: 'limit',
          type: 'number',
          required: true,
          defaultValue: 5,
        },
      ],
    },
  };

  let service: PluginLifecycleWriteService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginLifecycleWriteService(prisma as never);
  });

  it('persists manifest governance metadata during plugin registration', async () => {
    prisma.plugin.upsert.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        runtimeKind: 'builtin',
        version: '1.0.0',
        manifest,
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
    const persistedManifestJson = serializePersistedPluginManifest(manifest);

    expect(prisma.plugin.upsert).toHaveBeenCalledWith({
      where: {
        name: 'builtin.memory-context',
      },
      create: expect.objectContaining({
        name: 'builtin.memory-context',
        displayName: '记忆上下文',
        deviceType: 'builtin',
        runtimeKind: 'builtin',
        description: undefined,
        status: 'online',
        version: '1.0.0',
        manifestJson: persistedManifestJson,
        healthStatus: 'healthy',
        lastSeenAt: expect.any(Date),
      }),
      update: expect.objectContaining({
        displayName: '记忆上下文',
        deviceType: 'builtin',
        runtimeKind: 'builtin',
        description: undefined,
        status: 'online',
        version: '1.0.0',
        manifestJson: persistedManifestJson,
        healthStatus: 'healthy',
        lastSeenAt: expect.any(Date),
      }),
    });
    expect(snapshot).toEqual({
      configSchema: manifest.config,
      resolvedConfig: {
        limit: 8,
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

  it('persists online, offline, and heartbeat mutations', async () => {
    prisma.plugin.update
      .mockResolvedValueOnce({
        id: 'plugin-1',
      })
      .mockResolvedValueOnce({
        id: 'plugin-1',
      })
      .mockResolvedValueOnce({
        id: 'plugin-1',
      });

    await service.setOnline('builtin.memory-context');
    await service.setOffline('builtin.memory-context');
    await service.heartbeat('builtin.memory-context');

    expect(prisma.plugin.update).toHaveBeenNthCalledWith(1, {
      where: { name: 'builtin.memory-context' },
      data: expect.objectContaining({
        status: 'online',
        lastSeenAt: expect.any(Date),
      }),
    });
    expect(prisma.plugin.update).toHaveBeenNthCalledWith(2, {
      where: { name: 'builtin.memory-context' },
      data: expect.objectContaining({
        status: 'offline',
      }),
    });
    expect(prisma.plugin.update).toHaveBeenNthCalledWith(3, {
      where: { name: 'builtin.memory-context' },
      data: expect.objectContaining({
        lastSeenAt: expect.any(Date),
      }),
    });
  });

  it('rejects deleting an online plugin and deletes an offline plugin', async () => {
    prisma.plugin.findUnique
      .mockResolvedValueOnce({
        id: 'plugin-1',
        name: 'builtin.memory-context',
        status: 'online',
      })
      .mockResolvedValueOnce({
        id: 'plugin-1',
        name: 'builtin.memory-context',
        status: 'offline',
      });
    prisma.plugin.delete.mockResolvedValue({
      id: 'plugin-1',
      name: 'builtin.memory-context',
    });

    await expect(
      service.deletePlugin('builtin.memory-context'),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.deletePlugin('builtin.memory-context'),
    ).resolves.toEqual({
      id: 'plugin-1',
      name: 'builtin.memory-context',
    });
  });
});

function createPluginRecord(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const {
    manifest,
    manifestJson,
    ...recordOverrides
  } = overrides as Partial<Record<string, unknown>> & {
    manifest?: Partial<PluginManifest>;
    manifestJson?: string | null;
  };
  const name = typeof recordOverrides.name === 'string'
    ? recordOverrides.name
    : 'builtin.memory-context';
  const displayName = typeof recordOverrides.displayName === 'string'
    ? recordOverrides.displayName
    : name;
  const version = typeof recordOverrides.version === 'string'
    ? recordOverrides.version
    : '1.0.0';
  const runtime =
    recordOverrides.runtimeKind === 'remote'
      ? 'remote'
      : 'builtin';
  const persistedManifest: PluginManifest = {
    id: name,
    name: displayName,
    version,
    runtime,
    permissions: [],
    tools: [],
    hooks: [],
    routes: [],
    ...(typeof recordOverrides.description === 'string'
      ? { description: recordOverrides.description }
      : {}),
    ...(manifest ?? {}),
  };

  return {
    id: 'plugin-1',
    name,
    deviceType: 'builtin',
    runtimeKind: 'builtin',
    status: 'online',
    version,
    manifestJson:
      manifestJson !== undefined
        ? manifestJson
        : JSON.stringify(persistedManifest),
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
    ...recordOverrides,
  };
}

import type { PluginManifest } from '@garlic-claw/shared';
import { PluginReadService } from './plugin-read.service';

describe('PluginReadService', () => {
  const prisma = {
    plugin: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    pluginEvent: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };

  let service: PluginReadService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PluginReadService(prisma as never);
  });

  it('reads governance, config, scope, health, and self info from the persisted plugin record', async () => {
    prisma.plugin.findUnique.mockResolvedValue(
      createPluginRecord({
        name: 'builtin.memory-context',
        manifest: {
          id: 'builtin.memory-context',
          name: 'builtin.memory-context',
          version: '1.0.0',
          runtime: 'builtin',
          permissions: ['memory:read'],
          tools: [],
          hooks: [],
          routes: [],
          config: {
            fields: [
              {
                key: 'limit',
                type: 'number',
                defaultValue: 5,
              },
            ],
          },
        },
        config: JSON.stringify({
          limit: 8,
        }),
        defaultEnabled: false,
        conversationScopes: JSON.stringify({
          'conversation-1': true,
        }),
        healthStatus: 'degraded',
        failureCount: 2,
        consecutiveFailures: 1,
        lastError: 'memory.search timeout',
      }),
    );

    await expect(service.getGovernanceSnapshot('builtin.memory-context')).resolves.toEqual({
      configSchema: {
        fields: [
          {
            key: 'limit',
            type: 'number',
            defaultValue: 5,
          },
        ],
      },
      resolvedConfig: {
        limit: 8,
      },
      scope: {
        defaultEnabled: false,
        conversations: {
          'conversation-1': true,
        },
      },
    });
    await expect(service.getPluginConfig('builtin.memory-context')).resolves.toEqual({
      schema: {
        fields: [
          {
            key: 'limit',
            type: 'number',
            defaultValue: 5,
          },
        ],
      },
      values: {
        limit: 8,
      },
    });
    await expect(service.getResolvedConfig('builtin.memory-context')).resolves.toEqual({
      limit: 8,
    });
    await expect(service.getPluginScope('builtin.memory-context')).resolves.toEqual({
      defaultEnabled: false,
      conversations: {
        'conversation-1': true,
      },
    });
    await expect(service.getPluginHealth('builtin.memory-context')).resolves.toEqual({
      status: 'degraded',
      failureCount: 2,
      consecutiveFailures: 1,
      lastError: 'memory.search timeout',
      lastErrorAt: null,
      lastSuccessAt: null,
      lastCheckedAt: null,
    });
    await expect(service.getPluginSelfInfo('builtin.memory-context')).resolves.toEqual({
      id: 'builtin.memory-context',
      name: 'builtin.memory-context',
      runtimeKind: 'builtin',
      version: '1.0.0',
      permissions: ['memory:read'],
      hooks: [],
      routes: [],
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
      service.listPluginEvents('builtin.memory-context', {
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

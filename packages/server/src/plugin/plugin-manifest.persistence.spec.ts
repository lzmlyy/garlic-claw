import { parsePersistedPluginManifest } from './plugin-manifest.persistence';

describe('plugin-manifest.persistence', () => {
  it('keeps valid persisted manifest entries while dropping malformed ones', () => {
    const manifest = parsePersistedPluginManifest(
      JSON.stringify({
        name: '持久化插件',
        version: '1.2.3',
        runtime: 'builtin',
        permissions: [
          'memory:read',
          123,
        ],
        tools: [
          {
            name: 'lookup_memory',
            description: '查询记忆',
            parameters: {
              query: {
                type: 'string',
                required: true,
              },
            },
          },
          {
            name: 99,
          },
        ],
        hooks: [
          {
            name: 'message:received',
            priority: 2,
          },
          {
            name: 42,
          },
        ],
        routes: [
          {
            path: 'inspect/context',
            methods: ['GET'],
          },
          {
            path: 5,
            methods: ['TRACE'],
          },
        ],
        commands: [
          {
            kind: 'command',
            canonicalCommand: '/memory',
            path: ['memory'],
            aliases: ['/mem'],
            variants: ['/memory', '/mem'],
            priority: 1,
          },
          {
            kind: 'command',
            canonicalCommand: '/broken',
            path: 'bad',
          },
        ],
        crons: [
          {
            name: 'heartbeat',
            cron: '*/5 * * * *',
            enabled: true,
          },
          {
            name: 'broken',
            cron: 123,
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
            {
              key: 7,
              type: 'string',
            },
          ],
        },
      }),
      {
        id: 'builtin.memory-context',
        displayName: '记忆上下文',
        version: '0.0.1',
        runtimeKind: 'remote',
      },
    );

    expect(manifest).toEqual({
      id: 'builtin.memory-context',
      name: '持久化插件',
      version: '1.2.3',
      runtime: 'builtin',
      permissions: ['memory:read'],
      tools: [
        {
          name: 'lookup_memory',
          description: '查询记忆',
          parameters: {
            query: {
              type: 'string',
              required: true,
            },
          },
        },
      ],
      hooks: [
        {
          name: 'message:received',
          priority: 2,
        },
      ],
      routes: [
        {
          path: 'inspect/context',
          methods: ['GET'],
        },
      ],
      commands: [
        {
          kind: 'command',
          canonicalCommand: '/memory',
          path: ['memory'],
          aliases: ['/mem'],
          variants: ['/memory', '/mem'],
          priority: 1,
        },
      ],
      crons: [
        {
          name: 'heartbeat',
          cron: '*/5 * * * *',
          enabled: true,
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
    });
  });
});

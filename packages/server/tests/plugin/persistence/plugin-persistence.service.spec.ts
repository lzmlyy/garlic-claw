import { BadRequestException } from '@nestjs/common';
import { PluginPersistenceService } from '../../../src/plugin/persistence/plugin-persistence.service';

describe('PluginPersistenceService', () => {
  it('stores, lists and updates plugin records in memory', () => {
    const service = new PluginPersistenceService();

    service.upsertPlugin({
      connected: true,
      defaultEnabled: true,
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'builtin.ping',
        name: 'Builtin Ping',
        permissions: [],
        runtime: 'local',
        tools: [],
        version: '1.0.0',
        config: {
          type: 'object',
          items: {
            limit: {
              type: 'int',
              defaultValue: 5,
            },
          },
        },
      },
      pluginId: 'builtin.ping',
    });

    expect(service.listPlugins()).toHaveLength(1);
    expect(service.touchHeartbeat('builtin.ping', '2026-04-10T00:00:00.000Z')).toMatchObject({
      connected: true,
      lastSeenAt: '2026-04-10T00:00:00.000Z',
      status: 'online',
    });
    expect(service.setConnectionState('builtin.ping', false)).toMatchObject({
      connected: false,
      pluginId: 'builtin.ping',
      status: 'offline',
    });
    expect(service.getPluginConfig('builtin.ping')).toEqual({
      schema: {
        type: 'object',
        items: {
          limit: {
            type: 'int',
            defaultValue: 5,
          },
        },
      },
      values: {
        limit: 5,
      },
    });
    expect(service.updatePluginConfig('builtin.ping', { limit: 8 })).toEqual({
      schema: {
        type: 'object',
        items: {
          limit: {
            type: 'int',
            defaultValue: 5,
          },
        },
      },
      values: {
        limit: 8,
      },
    });
    expect(service.getPluginLlmPreference('builtin.ping')).toEqual({
      mode: 'inherit',
      modelId: null,
      providerId: null,
    });
    expect(service.updatePluginLlmPreference('builtin.ping', {
      mode: 'override',
      modelId: 'deepseek-reasoner',
      providerId: 'ds2api',
    })).toEqual({
      mode: 'override',
      modelId: 'deepseek-reasoner',
      providerId: 'ds2api',
    });
    expect(service.getPluginScope('builtin.ping')).toEqual({
      defaultEnabled: true,
      conversations: {},
    });
    expect(service.updatePluginScope('builtin.ping', {
        conversations: {
          'conversation-1': false,
        },
      })).toEqual({
      defaultEnabled: true,
      conversations: {
        'conversation-1': false,
      },
    });
    expect(service.getPluginScope('builtin.ping')).toEqual({
      defaultEnabled: true,
      conversations: {
        'conversation-1': false,
      },
    });
    expect(service.getPluginOrThrow('builtin.ping')).toMatchObject({
      createdAt: expect.any(String),
      llmPreference: {
        mode: 'override',
        modelId: 'deepseek-reasoner',
        providerId: 'ds2api',
      },
      status: 'offline',
      updatedAt: expect.any(String),
    });
  });

  it('rejects incomplete plugin llm override values', () => {
    const service = new PluginPersistenceService();

    service.upsertPlugin({
      connected: true,
      defaultEnabled: true,
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'builtin.ping',
        name: 'Builtin Ping',
        permissions: [],
        runtime: 'local',
        tools: [],
        version: '1.0.0',
      },
      pluginId: 'builtin.ping',
    });

    expect(() => service.updatePluginLlmPreference('builtin.ping', {
      mode: 'override',
      modelId: null,
      providerId: 'openai',
    })).toThrow(BadRequestException);
  });

  it('rejects config values that are outside declared options', () => {
    const service = new PluginPersistenceService();

    service.upsertPlugin({
      connected: true,
      defaultEnabled: true,
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'builtin.schema-options',
        name: 'Schema Options',
        permissions: [],
        runtime: 'local',
        tools: [],
        version: '1.0.0',
        config: {
          type: 'object',
          items: {
            locale: {
              type: 'string',
              options: [
                { value: 'zh-CN', label: '简体中文' },
                { value: 'en-US', label: 'English' },
              ],
            },
            tags: {
              type: 'list',
              renderType: 'select',
              options: [
                { value: 'safe', label: '安全' },
                { value: 'fast', label: '快速' },
              ],
            },
          },
        },
      },
      pluginId: 'builtin.schema-options',
    });

    expect(() => service.updatePluginConfig('builtin.schema-options', {
      locale: 'ja-JP',
      tags: ['safe'],
    })).toThrow(new BadRequestException('配置字段 locale 必须命中声明的 options'));

    expect(() => service.updatePluginConfig('builtin.schema-options', {
      locale: 'zh-CN',
      tags: ['safe', 'unknown'],
    })).toThrow(new BadRequestException('配置字段 tags.1 必须命中声明的 options'));
  });

  it('builds nested defaults and strips legacy unknown keys from config snapshots', () => {
    const service = new PluginPersistenceService();

    service.upsertPlugin({
      connected: true,
      configValues: {
        advanced: {
          mode: 'manual',
          staleNested: 'legacy',
        },
        staleRoot: 'legacy',
      },
      defaultEnabled: true,
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'builtin.object-tree',
        name: 'Object Tree',
        permissions: [],
        runtime: 'local',
        tools: [],
        version: '1.0.0',
        config: {
          type: 'object',
          items: {
            advanced: {
              type: 'object',
              items: {
                enabled: {
                  type: 'bool',
                  defaultValue: false,
                },
                mode: {
                  type: 'string',
                  defaultValue: 'auto',
                },
              },
            },
          },
        },
      },
      pluginId: 'builtin.object-tree',
    });

    expect(service.getPluginConfig('builtin.object-tree')).toEqual({
      schema: {
        type: 'object',
        items: {
          advanced: {
            type: 'object',
            items: {
              enabled: {
                type: 'bool',
                defaultValue: false,
              },
              mode: {
                type: 'string',
                defaultValue: 'auto',
              },
            },
          },
        },
      },
      values: {
        advanced: {
          enabled: false,
          mode: 'manual',
        },
      },
    });

    expect(() => service.updatePluginConfig('builtin.object-tree', {
      advanced: {
        enabled: true,
        staleNested: 'legacy',
      },
    })).toThrow(new BadRequestException('未知配置字段: advanced.staleNested'));
  });

  it('recursively resolves list item defaults and validates object items inside lists', () => {
    const service = new PluginPersistenceService();

    service.upsertPlugin({
      connected: true,
      defaultEnabled: true,
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'builtin.list-tree',
        name: 'List Tree',
        permissions: [],
        runtime: 'local',
        tools: [],
        version: '1.0.0',
        config: {
          type: 'object',
          items: {
            rules: {
              type: 'list',
              defaultValue: [
                {
                  enabled: false,
                },
              ],
              items: {
                type: 'object',
                items: {
                  enabled: {
                    type: 'bool',
                    defaultValue: true,
                  },
                  name: {
                    type: 'string',
                    defaultValue: 'default-rule',
                  },
                },
              },
            },
          },
        },
      },
      pluginId: 'builtin.list-tree',
    });

    expect(service.getPluginConfig('builtin.list-tree')).toEqual({
      schema: {
        type: 'object',
        items: {
          rules: {
            type: 'list',
            defaultValue: [
              {
                enabled: false,
              },
            ],
            items: {
              type: 'object',
              items: {
                enabled: {
                  type: 'bool',
                  defaultValue: true,
                },
                name: {
                  type: 'string',
                  defaultValue: 'default-rule',
                },
              },
            },
          },
        },
      },
      values: {
        rules: [
          {
            enabled: false,
            name: 'default-rule',
          },
        ],
      },
    });

    expect(() => service.updatePluginConfig('builtin.list-tree', {
      rules: [
        {
          enabled: true,
          extra: 'legacy',
        },
      ],
    })).toThrow(new BadRequestException('未知配置字段: rules.0.extra'));
  });

  it('rejects deleting connected plugins and deletes offline plugins', () => {
    const service = new PluginPersistenceService();

    service.upsertPlugin({
      connected: true,
      defaultEnabled: true,
      governance: { canDisable: true },
      lastSeenAt: null,
      manifest: {
        id: 'builtin.ping',
        name: 'Builtin Ping',
        permissions: [],
        runtime: 'local',
        tools: [],
        version: '1.0.0',
      },
      pluginId: 'builtin.ping',
    });

    expect(() => service.deletePlugin('builtin.ping')).toThrow(BadRequestException);
    service.setConnectionState('builtin.ping', false);
    expect(service.deletePlugin('builtin.ping')).toMatchObject({
      pluginId: 'builtin.ping',
    });
    expect(service.listPlugins()).toEqual([]);
  });

  it('records, filters and pages plugin events in memory', () => {
    const service = new PluginPersistenceService();

    service.recordPluginEvent('builtin.ping', {
      level: 'info',
      message: 'saved memory',
      metadata: { tool: 'memory.save' },
      type: 'tool:success',
    });
    service.recordPluginEvent('builtin.ping', {
      level: 'error',
      message: 'memory save failed',
      metadata: { tool: 'memory.save' },
      type: 'tool:error',
    });

    expect(service.listPluginEvents('builtin.ping')).toEqual({
      items: [
        expect.objectContaining({ level: 'error', type: 'tool:error' }),
        expect.objectContaining({ level: 'info', type: 'tool:success' }),
      ],
      nextCursor: null,
    });
    expect(service.listPluginEvents('builtin.ping', { keyword: 'failed' }).items).toEqual([
      expect.objectContaining({ type: 'tool:error' }),
    ]);
    expect(service.listPluginEvents('builtin.ping', { level: 'info', limit: 1 })).toEqual({
      items: [expect.objectContaining({ type: 'tool:success' })],
      nextCursor: null,
    });
  });
});

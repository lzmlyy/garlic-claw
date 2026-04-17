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
        runtime: 'builtin',
        tools: [],
        version: '1.0.0',
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
        fields: [
          {
            key: 'limit',
            type: 'number',
            defaultValue: 5,
          },
        ],
      },
      values: {
        limit: 5,
      },
    });
    expect(service.updatePluginConfig('builtin.ping', { limit: 8 })).toEqual({
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
      status: 'offline',
      updatedAt: expect.any(String),
    });
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
        runtime: 'builtin',
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

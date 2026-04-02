import {
  buildPluginStorageEntries,
  buildPluginStorageKey,
  buildPluginStorageListWhere,
  buildPluginStorageUpsertData,
  readPluginStorageValue,
} from './plugin-storage.helpers';

describe('plugin-storage.helpers', () => {
  it('builds composite keys, list filters, and upsert payloads for plugin storage', () => {
    expect(buildPluginStorageKey('plugin-1', 'cursor.lastMessageId')).toEqual({
      pluginId_key: {
        pluginId: 'plugin-1',
        key: 'cursor.lastMessageId',
      },
    });
    expect(buildPluginStorageListWhere({
      pluginId: 'plugin-1',
      prefix: 'cursor.',
    })).toEqual({
      pluginId: 'plugin-1',
      key: {
        startsWith: 'cursor.',
      },
    });
    expect(buildPluginStorageUpsertData({
      pluginId: 'plugin-1',
      key: 'cursor.lastMessageId',
      value: 'message-42',
    })).toEqual({
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
  });

  it('parses single values and mapped entry lists with warn-safe fallback labels', () => {
    const warnings: string[] = [];

    expect(readPluginStorageValue({
      pluginName: 'builtin.memory-context',
      key: 'cursor.lastMessageId',
      raw: JSON.stringify('message-42'),
    })).toBe('message-42');
    expect(buildPluginStorageEntries({
      pluginName: 'builtin.memory-context',
      entries: [
        {
          key: 'cursor.lastMessageId',
          valueJson: JSON.stringify('message-42'),
        },
        {
          key: 'cursor.broken',
          valueJson: '{bad-json',
        },
      ],
      onWarn: (message) => warnings.push(message),
    })).toEqual([
      {
        key: 'cursor.lastMessageId',
        value: 'message-42',
      },
      {
        key: 'cursor.broken',
        value: null,
      },
    ]);
    expect(warnings).toEqual([
      expect.stringContaining('pluginStorage:builtin.memory-context:cursor.broken'),
    ]);
  });
});

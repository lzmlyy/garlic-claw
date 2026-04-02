import type { JsonValue } from '@garlic-claw/shared';
import { parseStoredPluginJsonValue } from './plugin-persistence.helpers';

export function buildPluginStorageKey(pluginId: string, key: string) {
  return {
    pluginId_key: {
      pluginId,
      key,
    },
  };
}

export function buildPluginStorageUpsertData(input: {
  pluginId: string;
  key: string;
  value: JsonValue;
}) {
  return {
    where: buildPluginStorageKey(input.pluginId, input.key),
    create: {
      pluginId: input.pluginId,
      key: input.key,
      valueJson: JSON.stringify(input.value),
    },
    update: {
      valueJson: JSON.stringify(input.value),
    },
  };
}

export function buildPluginStorageListWhere(input: {
  pluginId: string;
  prefix?: string;
}) {
  return {
    pluginId: input.pluginId,
    ...(input.prefix ? { key: { startsWith: input.prefix } } : {}),
  };
}

export function readPluginStorageValue(input: {
  pluginName: string;
  key: string;
  raw: string | null;
  onWarn?: (message: string) => void;
}): JsonValue | null {
  return parseStoredPluginJsonValue({
    raw: input.raw,
    fallback: null,
    label: `pluginStorage:${input.pluginName}:${input.key}`,
    onWarn: input.onWarn,
  });
}

export function buildPluginStorageEntries(input: {
  pluginName: string;
  entries: Array<{
    key: string;
    valueJson: string | null;
  }>;
  onWarn?: (message: string) => void;
}): Array<{ key: string; value: JsonValue }> {
  return input.entries.map((entry) => ({
    key: entry.key,
    value: readPluginStorageValue({
      pluginName: input.pluginName,
      key: entry.key,
      raw: entry.valueJson,
      onWarn: input.onWarn,
    }),
  }));
}

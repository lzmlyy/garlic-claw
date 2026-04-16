import type {
  JsonObject,
  PluginActionName,
  PluginCommandConflict,
  PluginCommandInfo,
  PluginConfigSnapshot,
  PluginInfo,
} from '@garlic-claw/shared';
import type { RegisteredPluginRecord } from './plugin-persistence.service';

export function createPluginConfigSnapshot(record: RegisteredPluginRecord): PluginConfigSnapshot {
  return {
    schema: record.manifest.config ?? null,
    values: resolvePluginConfigValues(record),
  };
}

export function buildPluginInfo(record: RegisteredPluginRecord, supportedActions: PluginActionName[]): PluginInfo {
  return {
    connected: record.connected,
    defaultEnabled: record.defaultEnabled,
    createdAt: record.createdAt,
    ...(record.manifest.description ? { description: record.manifest.description } : {}),
    deviceType: record.deviceType ?? record.pluginId,
    displayName: record.manifest.name,
    governance: record.governance,
    health: {
      status: record.connected ? 'healthy' : 'offline',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: record.lastSeenAt,
      lastCheckedAt: record.lastSeenAt,
    },
    id: record.pluginId,
    lastSeenAt: record.lastSeenAt,
    manifest: record.manifest,
    name: record.pluginId,
    runtimeKind: record.manifest.runtime,
    status: record.status,
    supportedActions,
    updatedAt: record.updatedAt,
    version: record.manifest.version,
  };
}

export function buildPluginSelfSummary(record: RegisteredPluginRecord): JsonObject {
  const capabilities = Object.fromEntries(([
    ['tools', record.manifest.tools],
    ['commands', record.manifest.commands],
    ['crons', record.manifest.crons],
    ['hooks', record.manifest.hooks],
    ['routes', record.manifest.routes],
  ] as const).flatMap(([key, value]) => value?.length ? [[key, value]] : [])) as unknown as JsonObject;
  return {
    connected: record.connected,
    defaultEnabled: record.defaultEnabled,
    ...(record.manifest.description ? { description: record.manifest.description } : {}),
    ...(record.deviceType ? { deviceType: record.deviceType } : {}),
    governance: record.governance as unknown as JsonObject,
    id: record.manifest.id,
    lastSeenAt: record.lastSeenAt,
    name: record.manifest.name,
    permissions: [...record.manifest.permissions],
    runtimeKind: record.manifest.runtime,
    version: record.manifest.version,
    ...capabilities,
  };
}

export function listPluginCommands(record: RegisteredPluginRecord, connected: boolean): PluginCommandInfo[] {
  return (record.manifest.commands ?? []).map((command) => ({
    ...command,
    aliases: [...command.aliases],
    variants: [...command.variants],
    path: [...command.path],
    commandId: `${record.pluginId}:${command.canonicalCommand}:${command.kind}`,
    conflictTriggers: [],
    connected,
    defaultEnabled: record.defaultEnabled,
    pluginDisplayName: record.manifest.name,
    pluginId: record.pluginId,
    runtimeKind: record.manifest.runtime,
    source: 'manifest' as const,
    governance: record.governance,
  }));
}

export function buildPluginCommandConflicts(commands: PluginCommandInfo[]): PluginCommandConflict[] {
  const triggerMap = new Map<string, PluginCommandInfo[]>();
  for (const command of commands) {
    for (const trigger of command.variants) {
      const entries = triggerMap.get(trigger) ?? [];
      entries.push(command);
      triggerMap.set(trigger, entries);
    }
  }
  return [...triggerMap.entries()]
    .map(([trigger, relatedCommands]) => ({
      trigger,
      commands: relatedCommands.map((command) => ({
        commandId: command.commandId,
        pluginId: command.pluginId,
        pluginDisplayName: command.pluginDisplayName,
        runtimeKind: command.runtimeKind,
        connected: command.connected,
        defaultEnabled: command.defaultEnabled,
        kind: command.kind,
        canonicalCommand: command.canonicalCommand,
        ...(typeof command.priority === 'number' ? { priority: command.priority } : {}),
      })),
    }))
    .filter((conflict) => conflict.commands.length > 1);
}

function resolvePluginConfigValues(record: RegisteredPluginRecord): JsonObject {
  const values: JsonObject = {};
  for (const field of record.manifest.config?.fields ?? []) {
    if (typeof record.configValues?.[field.key] !== 'undefined') {
      values[field.key] = record.configValues[field.key];
      continue;
    }
    if (typeof field.defaultValue !== 'undefined') {
      values[field.key] = field.defaultValue;
    }
  }
  for (const [key, value] of Object.entries(record.configValues ?? {})) {
    if (!(key in values)) {
      values[key] = value;
    }
  }
  return values;
}

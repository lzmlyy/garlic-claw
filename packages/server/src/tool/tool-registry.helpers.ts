import type {
  PluginAvailableToolSummary,
  ToolInfo,
  ToolOverview,
  ToolSourceInfo,
} from '@garlic-claw/shared';
import type {
  ToolProviderTool,
  ToolRecord,
  ToolSourceDescriptor,
} from './tool.types';

export function buildToolSourceKey(
  kind: ToolSourceDescriptor['kind'],
  id: string,
): string {
  return `${kind}:${id}`;
}

export function compareToolKeys(left: string, right: string): number {
  return left.localeCompare(right, 'zh-CN');
}

export function buildToolId(input: ToolProviderTool): string {
  return `${input.source.kind}:${input.source.id}:${input.name}`;
}

export function buildToolCallName(input: ToolProviderTool): string {
  if (input.source.kind === 'plugin') {
    return input.runtimeKind === 'builtin'
      ? input.name
      : `${input.source.id}__${input.name}`;
  }
  if (input.source.kind === 'skill') {
    return `skill__${input.name.replace(/\./g, '__')}`;
  }

  return `mcp__${input.source.id}__${input.name}`;
}

export function buildToolDescription(input: ToolProviderTool): string {
  if (input.source.kind === 'plugin') {
    return input.runtimeKind === 'builtin'
      ? input.description
      : `[插件：${input.source.id}] ${input.description}`;
  }
  if (input.source.kind === 'skill') {
    return `[Skill] ${input.description}`;
  }

  return `[MCP：${input.source.id}] ${input.description}`;
}

export function normalizeToolRecord(input: ToolProviderTool): ToolRecord {
  const sourceEnabled = input.source.enabled ?? true;

  return {
    toolId: buildToolId(input),
    toolName: input.name,
    callName: buildToolCallName(input),
    description: buildToolDescription(input),
    parameters: input.parameters,
    enabled: input.enabled ?? sourceEnabled,
    source: {
      kind: input.source.kind,
      id: input.source.id,
      label: input.source.label,
      enabled: sourceEnabled,
      health: input.source.health ?? 'unknown',
      lastError: input.source.lastError ?? null,
      lastCheckedAt: input.source.lastCheckedAt ?? null,
    },
    ...(input.pluginId ? { pluginId: input.pluginId } : {}),
    ...(input.runtimeKind ? { runtimeKind: input.runtimeKind } : {}),
  };
}

export function buildAvailableToolSummary(
  record: ToolRecord,
): PluginAvailableToolSummary {
  return {
    name: record.callName,
    callName: record.callName,
    toolId: record.toolId,
    description: record.description,
    parameters: record.parameters,
    sourceKind: record.source.kind,
    sourceId: record.source.id,
    ...(record.pluginId ? { pluginId: record.pluginId } : {}),
    ...(record.runtimeKind ? { runtimeKind: record.runtimeKind } : {}),
  };
}

export function buildToolOverview(input: {
  sources: ToolSourceDescriptor[];
  tools: ToolRecord[];
}): ToolOverview {
  const sourceInfos = new Map<string, ToolSourceInfo>();
  const tools: ToolInfo[] = [];

  for (const source of input.sources) {
    sourceInfos.set(buildToolSourceKey(source.kind, source.id), {
      kind: source.kind,
      id: source.id,
      label: source.label,
      enabled: source.enabled ?? true,
      health: source.health ?? 'unknown',
      lastError: source.lastError ?? null,
      lastCheckedAt: source.lastCheckedAt ?? null,
      totalTools: 0,
      enabledTools: 0,
      ...(source.pluginId ? { pluginId: source.pluginId } : {}),
      ...(source.runtimeKind ? { runtimeKind: source.runtimeKind } : {}),
      ...(source.supportedActions
        ? { supportedActions: source.supportedActions }
        : {}),
    });
  }

  for (const record of input.tools) {
    const key = buildToolSourceKey(record.source.kind, record.source.id);
    const existing = sourceInfos.get(key);
    if (existing) {
      existing.totalTools += 1;
      if (record.enabled) {
        existing.enabledTools += 1;
      }
    } else {
      sourceInfos.set(key, {
        kind: record.source.kind,
        id: record.source.id,
        label: record.source.label,
        enabled: record.source.enabled,
        health: record.source.health,
        lastError: record.source.lastError,
        lastCheckedAt: record.source.lastCheckedAt,
        totalTools: 1,
        enabledTools: record.enabled ? 1 : 0,
        ...(record.pluginId ? { pluginId: record.pluginId } : {}),
        ...(record.runtimeKind ? { runtimeKind: record.runtimeKind } : {}),
      });
    }

    tools.push({
      toolId: record.toolId,
      name: record.toolName,
      callName: record.callName,
      description: record.description,
      parameters: record.parameters,
      enabled: record.enabled,
      sourceKind: record.source.kind,
      sourceId: record.source.id,
      sourceLabel: record.source.label,
      health: record.source.health,
      lastError: record.source.lastError,
      lastCheckedAt: record.source.lastCheckedAt,
      ...(record.pluginId ? { pluginId: record.pluginId } : {}),
      ...(record.runtimeKind ? { runtimeKind: record.runtimeKind } : {}),
    });
  }

  return {
    sources: [...sourceInfos.values()].sort((left, right) =>
      compareToolKeys(
        buildToolSourceKey(left.kind, left.id),
        buildToolSourceKey(right.kind, right.id),
      )),
    tools: tools.sort((left, right) => compareToolKeys(left.toolId, right.toolId)),
  };
}

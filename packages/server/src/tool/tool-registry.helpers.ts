import type { PluginAvailableToolSummary } from '@garlic-claw/shared';
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

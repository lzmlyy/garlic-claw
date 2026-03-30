import { Injectable } from '@nestjs/common';
import type { ToolProviderTool, ToolRecord, UnifiedToolSummary } from './tool.types';

@Injectable()
export class ToolGovernanceService {
  normalizeTool(input: ToolProviderTool): ToolRecord {
    const sourceEnabled = input.source.enabled ?? true;
    const callName = this.buildCallName(input);

    return {
      toolId: this.buildToolId(input),
      toolName: input.name,
      callName,
      description: this.buildDescription(input),
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

  toAvailableToolSummary(record: ToolRecord): UnifiedToolSummary {
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

  private buildToolId(input: ToolProviderTool): string {
    return `${input.source.kind}:${input.source.id}:${input.name}`;
  }

  private buildCallName(input: ToolProviderTool): string {
    if (input.source.kind === 'plugin') {
      return input.runtimeKind === 'builtin'
        ? input.name
        : `${input.source.id}__${input.name}`;
    }

    return `mcp__${input.source.id}__${input.name}`;
  }

  private buildDescription(input: ToolProviderTool): string {
    if (input.source.kind === 'plugin') {
      return input.runtimeKind === 'builtin'
        ? input.description
        : `[插件：${input.source.id}] ${input.description}`;
    }

    return `[MCP：${input.source.id}] ${input.description}`;
  }
}

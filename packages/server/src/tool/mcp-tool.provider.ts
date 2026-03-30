import { Injectable } from '@nestjs/common';
import type { PluginCallContext } from '@garlic-claw/shared';
import type { JsonObject } from '../common/types/json-value';
import { McpService } from '../mcp/mcp.service';
import type { ToolProvider, ToolProviderTool } from './tool.types';

@Injectable()
export class McpToolProvider implements ToolProvider {
  readonly kind = 'mcp' as const;

  constructor(private readonly mcpService: McpService) {}

  listSources(_context?: PluginCallContext) {
    return this.mcpService.listServerStatuses().map((status) => ({
      kind: 'mcp' as const,
      id: status.name,
      label: status.name,
      enabled: status.enabled,
      health: status.health,
      lastError: status.lastError,
      lastCheckedAt: status.lastCheckedAt,
      supportedActions: ['health-check' as const],
    }));
  }

  async listTools(_context?: PluginCallContext): Promise<ToolProviderTool[]> {
    const statusByName = new Map(
      this.listSources().map((status) => [status.id, status]),
    );

    return (await this.mcpService.listToolDescriptors()).map((tool) => {
      const status = statusByName.get(tool.serverName);

      return {
        source: {
          kind: 'mcp',
          id: tool.serverName,
          label: tool.serverName,
          enabled: status?.enabled ?? true,
          health: status?.health ?? 'unknown',
          lastError: status?.lastError ?? null,
          lastCheckedAt: status?.lastCheckedAt ?? null,
          supportedActions: status?.supportedActions ?? ['health-check'],
        },
        name: tool.name,
        description: tool.description || tool.name,
        parameters: this.schemaToParams(tool.inputSchema),
      };
    });
  }

  executeTool(input: {
    tool: ToolProviderTool;
    params: JsonObject;
    context: PluginCallContext;
    skipLifecycleHooks?: boolean;
  }) {
    return this.mcpService.callTool({
      serverName: input.tool.source.id,
      toolName: input.tool.name,
      arguments: input.params,
    });
  }

  private schemaToParams(schema: unknown): ToolProviderTool['parameters'] {
    if (!isJsonObject(schema) || !isJsonObject(schema.properties)) {
      return {};
    }

    const required = Array.isArray(schema.required)
      ? new Set(schema.required.filter((item): item is string => typeof item === 'string'))
      : new Set<string>();
    const params: ToolProviderTool['parameters'] = {};

    for (const [key, rawDefinition] of Object.entries(schema.properties)) {
      if (!isJsonObject(rawDefinition)) {
        continue;
      }
      const type = normalizeParameterType(rawDefinition.type);

      params[key] = {
        type,
        ...(typeof rawDefinition.description === 'string'
          ? { description: rawDefinition.description }
          : {}),
        required: required.has(key),
      };
    }

    return params;
  }
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeParameterType(
  value: unknown,
): 'string' | 'number' | 'boolean' | 'object' | 'array' {
  return value === 'number'
    || value === 'boolean'
    || value === 'object'
    || value === 'array'
    ? value
    : 'string';
}

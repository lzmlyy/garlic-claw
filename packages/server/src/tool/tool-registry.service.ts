import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type { PluginCallContext } from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { McpToolProvider } from './mcp-tool.provider';
import { PluginToolProvider } from './plugin-tool.provider';
import { ToolGovernanceService } from './tool-governance.service';
import { ToolSettingsService } from './tool-settings.service';
import type {
  ResolvedToolRecord,
  ToolFilterInput,
  ToolProvider,
  ToolProviderTool,
  ToolRecord,
  ToolSourceDescriptor,
} from './tool.types';

interface ToolParameterSchema {
  type: string;
  description?: string;
  required?: boolean;
}

const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

@Injectable()
export class ToolRegistryService {
  constructor(
    private readonly governance: ToolGovernanceService,
    private readonly settings: ToolSettingsService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
    @Inject(forwardRef(() => PluginToolProvider))
    private readonly pluginToolProvider: PluginToolProvider,
    @Inject(forwardRef(() => McpToolProvider))
    private readonly mcpToolProvider: McpToolProvider,
  ) {}

  async listTools(input: ToolFilterInput): Promise<ToolRecord[]> {
    return (await this.resolveTools(input)).map((entry) => entry.record);
  }

  async listAvailableToolSummaries(input: ToolFilterInput) {
    return (await this.resolveTools(input)).map((entry) =>
      this.governance.toAvailableToolSummary(entry.record),
    );
  }

  async listSources(context?: PluginCallContext) {
    const providedState = await this.collectProviderState(context);
    const sourceInfos = new Map<string, {
      kind: ToolSourceDescriptor['kind'];
      id: string;
      label: string;
      enabled: boolean;
      health: 'healthy' | 'error' | 'unknown';
      lastError: string | null;
      lastCheckedAt: string | null;
      totalTools: number;
      enabledTools: number;
      pluginId?: string;
      runtimeKind?: 'builtin' | 'remote';
      supportedActions?: Array<'health-check' | 'reload' | 'reconnect'>;
    }>();

    for (const { sources } of providedState) {
      for (const source of sources) {
        const normalized = this.applySourceOverrides(source);
        sourceInfos.set(this.buildSourceKey(normalized.kind, normalized.id), {
          kind: normalized.kind,
          id: normalized.id,
          label: normalized.label,
          enabled: normalized.enabled ?? true,
          health: normalized.health ?? 'unknown',
          lastError: normalized.lastError ?? null,
          lastCheckedAt: normalized.lastCheckedAt ?? null,
          totalTools: 0,
          enabledTools: 0,
          ...(normalized.pluginId ? { pluginId: normalized.pluginId } : {}),
          ...(normalized.runtimeKind ? { runtimeKind: normalized.runtimeKind } : {}),
          ...(normalized.supportedActions
            ? { supportedActions: normalized.supportedActions }
            : {}),
        });
      }
    }

    for (const entry of providedState.flatMap(({ provider, tools }) =>
      tools.map((raw) => this.toResolvedToolRecord(provider, raw)),
    )) {
      const key = this.buildSourceKey(entry.record.source.kind, entry.record.source.id);
      const existing = sourceInfos.get(key);
      if (existing) {
        existing.totalTools += 1;
        if (entry.record.enabled) {
          existing.enabledTools += 1;
        }
        continue;
      }

      sourceInfos.set(key, {
        kind: entry.record.source.kind,
        id: entry.record.source.id,
        label: entry.record.source.label,
        enabled: entry.record.source.enabled,
        health: entry.record.source.health,
        lastError: entry.record.source.lastError,
        lastCheckedAt: entry.record.source.lastCheckedAt,
        totalTools: 1,
        enabledTools: entry.record.enabled ? 1 : 0,
        ...(entry.record.pluginId ? { pluginId: entry.record.pluginId } : {}),
        ...(entry.record.runtimeKind ? { runtimeKind: entry.record.runtimeKind } : {}),
      });
    }

    return [...sourceInfos.values()].sort((left, right) =>
      this.compareKeys(
        `${left.kind}:${left.id}`,
        `${right.kind}:${right.id}`,
      ));
  }

  async listToolInfos(context?: PluginCallContext) {
    return (await this.resolveAllTools(context))
      .map(({ record }) => ({
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
      }))
      .sort((left, right) => this.compareKeys(left.toolId, right.toolId));
  }

  async setSourceEnabled(
    kind: ToolSourceDescriptor['kind'],
    id: string,
    enabled: boolean,
  ) {
    const existing = (await this.listSources()).find((source) =>
      source.kind === kind && source.id === id);
    if (!existing) {
      throw new NotFoundException(`Tool source not found: ${kind}:${id}`);
    }

    this.settings.setSourceEnabled(kind, id, enabled);
    const updated = (await this.listSources()).find((source) =>
      source.kind === kind && source.id === id);
    if (!updated) {
      throw new NotFoundException(`Tool source not found after update: ${kind}:${id}`);
    }

    return updated;
  }

  async setToolEnabled(toolId: string, enabled: boolean) {
    const existing = (await this.listToolInfos()).find((toolInfo) => toolInfo.toolId === toolId);
    if (!existing) {
      throw new NotFoundException(`Tool not found: ${toolId}`);
    }

    this.settings.setToolEnabled(toolId, enabled);
    const updated = (await this.listToolInfos()).find((toolInfo) => toolInfo.toolId === toolId);
    if (!updated) {
      throw new NotFoundException(`Tool not found after update: ${toolId}`);
    }

    return updated;
  }

  async buildToolSet(input: ToolFilterInput): Promise<Record<string, Tool> | undefined> {
    const resolvedTools = await this.resolveTools(input);
    if (resolvedTools.length === 0) {
      return undefined;
    }

    const toolSet: Record<string, Tool> = {};
    for (const entry of resolvedTools) {
      toolSet[entry.record.callName] = tool({
        description: entry.record.description,
        inputSchema: this.paramSchemaToZod(entry.record.parameters),
        execute: async (args: JsonObject) => {
          try {
            return await this.executeResolvedTool(entry, args, input.context);
          } catch (error) {
            return {
              error: error instanceof Error ? error.message : String(error),
            };
          }
        },
      });
    }

    return toolSet;
  }

  private async resolveTools(input: ToolFilterInput): Promise<ResolvedToolRecord[]> {
    return (await this.resolveAllTools(input.context))
      .filter((entry) => this.matchesFilters(entry.record, input));
  }

  private matchesFilters(record: ToolRecord, input: ToolFilterInput): boolean {
    if (!record.enabled || !record.source.enabled) {
      return false;
    }

    if (input.allowedToolNames && !input.allowedToolNames.includes(record.callName)) {
      return false;
    }

    if (input.excludedSources?.some((source) =>
      source.kind === record.source.kind && source.id === record.source.id
    )) {
      return false;
    }

    return true;
  }

  private listProviders(): ToolProvider[] {
    return [
      this.pluginToolProvider,
      this.mcpToolProvider,
    ];
  }

  private async resolveAllTools(context?: PluginCallContext): Promise<ResolvedToolRecord[]> {
    const providers = this.listProviders();
    const providedTools = await Promise.all(
      providers.map(async (provider) => ({
        provider,
        tools: await Promise.resolve(provider.listTools(context)),
      })),
    );

    return providedTools.flatMap(({ provider, tools }) =>
      tools.map((raw) => this.toResolvedToolRecord(provider, raw)));
  }

  private async collectProviderState(context?: PluginCallContext) {
    const providers = this.listProviders();

    return Promise.all(
      providers.map(async (provider) => {
        const [sources, tools] = await Promise.all([
          Promise.resolve(provider.listSources(context)),
          Promise.resolve(provider.listTools(context)),
        ]);

        return {
          provider,
          sources,
          tools,
        };
      }),
    );
  }

  private toResolvedToolRecord(
    provider: ToolProvider,
    raw: ToolProviderTool,
  ): ResolvedToolRecord {
    const normalized = this.governance.normalizeTool(raw);
    const sourceEnabled = this.settings.getSourceEnabled(
      normalized.source.kind,
      normalized.source.id,
    ) ?? normalized.source.enabled;
    const persistedToolEnabled = this.settings.getToolEnabled(normalized.toolId);
    const toolEnabled = (persistedToolEnabled ?? normalized.enabled) && sourceEnabled;

    return {
      provider,
      raw,
      record: {
        ...normalized,
        enabled: toolEnabled,
        source: {
          ...normalized.source,
          enabled: sourceEnabled,
        },
      },
    };
  }

  private applySourceOverrides(source: ToolSourceDescriptor): ToolSourceDescriptor {
    const enabled = this.settings.getSourceEnabled(source.kind, source.id)
      ?? source.enabled
      ?? true;

    return {
      ...source,
      enabled,
      health: source.health ?? 'unknown',
      lastError: source.lastError ?? null,
      lastCheckedAt: source.lastCheckedAt ?? null,
    };
  }

  private async executeResolvedTool(
    entry: ResolvedToolRecord,
    args: JsonObject,
    context: PluginCallContext,
  ): Promise<JsonValue> {
    const beforeCallResult = await this.pluginRuntime.runToolBeforeCallHooks({
      context,
      payload: this.buildBeforeCallPayload(entry, args, context),
    });

    if (beforeCallResult.action === 'short-circuit') {
      return beforeCallResult.output;
    }

    const toolParams = beforeCallResult.payload.params;
    const output = await Promise.resolve(entry.provider.executeTool({
      tool: entry.raw,
      params: toolParams,
      context,
      skipLifecycleHooks: entry.record.source.kind === 'plugin',
    }));
    const afterCallPayload = await this.pluginRuntime.runToolAfterCallHooks({
      context,
      payload: this.buildAfterCallPayload(entry, toolParams, output, context),
    });

    return afterCallPayload.output;
  }

  private buildBeforeCallPayload(
    entry: ResolvedToolRecord,
    params: JsonObject,
    context: PluginCallContext,
  ) {
    return {
      context: {
        ...context,
      },
      source: {
        kind: entry.record.source.kind,
        id: entry.record.source.id,
        label: entry.record.source.label,
        ...(entry.record.pluginId ? { pluginId: entry.record.pluginId } : {}),
        ...(entry.record.runtimeKind ? { runtimeKind: entry.record.runtimeKind } : {}),
      },
      ...(entry.record.pluginId ? { pluginId: entry.record.pluginId } : {}),
      ...(entry.record.runtimeKind ? { runtimeKind: entry.record.runtimeKind } : {}),
      tool: {
        toolId: entry.record.toolId,
        callName: entry.record.callName,
        name: entry.record.toolName,
        description: entry.record.description,
        parameters: {
          ...entry.record.parameters,
        },
      },
      params: {
        ...params,
      },
    };
  }

  private buildAfterCallPayload(
    entry: ResolvedToolRecord,
    params: JsonObject,
    output: JsonValue,
    context: PluginCallContext,
  ) {
    return {
      ...this.buildBeforeCallPayload(entry, params, context),
      output,
    };
  }

  private buildSourceKey(kind: ToolSourceDescriptor['kind'], id: string): string {
    return `${kind}:${id}`;
  }

  private compareKeys(left: string, right: string): number {
    return left.localeCompare(right, 'zh-CN');
  }

  private paramSchemaToZod(params: Record<string, ToolParameterSchema>) {
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, schema] of Object.entries(params)) {
      let zType: z.ZodTypeAny;
      switch (schema.type) {
        case 'number':
          zType = z.number();
          break;
        case 'boolean':
          zType = z.boolean();
          break;
        case 'array':
          zType = z.array(jsonValueSchema);
          break;
        case 'object':
          zType = z.record(z.string(), jsonValueSchema);
          break;
        default:
          zType = z.string();
      }
      if (schema.description) {
        zType = zType.describe(schema.description);
      }
      if (!schema.required) {
        zType = zType.optional();
      }
      shape[key] = zType;
    }

    return z.object(shape);
  }
}

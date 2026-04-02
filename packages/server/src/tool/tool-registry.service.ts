import { Inject, Injectable, NotFoundException, forwardRef } from '@nestjs/common';
import { tool, type Tool } from 'ai';
import { z } from 'zod';
import type {
  PluginAvailableToolSummary,
  PluginCallContext,
  ToolInfo,
  ToolOverview,
  ToolSourceInfo,
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import { McpToolProvider } from './mcp-tool.provider';
import { PluginToolProvider } from './plugin-tool.provider';
import { SkillToolProvider } from './skill-tool.provider';
import {
  buildAvailableToolSummary,
  buildToolSourceKey,
  compareToolKeys,
  normalizeToolRecord,
} from './tool-registry.helpers';
import { ToolSettingsService } from './tool-settings.service';
import type {
  ResolvedToolRecord,
  ToolFilterInput,
  ToolProvider,
  ToolProviderState,
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
    private readonly settings: ToolSettingsService,
    @Inject(forwardRef(() => PluginRuntimeService))
    private readonly pluginRuntime: PluginRuntimeService,
    @Inject(forwardRef(() => PluginToolProvider))
    private readonly pluginToolProvider: PluginToolProvider,
    @Inject(forwardRef(() => McpToolProvider))
    private readonly mcpToolProvider: McpToolProvider,
    @Inject(forwardRef(() => SkillToolProvider))
    private readonly skillToolProvider?: SkillToolProvider,
  ) {}

  async listTools(input: ToolFilterInput): Promise<ToolRecord[]> {
    return (await this.resolveTools(input)).map((entry) => entry.record);
  }

  async listAvailableToolSummaries(input: ToolFilterInput) {
    return (await this.prepareToolSelection(input)).availableTools;
  }

  async listSources(context?: PluginCallContext): Promise<ToolSourceInfo[]> {
    return (await this.listOverview(context)).sources;
  }

  async listOverview(context?: PluginCallContext): Promise<ToolOverview> {
    return this.buildOverviewFromProviderState(
      await this.collectProviderState(context),
    );
  }

  async setSourceEnabled(
    kind: ToolSourceDescriptor['kind'],
    id: string,
    enabled: boolean,
  ) {
    const providerState = await this.collectProviderState();
    const existing = this.buildOverviewFromProviderState(providerState).sources.find((source) =>
      source.kind === kind && source.id === id);
    if (!existing) {
      throw new NotFoundException(`Tool source not found: ${kind}:${id}`);
    }

    this.settings.setSourceEnabled(kind, id, enabled);
    const updated = this.buildOverviewFromProviderState(providerState).sources.find((source) =>
      source.kind === kind && source.id === id);
    if (!updated) {
      throw new NotFoundException(`Tool source not found after update: ${kind}:${id}`);
    }

    return updated;
  }

  async setToolEnabled(toolId: string, enabled: boolean) {
    const providerState = await this.collectProviderState();
    const existing = this.buildOverviewFromProviderState(providerState).tools.find((toolInfo) =>
      toolInfo.toolId === toolId);
    if (!existing) {
      throw new NotFoundException(`Tool not found: ${toolId}`);
    }

    this.settings.setToolEnabled(toolId, enabled);
    const updated = this.buildOverviewFromProviderState(providerState).tools.find((toolInfo) =>
      toolInfo.toolId === toolId);
    if (!updated) {
      throw new NotFoundException(`Tool not found after update: ${toolId}`);
    }

    return updated;
  }

  private buildOverviewFromProviderState(providedState: Array<{
    provider: ToolProvider;
    sources: ToolProviderState['sources'];
    tools: ToolProviderState['tools'];
  }>): ToolOverview {
    const sourceInfos = new Map<string, ToolSourceInfo>();
    const tools: ToolInfo[] = [];

    for (const { sources } of providedState) {
      for (const source of sources) {
        const normalized = this.applySourceOverrides(source);
        sourceInfos.set(buildToolSourceKey(normalized.kind, normalized.id), {
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
      const { record } = entry;
      const key = buildToolSourceKey(entry.record.source.kind, entry.record.source.id);
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

  async buildToolSet(input: ToolFilterInput): Promise<Record<string, Tool> | undefined> {
    return (await this.prepareToolSelection(input)).buildToolSet({
      context: input.context,
      allowedToolNames: input.allowedToolNames,
    });
  }

  private async resolveTools(input: ToolFilterInput): Promise<ResolvedToolRecord[]> {
    return (await this.resolveAllTools(input.context))
      .filter((entry) => this.matchesFilters(entry.record, input));
  }

  async prepareToolSelection(input: ToolFilterInput): Promise<{
    availableTools: PluginAvailableToolSummary[];
    buildToolSet: (options: {
      context: PluginCallContext;
      allowedToolNames?: string[];
    }) => Record<string, Tool> | undefined;
  }> {
    const resolvedTools = await this.resolveTools(input);

    return {
      availableTools: resolvedTools.map((entry) => buildAvailableToolSummary(entry.record)),
      buildToolSet: (options) => this.buildAiToolSetFromResolvedTools(
        resolvedTools,
        options.context,
        options.allowedToolNames,
      ),
    };
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
      ...(this.skillToolProvider ? [this.skillToolProvider] : []),
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

  private async collectProviderState(context?: PluginCallContext): Promise<Array<{
    provider: ToolProvider;
    sources: ToolProviderState['sources'];
    tools: ToolProviderState['tools'];
  }>> {
    const providers = this.listProviders();

    return Promise.all(
      providers.map(async (provider) => {
        if (provider.collectState) {
          const state = await Promise.resolve(provider.collectState(context));

          return {
            provider,
            sources: state.sources,
            tools: state.tools,
          };
        }

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

  private buildAiToolSetFromResolvedTools(
    resolvedTools: ResolvedToolRecord[],
    context: PluginCallContext,
    allowedToolNames?: string[],
  ): Record<string, Tool> | undefined {
    const filteredTools = allowedToolNames
      ? resolvedTools.filter((entry) => allowedToolNames.includes(entry.record.callName))
      : resolvedTools;
    if (filteredTools.length === 0) {
      return undefined;
    }

    const toolSet: Record<string, Tool> = {};
    for (const entry of filteredTools) {
      toolSet[entry.record.callName] = tool({
        description: entry.record.description,
        inputSchema: this.paramSchemaToZod(entry.record.parameters),
        execute: async (args: JsonObject) => {
          try {
            return await this.executeResolvedTool(entry, args, context);
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

  private toResolvedToolRecord(
    provider: ToolProvider,
    raw: ToolProviderTool,
  ): ResolvedToolRecord {
    const normalized = normalizeToolRecord(raw);
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

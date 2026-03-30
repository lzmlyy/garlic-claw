import { Injectable } from '@nestjs/common';
import type { PluginCallContext } from '@garlic-claw/shared';
import type { JsonObject } from '../common/types/json-value';
import { PluginService } from '../plugin/plugin.service';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import type { ToolProvider, ToolProviderState, ToolProviderTool } from './tool.types';

@Injectable()
export class PluginToolProvider implements ToolProvider {
  readonly kind = 'plugin' as const;

  constructor(
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly pluginService: PluginService,
  ) {}

  async collectState(context?: PluginCallContext): Promise<ToolProviderState> {
    const state = await this.readSourceState();

    return {
      sources: state.sources,
      tools: this.buildToolsFromState(state, context),
    };
  }

  async listSources(context?: PluginCallContext) {
    return (await this.collectState(context)).sources;
  }

  async listTools(context?: PluginCallContext): Promise<ToolProviderTool[]> {
    return (await this.collectState(context)).tools;
  }

  executeTool(input: {
    tool: ToolProviderTool;
    params: JsonObject;
    context: PluginCallContext;
    skipLifecycleHooks?: boolean;
  }) {
    return this.pluginRuntime.executeTool({
      pluginId: input.tool.pluginId ?? input.tool.source.id,
      toolName: input.tool.name,
      params: input.params,
      context: input.context,
      skipLifecycleHooks: input.skipLifecycleHooks,
    });
  }

  private async readSourceState() {
    const [persistedPlugins, runtimePlugins] = await Promise.all([
      this.pluginService.findAll(),
      Promise.resolve(this.pluginRuntime.listPlugins()),
    ]);
    const persistedByName = new Map(
      persistedPlugins.map((plugin) => [plugin.name, plugin]),
    );
    const sources = runtimePlugins.map((entry) => {
      const persisted = persistedByName.get(entry.pluginId);

      return {
        kind: 'plugin' as const,
        id: entry.pluginId,
        label: entry.manifest.name || entry.pluginId,
        enabled: true,
        health: persisted?.status === 'online'
          ? ((persisted.healthStatus as 'healthy' | 'error' | 'unknown' | 'degraded' | null) === 'degraded'
            ? 'error'
            : (persisted.healthStatus as 'healthy' | 'error' | 'unknown' | null) ?? 'unknown')
          : 'unknown',
        lastError: persisted?.lastError ?? null,
        lastCheckedAt: persisted?.lastCheckedAt?.toISOString() ?? null,
        supportedActions: entry.supportedActions,
        pluginId: entry.pluginId,
        runtimeKind: entry.runtimeKind,
      };
    });

    return {
      sources,
      sourceById: new Map(
        sources.map((source) => [
          source.id,
          source,
        ]),
      ),
      pluginLabels: new Map(
        runtimePlugins.map((entry) => [
          entry.pluginId,
          entry.manifest.name || entry.pluginId,
        ]),
      ),
    };
  }

  private buildToolsFromState(
    state: Awaited<ReturnType<PluginToolProvider['readSourceState']>>,
    context?: PluginCallContext,
  ): ToolProviderTool[] {
    return this.pluginRuntime.listTools(context).map((entry) => ({
      source: state.sourceById.get(entry.pluginId) ?? {
        kind: 'plugin',
        id: entry.pluginId,
        label: state.pluginLabels.get(entry.pluginId) ?? entry.pluginId,
        enabled: true,
        health: 'unknown',
        lastError: null,
        lastCheckedAt: null,
      },
      name: entry.tool.name,
      description: entry.tool.description,
      parameters: entry.tool.parameters,
      pluginId: entry.pluginId,
      runtimeKind: entry.runtimeKind,
    }));
  }
}

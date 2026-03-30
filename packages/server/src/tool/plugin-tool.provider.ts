import { Injectable } from '@nestjs/common';
import type { PluginCallContext } from '@garlic-claw/shared';
import type { JsonObject } from '../common/types/json-value';
import { PluginService } from '../plugin/plugin.service';
import { PluginRuntimeService } from '../plugin/plugin-runtime.service';
import type { ToolProvider, ToolProviderTool } from './tool.types';

@Injectable()
export class PluginToolProvider implements ToolProvider {
  readonly kind = 'plugin' as const;

  constructor(
    private readonly pluginRuntime: PluginRuntimeService,
    private readonly pluginService: PluginService,
  ) {}

  async listSources(_context?: PluginCallContext) {
    const persistedPlugins = await this.pluginService.findAll();
    const persistedByName = new Map(
      persistedPlugins.map((plugin) => [plugin.name, plugin]),
    );

    return this.pluginRuntime.listPlugins().map((entry) => {
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
  }

  async listTools(context?: PluginCallContext): Promise<ToolProviderTool[]> {
    const sources = await this.listSources(context);
    const sourceById = new Map(
      sources.map((source) => [
        source.id,
        source,
      ]),
    );
    const pluginLabels = new Map(
      this.pluginRuntime.listPlugins().map((entry) => [
        entry.pluginId,
        entry.manifest.name || entry.pluginId,
      ]),
    );

    return this.pluginRuntime.listTools(context).map((entry) => ({
      source: sourceById.get(entry.pluginId) ?? {
        kind: 'plugin',
        id: entry.pluginId,
        label: pluginLabels.get(entry.pluginId) ?? entry.pluginId,
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
}

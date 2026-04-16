import type { PluginActionName, PluginAvailableToolSummary, PluginCallContext, PluginParamSchema, ToolInfo, ToolOverview, ToolSourceActionResult, ToolSourceInfo, ToolSourceKind } from '@garlic-claw/shared';
import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Tool } from 'ai';
import { z } from 'zod';
import type { RegisteredPluginRecord } from '../../plugin/persistence/plugin-persistence.service';
import { RuntimeHostPluginDispatchService } from '../../runtime/host/runtime-host-plugin-dispatch.service';
import { isPluginEnabledForContext } from '../../runtime/kernel/runtime-plugin-hook-governance';
import { RuntimePluginGovernanceService } from '../../runtime/kernel/runtime-plugin-governance.service';
import { McpService } from '../mcp/mcp.service';
import { SkillSessionService } from '../skill/skill-session.service';

@Injectable()
export class ToolRegistryService {
  private readonly sourceEnabledOverrides = new Map<string, boolean>();
  private readonly toolEnabledOverrides = new Map<string, boolean>();

  constructor(
    private readonly mcpService: McpService,
    private readonly skillExecution: SkillSessionService,
    @Inject(RuntimeHostPluginDispatchService)
    private readonly runtimeHostPluginDispatchService: RuntimeHostPluginDispatchService,
    @Inject(RuntimePluginGovernanceService)
    private readonly runtimePluginGovernanceService: RuntimePluginGovernanceService,
  ) {}

  async listOverview(context?: PluginCallContext): Promise<ToolOverview> {
    const pluginSources = this.buildPluginSources();
    const mcpSources = this.mcpService.listToolSources();
    const skillSources = await this.skillExecution.listToolSources(context);
    const allSources = [pluginSources, mcpSources, skillSources] as const;
    return {
      sources: allSources.flatMap((entries) => entries.map((entry) => entry.source)),
      tools: allSources.flatMap((entries) => entries.flatMap((entry) => entry.tools)),
    };
  }

  async runSourceAction(kind: ToolSourceKind, sourceId: string, action: PluginActionName): Promise<ToolSourceActionResult> {
    if (kind === 'mcp') {return this.mcpService.runGovernanceAction(sourceId, action as 'health-check' | 'reconnect' | 'reload');}
    if (kind === 'skill') {return this.skillExecution.runToolSourceAction(sourceId, action);}
    if (kind !== 'plugin') {throw new BadRequestException(`工具源 ${kind}:${sourceId} 不支持治理动作 ${action}`);}
    const source = await this.readSource(kind, sourceId);
    if (!(source.supportedActions ?? []).includes(action)) {throw new BadRequestException(`工具源 ${kind}:${sourceId} 不支持治理动作 ${action}`);}
    const result = await this.runtimePluginGovernanceService.runPluginAction({ action, pluginId: sourceId });
    return {
      accepted: result.accepted,
      action: result.action,
      sourceKind: source.kind,
      sourceId: result.pluginId,
      message: result.message,
    };
  }

  async setSourceEnabled(kind: ToolSourceKind, sourceId: string, enabled: boolean): Promise<ToolSourceInfo> {
    const readSource = () => this.readSource(kind, sourceId);
    if (kind === 'mcp') {
      await this.mcpService.setServerEnabled(sourceId, enabled);
      return readSource();
    }
    if (kind === 'skill') {
      await readSource();
      this.skillExecution.setSkillPackageToolsEnabled(enabled);
      return readSource();
    }
    await readSource();
    this.sourceEnabledOverrides.set(`${kind}:${sourceId}`, enabled);
    return readSource();
  }

  async setToolEnabled(toolId: string, enabled: boolean): Promise<ToolInfo> {
    await this.readTool(toolId);
    this.toolEnabledOverrides.set(toolId, enabled);
    return this.readTool(toolId);
  }

  async buildToolSet(input: { allowedToolNames?: string[]; context: PluginCallContext; excludedPluginId?: string }): Promise<Record<string, Tool> | undefined> {
    const tools = await this.readEnabledTools(input);
    if (tools.length === 0) {return undefined;}
    const toolSet: Record<string, unknown> = {};
    for (const entry of tools) {
      const conversationId = entry.sourceKind === 'skill' ? requireConversationId(input.context) : undefined;
      toolSet[entry.callName] = {
        description: entry.description,
        execute: async (args: Record<string, unknown>) =>
          entry.sourceKind === 'mcp'
            ? this.mcpService.callTool({ arguments: args, serverName: entry.sourceId, toolName: entry.name })
            : entry.sourceKind === 'skill'
              ? this.skillExecution.runPackageTool({
                  conversationId: conversationId as string,
                  toolName: entry.name as 'asset.list' | 'asset.read' | 'script.run',
                  params: args as never,
                })
              : this.runtimeHostPluginDispatchService.executeTool({
                  context: input.context,
                  params: args as never,
                  pluginId: entry.pluginId ?? entry.sourceId,
                  toolName: entry.name,
                }),
        inputSchema: paramSchemaToZod(entry.parameters),
      };
    }

    return toolSet as Record<string, Tool>;
  }

  async listAvailableTools(input: { context: PluginCallContext; excludedPluginId?: string }): Promise<PluginAvailableToolSummary[]> {
    return (await this.readEnabledTools(input)).map(toAvailableToolSummary);
  }

  private async readEnabledTools(input: { allowedToolNames?: string[]; context: PluginCallContext; excludedPluginId?: string }): Promise<ToolInfo[]> {
    return (await this.listOverview(input.context)).tools.filter((entry) =>
      (entry.sourceKind !== 'plugin' || entry.pluginId !== input.excludedPluginId)
      && this.isToolEnabledForContext(entry, input.context)
      && (input.allowedToolNames ? input.allowedToolNames.includes(entry.callName) : true),
    );
  }

  private buildPluginSources(): Array<{ source: ToolSourceInfo; tools: ToolInfo[] }> {
    return this.runtimePluginGovernanceService.listPlugins()
      .filter((plugin) => plugin.connected && plugin.manifest.tools.length > 0)
      .map((plugin) => {
        const sourceEnabled = this.sourceEnabledOverrides.get(`plugin:${plugin.pluginId}`) ?? plugin.defaultEnabled;
        const source: ToolSourceInfo = {
          kind: 'plugin',
          id: plugin.pluginId,
          label: plugin.manifest.name,
          enabled: sourceEnabled,
          health: plugin.connected ? 'healthy' : 'unknown',
          lastError: null,
          lastCheckedAt: plugin.lastSeenAt,
          totalTools: plugin.manifest.tools.length,
          enabledTools: 0,
          pluginId: plugin.pluginId,
          runtimeKind: plugin.manifest.runtime,
          supportedActions: this.runtimePluginGovernanceService.listSupportedActions(plugin.pluginId) as PluginActionName[],
        };
        const tools = plugin.manifest.tools.map((tool: typeof plugin.manifest.tools[number]) => createPluginToolInfo(
          plugin,
          source,
          tool,
          this.toolEnabledOverrides.get(`plugin:${plugin.pluginId}:${tool.name}`) ?? sourceEnabled,
        ));
        source.enabledTools = tools.filter((tool: ToolInfo) => tool.enabled).length;
        return { source, tools };
      });
  }

  private isToolEnabledForContext(tool: ToolInfo, context: PluginCallContext): boolean {
    if (tool.sourceKind === 'mcp') {
      const source = this.mcpService.getToolingSnapshot().statuses.find((entry) => entry.name === tool.sourceId);
      return source?.enabled === true && source.connected === true;
    }
    if (tool.sourceKind === 'skill') {
      return Boolean(context.conversationId) && tool.enabled;
    }
    const plugin = this.runtimePluginGovernanceService.listPlugins().find((entry) => entry.pluginId === tool.pluginId);
    if (!plugin) {return false;}

    const sourceOverride = this.sourceEnabledOverrides.get(`plugin:${plugin.pluginId}`);
    const sourceEnabled = sourceOverride ?? isPluginEnabledForContext({
      conversations: { ...(plugin.conversationScopes ?? {}) },
      defaultEnabled: plugin.defaultEnabled,
    }, context);
    return sourceEnabled && (this.toolEnabledOverrides.get(tool.toolId) ?? true);
  }

  private async readSource(kind: ToolSourceKind, sourceId: string): Promise<ToolSourceInfo> {
    return readSourceOrThrow(await this.listOverview(), kind, sourceId);
  }

  private async readTool(toolId: string): Promise<ToolInfo> {
    return readToolOrThrow(await this.listOverview(), toolId);
  }
}

function createPluginToolInfo(
  plugin: RegisteredPluginRecord,
  source: ToolSourceInfo,
  tool: RegisteredPluginRecord['manifest']['tools'][number],
  enabled: boolean,
) {
  return {
    toolId: `plugin:${plugin.pluginId}:${tool.name}`,
    name: tool.name,
    callName: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    enabled,
    sourceKind: 'plugin' as const,
    sourceId: plugin.pluginId,
    sourceLabel: plugin.manifest.name,
    health: source.health,
    lastError: source.lastError,
    lastCheckedAt: source.lastCheckedAt,
    pluginId: plugin.pluginId,
    runtimeKind: plugin.manifest.runtime,
  } satisfies ToolInfo;
}

function toAvailableToolSummary(entry: ToolInfo): PluginAvailableToolSummary {
  return { callName: entry.callName, description: entry.description, name: entry.name, parameters: entry.parameters, pluginId: entry.pluginId, runtimeKind: entry.runtimeKind, sourceId: entry.sourceId, sourceKind: entry.sourceKind };
}

function readSourceOrThrow(overview: ToolOverview, kind: ToolSourceKind, sourceId: string): ToolSourceInfo {
  const source = overview.sources.find((entry) => entry.kind === kind && entry.id === sourceId);
  if (source) {return source;}
  throw new NotFoundException(`Tool source not found: ${kind}:${sourceId}`);
}

function readToolOrThrow(overview: ToolOverview, toolId: string): ToolInfo {
  const tool = overview.tools.find((entry) => entry.toolId === toolId);
  if (tool) {return tool;}
  throw new NotFoundException(`Tool not found: ${toolId}`);
}

function paramSchemaToZod(params: Record<string, PluginParamSchema>) {
  const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(jsonValueSchema),
      z.record(z.string(), jsonValueSchema),
    ]));
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, schema] of Object.entries(params)) {
    let next: z.ZodTypeAny;
    switch (schema.type) {
      case 'number': next = z.number(); break;
      case 'boolean': next = z.boolean(); break;
      case 'array': next = z.array(jsonValueSchema); break;
      case 'object': next = z.record(z.string(), jsonValueSchema); break;
      default: next = z.string();
    }
    shape[key] = schema.required === true ? next : next.optional();
  }
  return z.object(shape);
}

function requireConversationId(context: PluginCallContext): string {
  if (context.conversationId) {
    return context.conversationId;
  }
  throw new BadRequestException('Skill package tools require a conversation context');
}

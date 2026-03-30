import type {
  PluginAvailableToolSummary,
  PluginCallContext,
  PluginParamSchema,
  PluginRuntimeKind,
  ToolInfo,
  ToolSourceInfo,
} from '@garlic-claw/shared';
import type { Tool } from 'ai';
import type { JsonObject, JsonValue } from '../common/types/json-value';

export type ToolSourceKind = 'plugin' | 'mcp';

export type ToolHealthStatus = 'healthy' | 'error' | 'unknown';

export interface ToolSourceDescriptor {
  kind: ToolSourceKind;
  id: string;
  label: string;
  enabled?: boolean;
  health?: ToolHealthStatus;
  lastError?: string | null;
  lastCheckedAt?: string | null;
  supportedActions?: Array<'health-check' | 'reload' | 'reconnect'>;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
}

export interface ToolProviderTool {
  source: ToolSourceDescriptor;
  name: string;
  description: string;
  parameters: Record<string, PluginParamSchema>;
  enabled?: boolean;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
}

export interface ToolRecord {
  toolId: string;
  toolName: string;
  callName: string;
  description: string;
  parameters: Record<string, PluginParamSchema>;
  enabled: boolean;
  source: Required<
    Pick<ToolSourceDescriptor, 'kind' | 'id' | 'label'>
  > & {
    enabled: boolean;
    health: ToolHealthStatus;
    lastError: string | null;
    lastCheckedAt: string | null;
  };
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
}

export interface ToolFilterInput {
  context: PluginCallContext;
  allowedToolNames?: string[];
  excludedSources?: Array<{
    kind: ToolSourceKind;
    id: string;
  }>;
}

export interface ToolProvider {
  kind: ToolSourceKind;
  listSources(context?: PluginCallContext): Promise<ToolSourceDescriptor[]> | ToolSourceDescriptor[];
  listTools(context?: PluginCallContext): Promise<ToolProviderTool[]> | ToolProviderTool[];
  executeTool(input: {
    tool: ToolProviderTool;
    params: JsonObject;
    context: PluginCallContext;
    skipLifecycleHooks?: boolean;
  }): Promise<JsonValue> | JsonValue;
}

export interface ResolvedToolRecord {
  provider: ToolProvider;
  raw: ToolProviderTool;
  record: ToolRecord;
}

export type UnifiedToolInfo = ToolInfo;

export type UnifiedToolSourceInfo = ToolSourceInfo;

export interface ToolSetBuildResult {
  records: ToolRecord[];
  toolSet: Record<string, Tool> | undefined;
  summaries: UnifiedToolSummary[];
}

export interface UnifiedToolSummary extends PluginAvailableToolSummary {
  callName?: string;
  toolId?: string;
  sourceKind?: ToolSourceKind;
  sourceId?: string;
}

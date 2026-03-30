import type { PluginActionName, PluginParamSchema, PluginRuntimeKind } from './plugin';

export type ToolSourceKind = 'plugin' | 'mcp';

export type ToolHealthStatus = 'healthy' | 'error' | 'unknown';

export interface ToolSourceInfo {
  kind: ToolSourceKind;
  id: string;
  label: string;
  enabled: boolean;
  health: ToolHealthStatus;
  lastError: string | null;
  lastCheckedAt: string | null;
  totalTools: number;
  enabledTools: number;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
  supportedActions?: PluginActionName[];
}

export interface ToolInfo {
  toolId: string;
  name: string;
  callName: string;
  description: string;
  parameters: Record<string, PluginParamSchema>;
  enabled: boolean;
  sourceKind: ToolSourceKind;
  sourceId: string;
  sourceLabel: string;
  health: ToolHealthStatus;
  lastError: string | null;
  lastCheckedAt: string | null;
  pluginId?: string;
  runtimeKind?: PluginRuntimeKind;
}

export interface ToolSourceActionResult {
  accepted: boolean;
  action: PluginActionName;
  sourceKind: ToolSourceKind;
  sourceId: string;
  message: string;
}

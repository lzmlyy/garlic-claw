import type { PluginActionName, PluginParamSchema, PluginRuntimeKind } from './plugin';
import type { EventLogSettings } from './plugin-records';

export type ToolSourceKind = 'internal' | 'plugin' | 'mcp' | 'skill';

export type ToolHealthStatus = 'healthy' | 'error' | 'unknown';

export interface ToolSourceInfo {
  kind: ToolSourceKind;
  id: string;
  label: string;
  enabled: boolean;
  health?: ToolHealthStatus;
  lastError?: string | null;
  lastCheckedAt?: string | null;
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
  health?: ToolHealthStatus;
  lastError?: string | null;
  lastCheckedAt?: string | null;
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

export interface ToolOverview {
  sources: ToolSourceInfo[];
  tools: ToolInfo[];
}

export type McpEnvValueSource = 'env-ref' | 'literal' | 'stored-secret';

export interface McpServerEnvEntry {
  key: string;
  source: McpEnvValueSource;
  value: string;
  hasStoredValue?: boolean;
}

export interface McpServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  envEntries?: McpServerEnvEntry[];
  eventLog: EventLogSettings;
}

export interface McpConfigSnapshot {
  configPath: string;
  servers: McpServerConfig[];
}

export interface McpServerDeleteResult {
  deleted: boolean;
  name: string;
}

import type { PluginCronDescriptor, PluginCronJobSummary } from './plugin-cron';
import type { JsonObject, JsonValue } from './json';
import type { PluginHealthSnapshot } from './plugin-records';
import type { PluginRouteDescriptor } from './plugin-route';
import type {
  PluginActionName,
  PluginCallContext,
  PluginCommandDescriptor,
  PluginCommandKind,
  PluginConfigSchema,
  PluginHookDescriptor,
  PluginParamSchema,
  PluginRuntimeKind,
} from './plugin-core';

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  runtime: PluginRuntimeKind;
  description?: string;
  permissions: import('./plugin-core').PluginPermission[];
  tools: PluginCapability[];
  crons?: PluginCronDescriptor[];
  commands?: PluginCommandDescriptor[];
  hooks?: PluginHookDescriptor[];
  config?: PluginConfigSchema;
  routes?: PluginRouteDescriptor[];
}

export interface RegisterPayload {
  manifest: PluginManifest;
}

export interface ExecutePayload {
  capability?: string;
  toolName?: string;
  params: JsonObject;
  context?: PluginCallContext;
}

export interface ExecuteResultPayload {
  data: JsonValue;
}

export interface ExecuteErrorPayload {
  error: string;
}

export interface HookInvokePayload {
  hookName: import('./plugin-core').PluginHookName;
  context: PluginCallContext;
  payload: JsonValue;
}

export interface HookResultPayload {
  data: JsonValue;
}

export interface PluginCapability {
  name: string;
  description: string;
  parameters: Record<string, PluginParamSchema>;
}

export type PluginBuiltinRole =
  | 'user-facing'
  | 'system-optional'
  | 'system-required';

export interface PluginGovernanceInfo {
  canDisable: boolean;
  disableReason?: string;
  builtinRole?: PluginBuiltinRole;
}

export type PluginCommandDescriptorSource = 'manifest' | 'hook-filter';

export interface PluginCommandInfo extends PluginCommandDescriptor {
  commandId: string;
  pluginId: string;
  pluginDisplayName?: string;
  runtimeKind: PluginRuntimeKind;
  connected: boolean;
  defaultEnabled: boolean;
  source: PluginCommandDescriptorSource;
  governance?: PluginGovernanceInfo;
  conflictTriggers: string[];
}

export interface PluginCommandConflictEntry {
  commandId: string;
  pluginId: string;
  pluginDisplayName?: string;
  runtimeKind: PluginRuntimeKind;
  connected: boolean;
  defaultEnabled: boolean;
  kind: PluginCommandKind;
  canonicalCommand: string;
  priority?: number;
}

export interface PluginCommandConflict {
  trigger: string;
  commands: PluginCommandConflictEntry[];
}

export interface PluginCommandOverview {
  commands: PluginCommandInfo[];
  conflicts: PluginCommandConflict[];
}

export interface PluginInfo {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  deviceType: string;
  status: string;
  connected: boolean;
  defaultEnabled: boolean;
  runtimeKind?: PluginRuntimeKind;
  version?: string;
  supportedActions?: PluginActionName[];
  crons?: PluginCronJobSummary[];
  manifest: PluginManifest;
  health?: PluginHealthSnapshot;
  governance?: PluginGovernanceInfo;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PluginStatus = 'online' | 'offline' | 'error';

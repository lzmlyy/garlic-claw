import type { PluginCronDescriptor } from './plugin-cron';
import type { JsonObject, JsonValue } from './json';
import type { PluginRouteDescriptor } from './plugin-route';
import type {
  PluginActionName,
  PluginCommandDescriptor,
  PluginHookDescriptor,
  PluginPermission,
  PluginRuntimeKind,
} from './plugin-core';

export type PluginHealthStatus =
  | 'unknown'
  | 'healthy'
  | 'degraded'
  | 'error'
  | 'offline';

export type PluginEventLevel = 'info' | 'warn' | 'error';

export interface PluginRuntimePressureSnapshot {
  activeExecutions: number;
  maxConcurrentExecutions: number;
}

export interface PluginHealthSnapshot {
  status: PluginHealthStatus;
  failureCount: number;
  consecutiveFailures: number;
  lastError: string | null;
  lastErrorAt: string | null;
  lastSuccessAt: string | null;
  lastCheckedAt: string | null;
  runtimePressure?: PluginRuntimePressureSnapshot;
}

export interface PluginEventRecord {
  id: string;
  type: string;
  level: PluginEventLevel;
  message: string;
  metadata: JsonObject | null;
  createdAt: string;
}

export interface PluginEventQuery {
  limit?: number;
  level?: PluginEventLevel;
  type?: string;
  keyword?: string;
  cursor?: string;
}

export interface PluginEventListResult {
  items: PluginEventRecord[];
  nextCursor: string | null;
}

export interface ListPluginEventOptions extends PluginEventQuery {}

export interface PluginStorageEntry {
  key: string;
  value: JsonValue;
}

export type PluginScopedStateScope = 'plugin' | 'conversation' | 'user';

export interface PluginSelfInfo {
  id: string;
  name: string;
  runtimeKind: PluginRuntimeKind;
  version?: string;
  description?: string;
  permissions: PluginPermission[];
  crons?: PluginCronDescriptor[];
  commands?: PluginCommandDescriptor[];
  hooks?: PluginHookDescriptor[];
  routes?: PluginRouteDescriptor[];
  supportedActions?: PluginActionName[];
}

export interface PluginActionResult {
  accepted: boolean;
  action: PluginActionName;
  pluginId: string;
  message: string;
}

export interface PluginPersonaSummary {
  id: string;
  name: string;
  avatar: string | null;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PluginPersonaDialogEntry {
  content: string;
  role: 'assistant' | 'user';
}

export interface PluginPersonaDetail extends PluginPersonaSummary {
  prompt: string;
  beginDialogs: PluginPersonaDialogEntry[];
  toolNames: string[] | null;
  skillIds: string[] | null;
  customErrorMessage: string | null;
}

export interface PluginPersonaCurrentInfo extends PluginPersonaDetail {
  source: 'context' | 'conversation' | 'default';
  personaId: string;
}

export interface PluginPersonaUpsertInput {
  id: string;
  name: string;
  prompt: string;
  description?: string;
  beginDialogs?: PluginPersonaDialogEntry[];
  toolNames?: string[] | null;
  skillIds?: string[] | null;
  customErrorMessage?: string | null;
  isDefault?: boolean;
}

export interface PluginPersonaUpdateInput {
  name?: string;
  prompt?: string;
  description?: string;
  beginDialogs?: PluginPersonaDialogEntry[];
  toolNames?: string[] | null;
  skillIds?: string[] | null;
  customErrorMessage?: string | null;
  isDefault?: boolean;
}

export interface PluginPersonaDeleteResult {
  deletedPersonaId: string;
  fallbackPersonaId: string;
  reassignedConversationCount: number;
}

export interface PluginKbEntrySummary {
  id: string;
  title: string;
  excerpt: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PluginKbEntryDetail extends PluginKbEntrySummary {
  content: string;
}

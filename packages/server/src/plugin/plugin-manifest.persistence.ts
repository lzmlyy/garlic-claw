import type {
  PluginCapability,
  PluginCommandDescriptor,
  PluginConfigFieldSchema,
  PluginConfigSchema,
  PluginCronDescriptor,
  PluginHookDescriptor,
  PluginHookFilterDescriptor,
  PluginHookMessageFilter,
  PluginManifest,
  PluginMessageKind,
  PluginParamSchema,
  PluginPermission,
  PluginRouteDescriptor,
  PluginRouteMethod,
  PluginRuntimeKind,
} from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';

interface PersistedPluginManifestFallback {
  id: string;
  displayName?: string | null;
  description?: string | null;
  version?: string | null;
  runtimeKind?: string | null;
}

type ManifestParseErrorHandler = (message: string) => void;

const PLUGIN_PERMISSIONS: PluginPermission[] = [
  'automation:read',
  'automation:write',
  'cron:read',
  'cron:write',
  'conversation:read',
  'conversation:write',
  'config:read',
  'kb:read',
  'llm:generate',
  'log:write',
  'memory:read',
  'memory:write',
  'persona:read',
  'persona:write',
  'provider:read',
  'storage:read',
  'storage:write',
  'subagent:run',
  'state:read',
  'state:write',
  'user:read',
];

const PLUGIN_HOOK_NAMES: PluginHookDescriptor['name'][] = [
  'message:received',
  'chat:before-model',
  'chat:waiting-model',
  'chat:after-model',
  'conversation:created',
  'message:created',
  'message:updated',
  'message:deleted',
  'automation:before-run',
  'automation:after-run',
  'subagent:before-run',
  'subagent:after-run',
  'tool:before-call',
  'tool:after-call',
  'response:before-send',
  'response:after-send',
  'plugin:loaded',
  'plugin:unloaded',
  'plugin:error',
  'cron:tick',
];

const PLUGIN_ROUTE_METHODS: PluginRouteMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
];

const PLUGIN_COMMAND_KINDS: PluginCommandDescriptor['kind'][] = [
  'command',
  'group-help',
];

const PLUGIN_PARAM_TYPES: PluginParamSchema['type'][] = [
  'string',
  'number',
  'boolean',
  'object',
  'array',
];

const PLUGIN_MESSAGE_KINDS: PluginMessageKind[] = [
  'text',
  'image',
  'mixed',
];

export function serializePersistedPluginManifest(manifest: PluginManifest): string {
  return JSON.stringify(
    normalizePluginManifestCandidate(manifest, {
      id: manifest.id,
      displayName: manifest.name,
      description: manifest.description,
      version: manifest.version,
      runtimeKind: manifest.runtime,
    }),
  );
}

export function parsePersistedPluginManifest(
  raw: string | null,
  fallback: PersistedPluginManifestFallback,
  onError?: ManifestParseErrorHandler,
): PluginManifest {
  if (!raw) {
    return normalizePluginManifestCandidate(null, fallback);
  }

  try {
    return normalizePluginManifestCandidate(JSON.parse(raw) as unknown, fallback);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onError?.(message);
    return normalizePluginManifestCandidate(null, fallback);
  }
}

export function normalizePluginManifestCandidate(
  candidate: unknown,
  fallback: PersistedPluginManifestFallback,
): PluginManifest {
  const source = readRecord(candidate);
  const manifest: PluginManifest = {
    id: readNonEmptyString(source?.id) ?? fallback.id,
    name: readNonEmptyString(source?.name)
      ?? readNonEmptyString(fallback.displayName)
      ?? fallback.id,
    version: readNonEmptyString(source?.version)
      ?? readNonEmptyString(fallback.version)
      ?? '0.0.0',
    runtime: readRuntimeKind(source?.runtime)
      ?? readRuntimeKind(fallback.runtimeKind)
      ?? 'remote',
    permissions: readArray(source?.permissions, readPermission),
    tools: readArray(source?.tools, readPluginCapability),
    hooks: readArray(source?.hooks, readPluginHookDescriptor),
    routes: readArray(source?.routes, readPluginRouteDescriptor),
  };

  const description = readNonEmptyString(source?.description)
    ?? readNonEmptyString(fallback.description);
  if (description) {
    manifest.description = description;
  }

  const commands = readArray(source?.commands, readPluginCommandDescriptor);
  if (commands.length > 0) {
    manifest.commands = commands;
  }

  const crons = readArray(source?.crons, readPluginCronDescriptor);
  if (crons.length > 0) {
    manifest.crons = crons;
  }

  const config = readPluginConfigSchema(source?.config);
  if (config) {
    manifest.config = config;
  }

  return manifest;
}

function readRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readRuntimeKind(value: unknown): PluginRuntimeKind | null {
  if (value === 'builtin' || value === 'remote') {
    return value;
  }

  return null;
}

function readArray<T>(
  value: unknown,
  readEntry: (entry: unknown) => T | null,
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const result: T[] = [];
  for (const entry of value) {
    const normalized = readEntry(entry);
    if (normalized) {
      result.push(normalized);
    }
  }

  return result;
}

function readPermission(value: unknown): PluginPermission | null {
  return isOneOf(value, PLUGIN_PERMISSIONS) ? value : null;
}

function readPluginCapability(value: unknown): PluginCapability | null {
  const record = readRecord(value);
  if (
    !record
    || typeof record.name !== 'string'
    || typeof record.description !== 'string'
  ) {
    return null;
  }

  return {
    name: record.name,
    description: record.description,
    parameters: readPluginParameterRecord(record.parameters),
  };
}

function readPluginParameterRecord(
  value: unknown,
): Record<string, PluginParamSchema> {
  const record = readRecord(value);
  if (!record) {
    return {};
  }

  const parameters: Record<string, PluginParamSchema> = {};
  for (const [key, entry] of Object.entries(record)) {
    const schema = readPluginParamSchema(entry);
    if (schema) {
      parameters[key] = schema;
    }
  }

  return parameters;
}

function readPluginParamSchema(value: unknown): PluginParamSchema | null {
  const record = readRecord(value);
  if (!record || !isOneOf(record.type, PLUGIN_PARAM_TYPES)) {
    return null;
  }

  const schema: PluginParamSchema = {
    type: record.type,
  };

  if (typeof record.description === 'string') {
    schema.description = record.description;
  }
  if (typeof record.required === 'boolean') {
    schema.required = record.required;
  }

  return schema;
}

function readPluginHookDescriptor(value: unknown): PluginHookDescriptor | null {
  const record = readRecord(value);
  if (!record || !isOneOf(record.name, PLUGIN_HOOK_NAMES)) {
    return null;
  }

  const hook: PluginHookDescriptor = {
    name: record.name,
  };

  if (typeof record.description === 'string') {
    hook.description = record.description;
  }
  if (typeof record.priority === 'number' && Number.isFinite(record.priority)) {
    hook.priority = record.priority;
  }

  const filter = readPluginHookFilterDescriptor(record.filter);
  if (filter) {
    hook.filter = filter;
  }

  return hook;
}

function readPluginHookFilterDescriptor(
  value: unknown,
): PluginHookFilterDescriptor | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const message = readPluginHookMessageFilter(record.message);
  if (!message) {
    return null;
  }

  return {
    message,
  };
}

function readPluginHookMessageFilter(
  value: unknown,
): PluginHookMessageFilter | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const filter: PluginHookMessageFilter = {};
  const commands = readStringArray(record.commands);
  if (commands.length > 0) {
    filter.commands = commands;
  }

  const regex = readHookRegex(record.regex);
  if (regex) {
    filter.regex = regex;
  }

  const messageKinds = readArray(record.messageKinds, readPluginMessageKind);
  if (messageKinds.length > 0) {
    filter.messageKinds = messageKinds;
  }

  return Object.keys(filter).length > 0 ? filter : null;
}

function readHookRegex(
  value: unknown,
): PluginHookMessageFilter['regex'] | null {
  if (typeof value === 'string') {
    return value;
  }

  const record = readRecord(value);
  if (!record || typeof record.pattern !== 'string') {
    return null;
  }

  return {
    pattern: record.pattern,
    ...(typeof record.flags === 'string' ? { flags: record.flags } : {}),
  };
}

function readPluginMessageKind(value: unknown): PluginMessageKind | null {
  return isOneOf(value, PLUGIN_MESSAGE_KINDS) ? value : null;
}

function readPluginRouteDescriptor(value: unknown): PluginRouteDescriptor | null {
  const record = readRecord(value);
  if (!record || typeof record.path !== 'string') {
    return null;
  }

  const methods = readArray(record.methods, readPluginRouteMethod);
  if (methods.length === 0) {
    return null;
  }

  return {
    path: record.path,
    methods,
    ...(typeof record.description === 'string' ? { description: record.description } : {}),
  };
}

function readPluginRouteMethod(value: unknown): PluginRouteMethod | null {
  return isOneOf(value, PLUGIN_ROUTE_METHODS) ? value : null;
}

function readPluginCommandDescriptor(
  value: unknown,
): PluginCommandDescriptor | null {
  const record = readRecord(value);
  if (
    !record
    || !isOneOf(record.kind, PLUGIN_COMMAND_KINDS)
    || typeof record.canonicalCommand !== 'string'
  ) {
    return null;
  }

  const path = readStringArray(record.path);
  if (path.length === 0) {
    return null;
  }

  const command: PluginCommandDescriptor = {
    kind: record.kind,
    canonicalCommand: record.canonicalCommand,
    path,
    aliases: readStringArray(record.aliases),
    variants: readStringArray(record.variants),
  };

  if (typeof record.description === 'string') {
    command.description = record.description;
  }
  if (typeof record.priority === 'number' && Number.isFinite(record.priority)) {
    command.priority = record.priority;
  }

  return command;
}

function readPluginCronDescriptor(value: unknown): PluginCronDescriptor | null {
  const record = readRecord(value);
  if (
    !record
    || typeof record.name !== 'string'
    || typeof record.cron !== 'string'
  ) {
    return null;
  }

  const cron: PluginCronDescriptor = {
    name: record.name,
    cron: record.cron,
  };

  if (typeof record.description === 'string') {
    cron.description = record.description;
  }
  if (typeof record.enabled === 'boolean') {
    cron.enabled = record.enabled;
  }
  if (Object.prototype.hasOwnProperty.call(record, 'data') && isJsonValue(record.data)) {
    cron.data = record.data;
  }

  return cron;
}

function readPluginConfigSchema(value: unknown): PluginConfigSchema | null {
  const record = readRecord(value);
  if (!record) {
    return null;
  }

  const fields = readArray(record.fields, readPluginConfigFieldSchema);
  if (fields.length === 0) {
    return null;
  }

  return {
    fields,
  };
}

function readPluginConfigFieldSchema(
  value: unknown,
): PluginConfigFieldSchema | null {
  const record = readRecord(value);
  if (
    !record
    || typeof record.key !== 'string'
    || !isOneOf(record.type, PLUGIN_PARAM_TYPES)
  ) {
    return null;
  }

  const field: PluginConfigFieldSchema = {
    key: record.key,
    type: record.type,
  };

  if (typeof record.description === 'string') {
    field.description = record.description;
  }
  if (typeof record.required === 'boolean') {
    field.required = record.required;
  }
  if (typeof record.secret === 'boolean') {
    field.secret = record.secret;
  }
  if (Object.prototype.hasOwnProperty.call(record, 'defaultValue') && isJsonValue(record.defaultValue)) {
    field.defaultValue = record.defaultValue;
  }

  return field;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry));
  }

  return typeof value === 'object'
    && value !== null
    && Object.values(value).every((entry) => isJsonValue(entry));
}

function isOneOf<T extends string>(
  value: unknown,
  values: readonly T[],
): value is T {
  return typeof value === 'string'
    && values.includes(value as T);
}

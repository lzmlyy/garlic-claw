import type { JsonObject, JsonValue, ListPluginEventOptions, PluginConfigNodeSchema, PluginConfigSnapshot, PluginEventLevel, PluginEventListResult, PluginEventRecord, PluginGovernanceInfo, PluginLlmPreference, PluginManifest, PluginScopeSettings, PluginStatus } from '@garlic-claw/shared';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PLUGIN_STATUS } from '../plugin.constants';
import { createPluginConfigSnapshot } from './plugin-read-model';

export interface RegisteredPluginRecord {
  connected: boolean;
  configValues?: JsonObject;
  conversationScopes?: Record<string, boolean>;
  createdAt: string;
  defaultEnabled: boolean;
  deviceType?: string;
  governance: PluginGovernanceInfo;
  lastSeenAt: string | null;
  llmPreference: PluginLlmPreference;
  manifest: PluginManifest;
  pluginId: string;
  status: PluginStatus;
  updatedAt: string;
}

type UpsertPluginRecordInput =
  Omit<RegisteredPluginRecord, 'createdAt' | 'llmPreference' | 'status' | 'updatedAt'>
  & Partial<Pick<RegisteredPluginRecord, 'createdAt' | 'llmPreference' | 'status' | 'updatedAt'>>;
type PluginEventInput = { level: PluginEventLevel; message: string; metadata?: JsonObject; type: string };

@Injectable()
export class PluginPersistenceService {
  private eventSequence = 0;
  private readonly events = new Map<string, PluginEventRecord[]>();
  private readonly records = new Map<string, RegisteredPluginRecord>();

  findPlugin(pluginId: string): RegisteredPluginRecord | null { const record = this.records.get(pluginId); return record ? cloneRegisteredPluginRecord(record) : null; }

  getPluginOrThrow(pluginId: string): RegisteredPluginRecord {
    return cloneRegisteredPluginRecord(this.readMutableRecord(pluginId));
  }

  getPluginConfig(pluginId: string): PluginConfigSnapshot { return createPluginConfigSnapshot(this.readMutableRecord(pluginId)); }
  getPluginLlmPreference(pluginId: string): PluginLlmPreference { return { ...this.readMutableRecord(pluginId).llmPreference }; }
  getPluginScope(pluginId: string): PluginScopeSettings { return toPluginScopeSettings(this.readMutableRecord(pluginId)); }

  listPluginEvents(pluginId: string, options: ListPluginEventOptions = {}): PluginEventListResult {
    const limit = options.limit ?? 50;
    const filtered = [...(this.events.get(pluginId) ?? [])]
      .reverse()
      .filter((event) => !options.level || event.level === options.level)
      .filter((event) => !options.type || event.type === options.type)
      .filter((event) => !options.keyword || pluginEventMatchesKeyword(event, options.keyword))
      .filter((event) => !options.cursor || event.id !== options.cursor);
    const items = filtered.slice(0, limit);
    return { items, nextCursor: filtered.length > limit ? items.at(-1)?.id ?? null : null };
  }

  listPlugins(): RegisteredPluginRecord[] { return [...this.records.values()].map(cloneRegisteredPluginRecord); }

  recordPluginEvent(pluginId: string, input: PluginEventInput): PluginEventRecord {
    const record: PluginEventRecord = {
      createdAt: new Date().toISOString(),
      id: `plugin-event-${++this.eventSequence}`,
      level: input.level,
      message: input.message,
      metadata: input.metadata ? { ...input.metadata } : null,
      type: input.type,
    };
    const records = this.events.get(pluginId) ?? [];
    records.push(record);
    this.events.set(pluginId, records);
    return record;
  }

  setConnectionState(pluginId: string, connected: boolean): RegisteredPluginRecord {
    const current = this.readMutableRecord(pluginId);
    return this.writeRecord({
      ...current,
      connected,
      status: connected ? PLUGIN_STATUS.ONLINE : PLUGIN_STATUS.OFFLINE,
      updatedAt: new Date().toISOString(),
    });
  }

  deletePlugin(pluginId: string): RegisteredPluginRecord {
    const current = this.readMutableRecord(pluginId);
    if (current.connected) {
      throw new BadRequestException(`Plugin ${current.pluginId} is still connected`);
    }
    this.records.delete(pluginId);
    return cloneRegisteredPluginRecord(current);
  }

  touchHeartbeat(pluginId: string, seenAt: string): RegisteredPluginRecord {
    const current = this.readMutableRecord(pluginId);
    return this.writeRecord({
      ...current,
      connected: true,
      lastSeenAt: seenAt,
      status: PLUGIN_STATUS.ONLINE,
      updatedAt: seenAt,
    });
  }

  upsertPlugin(record: UpsertPluginRecordInput): RegisteredPluginRecord {
    const now = new Date().toISOString();
    const existing = this.records.get(record.pluginId);
    return this.writeRecord({
      ...record,
      configValues: record.configValues ?? {},
      conversationScopes: record.conversationScopes ?? {},
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      status: record.status ?? (record.connected ? PLUGIN_STATUS.ONLINE : PLUGIN_STATUS.OFFLINE),
      llmPreference: normalizePluginLlmPreference(record.llmPreference ?? existing?.llmPreference),
      updatedAt: record.updatedAt ?? now,
    });
  }

  updatePluginConfig(pluginId: string, values: JsonObject): PluginConfigSnapshot {
    const current = this.readMutableRecord(pluginId);
    validatePluginConfig(current.manifest, values);
    return createPluginConfigSnapshot(this.writeRecord({
      ...current,
      configValues: { ...values },
      updatedAt: new Date().toISOString(),
    }));
  }

  updatePluginScope(
    pluginId: string,
    patch: Partial<PluginScopeSettings>,
  ): PluginScopeSettings {
    const current = this.readMutableRecord(pluginId);
    return toPluginScopeSettings(this.writeRecord({
      ...current,
      defaultEnabled: typeof patch.defaultEnabled === 'boolean'
        ? patch.defaultEnabled
        : current.defaultEnabled,
      conversationScopes: patch.conversations
        ? { ...patch.conversations }
        : { ...(current.conversationScopes ?? {}) },
      updatedAt: new Date().toISOString(),
    }));
  }

  updatePluginLlmPreference(pluginId: string, preference: PluginLlmPreference): PluginLlmPreference {
    const current = this.readMutableRecord(pluginId);
    const normalizedPreference = normalizePluginLlmPreference(preference);
    this.writeRecord({
      ...current,
      llmPreference: normalizedPreference,
      updatedAt: new Date().toISOString(),
    });
    return { ...normalizedPreference };
  }

  private readMutableRecord(pluginId: string): RegisteredPluginRecord { const record = this.records.get(pluginId); if (!record) {throw new NotFoundException(`Plugin not found: ${pluginId}`);} return record; }

  private writeRecord(record: RegisteredPluginRecord): RegisteredPluginRecord {
    const nextRecord = cloneRegisteredPluginRecord(record);
    this.records.set(record.pluginId, nextRecord);
    return cloneRegisteredPluginRecord(nextRecord);
  }
}

export function cloneRegisteredPluginRecord(record: RegisteredPluginRecord): RegisteredPluginRecord {
  return structuredClone(record);
}

function toPluginScopeSettings(record: RegisteredPluginRecord): PluginScopeSettings {
  return { defaultEnabled: record.defaultEnabled, conversations: { ...(record.conversationScopes ?? {}) } };
}

export function normalizePluginLlmPreference(preference?: PluginLlmPreference | null): PluginLlmPreference {
  if (!preference || preference.mode === 'inherit') {
    return {
      mode: 'inherit',
      modelId: null,
      providerId: null,
    };
  }
  const providerId = preference.providerId?.trim();
  const modelId = preference.modelId?.trim();
  if (!providerId || !modelId) {
    throw new BadRequestException('插件模型覆盖必须同时指定 providerId 和 modelId');
  }
  return {
    mode: 'override',
    modelId,
    providerId,
  };
}

export function validatePluginConfig(manifest: PluginManifest, values: JsonObject): void {
  const schema = manifest.config;
  if (!schema) {throw new BadRequestException(`Plugin ${manifest.id} 未声明配置 schema`);}
  validateConfigNode(schema, values, []);
}

function validateConfigNode(
  schema: PluginConfigNodeSchema,
  value: JsonValue | undefined,
  path: string[],
): void {
  const label = path.length > 0 ? path.join('.') : 'config';
  const allowedOptionValues = new Set((schema.options ?? []).map((option) => option.value));

  if (typeof value === 'undefined') {
    return;
  }

  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`配置字段 ${label} 必须是对象`);
    }
    const record = value as JsonObject;
    for (const key of Object.keys(record)) {
      const childSchema = schema.items[key];
      if (!childSchema) {
        throw new BadRequestException(`未知配置字段: ${[...path, key].join('.')}`);
      }
      validateConfigNode(childSchema, record[key], [...path, key]);
    }
    return;
  }

  if (schema.type === 'list') {
    if (!Array.isArray(value)) {
      throw new BadRequestException(`配置字段 ${label} 必须是数组`);
    }
    if (allowedOptionValues.size > 0) {
      value.forEach((item, index) => validateOptionValue(allowedOptionValues, item, [...path, String(index)]));
    }
    const itemSchema = schema.items;
    if (!itemSchema) {
      return;
    }
    value.forEach((item, index) => validateConfigNode(itemSchema, item, [...path, String(index)]));
    return;
  }

  if (schema.type === 'string' || schema.type === 'text') {
    if (typeof value !== 'string') {
      throw new BadRequestException(`配置字段 ${label} 必须是字符串`);
    }
    validateOptionValue(allowedOptionValues, value, path);
    return;
  }

  if (schema.type === 'int' || schema.type === 'float') {
    if (typeof value !== 'number' || Number.isNaN(value)) {
      throw new BadRequestException(`配置字段 ${label} 必须是数字`);
    }
    return;
  }

  if (schema.type === 'bool' && typeof value !== 'boolean') {
    throw new BadRequestException(`配置字段 ${label} 必须是布尔值`);
  }
}

function validateOptionValue(
  allowedOptionValues: Set<string>,
  value: JsonValue,
  path: string[],
): void {
  if (allowedOptionValues.size === 0) {
    return;
  }
  const label = path.length > 0 ? path.join('.') : 'config';
  if (typeof value !== 'string' || !allowedOptionValues.has(value)) {
    throw new BadRequestException(`配置字段 ${label} 必须命中声明的 options`);
  }
}

function pluginEventMatchesKeyword(event: PluginEventRecord, keyword: string): boolean {
  const normalizedKeyword = keyword.toLowerCase();
  return event.message.toLowerCase().includes(normalizedKeyword) || event.type.toLowerCase().includes(normalizedKeyword) || JSON.stringify(event.metadata ?? {}).toLowerCase().includes(normalizedKeyword);
}

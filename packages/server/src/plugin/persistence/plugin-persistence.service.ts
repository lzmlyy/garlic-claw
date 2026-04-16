import type {
  JsonObject,
  ListPluginEventOptions,
  PluginEventLevel,
  PluginEventListResult,
  PluginEventRecord,
  PluginConfigSnapshot,
  PluginGovernanceInfo,
  PluginManifest,
  PluginStatus,
  PluginScopeSettings,
} from '@garlic-claw/shared';
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
  manifest: PluginManifest;
  pluginId: string;
  status: PluginStatus;
  updatedAt: string;
}

type UpsertPluginRecordInput =
  Omit<RegisteredPluginRecord, 'createdAt' | 'status' | 'updatedAt'>
  & Partial<Pick<RegisteredPluginRecord, 'createdAt' | 'status' | 'updatedAt'>>;
type PluginEventInput = {
  level: PluginEventLevel;
  message: string;
  metadata?: JsonObject;
  type: string;
};

@Injectable()
export class PluginPersistenceService {
  private eventSequence = 0;
  private readonly events = new Map<string, PluginEventRecord[]>();
  private readonly records = new Map<string, RegisteredPluginRecord>();

  findPlugin(pluginId: string): RegisteredPluginRecord | null {
    return this.findRecord(pluginId);
  }

  getPluginOrThrow(pluginId: string): RegisteredPluginRecord {
    return this.readRecord(pluginId);
  }

  getPluginConfig(pluginId: string): PluginConfigSnapshot {
    return createPluginConfigSnapshot(this.readRecord(pluginId));
  }

  getPluginScope(pluginId: string): PluginScopeSettings {
    const record = this.readRecord(pluginId);
    return {
      defaultEnabled: record.defaultEnabled,
      conversations: { ...(record.conversationScopes ?? {}) },
    };
  }

  listPluginEvents(pluginId: string, options: ListPluginEventOptions = {}): PluginEventListResult {
    const limit = options.limit ?? 50;
    const filtered = [...(this.events.get(pluginId) ?? [])]
      .slice()
      .reverse()
      .filter((event) => !options.level || event.level === options.level)
      .filter((event) => !options.type || event.type === options.type)
      .filter((event) => !options.keyword || pluginEventMatchesKeyword(event, options.keyword))
      .filter((event) => !options.cursor || event.id !== options.cursor);
    const items = filtered.slice(0, limit);

    return {
      items,
      nextCursor: filtered.length > limit ? items.at(-1)?.id ?? null : null,
    };
  }

  listPlugins(): RegisteredPluginRecord[] {
    return [...this.records.values()].map(cloneRegisteredPluginRecord);
  }

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
    const existing = this.findRecord(record.pluginId);
    return this.writeRecord({
      ...record,
      configValues: record.configValues ?? {},
      conversationScopes: record.conversationScopes ?? {},
      createdAt: existing?.createdAt ?? record.createdAt ?? now,
      status: record.status ?? (record.connected ? PLUGIN_STATUS.ONLINE : PLUGIN_STATUS.OFFLINE),
      updatedAt: record.updatedAt ?? now,
    });
  }

  updatePluginConfig(pluginId: string, values: JsonObject): PluginConfigSnapshot {
    const current = this.readMutableRecord(pluginId);
    validatePluginConfig(current.manifest, values);
    this.writeRecord({
      ...current,
      configValues: { ...values },
      updatedAt: new Date().toISOString(),
    });
    return this.getPluginConfig(pluginId);
  }

  updatePluginScope(
    pluginId: string,
    patch: Partial<PluginScopeSettings>,
  ): PluginScopeSettings {
    const current = this.readMutableRecord(pluginId);
    const updated = this.writeRecord({
      ...current,
      defaultEnabled: typeof patch.defaultEnabled === 'boolean'
        ? patch.defaultEnabled
        : current.defaultEnabled,
      conversationScopes: patch.conversations
        ? { ...patch.conversations }
        : { ...(current.conversationScopes ?? {}) },
      updatedAt: new Date().toISOString(),
    });
    return {
      defaultEnabled: updated.defaultEnabled,
      conversations: { ...(updated.conversationScopes ?? {}) },
    };
  }

  private findRecord(pluginId: string): RegisteredPluginRecord | null {
    const record = this.records.get(pluginId);
    return record ? cloneRegisteredPluginRecord(record) : null;
  }

  private readRecord(pluginId: string): RegisteredPluginRecord {
    const record = this.records.get(pluginId);
    if (!record) {
      throw new NotFoundException(`Plugin not found: ${pluginId}`);
    }
    return cloneRegisteredPluginRecord(record);
  }

  private readMutableRecord(pluginId: string): RegisteredPluginRecord {
    const record = this.records.get(pluginId);
    if (!record) {
      throw new NotFoundException(`Plugin not found: ${pluginId}`);
    }
    return record;
  }

  private writeRecord(record: RegisteredPluginRecord): RegisteredPluginRecord {
    const nextRecord = cloneRegisteredPluginRecord(record);
    this.records.set(record.pluginId, nextRecord);
    return cloneRegisteredPluginRecord(nextRecord);
  }
}

export function cloneRegisteredPluginRecord(record: RegisteredPluginRecord): RegisteredPluginRecord {
  return structuredClone(record);
}

export function validatePluginConfig(manifest: PluginManifest, values: JsonObject): void {
  const schema = manifest.config;
  if (!schema) {
    throw new BadRequestException(`Plugin ${manifest.id} 未声明配置 schema`);
  }
  const fields = new Map(schema.fields.map((field) => [field.key, field]));
  for (const [key, value] of Object.entries(values)) {
    const field = fields.get(key);
    if (!field) {
      throw new BadRequestException(`未知配置字段: ${key}`);
    }
    if (!matchesConfigFieldType(field.type, value)) {
      throw new BadRequestException(`配置字段 ${key} 类型不合法`);
    }
  }
  for (const field of schema.fields) {
    if (!field.required) {continue;}
    if (typeof values[field.key] !== 'undefined' || typeof field.defaultValue !== 'undefined') {continue;}
    throw new BadRequestException(`缺少必填配置字段: ${field.key}`);
  }
}

function matchesConfigFieldType(
  type: 'array' | 'boolean' | 'number' | 'object' | 'string',
  value: unknown,
): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number';
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return false;
  }
}

function pluginEventMatchesKeyword(event: PluginEventRecord, keyword: string): boolean {
  const normalizedKeyword = keyword.toLowerCase();
  return event.message.toLowerCase().includes(normalizedKeyword)
    || event.type.toLowerCase().includes(normalizedKeyword)
    || JSON.stringify(event.metadata ?? {}).toLowerCase().includes(normalizedKeyword);
}

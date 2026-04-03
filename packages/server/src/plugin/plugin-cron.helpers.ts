import type {
  PluginCronJobSummary,
  PluginCronSource,
} from '@garlic-claw/shared';
import { isJsonValue } from '@garlic-claw/shared';
import type { JsonValue } from '../common/types/json-value';

export interface PluginCronJobRecord {
  id: string;
  pluginName: string;
  name: string;
  cron: string;
  description: string | null;
  source: string;
  enabled: boolean;
  dataJson: string | null;
  lastRunAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function normalizePluginCronJobRecord(
  record: Record<string, unknown>,
): PluginCronJobRecord {
  return {
    id: String(record.id),
    pluginName: String(record.pluginName),
    name: String(record.name),
    cron: String(record.cron),
    description: typeof record.description === 'string' ? record.description : null,
    source: String(record.source),
    enabled: Boolean(record.enabled),
    dataJson: typeof record.dataJson === 'string' ? record.dataJson : null,
    lastRunAt: record.lastRunAt instanceof Date ? record.lastRunAt : null,
    lastError: typeof record.lastError === 'string' ? record.lastError : null,
    lastErrorAt: record.lastErrorAt instanceof Date ? record.lastErrorAt : null,
    createdAt: record.createdAt instanceof Date ? record.createdAt : new Date(),
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt : new Date(),
  };
}

export function serializePluginCronJob(
  record: PluginCronJobRecord,
  onWarn?: (message: string) => void,
): PluginCronJobSummary {
  return {
    id: record.id,
    pluginId: record.pluginName,
    name: record.name,
    cron: record.cron,
    description: record.description ?? undefined,
    source: parsePluginCronSource(record.source),
    enabled: record.enabled,
    data: parsePluginCronData(record.dataJson, onWarn),
    lastRunAt: record.lastRunAt?.toISOString() ?? null,
    lastError: record.lastError,
    lastErrorAt: record.lastErrorAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function parsePluginCronData(
  raw: string | null,
  onWarn?: (message: string) => void,
): JsonValue | undefined {
  if (!raw) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isJsonValue(parsed) ? parsed : undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    onWarn?.(`插件 cron data JSON 无效，已回退为空值: ${message}`);
    return undefined;
  }
}

export function parsePluginCronSource(raw: string): PluginCronSource {
  return raw === 'host' ? 'host' : 'manifest';
}

export function parsePluginCronInterval(expr: string): number | null {
  const match = expr.trim().match(/^(\d+)\s*(s|m|h)$/i);
  if (!match) {
    return null;
  }

  const value = Number.parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const factor = unit === 'h'
    ? 60 * 60 * 1000
    : unit === 'm'
      ? 60 * 1000
      : 1000;
  const interval = value * factor;

  return interval >= 10000 ? interval : null;
}

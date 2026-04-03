import {
  isJsonObjectValue,
  isJsonValue,
  isStringRecord,
} from '@garlic-claw/shared';
import type { PluginMessageTargetInfo } from '@garlic-claw/shared';

export {
  isJsonObjectValue,
  isJsonValue,
  isStringRecord,
};

export function cloneJsonValue<T>(value: T): T {
  return structuredClone(value);
}

export function parseUnknownJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function readPluginMessageTargetInfoValue(
  value: unknown,
): PluginMessageTargetInfo | null {
  if (!isJsonObjectValue(value) || value.type !== 'conversation' || typeof value.id !== 'string') {
    return null;
  }

  return {
    type: value.type,
    id: value.id,
    ...(typeof value.label === 'string' ? { label: value.label } : {}),
  };
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

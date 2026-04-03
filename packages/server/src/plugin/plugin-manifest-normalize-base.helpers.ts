import { isJsonValue } from '@garlic-claw/shared';
import type { PluginRuntimeKind } from '@garlic-claw/shared';

export { isJsonValue };

export function readRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

export function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function readRuntimeKind(value: unknown): PluginRuntimeKind | null {
  if (value === 'builtin' || value === 'remote') {
    return value;
  }

  return null;
}

export function readArray<T>(
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

export function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function isOneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
): value is T {
  return typeof value === 'string' && allowed.includes(value as T);
}

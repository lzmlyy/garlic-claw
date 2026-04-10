import type {
  JsonObject,
  JsonValue,
} from '@garlic-claw/shared';

export function cloneJsonValue<T>(value: T): T {
  return structuredClone(value);
}

export function isOneOf<T extends string>(
  value: unknown,
  options: readonly T[],
): value is T {
  return typeof value === 'string' && options.some((option) => option === value);
}

export function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }

  if (typeof value !== 'object') {
    return false;
  }

  return Object.values(value).every((item) => isJsonValue(item));
}

export function isJsonObjectValue(value: unknown): value is JsonObject {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && Object.values(value).every((item) => isJsonValue(item));
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  return isJsonObjectValue(value)
    && Object.values(value).every((item) => typeof item === 'string');
}

export function isJsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * 共享 JSON 对象类型。
 */
export interface JsonObject {
  [key: string]: JsonValue;
}

/**
 * 共享 JSON 值类型。
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | JsonObject;

export function readUnknownObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
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
    return value.every((entry) => isJsonValue(entry));
  }

  return isJsonObjectValue(value);
}

export function isJsonObjectValue(value: unknown): value is JsonObject {
  const record = readUnknownObject(value);
  return !!record && Object.values(record).every((entry) => isJsonValue(entry));
}

export function isStringRecord(value: unknown): value is Record<string, string> {
  const record = readUnknownObject(value);
  return !!record && Object.values(record).every((entry) => typeof entry === 'string');
}

export function toJsonValue(value: unknown): JsonValue {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => toJsonValue(entry));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (isPlainObject(value)) {
    const result: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = toJsonValue(entry);
    }
    return result;
  }

  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

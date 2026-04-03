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

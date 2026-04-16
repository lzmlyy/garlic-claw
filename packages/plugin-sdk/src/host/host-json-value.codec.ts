import type { JsonObject, JsonValue } from "@garlic-claw/shared";

export function toHostJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    const result: JsonValue[] = [];
    for (const item of value) {
      if (typeof item === "undefined") {
        continue;
      }
      result.push(toHostJsonValue(item));
    }
    return result;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (isPlainObject(value)) {
    const result: JsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === "undefined") {
        continue;
      }
      result[key] = toHostJsonValue(entry);
    }
    return result;
  }
  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

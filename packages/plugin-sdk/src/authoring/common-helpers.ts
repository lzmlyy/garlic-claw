import type { JsonObject, JsonValue } from "@garlic-claw/shared";
import { isJsonObjectValue } from "../utils/json-value";

export function sanitizeOptionalText(value?: string): string {
  return (value ?? "").trim();
}

export function readJsonObjectValue(value: unknown): JsonObject | null {
  return isJsonObjectValue(value) ? value : null;
}

export function readRequiredStringParam(params: JsonObject, key: string): string {
  const value = params[key];
  if (typeof value !== "string" || value.length === 0) {throw new Error(`${key} 必填`);}
  return value;
}
export function readOptionalStringParam(params: JsonObject, key: string): string | null {
  const value = params[key];
  if (value === undefined || value === null) {return null;}
  if (typeof value !== "string") {throw new Error(`${key} 必须是字符串`);}
  return value;
}
export function readOptionalObjectParam(params: JsonObject, key: string): JsonObject | undefined {
  const value = params[key];
  if (value === undefined || value === null) {return undefined;}
  const object = readJsonObjectValue(value);
  if (!object) {throw new Error(`${key} 必须是对象`);}
  return object;
}
export function readRequiredTextValue(value: JsonValue, label: string): string {
  if (typeof value !== "string" || !value.trim()) {throw new Error(`${label} 必须是非空字符串`);}
  return value.trim();
}
export function readBooleanFlag(value: JsonValue, fallback: boolean): boolean { return typeof value === "boolean" ? value : fallback; }

export function pickOptionalStringFields<T extends string>(object: JsonObject | null, keys: readonly T[]): Partial<Record<T, string>> {
  return pickOptionalFields(object, keys, (value): value is string => typeof value === "string");
}

export function pickOptionalNumberFields<T extends string>(object: JsonObject | null, keys: readonly T[]): Partial<Record<T, number>> {
  return pickOptionalFields(object, keys, (value): value is number => typeof value === "number");
}

export function parseCommaSeparatedNames(raw?: string): string[] | undefined {
  const normalized = sanitizeOptionalText(raw);
  if (!normalized) {return undefined;}
  const names = normalized.split(",").map((item) => item.trim()).filter(Boolean);
  return names.length > 0 ? names : undefined;
}
export function textIncludesKeyword(text: string, keyword?: string): boolean {
  const normalizedKeyword = sanitizeOptionalText(keyword);
  return Boolean(normalizedKeyword) && text.includes(normalizedKeyword);
}

function pickOptionalFields<T extends string, TValue extends JsonValue>(object: JsonObject | null, keys: readonly T[], predicate: (value: JsonValue) => value is TValue): Partial<Record<T, TValue>> {
  const result: Partial<Record<T, TValue>> = {};
  if (!object) {return result;}
  for (const key of keys) {
    const value = object[key];
    if (predicate(value)) {
      result[key] = value;
    }
  }
  return result;
}

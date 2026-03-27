import type { JsonObject, JsonValue } from '../types/json-value';

/**
 * 将未知值归一化为 JSON 可序列化值。
 *
 * 输入:
 * - 任意未知值
 *
 * 输出:
 * - 可安全写入日志、SSE 与 JSON 字段的 `JsonValue`
 *
 * 预期行为:
 * - 递归处理数组和普通对象
 * - `Date` 转为 ISO 字符串
 * - 其他不可直接序列化的值转为字符串
 */
export function toJsonValue(value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => toJsonValue(item));
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

/**
 * 判断值是否为普通对象。
 * @param value 待判断的值
 * @returns 是否为普通对象
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

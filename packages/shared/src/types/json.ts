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

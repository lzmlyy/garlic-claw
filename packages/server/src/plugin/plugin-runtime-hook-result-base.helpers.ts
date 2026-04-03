import type { JsonObject, JsonValue } from '../common/types/json-value';
import { isJsonObjectValue } from '@garlic-claw/shared';

export function readHookResultObject(
  result: JsonValue | null | undefined,
  hookName: string,
): JsonObject | null {
  if (result === null || typeof result === 'undefined') {
    return null;
  }
  if (!isJsonObjectValue(result)) {
    throw new Error(`${hookName} Hook 返回值必须是对象`);
  }

  return result;
}

export function castValidatedHookResult<T>(result: JsonObject): T {
  return result as T;
}

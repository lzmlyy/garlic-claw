import type { JsonValue } from '../../common/types/json-value';

/**
 * 将内建插件 Hook 负载收口为目标类型。
 * @param payload 原始 Hook 负载
 * @returns 目标负载类型
 */
export function readBuiltinHookPayload<T>(payload: JsonValue): T {
  return payload as T;
}

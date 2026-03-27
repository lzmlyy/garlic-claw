/**
 * 复用 shared 中的 JSON 公共契约。
 *
 * 输入:
 * - 供后端边界层消费的 JSON 数据
 *
 * 输出:
 * - 与前端保持一致的 `JsonObject / JsonValue`
 *
 * 预期行为:
 * - 避免前后端重复维护 JSON 基础类型
 * - 保留现有本地导入路径，降低迁移改动面
 */
export type { JsonObject, JsonValue } from '@garlic-claw/shared';

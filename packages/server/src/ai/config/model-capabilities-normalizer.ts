import type { JsonObject, JsonValue } from '../../common/types/json-value';
import {
  createDefaultCapabilities,
  type ModelCapabilities,
  type ModalityCapabilities,
} from '../types/provider.types';

/**
 * 归一化后的模型能力条目。
 */
export interface NormalizedModelCapabilitiesEntry {
  /** 供应商 ID。 */
  providerId: string;
  /** 模型 ID。 */
  modelId: string;
  /** 当前 schema 的能力配置。 */
  capabilities: ModelCapabilities;
  /** 更新时间。 */
  updatedAt: string;
}

/**
 * 归一化单个模型能力配置条目。
 * @param value 原始 JSON 条目
 * @returns 清洗后的条目；无法识别时返回 `null`
 */
export function normalizeModelCapabilitiesEntry(
  value: JsonValue,
): NormalizedModelCapabilitiesEntry | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const providerId = readString(value, 'providerId');
  const modelId = readString(value, 'modelId');
  const capabilities = normalizeCapabilities(value.capabilities ?? null);
  if (!providerId || !modelId || !capabilities) {
    return null;
  }

  return {
    providerId,
    modelId,
    capabilities,
    updatedAt: readString(value, 'updatedAt') ?? new Date().toISOString(),
  };
}

/**
 * 归一化模型能力，兼容旧 schema 并丢弃废弃字段。
 * @param value 原始能力 JSON
 * @returns 只包含当前 schema 的模型能力；无法识别时返回 `null`
 */
function normalizeCapabilities(value: JsonValue): ModelCapabilities | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const defaults = createDefaultCapabilities();
  return {
    input: normalizeModalityCapabilities(value.input ?? null, defaults.input),
    output: normalizeModalityCapabilities(value.output ?? null, defaults.output),
    reasoning: readBoolean(value, 'reasoning') ?? defaults.reasoning,
    toolCall: readBoolean(value, 'toolCall') ?? defaults.toolCall,
  };
}

/**
 * 归一化输入/输出模态能力。
 * @param value 原始模态 JSON
 * @param defaults 默认模态能力
 * @returns 仅保留 `text` / `image` 的模态能力
 */
function normalizeModalityCapabilities(
  value: JsonValue,
  defaults: ModalityCapabilities,
): ModalityCapabilities {
  if (!isJsonObjectValue(value)) {
    return defaults;
  }

  return {
    text: readBoolean(value, 'text') ?? defaults.text,
    image: readBoolean(value, 'image') ?? defaults.image,
  };
}

/**
 * 判断 JSON 值是否为对象。
 * @param value JSON 值
 * @returns 是否为普通对象
 */
function isJsonObjectValue(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 从 JSON 对象中读取字符串字段。
 * @param value JSON 对象
 * @param key 字段名
 * @returns 非空字符串；不存在时返回 `null`
 */
function readString(value: JsonObject, key: string): string | null {
  const entry = value[key];
  return typeof entry === 'string' && entry.length > 0 ? entry : null;
}

/**
 * 从 JSON 对象中读取布尔字段。
 * @param value JSON 对象
 * @param key 字段名
 * @returns 布尔值；不存在时返回 `null`
 */
function readBoolean(value: JsonObject, key: string): boolean | null {
  const entry = value[key];
  return typeof entry === 'boolean' ? entry : null;
}

/**
 * 聊天模型调用参数归一化
 *
 * 输入:
 * - 模型配置中的默认 options / headers / variants / limit
 * - 调用侧显式传入的 variant / providerOptions / headers / maxOutputTokens
 *
 * 输出:
 * - 可直接透传给 AI SDK 的请求参数
 *
 * 预期行为:
 * - 显式参数优先
 * - 未显式传入时回退模型默认配置
 * - 选中 variant 时，将其作为模型默认 options 的覆盖层
 */

import type { JsonObject, JsonValue } from '../common/types/json-value';
import type { ModelConfig } from '../ai/types/provider.types';

/**
 * 调用侧可显式覆盖的请求参数。
 */
export interface ChatModelInvocationRequestOptionsInput {
  /** 可选的请求变体名。 */
  variant?: string;
  /** 可选的 provider 透传参数。 */
  providerOptions?: JsonObject;
  /** 可选的额外请求头。 */
  headers?: Record<string, string>;
  /** 可选的最大输出 token。 */
  maxOutputTokens?: number;
}

/**
 * 统一解析后的请求参数。
 */
export interface ResolvedChatModelInvocationRequestOptions {
  /** 最终生效的 provider 透传参数。 */
  providerOptions?: JsonObject;
  /** 最终生效的请求头。 */
  headers?: Record<string, string>;
  /** 最终生效的最大输出 token。 */
  maxOutputTokens?: number;
}

/**
 * 统一解析聊天模型调用参数。
 * @param input 模型默认配置与显式覆盖项
 * @returns 可直接交给 SDK 的请求参数
 */
export function resolveChatModelInvocationRequestOptions(input: {
  modelConfig: ModelConfig;
  requestOptions: ChatModelInvocationRequestOptionsInput;
}): ResolvedChatModelInvocationRequestOptions {
  const variantOptions = resolveVariantOptions(
    input.modelConfig,
    input.requestOptions.variant,
  );

  return {
    providerOptions: mergeJsonObjects(
      input.modelConfig.options,
      variantOptions,
      input.requestOptions.providerOptions,
    ),
    headers: mergeHeaders(
      input.modelConfig.headers,
      input.requestOptions.headers,
    ),
    maxOutputTokens:
      input.requestOptions.maxOutputTokens ?? input.modelConfig.limit?.output,
  };
}

/**
 * 解析模型变体对应的 provider 透传参数。
 * @param modelConfig 模型配置
 * @param variant 目标变体名
 * @returns 变体配置，未指定时返回 `undefined`
 */
function resolveVariantOptions(
  modelConfig: ModelConfig,
  variant?: string,
): JsonObject | undefined {
  if (!variant) {
    return undefined;
  }

  const variantOptions = modelConfig.variants?.[variant];
  if (variantOptions) {
    return variantOptions;
  }

  throw new Error(
    `Model variant "${variant}" is not configured for "${String(modelConfig.providerId)}/${String(modelConfig.id)}"`,
  );
}

/**
 * 合并请求头。
 * @param defaults 模型默认请求头
 * @param overrides 调用侧覆盖请求头
 * @returns 合并后的请求头，空结果返回 `undefined`
 */
function mergeHeaders(
  defaults?: Record<string, string>,
  overrides?: Record<string, string>,
): Record<string, string> | undefined {
  const merged = {
    ...(defaults ?? {}),
    ...(overrides ?? {}),
  };

  return Object.keys(merged).length > 0 ? merged : undefined;
}

/**
 * 深度合并 JSON 对象。
 * @param sources 需要合并的对象列表
 * @returns 合并后的对象，空结果返回 `undefined`
 */
function mergeJsonObjects(
  ...sources: Array<JsonObject | undefined>
): JsonObject | undefined {
  const result: JsonObject = {};

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const [key, value] of Object.entries(source)) {
      const currentValue = result[key];
      if (isJsonObject(currentValue) && isJsonObject(value)) {
        result[key] = mergeJsonObjects(currentValue, value) ?? {};
        continue;
      }

      result[key] = cloneJsonValue(value);
    }
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

/**
 * 复制 JSON 值，避免把原配置对象直接透传后续链路。
 * @param value 待复制的 JSON 值
 * @returns 深拷贝后的 JSON 值
 */
function cloneJsonValue(value: JsonValue): JsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => cloneJsonValue(entry));
  }

  const cloned: JsonObject = {};
  for (const [key, entry] of Object.entries(value)) {
    cloned[key] = cloneJsonValue(entry);
  }
  return cloned;
}

/**
 * 判断值是否为普通 JSON 对象。
 * @param value 待判断的值
 * @returns 是否为普通 JSON 对象
 */
function isJsonObject(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

import { BadRequestException } from '@nestjs/common';
import type {
  DiscoveredAiModel,
} from '@garlic-claw/shared';
import type { JsonObject, JsonValue } from '../common/types/json-value';
import type { StoredAiProviderConfig } from './config/config-manager.service';
export type {
  AiProviderConnectionTestResult,
  DiscoveredAiModel,
} from '@garlic-claw/shared';

/**
 * 模型发现请求配置。
 */
export interface ModelDiscoveryRequest {
  /** 完整请求 URL。 */
  url: string;
  /** 请求头。 */
  headers: Record<string, string>;
}

/**
 * 为模型发现构造请求。
 * @param provider provider 配置
 * @returns 远程发现请求配置
 */
export function buildModelDiscoveryRequest(
  provider: StoredAiProviderConfig,
): ModelDiscoveryRequest {
  if (!provider.baseUrl) {
    throw new BadRequestException(
      `Provider "${provider.id}" does not have a baseUrl`,
    );
  }

  if (!provider.apiKey) {
    throw new BadRequestException(
      `Provider "${provider.id}" does not have an apiKey`,
    );
  }

  const baseUrl = provider.baseUrl.replace(/\/+$/, '');
  switch (provider.driver) {
    case 'anthropic':
      return {
        url: `${baseUrl}/models`,
        headers: {
          'content-type': 'application/json',
          'x-api-key': provider.apiKey,
          'anthropic-version': '2023-06-01',
        },
      };
    case 'gemini':
      return {
        url: `${baseUrl}/models`,
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': provider.apiKey,
        },
      };
    default:
      return {
        url: `${baseUrl}/models`,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${provider.apiKey}`,
        },
      };
  }
}

/**
 * 从远程 JSON 响应中提取模型列表。
 * @param payload 响应 JSON
 * @returns 标准化后的模型列表
 */
export function extractDiscoveredModels(payload: JsonValue): DiscoveredAiModel[] {
  if (!isJsonObjectValue(payload)) {
    return [];
  }

  const collections: JsonValue[] = [];
  if (Array.isArray(payload.data)) {
    collections.push(...payload.data);
  }
  if (Array.isArray(payload.models)) {
    collections.push(...payload.models);
  }

  const discovered: DiscoveredAiModel[] = [];
  const seen = new Set<string>();

  for (const item of collections) {
    const normalized = normalizeModelEntry(item);
    if (!normalized || seen.has(normalized.id)) {
      continue;
    }

    seen.add(normalized.id);
    discovered.push(normalized);
  }

  return discovered;
}

/**
 * 在远程发现失败或返回空列表时，回退到本地已配置模型。
 * @param provider provider 配置
 * @returns 本地模型列表
 */
export function getConfiguredModelsFallback(
  provider: StoredAiProviderConfig,
): DiscoveredAiModel[] {
  const ids = new Set<string>();
  const discovered: DiscoveredAiModel[] = [];

  for (const modelId of [
    ...(provider.defaultModel ? [provider.defaultModel] : []),
    ...provider.models,
  ]) {
    if (!modelId || ids.has(modelId)) {
      continue;
    }

    ids.add(modelId);
    discovered.push({
      id: modelId,
      name: modelId,
    });
  }

  return discovered;
}

/**
 * 将单个模型条目归一化。
 * @param value 远程返回的模型项
 * @returns 标准化结果；无法识别时返回 null
 */
function normalizeModelEntry(value: JsonValue): DiscoveredAiModel | null {
  if (!isJsonObjectValue(value)) {
    return null;
  }

  const rawId =
    readString(value, 'id') ??
    readString(value, 'name') ??
    readString(value, 'model');
  if (!rawId) {
    return null;
  }

  const id = normalizeRemoteModelId(rawId);
  const displayName =
    readString(value, 'display_name') ??
    readString(value, 'displayName') ??
    readString(value, 'name') ??
    id;

  return {
    id,
    name: normalizeRemoteModelId(displayName),
  };
}

/**
 * 判断 JSON 值是否为对象。
 * @param value JSON 值
 * @returns 是否为对象
 */
function isJsonObjectValue(value: JsonValue): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 从 JSON 对象中读取字符串字段。
 * @param value JSON 对象
 * @param key 字段名
 * @returns 字符串值；不存在时返回 null
 */
function readString(value: JsonObject, key: string): string | null {
  const entry = value[key];
  return typeof entry === 'string' && entry.length > 0 ? entry : null;
}

/**
 * 归一化远程模型 ID。
 * @param value 原始模型 ID 或名称
 * @returns 去掉 Gemini `models/` 前缀后的值
 */
function normalizeRemoteModelId(value: string): string {
  return value.replace(/^models\//, '');
}

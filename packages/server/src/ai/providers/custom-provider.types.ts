import type { JsonObject } from '../../common/types/json-value';
import type { ModelCapabilities } from '../types';

/**
 * 兼容供应商请求格式。
 */
export type CompatibleProviderFormat = 'openai' | 'anthropic' | 'gemini';

/**
 * 自定义供应商注册请求。
 */
export interface RegisterCustomProviderDto {
  /** 供应商唯一 ID。 */
  id: string;
  /** 供应商显示名称。 */
  name: string;
  /** 兼容端点基础 URL。 */
  baseUrl: string;
  /** 直接传入的 API Key。 */
  apiKey?: string;
  /** 读取 API Key 的环境变量名。 */
  apiKeyEnv?: string;
  /** 兼容请求格式，默认 openai。 */
  format?: CompatibleProviderFormat;
  /** 默认模型 ID。 */
  defaultModel?: string;
  /** 预置模型列表。 */
  models?: CustomModelDto[];
  /** 额外透传选项。 */
  options?: JsonObject;
}

/**
 * 自定义模型配置。
 */
export interface CustomModelDto {
  /** 模型 ID。 */
  id: string;
  /** 模型显示名称。 */
  name: string;
  /** 模型能力覆盖项。 */
  capabilities?: Partial<ModelCapabilities> & {
    input?: Partial<ModelCapabilities['input']>;
    output?: Partial<ModelCapabilities['output']>;
  };
}

/**
 * 模型发现结果。
 */
export interface DiscoveredModel {
  /** 模型 ID。 */
  id: string;
  /** 模型显示名称。 */
  name: string;
  /** 推断得到的模型能力。 */
  capabilities: ModelCapabilities;
}

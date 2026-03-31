import type { JsonObject } from '../../common/types/json-value';

/**
 * 供应商 ID。
 */
export type ProviderId = string & { readonly __brand: 'ProviderId' };

/**
 * 模型 ID。
 */
export type ModelId = string & { readonly __brand: 'ModelId' };

/**
 * 创建品牌化的供应商 ID。
 * @param id 原始字符串 ID
 * @returns 品牌化后的供应商 ID
 */
export function createProviderId(id: string): ProviderId {
  return id as ProviderId;
}

/**
 * 创建品牌化的模型 ID。
 * @param id 原始字符串 ID
 * @returns 品牌化后的模型 ID
 */
export function createModelId(id: string): ModelId {
  return id as ModelId;
}

/**
 * 模态能力。
 */
export interface ModalityCapabilities {
  /** 是否支持文本。 */
  text: boolean;
  /** 是否支持图片。 */
  image: boolean;
}

/**
 * 模型能力定义。
 */
export interface ModelCapabilities {
  /** 输入模态能力。 */
  input: ModalityCapabilities;
  /** 输出模态能力。 */
  output: ModalityCapabilities;
  /** 是否支持 reasoning。 */
  reasoning: boolean;
  /** 是否支持工具调用。 */
  toolCall: boolean;
}

/**
 * 创建默认的模态能力。
 * @returns 默认仅支持文本的模态能力
 */
export function createDefaultModalityCapabilities(): ModalityCapabilities {
  return {
    text: true,
    image: false,
  };
}

/**
 * 创建默认的模型能力。
 * @returns 默认模型能力
 */
export function createDefaultCapabilities(): ModelCapabilities {
  return {
    input: createDefaultModalityCapabilities(),
    output: createDefaultModalityCapabilities(),
    reasoning: false,
    toolCall: true,
  };
}

/**
 * 模型 API 元数据。
 */
export interface ApiConfig {
  /** 模型在 provider API 中的标识。 */
  id: string;
  /** provider API 基础地址。 */
  url: string;
  /** 对应 SDK 包名。 */
  npm: string;
}

/**
 * 模型成本配置。
 */
export interface ModelCost {
  /** 输入 token 成本。 */
  input: number;
  /** 输出 token 成本。 */
  output: number;
  /** 缓存成本。 */
  cache?: {
    /** 缓存读取成本。 */
    read: number;
    /** 缓存写入成本。 */
    write: number;
  };
}

/**
 * 模型限制配置。
 */
export interface ModelLimit {
  /** 上下文窗口大小。 */
  context: number;
  /** 最大输入 token。 */
  input?: number;
  /** 最大输出 token。 */
  output: number;
}

/**
 * 模型配置。
 */
export interface ModelConfig {
  /** 模型 ID。 */
  id: string | ModelId;
  /** 所属 provider ID。 */
  providerId: string | ProviderId;
  /** 显示名称。 */
  name: string;
  /** 模型家族名。 */
  family?: string;
  /** 模型能力。 */
  capabilities: ModelCapabilities;
  /** API 元数据。 */
  api: ApiConfig;
  /** 成本信息。 */
  cost?: ModelCost;
  /** 限制信息。 */
  limit?: ModelLimit;
  /** 生命周期状态。 */
  status?: 'alpha' | 'beta' | 'active' | 'deprecated';
  /** provider 透传配置。 */
  options?: JsonObject;
  /** 自定义请求头。 */
  headers?: Record<string, string>;
  /** 推理变体配置。 */
  variants?: Record<string, JsonObject>;
}

/**
 * provider 配置。
 */
export interface ProviderConfig {
  /** provider ID。 */
  id: string | ProviderId;
  /** provider 名称。 */
  name: string;
  /** provider 描述。 */
  description?: string;
  /** 默认 SDK 包名。 */
  npm?: string;
  /** 默认 API 地址。 */
  api?: string;
  /** 需要的环境变量。 */
  env?: string[];
  /** provider 级能力默认值。 */
  capabilities?: Partial<ModelCapabilities>;
  /** provider 级附加配置。 */
  options?: JsonObject;
}

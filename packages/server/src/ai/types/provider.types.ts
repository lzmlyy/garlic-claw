import type { LanguageModel } from 'ai';
import type { JsonObject, JsonValue } from '../../common/types/json-value';

/**
 * AI SDK 语言模型实例。
 *
 * 输入:
 * - 由官方 provider SDK 创建的聊天模型
 *
 * 输出:
 * - 可直接用于 `streamText` / `generateText` 的 `LanguageModel`
 *
 * 预期行为:
 * - 不再把模型实例暴露为宽松顶层类型
 * - 保持外部 SDK 边界的明确类型
 */
export type AnyLanguageModel = LanguageModel;

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
 * 推理配置。
 */
export interface ReasoningConfig {
  /** 是否启用推理。 */
  type: 'enabled' | 'disabled';
  /** 推理预算 token。 */
  budgetTokens?: number;
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
  /** 兼容请求格式，仅允许三种。 */
  type?: 'openai' | 'anthropic' | 'gemini';
}

/**
 * provider 选项允许的值类型。
 */
export type ProviderOptionValue = JsonValue | typeof fetch | undefined;

/**
 * provider 工厂输入。
 */
export interface ProviderOptions {
  /** provider 名称。 */
  name?: string;
  /** API Key。 */
  apiKey?: string;
  /** Base URL。 */
  baseURL?: string;
  /** 自定义 fetch 实现。 */
  fetch?: typeof fetch;
  /** 超时时间。 */
  timeout?: number;
  /** 其他透传选项。 */
  [key: string]: ProviderOptionValue;
}

/**
 * provider 运行时实例。
 */
export interface ProviderInstance {
  /** 可选的底层 SDK 实例。 */
  instance?: object;
  /** 创建语言模型实例。 */
  createModel(modelId: string): AnyLanguageModel;
  /** 获取模型能力。 */
  getModelCapabilities?(modelId: string): ModelCapabilities;
  /** 获取 provider 配置。 */
  getConfig?(): ProviderConfig;
  /** 获取单个模型配置。 */
  getModelConfig?(modelId: string): ModelConfig | undefined;
  /** 列出所有模型。 */
  listModels?(): ModelConfig[];
  /** 获取推理变体配置。 */
  getReasoningVariants?(): Record<string, JsonObject>;
  /** 动态发现模型。 */
  discoverModels?(): Promise<ModelConfig[]>;
}

/**
 * provider 工厂函数。
 */
export type ProviderFactory = (options: ProviderOptions) => ProviderInstance;

/**
 * 自定义模型加载器。
 */
export type CustomModelLoader = (
  sdk: ProviderInstance,
  modelId: string,
  options?: JsonObject,
) => AnyLanguageModel | Promise<AnyLanguageModel>;

/**
 * provider 加载器配置。
 */
export interface ProviderLoader {
  /** 是否自动加载。 */
  autoload?: boolean;
  /** 自定义模型加载器。 */
  getModel?: CustomModelLoader;
  /** 额外环境变量生成器。 */
  vars?: (options: JsonObject) => Record<string, string>;
  /** 额外配置。 */
  options?: JsonObject;
  /** 动态发现模型。 */
  discoverModels?: () => Promise<ModelConfig[]>;
}

/**
 * 内置 provider ID 常量。
 */
export const BUILTIN_PROVIDER_IDS = {
  OPENAI: createProviderId('openai'),
  ANTHROPIC: createProviderId('anthropic'),
  OLLAMA: createProviderId('ollama'),
  GOOGLE: createProviderId('google'),
  OPENAI_COMPATIBLE: createProviderId('openai-compatible'),
  AZURE: createProviderId('azure'),
  OPENROUTER: createProviderId('openrouter'),
} as const;

/**
 * 内置 SDK 包名常量。
 */
export const BUILTIN_SDK_PACKAGES = {
  OPENAI: '@ai-sdk/openai',
  ANTHROPIC: '@ai-sdk/anthropic',
  GOOGLE: '@ai-sdk/google',
  AZURE: '@ai-sdk/azure',
  OPENROUTER: '@openrouter/ai-sdk-provider',
  OPENAI_COMPATIBLE: '@ai-sdk/openai-compatible',
} as const;

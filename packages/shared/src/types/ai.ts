/**
 * provider 模式。
 */
export type AiProviderMode = 'official' | 'compatible';

/**
 * 兼容 provider 请求格式。
 */
export type CompatibleProviderDriver = 'openai' | 'anthropic' | 'gemini';

/**
 * 官方 provider 标识。
 */
export type OfficialProviderDriver =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'groq'
  | 'xai'
  | 'mistral'
  | 'cohere'
  | 'cerebras'
  | 'deepinfra'
  | 'togetherai'
  | 'perplexity'
  | 'gateway'
  | 'vercel'
  | 'openrouter';

/**
 * 模态能力。
 */
export interface AiModalityCapabilities {
  /** 是否支持文本。 */
  text: boolean;
  /** 是否支持图片。 */
  image: boolean;
}

/**
 * AI 模型能力。
 */
export interface AiModelCapabilities {
  /** 是否支持推理。 */
  reasoning: boolean;
  /** 是否支持工具调用。 */
  toolCall: boolean;
  /** 输入模态。 */
  input: AiModalityCapabilities;
  /** 输出模态。 */
  output: AiModalityCapabilities;
}

/**
 * 模型 API 元信息。
 */
export interface AiModelApiConfig {
  /** provider 侧模型 ID。 */
  id: string;
  /** provider API 地址。 */
  url: string;
  /** 对应 SDK 包名。 */
  npm: string;
}

/**
 * AI 模型配置。
 */
export interface AiModelConfig {
  /** 模型 ID。 */
  id: string;
  /** 所属 provider ID。 */
  providerId: string;
  /** 显示名称。 */
  name: string;
  /** 模型能力。 */
  capabilities: AiModelCapabilities;
  /** API 元信息。 */
  api: AiModelApiConfig;
  /** 生命周期状态。 */
  status?: 'alpha' | 'beta' | 'active' | 'deprecated';
}

/**
 * 官方 provider 目录项。
 */
export interface OfficialProviderCatalogItem {
  /** 官方 provider ID。 */
  id: OfficialProviderDriver;
  /** 显示名称。 */
  name: string;
  /** SDK 包名。 */
  npm: string;
  /** 默认 Base URL。 */
  defaultBaseUrl: string;
  /** 推荐默认模型。 */
  defaultModel: string;
}

/**
 * provider 摘要。
 */
export interface AiProviderSummary {
  /** provider ID。 */
  id: string;
  /** provider 名称。 */
  name: string;
  /** provider 模式。 */
  mode: AiProviderMode;
  /** 官方 driver 或兼容格式。 */
  driver: string;
  /** 默认模型。 */
  defaultModel?: string;
  /** Base URL。 */
  baseUrl?: string;
  /** 模型数量。 */
  modelCount: number;
  /** 是否可用。 */
  available: boolean;
}

/**
 * provider 详情配置。
 */
export interface AiProviderConfig {
  /** provider ID。 */
  id: string;
  /** provider 名称。 */
  name: string;
  /** provider 模式。 */
  mode: AiProviderMode;
  /** 官方 driver 或兼容格式。 */
  driver: string;
  /** API key。 */
  apiKey?: string;
  /** Base URL。 */
  baseUrl?: string;
  /** 默认模型。 */
  defaultModel?: string;
  /** 已添加模型。 */
  models: string[];
}

/**
 * 视觉转述配置。
 */
export interface VisionFallbackConfig {
  /** 是否启用。 */
  enabled: boolean;
  /** 转述 provider。 */
  providerId?: string;
  /** 转述模型。 */
  modelId?: string;
  /** 自定义提示词。 */
  prompt?: string;
  /** 最大描述长度，`0` 表示不限制。 */
  maxDescriptionLength?: number;
}

/**
 * 远程发现到的模型。
 */
export interface DiscoveredAiModel {
  /** 模型 ID。 */
  id: string;
  /** 模型显示名称。 */
  name: string;
}

/**
 * provider 测试连接结果。
 */
export interface AiProviderConnectionTestResult {
  /** 当前固定为成功结果。 */
  ok: true;
  /** provider ID。 */
  providerId: string;
  /** 实际使用的模型 ID。 */
  modelId: string;
  /** 模型返回的首段文本。 */
  text: string;
}

import type {
  AiHostModelRoutingConfig,
  AiModelRouteTarget,
  AiProviderConfig,
  JsonValue,
  VisionFallbackConfig,
} from '@garlic-claw/shared';

/**
 * 持久化的 provider 配置。
 */
export interface StoredAiProviderConfig extends AiProviderConfig {}

/**
 * 持久化的视觉转述配置。
 */
export interface StoredVisionFallbackConfig extends VisionFallbackConfig {}

/**
 * 持久化的模型路由目标。
 */
export interface StoredAiModelRouteTarget extends AiModelRouteTarget {}

/**
 * 持久化的宿主 AI 模型路由配置。
 */
export interface StoredAiHostModelRoutingConfig extends AiHostModelRoutingConfig {}

/**
 * AI 设置文件结构。
 */
export interface AiSettingsFile {
  /** 配置版本。 */
  version: number;
  /** 最近更新时间。 */
  updatedAt: string;
  /** provider 配置列表。 */
  providers: StoredAiProviderConfig[];
  /** 视觉转述配置。 */
  visionFallback: StoredVisionFallbackConfig;
  /** 宿主模型路由配置。 */
  hostModelRouting: StoredAiHostModelRoutingConfig;
}

/**
 * 设置文件中的宽松 provider 形状。
 */
export interface RawStoredAiProviderConfig {
  /** provider ID。 */
  id?: JsonValue;
  /** provider 名称。 */
  name?: JsonValue;
  /** 旧字段。 */
  type?: JsonValue;
  /** 新字段。 */
  mode?: JsonValue;
  /** 新字段。 */
  driver?: JsonValue;
  /** API key。 */
  apiKey?: JsonValue;
  /** Base URL。 */
  baseUrl?: JsonValue;
  /** 默认模型。 */
  defaultModel?: JsonValue;
  /** 模型列表。 */
  models?: JsonValue;
}

/**
 * 设置文件中的宽松模型路由目标形状。
 */
export interface RawStoredAiModelRouteTarget {
  providerId?: JsonValue;
  modelId?: JsonValue;
}

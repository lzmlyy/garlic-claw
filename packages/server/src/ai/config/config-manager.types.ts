import type {
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

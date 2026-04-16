import type {
  AiHostModelRoutingConfig,
  AiProviderMode,
  VisionFallbackConfig,
} from '@garlic-claw/shared';

export interface StoredAiProviderConfig {
  id: string;
  name: string;
  mode: AiProviderMode;
  driver: string;
  apiKey?: string;
  baseUrl?: string;
  defaultModel?: string;
  models: string[];
}

export interface AiSettingsFile {
  providers: StoredAiProviderConfig[];
  visionFallback: VisionFallbackConfig;
  hostModelRouting: AiHostModelRoutingConfig;
}

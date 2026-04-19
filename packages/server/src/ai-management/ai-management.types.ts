import type {
  AiHostModelRoutingConfig,
  AiModelCapabilities,
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

export interface StoredAiModelConfig {
  id: string;
  providerId: string;
  name: string;
  capabilities: AiModelCapabilities;
  contextLength: number;
  status?: 'alpha' | 'beta' | 'active' | 'deprecated';
}

export interface AiSettingsFile {
  providers: StoredAiProviderConfig[];
  models: StoredAiModelConfig[];
  visionFallback: VisionFallbackConfig;
  hostModelRouting: AiHostModelRoutingConfig;
}

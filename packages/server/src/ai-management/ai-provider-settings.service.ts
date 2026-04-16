import {
  type AiHostModelRoutingConfig,
  type AiProviderCatalogItem,
  type AiProviderSummary,
  type VisionFallbackConfig,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  findAiProviderCatalogItem,
  isCatalogProviderMode,
  validateAiProviderInput,
} from './ai-management-model-config';
import { PROVIDER_CATALOG } from './ai-provider-catalog';
import {
  cloneRoutingConfig,
  loadAiSettings,
  resolveAiSettingsPath,
  saveAiSettings,
} from './ai-management-settings.store';
import type { AiSettingsFile, StoredAiProviderConfig } from './ai-management.types';

@Injectable()
export class AiProviderSettingsService {
  private readonly settingsPath = resolveAiSettingsPath();
  private settings: AiSettingsFile = loadAiSettings(this.settingsPath);

  getProvider(providerId: string): StoredAiProviderConfig {
    const provider = this.settings.providers.find((entry) => entry.id === providerId);
    if (provider) {
      return provider;
    }
    throw new NotFoundException(`Provider "${providerId}" not found`);
  }

  listProviderCatalog(): AiProviderCatalogItem[] {
    return PROVIDER_CATALOG;
  }

  listProviders(): AiProviderSummary[] {
    return this.settings.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      mode: provider.mode,
      driver: provider.driver,
      defaultModel: provider.defaultModel,
      baseUrl: provider.baseUrl,
      modelCount: provider.models.length,
      available: Boolean(provider.apiKey),
    }));
  }

  getHostModelRoutingConfig(): AiHostModelRoutingConfig {
    return cloneRoutingConfig(this.settings.hostModelRouting);
  }

  removeProvider(providerId: string): void {
    this.getProvider(providerId);
    this.settings.providers = this.settings.providers.filter((entry) => entry.id !== providerId);
    this.saveSettings();
  }

  getVisionFallbackConfig(): VisionFallbackConfig {
    return { ...this.settings.visionFallback };
  }

  upsertProvider(providerId: string, input: Omit<StoredAiProviderConfig, 'id'>): StoredAiProviderConfig {
    validateAiProviderInput(PROVIDER_CATALOG, input);
    const catalog = findAiProviderCatalogItem(PROVIDER_CATALOG, input.driver);
    const nextProvider: StoredAiProviderConfig = {
      id: providerId,
      ...input,
      baseUrl: input.baseUrl ?? (isCatalogProviderMode(input.mode) ? catalog?.defaultBaseUrl : undefined),
      defaultModel: input.defaultModel ?? (isCatalogProviderMode(input.mode) ? catalog?.defaultModel : undefined),
      models: [...input.models],
    };
    const index = this.settings.providers.findIndex((entry) => entry.id === providerId);
    if (index >= 0) {
      this.settings.providers[index] = nextProvider;
    } else {
      this.settings.providers.push(nextProvider);
    }
    this.saveSettings();
    return { ...nextProvider, models: [...nextProvider.models] };
  }

  updateHostModelRoutingConfig(config: AiHostModelRoutingConfig): AiHostModelRoutingConfig {
    this.settings.hostModelRouting = cloneRoutingConfig(config);
    this.saveSettings();
    return cloneRoutingConfig(this.settings.hostModelRouting);
  }

  updateVisionFallbackConfig(config: VisionFallbackConfig): VisionFallbackConfig {
    this.settings.visionFallback = { ...config };
    this.saveSettings();
    return { ...this.settings.visionFallback };
  }

  private saveSettings(): void {
    saveAiSettings(this.settingsPath, this.settings);
  }
}

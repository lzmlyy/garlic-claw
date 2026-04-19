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
import type { AiSettingsFile, StoredAiModelConfig, StoredAiProviderConfig } from './ai-management.types';

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

  listPersistedModels(providerId?: string): StoredAiModelConfig[] {
    const models = providerId
      ? this.settings.models.filter((entry) => entry.providerId === providerId)
      : this.settings.models;
    return models.map((entry) => ({
      ...entry,
      capabilities: {
        ...entry.capabilities,
        input: { ...entry.capabilities.input },
        output: { ...entry.capabilities.output },
      },
    }));
  }

  readPersistedModel(providerId: string, modelId: string): StoredAiModelConfig | null {
    return this.listPersistedModels(providerId).find((entry) => entry.id === modelId) ?? null;
  }

  removeProvider(providerId: string): void {
    this.getProvider(providerId);
    this.settings.providers = this.settings.providers.filter((entry) => entry.id !== providerId);
    this.settings.models = this.settings.models.filter((entry) => entry.providerId !== providerId);
    this.saveSettings();
  }

  getVisionFallbackConfig(): VisionFallbackConfig {
    return { ...this.settings.visionFallback };
  }

  upsertProvider(providerId: string, input: Omit<StoredAiProviderConfig, 'id'>): StoredAiProviderConfig {
    validateAiProviderInput(PROVIDER_CATALOG, input);
    const catalog = findAiProviderCatalogItem(PROVIDER_CATALOG, input.driver);
    const existingProvider = this.settings.providers.find((entry) => entry.id === providerId) ?? null;
    const nextProvider: StoredAiProviderConfig = {
      id: providerId,
      ...input,
      baseUrl: input.baseUrl ?? (isCatalogProviderMode(input.mode) ? catalog?.defaultBaseUrl : undefined),
      defaultModel: input.defaultModel ?? (isCatalogProviderMode(input.mode) ? catalog?.defaultModel : undefined),
      models: [...input.models],
    };
    const removedModelIds = existingProvider
      ? existingProvider.models.filter((modelId) => !nextProvider.models.includes(modelId))
      : [];
    const index = this.settings.providers.findIndex((entry) => entry.id === providerId);
    if (index >= 0) {
      this.settings.providers[index] = nextProvider;
    } else {
      this.settings.providers.push(nextProvider);
    }
    if (removedModelIds.length > 0) {
      this.settings.models = this.settings.models.filter(
        (entry) => !(entry.providerId === providerId && removedModelIds.includes(entry.id)),
      );
    }
    this.saveSettings();
    return { ...nextProvider, models: [...nextProvider.models] };
  }

  upsertPersistedModel(input: StoredAiModelConfig): StoredAiModelConfig {
    const nextModel: StoredAiModelConfig = {
      ...input,
      capabilities: {
        ...input.capabilities,
        input: { ...input.capabilities.input },
        output: { ...input.capabilities.output },
      },
    };
    const index = this.settings.models.findIndex((entry) => entry.providerId === input.providerId && entry.id === input.id);
    if (index >= 0) {
      this.settings.models[index] = nextModel;
    } else {
      this.settings.models.push(nextModel);
    }
    this.saveSettings();
    return {
      ...nextModel,
      capabilities: {
        ...nextModel.capabilities,
        input: { ...nextModel.capabilities.input },
        output: { ...nextModel.capabilities.output },
      },
    };
  }

  removePersistedModel(providerId: string, modelId: string): void {
    this.settings.models = this.settings.models.filter((entry) => !(entry.providerId === providerId && entry.id === modelId));
    this.saveSettings();
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

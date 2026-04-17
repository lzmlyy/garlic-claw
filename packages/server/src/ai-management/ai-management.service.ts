import {
  type AiModelConfig,
  type DiscoveredAiModel,
  type AiProviderSummary,
} from '@garlic-claw/shared';
import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  buildAiProviderHeaders,
  buildAiModelKey,
  createAiModelConfig,
  mergeAiCapabilities,
  type ModelCapabilitiesUpdate,
} from './ai-management-model-config';
import { PROVIDER_CATALOG } from './ai-provider-catalog';
import { AiProviderSettingsService } from './ai-provider-settings.service';
import type { StoredAiProviderConfig } from './ai-management.types';

@Injectable()
export class AiManagementService {
  private readonly models = new Map<string, AiModelConfig>();

  constructor(private readonly aiProviderSettingsService: AiProviderSettingsService) {}

  listProviderCatalog() { return this.aiProviderSettingsService.listProviderCatalog(); }

  listProviders() { return this.aiProviderSettingsService.listProviders(); }

  getDefaultProviderSelection(): { modelId: string | null; providerId: string | null; source: 'default' } {
    const provider = this.listProviders()[0];
    return !provider?.defaultModel ? { modelId: null, providerId: null, source: 'default' } : { modelId: provider.defaultModel, providerId: provider.id, source: 'default' };
  }

  getProviderSummary(providerId: string): AiProviderSummary {
    const provider = this.listProviders().find((entry) => entry.id === providerId);
    if (provider) {return provider;}
    throw new NotFoundException(`Provider "${providerId}" not found`);
  }

  getProviderModelSummary(providerId: string, modelId: string) {
    const model = this.getProviderModel(providerId, modelId);
    return {
      id: model.id,
      name: model.name,
      providerId: model.providerId,
      capabilities: model.capabilities,
      ...(model.status ? { status: model.status } : {}),
    };
  }

  getProvider(providerId: string): StoredAiProviderConfig { return this.aiProviderSettingsService.getProvider(providerId); }

  upsertProvider(providerId: string, input: Omit<StoredAiProviderConfig, 'id'>): StoredAiProviderConfig { return this.aiProviderSettingsService.upsertProvider(providerId, input); }

  deleteProvider(providerId: string): void {
    this.aiProviderSettingsService.removeProvider(providerId);
    for (const key of [...this.models.keys()]) {
      if (key.startsWith(`${providerId}:`)) {
        this.models.delete(key);
      }
    }
  }

  listModels(providerId: string): AiModelConfig[] { return this.getProvider(providerId).models.map((modelId) => this.getProviderModel(providerId, modelId)); }

  getProviderModel(providerId: string, modelId: string): AiModelConfig {
    const provider = this.getProvider(providerId);
    if (!provider.models.includes(modelId)) {throw new NotFoundException(`Model "${modelId}" is not configured for provider "${providerId}"`);}

    const key = buildAiModelKey(providerId, modelId);
    const existing = this.models.get(key) ?? createAiModelConfig(PROVIDER_CATALOG, provider, modelId);
    this.models.set(key, existing);
    return existing;
  }

  upsertModel(
    providerId: string,
    modelId: string,
    input: { name?: string; capabilities?: ModelCapabilitiesUpdate } = {},
  ): AiModelConfig {
    this.updateProvider(providerId, (provider) => {
      if (!provider.models.includes(modelId)) {provider.models.push(modelId);}
      if (!provider.defaultModel) {provider.defaultModel = modelId;}
    });

    const nextModel = {
      ...this.getProviderModel(providerId, modelId),
      ...(input.name ? { name: input.name } : {}),
    };
    if (input.capabilities) {
      nextModel.capabilities = mergeAiCapabilities(nextModel.capabilities, input.capabilities);
    }
    this.models.set(buildAiModelKey(providerId, modelId), nextModel);
    return nextModel;
  }

  deleteModel(providerId: string, modelId: string): void {
    this.updateProvider(providerId, (provider) => {
      provider.models = provider.models.filter((entry) => entry !== modelId);
      if (provider.defaultModel === modelId) {provider.defaultModel = provider.models[0];}
    });
    this.models.delete(buildAiModelKey(providerId, modelId));
  }

  setDefaultModel(providerId: string, modelId: string): StoredAiProviderConfig {
    this.getProviderModel(providerId, modelId);
    return this.updateProvider(providerId, (provider) => { provider.defaultModel = modelId; });
  }

  updateModelCapabilities(
    providerId: string,
    modelId: string,
    capabilities: ModelCapabilitiesUpdate,
  ): AiModelConfig {
    const model = this.getProviderModel(providerId, modelId);
    model.capabilities = mergeAiCapabilities(model.capabilities, capabilities);
    this.models.set(buildAiModelKey(providerId, modelId), model);
    return model;
  }

  async discoverModels(providerId: string) {
    const provider = this.getProvider(providerId);
    const fallbackModels = provider.models.map(toDiscoveredModel);
    if (!provider.baseUrl || !provider.apiKey) {return fallbackModels;}
    try {
      const response = await fetch(`${provider.baseUrl.replace(/\/+$/, '')}/models`, {
        headers: buildAiProviderHeaders(PROVIDER_CATALOG, provider),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        throw new BadGatewayException(`Failed to discover models for provider "${provider.id}" (${response.status})`);
      }
      const payload = await response.json() as Record<string, unknown>;
      const models = Array.isArray(payload.data) ? payload.data : Array.isArray(payload.models) ? payload.models : [];
      const discovered = models.map(readDiscoveredModel).filter((entry): entry is DiscoveredAiModel => Boolean(entry));
      return discovered.length > 0 ? discovered : fallbackModels;
    } catch (error) {
      if (error instanceof BadGatewayException) {throw error;}
      throw new BadGatewayException(`Failed to discover models for provider "${provider.id}": ${String(error)}`);
    }
  }

  async testConnection(providerId: string, modelId?: string) {
    const provider = this.getProvider(providerId);
    const resolvedModelId = modelId ?? provider.defaultModel ?? provider.models[0];
    if (!resolvedModelId) {
      throw new BadRequestException(`Provider "${provider.id}" does not have any testable model`);
    }
    return {
      ok: true,
      providerId: provider.id,
      modelId: resolvedModelId,
      text: 'OK',
    };
  }

  private updateProvider(providerId: string, mutate: (provider: StoredAiProviderConfig) => void): StoredAiProviderConfig {
    const provider = this.getProvider(providerId);
    mutate(provider);
    return this.aiProviderSettingsService.upsertProvider(providerId, provider);
  }
}

function readDiscoveredModel(entry: unknown): DiscoveredAiModel | null {
  if (!entry || typeof entry !== 'object') {return null;}
  const record = entry as Record<string, unknown>;
  const id = [record.id, record.name, record.model].find((value) => typeof value === 'string') as string | undefined;
  return id ? { id: id.replace(/^models\//, ''), name: (typeof record.display_name === 'string' ? record.display_name : id).replace(/^models\//, '') } : null;
}

function toDiscoveredModel(modelId: string): DiscoveredAiModel {
  return { id: modelId, name: modelId };
}

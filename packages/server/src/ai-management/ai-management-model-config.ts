import {
  type AiModelCapabilities,
  type AiModelConfig,
  type AiProviderCatalogItem,
  type AiProviderMode,
  type ProviderProtocolDriver,
} from '@garlic-claw/shared';
import type { StoredAiProviderConfig } from './ai-management.types';

const PROVIDER_PROTOCOL_DRIVERS: ProviderProtocolDriver[] = [
  'openai',
  'anthropic',
  'gemini',
];

const PROVIDER_PROTOCOL_DRIVER_SET = new Set<string>(PROVIDER_PROTOCOL_DRIVERS);

export type ModelCapabilitiesUpdate = Partial<
  Omit<AiModelCapabilities, 'input' | 'output'>
> & {
  input?: Partial<AiModelCapabilities['input']>;
  output?: Partial<AiModelCapabilities['output']>;
};

export function buildAiProviderHeaders(
  providerCatalog: AiProviderCatalogItem[],
  provider: StoredAiProviderConfig,
): Record<string, string> {
  const protocol = findAiProviderCatalogItem(providerCatalog, provider.driver)?.protocol ?? 'openai';
  switch (protocol) {
    case 'anthropic':
      return {
        'content-type': 'application/json',
        'x-api-key': provider.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      };
    case 'gemini':
      return {
        'content-type': 'application/json',
        'x-goog-api-key': provider.apiKey ?? '',
      };
    case 'openai':
    default:
      return {
        'content-type': 'application/json',
        authorization: `Bearer ${provider.apiKey ?? ''}`,
      };
  }
}

export function buildAiModelKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

export function createAiModelConfig(
  providerCatalog: AiProviderCatalogItem[],
  provider: StoredAiProviderConfig,
  modelId: string,
): AiModelConfig {
  const resolved = findAiProviderCatalogItem(providerCatalog, provider.driver);
  return {
    id: modelId,
    providerId: provider.id,
    name: modelId,
    capabilities: {
      reasoning: false,
      toolCall: true,
      input: { text: true, image: false },
      output: { text: true, image: false },
    },
    api: {
      id: modelId,
      url: provider.baseUrl ?? resolved?.defaultBaseUrl ?? '',
      npm: resolved?.protocol === 'anthropic'
        ? '@ai-sdk/anthropic'
        : resolved?.protocol === 'gemini'
          ? '@ai-sdk/google'
          : '@ai-sdk/openai',
    },
    status: 'active',
  };
}

export function mergeAiCapabilities(
  base: AiModelCapabilities,
  patch: ModelCapabilitiesUpdate,
): AiModelCapabilities {
  return {
    ...base,
    ...patch,
    input: {
      ...base.input,
      ...(patch.input ?? {}),
    },
    output: {
      ...base.output,
      ...(patch.output ?? {}),
    },
  };
}

export function validateAiProviderInput(
  providerCatalog: AiProviderCatalogItem[],
  input: Omit<StoredAiProviderConfig, 'id'>,
): void {
  if (isCatalogProviderMode(input.mode)) {
    if (!findAiProviderCatalogItem(providerCatalog, input.driver)) {
      throw new Error(`Unknown provider catalog driver "${input.driver}"`);
    }
    return;
  }
  if (!isProviderProtocolDriver(input.driver)) {
    throw new Error('Protocol provider driver must be one of: openai, anthropic, gemini');
  }
}

export function findAiProviderCatalogItem(
  catalog: AiProviderCatalogItem[],
  driver: string,
): AiProviderCatalogItem | null {
  return catalog.find((item) => item.id === driver) ?? null;
}

export function isCatalogProviderMode(mode: AiProviderMode): boolean {
  return mode === 'catalog';
}

export function isProviderProtocolDriver(
  driver: string,
): driver is ProviderProtocolDriver {
  return PROVIDER_PROTOCOL_DRIVER_SET.has(driver);
}

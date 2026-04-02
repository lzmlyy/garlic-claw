import type {
  AiSettingsFile,
  StoredAiHostModelRoutingConfig,
  StoredAiModelRouteTarget,
  StoredAiProviderConfig,
  StoredVisionFallbackConfig,
} from './config-manager.types';
import type { JsonObject, JsonValue } from '../../common/types/json-value';
import {
  findAiProviderCatalogItem,
  isAiProviderMode,
  isProviderProtocolDriver,
} from '@garlic-claw/shared';
import { PROVIDER_CATALOG } from '../provider-catalog';

interface NormalizedValue<T> {
  value: T;
  changed: boolean;
}

export interface LoadedAiSettingsResult {
  settings: AiSettingsFile;
  changed: boolean;
}

const CATALOG_PROVIDER_MODE: StoredAiProviderConfig['mode'] = 'catalog';
const PROTOCOL_PROVIDER_MODE: StoredAiProviderConfig['mode'] = 'protocol';
const LEGACY_CATALOG_PROVIDER_MODE = 'official';
const LEGACY_PROTOCOL_PROVIDER_MODE = 'compatible';

export function normalizeAiSettingsFile(
  input: JsonValue,
  currentVersion: number,
  now: Date = new Date(),
): LoadedAiSettingsResult {
  if (!isJsonObjectValue(input)) {
    throw new Error('AI settings file must be a JSON object');
  }

  const providers = normalizeProviders(input.providers);
  const visionFallback = normalizeVisionFallback(input.visionFallback);
  const hostModelRouting = normalizeHostModelRouting(input.hostModelRouting);
  const updatedAt = readNonEmptyString(input.updatedAt) ?? now.toISOString();

  return {
    settings: {
      version: currentVersion,
      updatedAt,
      providers: providers.value,
      visionFallback: visionFallback.value,
      hostModelRouting: hostModelRouting.value,
    },
    changed:
      readFiniteNumber(input.version) !== currentVersion
      || !readNonEmptyString(input.updatedAt)
      || providers.changed
      || visionFallback.changed
      || hostModelRouting.changed,
  };
}

function normalizeProviders(
  value: JsonValue | undefined,
): NormalizedValue<StoredAiProviderConfig[]> {
  return normalizeArrayEntries(value, normalizeProvider);
}

function normalizeProvider(
  value: JsonValue,
): NormalizedValue<StoredAiProviderConfig | null> {
  if (!isJsonObjectValue(value)) {
    return {
      value: null,
      changed: true,
    };
  }

  const id = readNonEmptyString(value.id);
  if (!id) {
    return {
      value: null,
      changed: true,
    };
  }

  const name = normalizeRequiredStringWithFallback(value.name, id);
  const driver = normalizeRequiredStringWithFallback(value.driver, id);
  const apiKey = normalizeOptionalString(value.apiKey);
  const baseUrl = normalizeOptionalString(value.baseUrl);
  const mode = normalizeProviderMode(value.mode, driver.value, baseUrl.value);
  const defaultModel = normalizeOptionalString(value.defaultModel);
  const models = normalizeRequiredStringArray(value.models);

  return {
    value: {
      id,
      name: name.value,
      mode: mode.value,
      driver: driver.value,
      ...(apiKey.value ? { apiKey: apiKey.value } : {}),
      ...(baseUrl.value ? { baseUrl: baseUrl.value } : {}),
      ...(defaultModel.value ? { defaultModel: defaultModel.value } : {}),
      models: models.value,
    },
    changed: hasNormalizedChanges(
      name,
      mode,
      driver,
      apiKey,
      baseUrl,
      defaultModel,
      models,
    ),
  };
}

function normalizeVisionFallback(
  value: JsonValue | undefined,
): NormalizedValue<StoredVisionFallbackConfig> {
  if (!isJsonObjectValue(value)) {
    return {
      value: { enabled: false },
      changed: true,
    };
  }

  const enabled = normalizeRequiredBoolean(value.enabled, false);
  const providerId = normalizeOptionalString(value.providerId);
  const modelId = normalizeOptionalString(value.modelId);
  const prompt = normalizeOptionalString(value.prompt);
  const maxDescriptionLength = normalizeOptionalNumber(value.maxDescriptionLength);

  return {
    value: {
      enabled: enabled.value,
      ...(providerId.value ? { providerId: providerId.value } : {}),
      ...(modelId.value ? { modelId: modelId.value } : {}),
      ...(prompt.value ? { prompt: prompt.value } : {}),
      ...(maxDescriptionLength.value !== undefined
        ? { maxDescriptionLength: maxDescriptionLength.value }
        : {}),
    },
    changed: hasNormalizedChanges(
      enabled,
      providerId,
      modelId,
      prompt,
      maxDescriptionLength,
    ),
  };
}

function normalizeHostModelRouting(
  value: JsonValue | undefined,
): NormalizedValue<StoredAiHostModelRoutingConfig> {
  if (!isJsonObjectValue(value)) {
    return {
      value: {
        fallbackChatModels: [],
        utilityModelRoles: {},
      },
      changed: true,
    };
  }

  const fallbackChatModels = normalizeRequiredModelRouteTargetArray(
    value.fallbackChatModels,
  );
  const compressionModel = normalizeOptionalModelRouteTarget(
    value.compressionModel,
  );
  const utilityModelRoles = normalizeUtilityModelRoles(value.utilityModelRoles);

  return {
    value: {
      fallbackChatModels: fallbackChatModels.value,
      ...(compressionModel.value
        ? { compressionModel: compressionModel.value }
        : {}),
      utilityModelRoles: utilityModelRoles.value,
    },
    changed: hasNormalizedChanges(
      fallbackChatModels,
      compressionModel,
      utilityModelRoles,
    ),
  };
}

function normalizeUtilityModelRoles(
  value: JsonValue | undefined,
): NormalizedValue<StoredAiHostModelRoutingConfig['utilityModelRoles']> {
  if (!isJsonObjectValue(value)) {
    return {
      value: {},
      changed: true,
    };
  }

  const conversationTitle = normalizeOptionalModelRouteTarget(
    value.conversationTitle,
  );
  const pluginGenerateText = normalizeOptionalModelRouteTarget(
    value.pluginGenerateText,
  );

  return {
    value: {
      ...(conversationTitle.value
        ? { conversationTitle: conversationTitle.value }
        : {}),
      ...(pluginGenerateText.value
        ? { pluginGenerateText: pluginGenerateText.value }
        : {}),
    },
    changed: conversationTitle.changed || pluginGenerateText.changed,
  };
}

function normalizeRequiredModelRouteTargetArray(
  value: JsonValue | undefined,
): NormalizedValue<StoredAiModelRouteTarget[]> {
  return normalizeArrayEntries(value, normalizeModelRouteTarget);
}

function normalizeOptionalModelRouteTarget(
  value: JsonValue | undefined,
): NormalizedValue<StoredAiModelRouteTarget | undefined> {
  if (value === undefined) {
    return {
      value: undefined,
      changed: false,
    };
  }

  const normalized = normalizeModelRouteTarget(value);
  return {
    value: normalized.value ?? undefined,
    changed: normalized.changed,
  };
}

function normalizeModelRouteTarget(
  value: JsonValue,
): NormalizedValue<StoredAiModelRouteTarget | null> {
  if (!isJsonObjectValue(value)) {
    return {
      value: null,
      changed: true,
    };
  }

  const providerId = readNonEmptyString(value.providerId);
  const modelId = readNonEmptyString(value.modelId);
  if (!providerId || !modelId) {
    return {
      value: null,
      changed: true,
    };
  }

  return {
    value: {
      providerId,
      modelId,
    },
    changed: false,
  };
}

function normalizeArrayEntries<T>(
  value: JsonValue | undefined,
  normalizeEntry: (entry: JsonValue) => NormalizedValue<T | null>,
): NormalizedValue<T[]> {
  if (!Array.isArray(value)) {
    return {
      value: [],
      changed: true,
    };
  }

  let changed = false;
  const normalizedValues: T[] = [];

  for (const entry of value) {
    const normalized = normalizeEntry(entry);
    changed = changed || normalized.changed;
    if (normalized.value) {
      normalizedValues.push(normalized.value);
    }
  }

  return {
    value: normalizedValues,
    changed: changed || normalizedValues.length !== value.length,
  };
}

function normalizeProviderMode(
  value: JsonValue | undefined,
  driver: string,
  baseUrl?: string,
): NormalizedValue<StoredAiProviderConfig['mode']> {
  if (typeof value === 'string' && isAiProviderMode(value)) {
    return {
      value,
      changed: false,
    };
  }

  if (value === LEGACY_CATALOG_PROVIDER_MODE) {
    return {
      value: CATALOG_PROVIDER_MODE,
      changed: true,
    };
  }
  if (value === LEGACY_PROTOCOL_PROVIDER_MODE) {
    return {
      value: PROTOCOL_PROVIDER_MODE,
      changed: true,
    };
  }

  const catalogItem = findAiProviderCatalogItem(PROVIDER_CATALOG, driver);
  if (!catalogItem) {
    return {
      value: PROTOCOL_PROVIDER_MODE,
      changed: true,
    };
  }

  if (!isProviderProtocolDriver(driver)) {
    return {
      value: CATALOG_PROVIDER_MODE,
      changed: true,
    };
  }

  const normalizedBaseUrl = normalizeComparableBaseUrl(baseUrl);
  const defaultBaseUrl = normalizeComparableBaseUrl(catalogItem.defaultBaseUrl);
  return {
    value:
      !normalizedBaseUrl || normalizedBaseUrl === defaultBaseUrl
        ? CATALOG_PROVIDER_MODE
        : PROTOCOL_PROVIDER_MODE,
    changed: true,
  };
}

function normalizeComparableBaseUrl(value?: string): string {
  return value?.replace(/\/+$/, '') ?? '';
}

function normalizeRequiredStringWithFallback(
  value: JsonValue | undefined,
  fallback: string,
): NormalizedValue<string> {
  const normalized = normalizeOptionalString(value);
  return {
    value: normalized.value ?? fallback,
    changed: normalized.changed || !normalized.value,
  };
}

function normalizeOptionalString(
  value: JsonValue | undefined,
): NormalizedValue<string | undefined> {
  if (value === undefined) {
    return {
      value: undefined,
      changed: false,
    };
  }

  if (typeof value === 'string' && value.length > 0) {
    return {
      value,
      changed: false,
    };
  }

  return {
    value: undefined,
    changed: true,
  };
}

function normalizeRequiredStringArray(
  value: JsonValue | undefined,
): NormalizedValue<string[]> {
  if (!Array.isArray(value)) {
    return {
      value: [],
      changed: true,
    };
  }

  const entries = value.filter((entry): entry is string =>
    typeof entry === 'string' && entry.length > 0);

  return {
    value: entries,
    changed: entries.length !== value.length,
  };
}

function normalizeRequiredBoolean(
  value: JsonValue | undefined,
  fallback: boolean,
): NormalizedValue<boolean> {
  if (typeof value === 'boolean') {
    return {
      value,
      changed: false,
    };
  }

  return {
    value: fallback,
    changed: true,
  };
}

function hasNormalizedChanges(
  ...values: Array<NormalizedValue<unknown>>
): boolean {
  return values.some((value) => value.changed);
}

function normalizeOptionalNumber(
  value: JsonValue | undefined,
): NormalizedValue<number | undefined> {
  if (value === undefined) {
    return {
      value: undefined,
      changed: false,
    };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return {
      value,
      changed: false,
    };
  }

  return {
    value: undefined,
    changed: true,
  };
}

function isJsonObjectValue(value: JsonValue | undefined): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readFiniteNumber(value: JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readNonEmptyString(value: JsonValue | undefined): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

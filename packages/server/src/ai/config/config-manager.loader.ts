import type {
  AiSettingsFile,
  StoredAiHostModelRoutingConfig,
  StoredAiModelRouteTarget,
  StoredAiProviderConfig,
  StoredVisionFallbackConfig,
} from './config-manager.types';
import type { JsonObject, JsonValue } from '../../common/types/json-value';

interface NormalizedValue<T> {
  value: T;
  changed: boolean;
}

export interface LoadedAiSettingsResult {
  settings: AiSettingsFile;
  changed: boolean;
}

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
  if (!Array.isArray(value)) {
    return {
      value: [],
      changed: true,
    };
  }

  let changed = false;
  const providers: StoredAiProviderConfig[] = [];

  for (const entry of value) {
    const normalized = normalizeProvider(entry);
    changed = changed || normalized.changed;
    if (normalized.value) {
      providers.push(normalized.value);
    }
  }

  if (providers.length !== value.length) {
    changed = true;
  }

  return {
    value: providers,
    changed,
  };
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
  const mode = normalizeProviderMode(value.mode);
  const driver = normalizeRequiredStringWithFallback(value.driver, id);
  const apiKey = normalizeOptionalString(value.apiKey);
  const baseUrl = normalizeOptionalString(value.baseUrl);
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
    changed:
      name.changed
      || mode.changed
      || driver.changed
      || apiKey.changed
      || baseUrl.changed
      || defaultModel.changed
      || models.changed,
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
    changed:
      enabled.changed
      || providerId.changed
      || modelId.changed
      || prompt.changed
      || maxDescriptionLength.changed,
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
    changed:
      fallbackChatModels.changed
      || compressionModel.changed
      || utilityModelRoles.changed,
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
  if (!Array.isArray(value)) {
    return {
      value: [],
      changed: true,
    };
  }

  let changed = false;
  const targets: StoredAiModelRouteTarget[] = [];

  for (const entry of value) {
    const normalized = normalizeModelRouteTarget(entry);
    changed = changed || normalized.changed;
    if (normalized.value) {
      targets.push(normalized.value);
    }
  }

  if (targets.length !== value.length) {
    changed = true;
  }

  return {
    value: targets,
    changed,
  };
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

function normalizeProviderMode(
  value: JsonValue | undefined,
): NormalizedValue<StoredAiProviderConfig['mode']> {
  if (value === 'official' || value === 'compatible') {
    return {
      value,
      changed: false,
    };
  }

  return {
    value: 'compatible',
    changed: true,
  };
}

function normalizeRequiredStringWithFallback(
  value: JsonValue | undefined,
  fallback: string,
): NormalizedValue<string> {
  const normalized = normalizeOptionalString(value);
  return normalized.value
    ? {
        value: normalized.value,
        changed: normalized.changed,
      }
    : {
        value: fallback,
        changed: true,
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

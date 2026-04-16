import * as fs from 'node:fs';
import * as path from 'node:path';
import type { AiHostModelRoutingConfig } from '@garlic-claw/shared';
import type { AiSettingsFile, StoredAiProviderConfig } from './ai-management.types';

export function resolveAiSettingsPath(): string {
  return process.env.GARLIC_CLAW_AI_SETTINGS_PATH
    ?? path.join(process.cwd(), 'tmp', 'ai-settings.server.json');
}

export function loadAiSettings(settingsPath: string): AiSettingsFile {
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    if (!fs.existsSync(settingsPath)) {
      const initial = createEmptySettings();
      fs.writeFileSync(settingsPath, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const parsed = JSON.parse(fs.readFileSync(settingsPath, 'utf-8')) as Partial<AiSettingsFile>;
    return {
      providers: Array.isArray(parsed.providers) ? parsed.providers.map(cloneStoredProviderConfig) : [],
      visionFallback: parsed.visionFallback ? { ...parsed.visionFallback } : { enabled: false },
      hostModelRouting: parsed.hostModelRouting
        ? cloneRoutingConfig(parsed.hostModelRouting)
        : { fallbackChatModels: [], utilityModelRoles: {} },
    };
  } catch {
    return createEmptySettings();
  }
}

export function saveAiSettings(settingsPath: string, settings: AiSettingsFile): void {
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
}

export function cloneRoutingConfig(config: AiHostModelRoutingConfig): AiHostModelRoutingConfig {
  return {
    fallbackChatModels: config.fallbackChatModels.map((entry) => ({ ...entry })),
    ...(config.compressionModel ? { compressionModel: { ...config.compressionModel } } : {}),
    utilityModelRoles: Object.fromEntries(
      Object.entries(config.utilityModelRoles).map(([role, target]) => [role, target ? { ...target } : target]),
    ) as AiHostModelRoutingConfig['utilityModelRoles'],
  };
}

function cloneStoredProviderConfig(provider: StoredAiProviderConfig): StoredAiProviderConfig {
  return {
    ...provider,
    models: [...provider.models],
  };
}

function createEmptySettings(): AiSettingsFile {
  return {
    providers: [],
    visionFallback: { enabled: false },
    hostModelRouting: {
      fallbackChatModels: [],
      utilityModelRoles: {},
    },
  };
}

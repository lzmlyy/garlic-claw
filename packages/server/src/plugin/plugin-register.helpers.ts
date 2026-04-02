import type { PluginManifest } from '@garlic-claw/shared';
import { serializePersistedPluginManifest } from './plugin-manifest.persistence';

export function buildPluginRegistrationUpsertData(input: {
  name: string;
  deviceType: string;
  manifest: PluginManifest;
  now: Date;
}) {
  const persistedManifest = serializePersistedPluginManifest(input.manifest);

  return {
    create: {
      name: input.name,
      displayName: input.manifest.name,
      deviceType: input.deviceType,
      runtimeKind: input.manifest.runtime,
      description: input.manifest.description,
      status: 'online' as const,
      manifestJson: persistedManifest,
      version: input.manifest.version,
      healthStatus: 'healthy' as const,
      lastSeenAt: input.now,
    },
    update: {
      displayName: input.manifest.name,
      deviceType: input.deviceType,
      runtimeKind: input.manifest.runtime,
      description: input.manifest.description,
      status: 'online' as const,
      manifestJson: persistedManifest,
      version: input.manifest.version,
      healthStatus: 'healthy' as const,
      lastSeenAt: input.now,
    },
  };
}

export function buildPluginRegistrationEvent(input: {
  existing: boolean;
}) {
  return input.existing
    ? {
      type: 'lifecycle:online',
      message: '插件已上线',
    }
    : {
      type: 'register',
      message: '插件已注册',
    };
}

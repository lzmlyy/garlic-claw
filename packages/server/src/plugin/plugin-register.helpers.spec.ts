import type { PluginManifest } from '@garlic-claw/shared';
import {
  buildPluginRegistrationEvent,
  buildPluginRegistrationUpsertData,
} from './plugin-register.helpers';
import { serializePersistedPluginManifest } from './plugin-manifest.persistence';

describe('plugin-register.helpers', () => {
  const manifest: PluginManifest = {
    id: 'builtin.memory-context',
    name: '记忆上下文',
    version: '1.0.0',
    runtime: 'builtin',
    permissions: ['memory:read'],
    tools: [],
    hooks: [],
    routes: [],
  };

  it('builds online registration upsert payloads from the manifest contract', () => {
    const now = new Date('2026-04-02T12:00:00.000Z');

    expect(
      buildPluginRegistrationUpsertData({
        name: 'builtin.memory-context',
        deviceType: 'builtin',
        manifest,
        now,
      }),
    ).toEqual({
      create: {
        name: 'builtin.memory-context',
        displayName: '记忆上下文',
        deviceType: 'builtin',
        runtimeKind: 'builtin',
        description: undefined,
        status: 'online',
        manifestJson: serializePersistedPluginManifest(manifest),
        version: '1.0.0',
        healthStatus: 'healthy',
        lastSeenAt: now,
      },
      update: {
        displayName: '记忆上下文',
        deviceType: 'builtin',
        runtimeKind: 'builtin',
        description: undefined,
        status: 'online',
        manifestJson: serializePersistedPluginManifest(manifest),
        version: '1.0.0',
        healthStatus: 'healthy',
        lastSeenAt: now,
      },
    });
  });

  it('builds register vs lifecycle-online events from the existing flag', () => {
    expect(buildPluginRegistrationEvent({ existing: false })).toEqual({
      type: 'register',
      message: '插件已注册',
    });
    expect(buildPluginRegistrationEvent({ existing: true })).toEqual({
      type: 'lifecycle:online',
      message: '插件已上线',
    });
  });
});

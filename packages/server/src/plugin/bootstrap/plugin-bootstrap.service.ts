import type {
  DeviceType,
  PluginCapability,
  PluginCommandDescriptor,
  PluginConfigSchema,
  PluginCronDescriptor,
  PluginHookDescriptor,
  PluginManifest,
  PluginPermission,
  PluginRouteDescriptor,
  PluginRuntimeKind,
  RemotePluginBootstrapInfo,
} from '@garlic-claw/shared';
import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BuiltinPluginRegistryService } from '../builtin/builtin-plugin-registry.service';
import {
  PluginGovernanceService,
  type PluginGovernanceOverrides,
} from '../governance/plugin-governance.service';
import {
  PluginPersistenceService,
  type RegisteredPluginRecord,
} from '../persistence/plugin-persistence.service';

export interface RegisterPluginInput {
  deviceType?: string;
  fallback: PluginManifestFallback;
  governance?: PluginGovernanceOverrides;
  manifest?: Partial<PluginManifest> | null;
}
export interface CreateRemotePluginBootstrapInput {
  description?: string;
  deviceType: DeviceType;
  displayName?: string;
  pluginName: string;
  version?: string;
}
export interface PluginManifestFallback {
  description?: string;
  id: string;
  name?: string;
  runtime?: PluginRuntimeKind;
  version?: string;
}

@Injectable()
export class PluginBootstrapService {
  constructor(
    private readonly pluginGovernanceService: PluginGovernanceService,
    private readonly pluginPersistenceService: PluginPersistenceService,
    @Optional()
    private readonly builtinPluginRegistryService?: BuiltinPluginRegistryService,
    @Optional()
    private readonly configService?: ConfigService,
    @Optional()
    private readonly jwtService?: JwtService,
  ) {}

  getPlugin(pluginId: string): RegisteredPluginRecord {
    return this.pluginPersistenceService.getPluginOrThrow(pluginId);
  }

  listPlugins(): RegisteredPluginRecord[] {
    return this.pluginPersistenceService.listPlugins();
  }

  bootstrapBuiltins(): string[] {
    return this.builtinPluginRegistryService
      ? this.builtinPluginRegistryService
          .listDefinitions()
          .map((definition) => this.registerBuiltinDefinition(definition).pluginId)
      : [];
  }

  markPluginOffline(pluginId: string): RegisteredPluginRecord {
    return this.pluginPersistenceService.setConnectionState(pluginId, false);
  }

  registerPlugin(input: RegisterPluginInput): RegisteredPluginRecord {
    const manifest = normalizePluginManifest(input.manifest, input.fallback);
    const existing = this.pluginPersistenceService.findPlugin(manifest.id);
    const governance = this.pluginGovernanceService.createState({ manifest, overrides: input.governance });

    return this.pluginPersistenceService.upsertPlugin({
      connected: true,
      configValues: existing?.configValues,
      conversationScopes: existing?.conversationScopes,
      defaultEnabled: existing?.defaultEnabled ?? governance.defaultEnabled,
      deviceType: input.deviceType ?? existing?.deviceType,
      governance: governance.governance,
      lastSeenAt: new Date().toISOString(),
      manifest,
      pluginId: manifest.id,
    });
  }

  reloadBuiltin(pluginId: string): string {
    if (!this.builtinPluginRegistryService) {
      throw new Error('Builtin plugin registry is unavailable');
    }
    return this.registerBuiltinDefinition(
      this.builtinPluginRegistryService.getDefinition(pluginId),
    ).pluginId;
  }

  issueRemoteBootstrap(input: CreateRemotePluginBootstrapInput): RemotePluginBootstrapInfo {
    if (!this.configService || !this.jwtService) {
      throw new Error('Remote bootstrap dependencies are unavailable');
    }
    const normalized = normalizeRemoteBootstrapInput(input);

    this.registerPlugin({
      deviceType: normalized.deviceType,
      fallback: {
        description: normalized.description,
        id: normalized.pluginName,
        name: normalized.displayName ?? normalized.pluginName,
        runtime: 'remote',
        version: normalized.version,
      },
      manifest: {
        permissions: [],
        runtime: 'remote',
        tools: [],
        version: normalized.version ?? '0.0.0',
      },
    });

    const tokenExpiresIn = this.configService.get('REMOTE_PLUGIN_TOKEN_EXPIRES_IN', '30d');
    const token = this.jwtService.sign(
      {
        authKind: 'remote-plugin',
        deviceType: normalized.deviceType,
        pluginName: normalized.pluginName,
        role: 'remote_plugin',
      },
      {
        secret: this.configService.get('JWT_SECRET', 'fallback-secret'),
        expiresIn: readJwtExpiresIn(tokenExpiresIn),
      },
    );

    return {
      deviceType: normalized.deviceType,
      pluginName: normalized.pluginName,
      serverUrl: this.resolveRemotePluginServerUrl(),
      token,
      tokenExpiresIn,
    };
  }

  touchHeartbeat(pluginId: string, seenAt: string = new Date().toISOString()): RegisteredPluginRecord {
    return this.pluginPersistenceService.touchHeartbeat(pluginId, seenAt);
  }

  private resolveRemotePluginServerUrl(): string {
    if (!this.configService) {
      return 'ws://127.0.0.1:23331';
    }
    const explicitUrl = this.configService.get('REMOTE_PLUGIN_WS_URL');
    if (explicitUrl?.trim()) {
      return explicitUrl.trim();
    }
    const port = this.configService.get('WS_PORT', 23331);
    return `ws://127.0.0.1:${port}`;
  }

  private registerBuiltinDefinition(
    definition: ReturnType<BuiltinPluginRegistryService['getDefinition']>,
  ): RegisteredPluginRecord {
    return this.registerPlugin({
      fallback: {
        id: definition.manifest.id,
        name: definition.manifest.name,
        runtime: 'builtin',
        version: definition.manifest.version,
      },
      governance: definition.governance,
      manifest: definition.manifest,
    });
  }
}

function readJwtExpiresIn(value: string): number | JwtTimeSpan {
  if (/^\d+$/.test(value)) {
    return Number(value);
  }
  if (/^\d+(ms|s|m|h|d|w|y)$/.test(value)) {
    return value as JwtTimeSpan;
  }
  return '30d';
}

type JwtTimeSpan =
  | `${number}ms`
  | `${number}s`
  | `${number}m`
  | `${number}h`
  | `${number}d`
  | `${number}w`
  | `${number}y`;

function normalizeRemoteBootstrapInput(
  input: CreateRemotePluginBootstrapInput,
): CreateRemotePluginBootstrapInput {
  return {
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    deviceType: input.deviceType,
    ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
    pluginName: input.pluginName.trim(),
    ...(input.version?.trim() ? { version: input.version.trim() } : {}),
  };
}

export function normalizePluginManifest(
  candidate: Partial<PluginManifest> | null | undefined,
  fallback: PluginManifestFallback,
): PluginManifest {
  const source = readManifestRecord(candidate);
  const manifest: PluginManifest = {
    id: readNonEmptyString(source?.id) ?? fallback.id,
    name: readNonEmptyString(source?.name) ?? fallback.name ?? fallback.id,
    version: readNonEmptyString(source?.version) ?? fallback.version ?? '0.0.0',
    runtime: readRuntimeKind(source?.runtime) ?? fallback.runtime ?? 'remote',
    permissions: readManifestArray<PluginPermission>(source?.permissions),
    tools: readManifestArray<PluginCapability>(source?.tools),
  };

  const description = readNonEmptyString(source?.description) ?? fallback.description;
  if (description) {
    manifest.description = description;
  }

  const commands = readManifestArray<PluginCommandDescriptor>(source?.commands);
  if (commands.length > 0) {
    manifest.commands = commands;
  }
  const crons = readManifestArray<PluginCronDescriptor>(source?.crons);
  if (crons.length > 0) {
    manifest.crons = crons;
  }
  const hooks = readManifestArray<PluginHookDescriptor>(source?.hooks);
  if (hooks.length > 0) {
    manifest.hooks = hooks;
  }
  const routes = readManifestArray<PluginRouteDescriptor>(source?.routes);
  if (routes.length > 0) {
    manifest.routes = routes;
  }
  const config = readConfig(source?.config);
  if (config) {
    manifest.config = config;
  }

  return manifest;
}

function readManifestRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function readRuntimeKind(value: unknown): PluginRuntimeKind | null {
  return value === 'builtin' || value === 'remote' ? value : null;
}

function readManifestArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? [...value] as T[] : [];
}

function readConfig(value: unknown): PluginConfigSchema | null {
  const record = readManifestRecord(value);
  if (!record) {
    return null;
  }

  const fields = readManifestArray<PluginConfigSchema['fields'][number]>(record.fields);
  return fields.length > 0 ? { fields } : null;
}

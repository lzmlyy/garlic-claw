import {
  type PluginActionName,
  type PluginHostMethod,
  type PluginManifest,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PluginBootstrapService,
  type RegisterPluginInput,
} from '../../plugin/bootstrap/plugin-bootstrap.service';
import type { RegisteredPluginRecord } from '../../plugin/persistence/plugin-persistence.service';
import { CONNECTION_SCOPED_PLUGIN_HOST_METHODS } from '../host/runtime-host.constants';
import type { RuntimeGatewayAuthClaims, RuntimeGatewayConnectionRecord } from './runtime-gateway.types';

const CONNECTION_SCOPED_METHODS = new Set<PluginHostMethod>(
  CONNECTION_SCOPED_PLUGIN_HOST_METHODS,
);

export interface RegisterRemotePluginInput extends RegisterPluginInput {
  connectionId: string;
  claims: RuntimeGatewayAuthClaims;
  fallback: RegisterPluginInput['fallback'] & {
    runtime?: PluginManifest['runtime'];
  };
}

const DEFAULT_SUPPORTED_ACTIONS: PluginActionName[] = ['health-check', 'reload', 'reconnect'];

@Injectable()
export class RuntimeGatewayConnectionLifecycleService {
  private connectionHealthProbe?: (input: {
    connectionId: string;
    timeoutMs?: number;
  }) => Promise<{ ok: boolean }>;
  private connectionCloser?: (connectionId: string) => void;
  private connectionDrain?: (connectionId: string) => void;
  private readonly connectionByPluginId = new Map<string, string>();
  private readonly connections = new Map<string, RuntimeGatewayConnectionRecord>();
  private connectionSequence = 0;

  constructor(
    private readonly pluginBootstrapService: PluginBootstrapService,
  ) {}

  getConnection(connectionId: string): RuntimeGatewayConnectionRecord | null {
    const connection = this.connections.get(connectionId);
    return connection ? cloneConnectionRecord(connection) : null;
  }

  readConnectionIdByPluginId(pluginId: string): string | null {
    return this.connectionByPluginId.get(pluginId) ?? null;
  }

  openConnection(input?: {
    connectionId?: string;
    remoteAddress?: string;
    seenAt?: string;
  }): RuntimeGatewayConnectionRecord {
    const connectionId = input?.connectionId ?? `runtime-connection-${++this.connectionSequence}`;
    const record: RuntimeGatewayConnectionRecord = {
      authenticated: false,
      claims: null,
      connectionId,
      deviceType: null,
      lastHeartbeatAt: input?.seenAt ?? new Date().toISOString(),
      pluginId: null,
      ...(input?.remoteAddress ? { remoteAddress: input.remoteAddress } : {}),
    };
    this.connections.set(connectionId, record);
    return cloneConnectionRecord(record);
  }

  authenticateConnection(input: {
    connectionId: string;
    claims: RuntimeGatewayAuthClaims;
    deviceType: string;
    pluginName: string;
    seenAt?: string;
  }): RuntimeGatewayConnectionRecord {
    const isAdminToken = input.claims.role === 'admin' || input.claims.role === 'super_admin';
    const isRemotePluginToken = input.claims.role === 'remote_plugin'
      && input.claims.authKind === 'remote-plugin';
    if (!isAdminToken && !isRemotePluginToken) {
      throw new Error('Only admin or remote-plugin token can register a remote plugin');
    }
    if (
      isRemotePluginToken
      && (
        input.claims.pluginName !== input.pluginName
        || input.claims.deviceType !== input.deviceType
      )
    ) {
      throw new Error('Remote plugin token does not match plugin identity');
    }

    const previousConnectionId = this.connectionByPluginId.get(input.pluginName) ?? null;
    if (previousConnectionId && previousConnectionId !== input.connectionId) {
      this.disconnectConnection(previousConnectionId);
    }

    return this.patchConnection(input.connectionId, {
      authenticated: true,
      claims: { ...input.claims },
      deviceType: input.deviceType,
      lastHeartbeatAt: input.seenAt ?? new Date().toISOString(),
      pluginId: input.pluginName,
    });
  }

  registerConnectionCloser(closer: (connectionId: string) => void): void {
    this.connectionCloser = closer;
  }

  registerConnectionDrain(drain: (connectionId: string) => void): void {
    this.connectionDrain = drain;
  }

  registerConnectionHealthProbe(probe: (input: {
    connectionId: string;
    timeoutMs?: number;
  }) => Promise<{ ok: boolean }>): void {
    this.connectionHealthProbe = probe;
  }

  registerRemotePlugin(input: RegisterRemotePluginInput): RegisteredPluginRecord {
    const pluginName = input.fallback.id;
    const deviceType = input.deviceType ?? input.fallback.id;
    const connection = this.getConnection(input.connectionId);
    if (!connection || !connection.authenticated || connection.pluginId !== pluginName) {
      this.authenticateConnection({
        claims: input.claims,
        connectionId: input.connectionId,
        deviceType,
        pluginName,
      });
    }

    const registered = this.pluginBootstrapService.registerPlugin({
      deviceType,
      fallback: {
        ...input.fallback,
        runtime: 'remote',
      },
      governance: input.governance,
      manifest: input.manifest,
    });
    this.patchConnection(input.connectionId, {
      deviceType,
      pluginId: pluginName,
    });

    return {
      ...registered,
      manifest: {
        ...registered.manifest,
        runtime: 'remote',
      },
    };
  }

  checkHeartbeats(input: {
    maxIdleMs: number;
    now?: number;
  }): string[] {
    const now = input.now ?? Date.now();
    const staleConnectionIds = [...this.connections.values()]
      .filter((connection) => now - Date.parse(connection.lastHeartbeatAt) > input.maxIdleMs)
      .map((connection) => connection.connectionId);
    for (const connectionId of staleConnectionIds) {
      this.disconnectConnection(connectionId);
    }
    return staleConnectionIds;
  }

  checkPluginHealth(pluginId: string): { ok: boolean } {
    const connectionId = this.connectionByPluginId.get(pluginId);
    return { ok: Boolean(connectionId && this.connections.get(connectionId)?.authenticated) };
  }

  async probePluginHealth(pluginId: string, timeoutMs?: number): Promise<{ ok: boolean }> {
    const connectionId = this.connectionByPluginId.get(pluginId);
    const connection = connectionId ? this.connections.get(connectionId) : null;
    if (!connectionId || !connection?.authenticated) {
      return { ok: false };
    }
    if (!this.connectionHealthProbe) {
      return { ok: true };
    }

    return this.connectionHealthProbe({
      connectionId,
      timeoutMs,
    });
  }

  disconnectConnection(connectionId: string): RegisteredPluginRecord | null {
    const pluginId = this.removeConnectionState(connectionId)?.pluginId ?? null;
    this.connectionDrain?.(connectionId);
    if (!pluginId) {
      return null;
    }
    if (!this.pluginBootstrapService.listPlugins().some((plugin) => plugin.pluginId === pluginId)) {
      return null;
    }
    return this.pluginBootstrapService.markPluginOffline(pluginId);
  }

  disconnectPlugin(pluginId: string) {
    const connectionId = this.connectionByPluginId.get(pluginId);
    if (!connectionId) {
      return this.pluginBootstrapService.markPluginOffline(pluginId);
    }
    const disconnected = this.disconnectConnection(connectionId);
    this.connectionCloser?.(connectionId);
    return disconnected;
  }

  requireConnection(connectionId: string): RuntimeGatewayConnectionRecord {
    const connection = this.connections.get(connectionId);
    if (connection) {
      return connection;
    }
    throw new NotFoundException(`Gateway connection not found: ${connectionId}`);
  }

  touchConnectionHeartbeat(connectionId: string, seenAt?: string): RuntimeGatewayConnectionRecord {
    const nextConnection = this.patchConnection(connectionId, {
      lastHeartbeatAt: seenAt ?? new Date().toISOString(),
    });
    if (nextConnection.pluginId) {
      this.pluginBootstrapService.touchHeartbeat(
        nextConnection.pluginId,
        nextConnection.lastHeartbeatAt,
      );
    }
    return nextConnection;
  }

  private removeConnectionState(connectionId: string): RuntimeGatewayConnectionRecord | null {
    const connection = this.connections.get(connectionId);
    if (!connection) {
      return null;
    }

    this.connections.delete(connectionId);
    if (connection.pluginId && this.connectionByPluginId.get(connection.pluginId) === connectionId) {
      this.connectionByPluginId.delete(connection.pluginId);
    }
    return cloneConnectionRecord(connection);
  }

  private setConnection(input: RuntimeGatewayConnectionRecord): RuntimeGatewayConnectionRecord {
    const previous = this.connections.get(input.connectionId);
    if (
      previous?.pluginId
      && previous.pluginId !== input.pluginId
      && this.connectionByPluginId.get(previous.pluginId) === input.connectionId
    ) {
      this.connectionByPluginId.delete(previous.pluginId);
    }

    const nextConnection = cloneConnectionRecord(input);
    this.connections.set(nextConnection.connectionId, nextConnection);
    if (nextConnection.pluginId) {
      this.connectionByPluginId.set(nextConnection.pluginId, nextConnection.connectionId);
    }
    return this.requireConnection(nextConnection.connectionId);
  }

  private patchConnection(
    connectionId: string,
    patch: Partial<RuntimeGatewayConnectionRecord>,
  ): RuntimeGatewayConnectionRecord {
    const connection = this.requireConnection(connectionId);
    return this.setConnection({
      ...connection,
      ...patch,
    });
  }
}

export function isConnectionScopedHostMethod(method: PluginHostMethod): boolean {
  return CONNECTION_SCOPED_METHODS.has(method);
}

export function readDefaultRemotePluginActions(): PluginActionName[] {
  return DEFAULT_SUPPORTED_ACTIONS.slice();
}

function cloneConnectionRecord(
  connection: RuntimeGatewayConnectionRecord,
): RuntimeGatewayConnectionRecord {
  return {
    ...connection,
    claims: connection.claims ? { ...connection.claims } : null,
  };
}

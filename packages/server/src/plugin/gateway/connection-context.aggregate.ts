import { randomUUID } from 'node:crypto';
import type {
  ActiveRequestContext,
  PendingRequest,
  PluginManifest,
} from '@garlic-claw/shared';
import type { WebSocket } from 'ws';

export interface PluginConnection {
  ws: WebSocket;
  pluginName: string;
  deviceType: string;
  authenticated: boolean;
  manifest: PluginManifest | null;
  lastHeartbeatAt: number;
}

export interface ConnectionContextSnapshot {
  connectionId: string;
  socket: WebSocket;
  pendingRequests: Set<string>;
  lastHeartbeat: number;
}

class PendingRequestTrackerMap extends Map<string, PendingRequest> {
  constructor(
    private readonly onRequestSet: (requestId: string, pending: PendingRequest) => void,
    private readonly onRequestDelete: (
      requestId: string,
      pending: PendingRequest | undefined,
    ) => void,
  ) {
    super();
  }

  override set(key: string, value: PendingRequest): this {
    const previous = this.get(key);
    if (previous) {
      this.onRequestDelete(key, previous);
    }
    this.onRequestSet(key, value);
    return super.set(key, value);
  }

  override delete(key: string): boolean {
    const previous = this.get(key);
    const deleted = super.delete(key);
    if (deleted) {
      this.onRequestDelete(key, previous);
    }
    return deleted;
  }

  override clear(): void {
    for (const [requestId, pending] of this.entries()) {
      this.onRequestDelete(requestId, pending);
    }
    super.clear();
  }
}

export class ConnectionContextAggregate {
  readonly connections = new Map<WebSocket, PluginConnection>();
  readonly connectionByPluginId = new Map<string, PluginConnection>();
  readonly activeRequestContexts = new Map<string, ActiveRequestContext>();
  readonly pendingRequests = new PendingRequestTrackerMap(
    (requestId, pending) => this.bindPendingRequest(requestId, pending),
    (requestId, pending) => this.unbindPendingRequest(requestId, pending),
  );

  private readonly contextsBySocket = new Map<WebSocket, ConnectionContextSnapshot>();

  createConnection(socket: WebSocket, now = Date.now()): PluginConnection {
    const connection: PluginConnection = {
      ws: socket,
      pluginName: '',
      deviceType: '',
      authenticated: false,
      manifest: null,
      lastHeartbeatAt: now,
    };
    this.connections.set(socket, connection);
    this.contextsBySocket.set(socket, {
      connectionId: randomUUID(),
      socket,
      pendingRequests: new Set<string>(),
      lastHeartbeat: now,
    });

    return connection;
  }

  removeConnection(connection: PluginConnection): void {
    this.connections.delete(connection.ws);
    this.contextsBySocket.delete(connection.ws);
  }

  bindPlugin(pluginId: string, connection: PluginConnection): void {
    this.connectionByPluginId.set(pluginId, connection);
  }

  markHeartbeat(socket: WebSocket, heartbeatAt: number): void {
    const context = this.contextsBySocket.get(socket);
    if (!context) {
      return;
    }

    context.lastHeartbeat = heartbeatAt;
  }

  readContext(socket: WebSocket): ConnectionContextSnapshot | null {
    return this.contextsBySocket.get(socket) ?? null;
  }

  private bindPendingRequest(requestId: string, pending: PendingRequest): void {
    const context = this.contextsBySocket.get(pending.socket as WebSocket);
    if (!context) {
      return;
    }

    context.pendingRequests.add(requestId);
  }

  private unbindPendingRequest(
    requestId: string,
    pending: PendingRequest | undefined,
  ): void {
    if (pending) {
      const context = this.contextsBySocket.get(pending.socket as WebSocket);
      if (context) {
        context.pendingRequests.delete(requestId);
      }
      return;
    }

    for (const context of this.contextsBySocket.values()) {
      if (context.pendingRequests.has(requestId)) {
        context.pendingRequests.delete(requestId);
      }
    }
  }
}

import {
  type JsonObject,
  type JsonValue,
  type PluginActionName,
  type PluginCallContext,
  type PluginHookName,
  type PluginHostMethod,
  type PluginRouteRequest,
  type PluginRouteResponse,
} from '@garlic-claw/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import {
  RuntimeGatewayConnectionLifecycleService,
  isConnectionScopedHostMethod,
  readDefaultRemotePluginActions,
} from './runtime-gateway-connection-lifecycle.service';
import {
  RuntimeGatewayRequestLedger,
  type RuntimeGatewayOutboundMessage,
} from './runtime-gateway-request-ledger';

@Injectable()
export class RuntimeGatewayRemoteTransportService {
  private readonly requestLedger = new RuntimeGatewayRequestLedger();
  constructor(
    private readonly runtimeGatewayConnectionLifecycleService: RuntimeGatewayConnectionLifecycleService,
  ) {
    this.runtimeGatewayConnectionLifecycleService.registerConnectionDrain((connectionId) => this.requestLedger.disconnectConnection(connectionId));
  }
  getAuthorizedContextCount(): number {
    return this.requestLedger.getAuthorizedContextCount();
  }
  consumeOutboundMessages(connectionId: string): RuntimeGatewayOutboundMessage[] {
    return this.requestLedger.consumeOutboundMessages(connectionId);
  }
  createPendingRequest(input: {
    action: string;
    connectionId: string;
    context?: PluginCallContext;
    payload: unknown;
    type: string;
  }): Promise<JsonValue> {
    this.runtimeGatewayConnectionLifecycleService.requireConnection(input.connectionId);
    return this.requestLedger.createPendingRequest(input);
  }
  createRemoteTransport(pluginId: string) {
    const connectionId = this.runtimeGatewayConnectionLifecycleService.readConnectionIdByPluginId(pluginId);
    if (!connectionId) {throw new NotFoundException(`Gateway connection not found for plugin: ${pluginId}`);}
    const requestRemote = <TResult>(action: string, type: string, payload: unknown, context?: PluginCallContext): Promise<TResult> =>
      this.createPendingRequest({ action, connectionId, context, payload, type }).then((result) => result as TResult);
    return {
      checkHealth: (timeoutMs?: number) => this.runtimeGatewayConnectionLifecycleService.probePluginHealth(pluginId, timeoutMs),
      executeTool: (request: {
        context: PluginCallContext;
        params: JsonObject;
        toolName: string;
      }): Promise<JsonValue> =>
        requestRemote<JsonValue>('execute', 'command', { context: request.context, params: request.params, toolName: request.toolName }, request.context),
      invokeHook: (request: {
        context: PluginCallContext;
        hookName: PluginHookName;
        payload: JsonValue;
      }): Promise<JsonValue> =>
        requestRemote<JsonValue>('hook_invoke', 'plugin', { context: request.context, hookName: request.hookName, payload: request.payload }, request.context),
      invokeRoute: (request: {
        context: PluginCallContext;
        request: PluginRouteRequest;
      }): Promise<PluginRouteResponse> =>
        requestRemote<PluginRouteResponse>('route_invoke', 'plugin', { context: request.context, request: request.request }, request.context),
      listSupportedActions: (): PluginActionName[] => readDefaultRemotePluginActions(),
      reconnect: async () => this.runtimeGatewayConnectionLifecycleService.disconnectPlugin(pluginId),
      reload: async () => this.runtimeGatewayConnectionLifecycleService.disconnectPlugin(pluginId),
    };
  }
  resolveHostCallContext(input: {
    connectionId: string;
    context?: PluginCallContext;
    method: PluginHostMethod;
  }): PluginCallContext {
    this.runtimeGatewayConnectionLifecycleService.requireConnection(input.connectionId);
    if (isConnectionScopedHostMethod(input.method)) {return { source: 'plugin' };}
    const authorized = this.requestLedger.resolveAuthorizedContext(input.connectionId, input.context);
    if (authorized) {return authorized;}
    throw new Error(`Host API ${input.method} is missing an authorized invocation context`);
  }
  settlePendingRequest(input: {
    error?: string;
    requestId: string;
    result?: JsonValue;
  }): void {
    this.requestLedger.settlePendingRequest(input);
  }
}

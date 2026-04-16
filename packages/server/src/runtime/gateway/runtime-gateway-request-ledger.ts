import type { JsonValue, PluginCallContext } from '@garlic-claw/shared';

const AUTHORIZED_CONTEXT_KEYS: Array<'activeModelId' | 'activePersonaId' | 'activeProviderId' | 'automationId' | 'conversationId' | 'cronJobId' | 'source' | 'userId'> = [
  'source', 'userId', 'conversationId', 'automationId', 'cronJobId', 'activeProviderId', 'activeModelId', 'activePersonaId',
];

interface RuntimeGatewayPendingRequest {
  connectionId: string;
  reject(error: Error): void;
  resolve(value: JsonValue): void;
}

export interface RuntimeGatewayOutboundMessage {
  action: string;
  payload: JsonValue;
  requestId: string;
  type: string;
}

export class RuntimeGatewayRequestLedger {
  private readonly authorizedContexts = new Map<string, { connectionId: string; context: PluginCallContext }>();
  private readonly outboundMessages = new Map<string, RuntimeGatewayOutboundMessage[]>();
  private readonly pendingRequests = new Map<string, RuntimeGatewayPendingRequest>();
  private requestSequence = 0;

  getAuthorizedContextCount(): number {
    return this.authorizedContexts.size;
  }

  consumeOutboundMessages(connectionId: string): RuntimeGatewayOutboundMessage[] {
    const messages = this.outboundMessages.get(connectionId) ?? [];
    this.outboundMessages.delete(connectionId);
    return messages.map((message) => ({ ...message, payload: structuredClone(message.payload) }));
  }

  createPendingRequest(input: {
    action: string;
    connectionId: string;
    context?: PluginCallContext;
    payload: unknown;
    type: string;
  }): Promise<JsonValue> {
    const requestId = `runtime-request-${++this.requestSequence}`;
    const outbound = this.outboundMessages.get(input.connectionId) ?? [];
    outbound.push({
      action: input.action,
      payload: structuredClone(input.payload) as JsonValue,
      requestId,
      type: input.type,
    });
    this.outboundMessages.set(input.connectionId, outbound);
    const result = new Promise<JsonValue>((resolve, reject) => {
      this.pendingRequests.set(requestId, {
        connectionId: input.connectionId,
        reject,
        resolve,
      });
    });
    if (input.context) {
      this.authorizedContexts.set(requestId, { connectionId: input.connectionId, context: clonePluginCallContext(input.context) });
    }
    return result;
  }

  disconnectConnection(connectionId: string): void {
    this.outboundMessages.delete(connectionId);
    for (const [requestId, pending] of this.pendingRequests.entries()) {
      if (pending.connectionId !== connectionId) {
        continue;
      }
      this.pendingRequests.delete(requestId);
      this.authorizedContexts.delete(requestId);
      pending.reject(new Error('Plugin connection closed'));
    }
  }

  resolveAuthorizedContext(
    connectionId: string,
    context?: PluginCallContext,
  ): PluginCallContext | null {
    if (!context) {return null;}
    for (const authorized of this.authorizedContexts.values()) {
      if (authorized.connectionId === connectionId && samePluginCallContext(authorized.context, context)) {
        return clonePluginCallContext(authorized.context);
      }
    }
    return null;
  }

  settlePendingRequest(input: {
    error?: string;
    requestId: string;
    result?: JsonValue;
  }): void {
    const pending = this.pendingRequests.get(input.requestId);
    if (!pending) {
      return;
    }
    this.pendingRequests.delete(input.requestId);
    this.authorizedContexts.delete(input.requestId);
    if (input.error) {
      pending.reject(new Error(input.error));
      return;
    }
    pending.resolve(input.result ?? null);
  }
}

function clonePluginCallContext(context: PluginCallContext): PluginCallContext {
  return {
    ...context,
    ...(context.metadata ? { metadata: structuredClone(context.metadata) } : {}),
  };
}

function samePluginCallContext(
  left: PluginCallContext,
  right: PluginCallContext,
): boolean {
  return AUTHORIZED_CONTEXT_KEYS.every((key) => left[key] === right[key]) && JSON.stringify(left.metadata ?? null) === JSON.stringify(right.metadata ?? null);
}

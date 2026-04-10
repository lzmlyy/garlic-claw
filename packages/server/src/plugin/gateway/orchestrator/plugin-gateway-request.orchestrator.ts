import {
  rejectPluginGatewayPendingRequestsForSocket,
  type ActiveRequestContext,
  type PendingRequest,
} from '@garlic-claw/shared';
import type { WebSocket } from 'ws';

export class PluginGatewayRequestOrchestrator {
  shutdown(input: {
    pendingRequests: Map<string, PendingRequest>;
    activeRequestContexts: Map<string, ActiveRequestContext>;
    reason: string;
  }): void {
    for (const [requestId, pending] of input.pendingRequests) {
      clearTimeout(pending.timer);
      input.activeRequestContexts.delete(requestId);
      pending.reject(new Error(input.reason));
    }
    input.pendingRequests.clear();
  }

  rejectPendingRequestsForSocket(input: {
    socket: WebSocket;
    pendingRequests: Map<string, PendingRequest>;
    activeRequestContexts: Map<string, ActiveRequestContext>;
    reason: string;
  }): void {
    rejectPluginGatewayPendingRequestsForSocket({
      socket: input.socket,
      error: new Error(input.reason),
      pendingRequests: input.pendingRequests,
      activeRequestContexts: input.activeRequestContexts,
    });
  }
}

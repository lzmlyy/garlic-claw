export interface RuntimeGatewayAuthClaims {
  authKind?: string;
  deviceType?: string;
  pluginName?: string;
  role?: string;
}

export interface RuntimeGatewayConnectionRecord {
  authenticated: boolean;
  claims: RuntimeGatewayAuthClaims | null;
  connectionId: string;
  deviceType: string | null;
  lastHeartbeatAt: string;
  pluginId: string | null;
  remoteAddress?: string;
}

import type { DeviceType, PluginCapability, PluginManifest, PluginRouteDescriptor } from '@garlic-claw/shared';
export interface PluginManifestInput {
  name?: string;
  version?: string;
  description?: string;
  permissions?: PluginManifest["permissions"];
  tools?: PluginCapability[];
  commands?: NonNullable<PluginManifest["commands"]>;
  hooks?: NonNullable<PluginManifest["hooks"]>;
  config?: PluginManifest["config"];
  routes?: PluginRouteDescriptor[];
}
export interface PluginClientOptions {
  serverUrl: string;
  token: string;
  pluginName: string;
  deviceType: DeviceType;
  manifest?: PluginManifestInput;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  heartbeatInterval?: number;
}
export { DEVICE_TYPE, PluginClient } from './plugin-client';

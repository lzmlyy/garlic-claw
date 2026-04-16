import type { DeviceType, PluginStatus } from '@garlic-claw/shared';

export const DEVICE_TYPE = {
  API: 'api',
  BUILTIN: 'builtin',
  IOT: 'iot',
  MOBILE: 'mobile',
  PC: 'pc',
} as const satisfies Record<string, DeviceType>;

export const PLUGIN_STATUS = {
  ERROR: 'error',
  OFFLINE: 'offline',
  ONLINE: 'online',
} as const satisfies Record<string, PluginStatus>;

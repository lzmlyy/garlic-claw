import type { PluginRouteMethod } from '@garlic-claw/shared';

export const PLUGIN_ROUTE_METHOD_VALUES = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
] as const satisfies PluginRouteMethod[];

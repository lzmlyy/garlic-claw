import type {
  ChatMessageStatus,
  DeviceType,
  PluginHookName,
  PluginInvocationSource,
  PluginRouteMethod,
} from '@garlic-claw/shared';

export const CHAT_MESSAGE_STATUS_VALUES = [
  'pending', 'streaming', 'completed', 'stopped', 'error',
] as const satisfies ChatMessageStatus[];

export const DEVICE_TYPE = {
  API: 'api',
  BUILTIN: 'builtin',
  IOT: 'iot',
  MOBILE: 'mobile',
  PC: 'pc',
} as const satisfies Record<string, DeviceType>;

export const PLUGIN_HOOK_NAME_VALUES = [
  'message:received', 'chat:before-model', 'chat:waiting-model', 'chat:after-model', 'conversation:created',
  'message:created', 'message:updated', 'message:deleted', 'automation:before-run', 'automation:after-run',
  'subagent:before-run', 'subagent:after-run', 'tool:before-call', 'tool:after-call', 'response:before-send',
  'response:after-send', 'plugin:loaded', 'plugin:unloaded', 'plugin:error', 'cron:tick',
] as const satisfies PluginHookName[];

export const PLUGIN_INVOCATION_SOURCE_VALUES = [
  'chat-tool', 'chat-hook', 'cron', 'automation', 'http-route', 'subagent', 'plugin',
] as const satisfies PluginInvocationSource[];

export const PLUGIN_ROUTE_METHOD_VALUES = [
  'GET', 'POST', 'PUT', 'PATCH', 'DELETE',
] as const satisfies PluginRouteMethod[];

export const WS_TYPE = {
  AUTH: 'auth',
  PLUGIN: 'plugin',
  COMMAND: 'command',
  HEARTBEAT: 'heartbeat',
  ERROR: 'error',
} as const;

export const WS_ACTION = {
  AUTHENTICATE: 'authenticate',
  AUTH_OK: 'auth_ok',
  AUTH_FAIL: 'auth_fail',
  REGISTER: 'register',
  REGISTER_OK: 'register_ok',
  UNREGISTER: 'unregister',
  STATUS: 'status',
  EXECUTE: 'execute',
  EXECUTE_RESULT: 'execute_result',
  EXECUTE_ERROR: 'execute_error',
  HOOK_INVOKE: 'hook_invoke',
  HOOK_RESULT: 'hook_result',
  HOOK_ERROR: 'hook_error',
  ROUTE_INVOKE: 'route_invoke',
  ROUTE_RESULT: 'route_result',
  ROUTE_ERROR: 'route_error',
  HOST_CALL: 'host_call',
  HOST_RESULT: 'host_result',
  HOST_ERROR: 'host_error',
  PING: 'ping',
  PONG: 'pong',
} as const;

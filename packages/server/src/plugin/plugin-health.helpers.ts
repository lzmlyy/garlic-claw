import type { JsonObject, PluginEventLevel } from '@garlic-claw/shared';

export interface PersistedPluginHealthRecord {
  status: string;
  failureCount: number;
  consecutiveFailures: number;
}

interface PluginEventPayload {
  type: string;
  message: string;
  metadata?: JsonObject;
}

interface PreparedPluginEvent {
  type: string;
  level: PluginEventLevel;
  message: string;
  metadata?: JsonObject;
}

export function buildPluginSuccessUpdate(input: {
  plugin: PersistedPluginHealthRecord;
  checked?: boolean;
  now: Date;
}) {
  return {
    healthStatus: input.plugin.status === 'offline' ? 'offline' : 'healthy',
    consecutiveFailures: 0,
    lastSuccessAt: input.now,
    ...(input.checked ? { lastCheckedAt: input.now } : {}),
  };
}

export function buildPluginFailureUpdate(input: {
  plugin: PersistedPluginHealthRecord;
  message: string;
  checked?: boolean;
  now: Date;
}) {
  const consecutiveFailures = input.plugin.consecutiveFailures + 1;
  return {
    healthStatus:
      input.plugin.status === 'offline'
        ? 'offline'
        : consecutiveFailures >= 3
          ? 'error'
          : 'degraded',
    failureCount: input.plugin.failureCount + 1,
    consecutiveFailures,
    lastError: input.message,
    lastErrorAt: input.now,
    ...(input.checked ? { lastCheckedAt: input.now } : {}),
  };
}

export function preparePluginSuccessPersistence(input: {
  plugin: PersistedPluginHealthRecord;
  event: PluginEventPayload;
  checked?: boolean;
  persistEvent?: boolean;
  now: Date;
}): {
  updateData: ReturnType<typeof buildPluginSuccessUpdate>;
  event: PreparedPluginEvent | null;
} {
  return {
    updateData: buildPluginSuccessUpdate({
      plugin: input.plugin,
      checked: input.checked,
      now: input.now,
    }),
    event:
      input.persistEvent === false
        ? null
        : {
          type: input.event.type,
          level: 'info',
          message: input.event.message,
          ...(input.event.metadata ? { metadata: input.event.metadata } : {}),
        },
  };
}

export function preparePluginFailurePersistence(input: {
  plugin: PersistedPluginHealthRecord;
  event: PluginEventPayload;
  checked?: boolean;
  now: Date;
}): {
  updateData: ReturnType<typeof buildPluginFailureUpdate>;
  event: PreparedPluginEvent;
} {
  return {
    updateData: buildPluginFailureUpdate({
      plugin: input.plugin,
      message: input.event.message,
      checked: input.checked,
      now: input.now,
    }),
    event: {
      type: input.event.type,
      level: 'error',
      message: input.event.message,
      ...(input.event.metadata ? { metadata: input.event.metadata } : {}),
    },
  };
}

export function buildPluginHealthCheckRecordInput(input: {
  ok: boolean;
  message: string;
  metadata?: JsonObject;
}): PluginEventPayload & { checked: true } {
  return {
    type: input.ok ? 'health:ok' : 'health:error',
    message: input.message,
    ...(input.metadata ? { metadata: input.metadata } : {}),
    checked: true,
  };
}

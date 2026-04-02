import {
  buildPluginHealthCheckRecordInput,
  buildPluginFailureUpdate,
  buildPluginSuccessUpdate,
  preparePluginFailurePersistence,
  preparePluginSuccessPersistence,
} from './plugin-health.helpers';

describe('plugin-health.helpers', () => {
  const now = new Date('2026-04-02T12:00:00.000Z');

  it('builds healthy success updates for online plugins', () => {
    expect(
      buildPluginSuccessUpdate({
        plugin: {
          status: 'online',
          failureCount: 2,
          consecutiveFailures: 2,
        },
        checked: true,
        now,
      }),
    ).toEqual({
      healthStatus: 'healthy',
      consecutiveFailures: 0,
      lastSuccessAt: now,
      lastCheckedAt: now,
    });
  });

  it('keeps offline plugins offline when recording successes or failures', () => {
    expect(
      buildPluginSuccessUpdate({
        plugin: {
          status: 'offline',
          failureCount: 0,
          consecutiveFailures: 0,
        },
        now,
      }),
    ).toEqual({
      healthStatus: 'offline',
      consecutiveFailures: 0,
      lastSuccessAt: now,
    });

    expect(
      buildPluginFailureUpdate({
        plugin: {
          status: 'offline',
          failureCount: 1,
          consecutiveFailures: 2,
        },
        message: 'boom',
        now,
      }),
    ).toEqual({
      healthStatus: 'offline',
      failureCount: 2,
      consecutiveFailures: 3,
      lastError: 'boom',
      lastErrorAt: now,
    });
  });

  it('escalates repeated online failures from degraded to error', () => {
    expect(
      buildPluginFailureUpdate({
        plugin: {
          status: 'online',
          failureCount: 1,
          consecutiveFailures: 1,
        },
        message: 'timeout',
        checked: true,
        now,
      }),
    ).toEqual({
      healthStatus: 'degraded',
      failureCount: 2,
      consecutiveFailures: 2,
      lastError: 'timeout',
      lastErrorAt: now,
      lastCheckedAt: now,
    });

    expect(
      buildPluginFailureUpdate({
        plugin: {
          status: 'online',
          failureCount: 2,
          consecutiveFailures: 2,
        },
        message: 'timeout',
        now,
      }),
    ).toEqual({
      healthStatus: 'error',
      failureCount: 3,
      consecutiveFailures: 3,
      lastError: 'timeout',
      lastErrorAt: now,
    });
  });

  it('prepares success persistence with an optional info event', () => {
    expect(
      preparePluginSuccessPersistence({
        plugin: {
          status: 'online',
          failureCount: 2,
          consecutiveFailures: 2,
        },
        event: {
          type: 'health:ok',
          message: 'gateway ping ok',
          metadata: {
            source: 'gateway',
          },
        },
        checked: true,
        now,
      }),
    ).toEqual({
      updateData: {
        healthStatus: 'healthy',
        consecutiveFailures: 0,
        lastSuccessAt: now,
        lastCheckedAt: now,
      },
      event: {
        type: 'health:ok',
        level: 'info',
        message: 'gateway ping ok',
        metadata: {
          source: 'gateway',
        },
      },
    });

    expect(
      preparePluginSuccessPersistence({
        plugin: {
          status: 'online',
          failureCount: 2,
          consecutiveFailures: 2,
        },
        event: {
          type: 'health:ok',
          message: 'gateway ping ok',
        },
        persistEvent: false,
        now,
      }),
    ).toEqual({
      updateData: {
        healthStatus: 'healthy',
        consecutiveFailures: 0,
        lastSuccessAt: now,
      },
      event: null,
    });
  });

  it('prepares failure persistence with an error event', () => {
    expect(
      preparePluginFailurePersistence({
        plugin: {
          status: 'online',
          failureCount: 1,
          consecutiveFailures: 1,
        },
        event: {
          type: 'tool:error',
          message: 'timeout',
          metadata: {
            toolName: 'memory.search',
          },
        },
        checked: true,
        now,
      }),
    ).toEqual({
      updateData: {
        healthStatus: 'degraded',
        failureCount: 2,
        consecutiveFailures: 2,
        lastError: 'timeout',
        lastErrorAt: now,
        lastCheckedAt: now,
      },
      event: {
        type: 'tool:error',
        level: 'error',
        message: 'timeout',
        metadata: {
          toolName: 'memory.search',
        },
      },
    });
  });

  it('builds health-check bridge inputs for success and failure records', () => {
    expect(
      buildPluginHealthCheckRecordInput({
        ok: true,
        message: 'ok',
        metadata: {
          source: 'gateway',
        },
      }),
    ).toEqual({
      type: 'health:ok',
      message: 'ok',
      metadata: {
        source: 'gateway',
      },
      checked: true,
    });

    expect(
      buildPluginHealthCheckRecordInput({
        ok: false,
        message: 'timeout',
      }),
    ).toEqual({
      type: 'health:error',
      message: 'timeout',
      checked: true,
    });
  });
});

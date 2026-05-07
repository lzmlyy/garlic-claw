import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginCronDescriptor, PluginCronJobSummary } from '@garlic-claw/shared';
import { PluginBootstrapService } from '../../../src/modules/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/modules/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/modules/plugin/persistence/plugin-persistence.service';
import { PluginRuntimeService } from '../../../src/modules/runtime/host/plugin-runtime.service';

const trackedServices: Array<{
  onApplicationBootstrap?: () => void;
  onModuleDestroy?: () => void;
}> = [];

describe('PluginRuntimeService', () => {
  const pluginStateEnvKey = 'GARLIC_CLAW_PLUGIN_STATE_PATH';
  const pluginRuntimeEnvKey = 'GARLIC_CLAW_PLUGIN_RUNTIME_STATE_PATH';
  let pluginStatePath: string;
  let pluginRuntimePath: string;

  beforeEach(() => {
    pluginStatePath = path.join(os.tmpdir(), `host-plugin-state-${Date.now()}-${Math.random()}.json`);
    pluginRuntimePath = path.join(os.tmpdir(), `plugin-runtime-${Date.now()}-${Math.random()}.json`);
    process.env[pluginStateEnvKey] = pluginStatePath;
    process.env[pluginRuntimeEnvKey] = pluginRuntimePath;
  });

  afterEach(() => {
    jest.useRealTimers();
    while (trackedServices.length > 0) {
      trackedServices.pop()?.onModuleDestroy?.();
    }
    delete process.env[pluginStateEnvKey];
    delete process.env[pluginRuntimeEnvKey];
    for (const targetPath of [pluginStatePath, pluginRuntimePath]) {
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      } catch {
        // 临时文件清理失败不影响断言语义。
      }
    }
  });

  it('persists plugin storage and scoped state across service reloads', () => {
    const pluginPersistenceService = createPluginPersistenceService();
    const service = createService(pluginPersistenceService);

    expect(service.setPluginStorage('builtin.memory', 'cursor.lastMessageId', 'message-42')).toBe('message-42');
    expect(service.setStoreValue('state', 'builtin.memory', {
      conversationId: 'conversation-1',
      source: 'chat-hook',
      userId: 'user-1',
    }, {
      key: 'draft.step',
      scope: 'conversation',
      value: 'collect-name',
    })).toBe('collect-name');

    const reloaded = createService(pluginPersistenceService);

    expect(reloaded.listPluginStorage('builtin.memory', 'cursor.')).toEqual([
      {
        key: 'cursor.lastMessageId',
        value: 'message-42',
      },
    ]);
    expect(reloaded.getStoreValue('state', 'builtin.memory', {
      conversationId: 'conversation-1',
      source: 'chat-hook',
      userId: 'user-1',
    }, {
      key: 'draft.step',
      scope: 'conversation',
    })).toBe('collect-name');
  });

  it('deletes plugin runtime storage, scoped state and cron jobs together', () => {
    const pluginPersistenceService = createPluginPersistenceService();
    const service = createService(pluginPersistenceService);

    service.setPluginStorage('builtin.memory', 'cursor.lastMessageId', 'message-42');
    service.setStoreValue('state', 'builtin.memory', {
      conversationId: 'conversation-1',
      source: 'chat-hook',
      userId: 'user-1',
    }, {
      key: 'draft.step',
      scope: 'conversation',
      value: 'collect-name',
    });
    service.registerCronJob('builtin.memory', {
      cron: '1s',
      name: 'heartbeat',
    });

    service.deletePluginRuntimeState('builtin.memory');

    const reloaded = createService(pluginPersistenceService);
    expect(reloaded.listPluginStorage('builtin.memory')).toEqual([]);
    expect(reloaded.getStoreValue('state', 'builtin.memory', {
      conversationId: 'conversation-1',
      source: 'chat-hook',
      userId: 'user-1',
    }, {
      key: 'draft.step',
      scope: 'conversation',
    })).toBeNull();
    expect(reloaded.listCronJobs('builtin.memory')).toEqual([]);
  });

  it('restores host cron jobs across reloads and updates lastRunAt after a real tick', async () => {
    jest.useFakeTimers();
    const pluginPersistenceService = createPluginPersistenceService();
    const dispatchService = {
      invokeHook: jest.fn().mockResolvedValue(null),
    };
    const service = createService(pluginPersistenceService, dispatchService);
    const registered = service.registerCronJob('builtin.memory', {
      cron: '1s',
      data: {
        channel: 'default',
      },
      name: 'heartbeat',
    }) as unknown as PluginCronJobSummary;

    const reloaded = createService(pluginPersistenceService, dispatchService);
    await jest.advanceTimersByTimeAsync(1_000);

    expect(dispatchService.invokeHook).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({
        cronJobId: registered.id,
        source: 'cron',
      }),
      hookName: 'cron:tick',
      payload: expect.objectContaining({
        job: expect.objectContaining({
          id: registered.id,
          name: 'heartbeat',
          source: 'host',
        }),
      }),
      pluginId: 'builtin.memory',
    }));
    expect(reloaded.listCronJobs('builtin.memory')).toEqual([
      expect.objectContaining({
        id: registered.id,
        lastRunAt: expect.any(String),
        name: 'heartbeat',
        source: 'host',
      }),
    ]);
  });

  it('schedules manifest cron jobs and records the latest execution error', async () => {
    jest.useFakeTimers();
    const pluginPersistenceService = createPluginPersistenceService({
      crons: [
        {
          cron: '1s',
          description: 'manifest heartbeat',
          name: 'manifest-heartbeat',
        },
      ],
    });
    const dispatchService = {
      invokeHook: jest.fn().mockRejectedValue(new Error('cron failed')),
    };
    const service = createService(pluginPersistenceService, dispatchService);

    await jest.advanceTimersByTimeAsync(1_000);

    expect(service.listCronJobs('builtin.memory')).toEqual([
      expect.objectContaining({
        lastError: 'cron failed',
        lastErrorAt: expect.any(String),
        lastRunAt: expect.any(String),
        name: 'manifest-heartbeat',
        source: 'manifest',
      }),
    ]);
  });
});

function createPluginPersistenceService(input?: {
  crons?: PluginCronDescriptor[];
}): PluginPersistenceService {
  const pluginPersistenceService = new PluginPersistenceService();
  const pluginBootstrapService = new PluginBootstrapService(
    new PluginGovernanceService(),
    pluginPersistenceService,
  );
  pluginBootstrapService.registerPlugin({
    fallback: {
      id: 'builtin.memory',
      name: 'Memory',
      runtime: 'local',
      version: '1.0.0',
    },
    manifest: {
      crons: input?.crons,
      hooks: [
        {
          name: 'cron:tick',
        },
      ],
      id: 'builtin.memory',
      name: 'Memory',
      permissions: [
        'cron:read',
        'cron:write',
        'state:read',
        'state:write',
        'storage:read',
        'storage:write',
      ],
      runtime: 'local',
      tools: [],
      version: '1.0.0',
    },
  });
  return pluginPersistenceService;
}

function createService(
  pluginPersistenceService: PluginPersistenceService,
  dispatchService?: {
    invokeHook: jest.Mock;
  },
): PluginRuntimeService {
  const service = new PluginRuntimeService(pluginPersistenceService);
  if (dispatchService) {
    Object.assign(service as unknown as {
      pluginDispatch?: {
        invokeHook: jest.Mock;
      };
    }, {
      pluginDispatch: dispatchService,
    });
  }
  const lifecycleService = service as PluginRuntimeService & {
    onApplicationBootstrap?: () => void;
    onModuleDestroy?: () => void;
  };
  lifecycleService.onApplicationBootstrap?.();
  trackedServices.push(lifecycleService);
  return service;
}


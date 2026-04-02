import type {
  PluginConfigSchema,
  PluginCallContext,
  PluginManifest,
} from '@garlic-claw/shared';
import { NotFoundException } from '@nestjs/common';
import { PluginRuntimeBroadcastFacade } from './plugin-runtime-broadcast.facade';
import { PluginRuntimeGovernanceFacade } from './plugin-runtime-governance.facade';
import { PluginRuntimeHostFacade } from './plugin-runtime-host.facade';
import { PluginRuntimeOperationHooksFacade } from './plugin-runtime-operation-hooks.facade';
import { PluginRuntimeSubagentFacade } from './plugin-runtime-subagent.facade';
import { PluginRuntimeOrchestratorService } from './plugin-runtime-orchestrator.service';
import { PluginRuntimeService } from './plugin-runtime.service';

describe('PluginRuntimeOrchestratorService', () => {
  const pluginService = {
    registerPlugin: jest.fn(),
    getGovernanceSnapshot: jest.fn(),
    setOffline: jest.fn(),
    heartbeat: jest.fn(),
    recordPluginEvent: jest.fn(),
    recordPluginFailure: jest.fn(),
    getPluginSelfInfo: jest.fn(),
  };

  const hostService = {
    call: jest.fn(),
  };

  const cronService = {
    onPluginRegistered: jest.fn(),
    onPluginUnregistered: jest.fn(),
    registerCron: jest.fn(),
    listCronJobs: jest.fn(),
    deleteCron: jest.fn(),
  };

  const aiModelExecution = {
    resolveModelConfig: jest.fn(),
    prepareResolved: jest.fn(),
    streamPrepared: jest.fn(),
  };

  const moduleRef = {
    get: jest.fn(),
  };

  const builtinManifest: PluginManifest = {
    id: 'builtin.memory-tools',
    name: '记忆工具',
    version: '1.0.0',
    runtime: 'builtin',
    permissions: ['memory:read'],
    tools: [
      {
        name: 'save_memory',
        description: '保存记忆',
        parameters: {},
      },
    ],
    hooks: [],
  };

  const governanceSnapshot = {
    configSchema: null as PluginConfigSchema | null,
    resolvedConfig: {},
    scope: {
      defaultEnabled: true,
      conversations: {},
    },
  };

  let runtime: PluginRuntimeService;
  let runtimeBroadcastFacade: PluginRuntimeBroadcastFacade;
  let runtimeGovernanceFacade: PluginRuntimeGovernanceFacade;
  let runtimeHostFacade: PluginRuntimeHostFacade;
  let runtimeOperationHooksFacade: PluginRuntimeOperationHooksFacade;
  let runtimeSubagentFacade: PluginRuntimeSubagentFacade;
  let orchestrator: PluginRuntimeOrchestratorService;

  beforeEach(() => {
    jest.clearAllMocks();
    pluginService.registerPlugin.mockResolvedValue(governanceSnapshot);
    pluginService.getGovernanceSnapshot.mockResolvedValue(governanceSnapshot);
    pluginService.setOffline.mockResolvedValue(undefined);
    pluginService.heartbeat.mockResolvedValue(undefined);
    cronService.onPluginRegistered.mockResolvedValue(undefined);
    cronService.onPluginUnregistered.mockResolvedValue(undefined);
    runtimeBroadcastFacade = new PluginRuntimeBroadcastFacade();
    runtimeGovernanceFacade = new PluginRuntimeGovernanceFacade();
    runtimeHostFacade = new PluginRuntimeHostFacade(
      pluginService as never,
      hostService as never,
      cronService as never,
      moduleRef as never,
    );
    runtimeOperationHooksFacade = new PluginRuntimeOperationHooksFacade();
    runtimeSubagentFacade = new PluginRuntimeSubagentFacade(
      aiModelExecution as never,
      moduleRef as never,
    );

    runtime = new PluginRuntimeService(
      pluginService as never,
      hostService as never,
      aiModelExecution as never,
      runtimeBroadcastFacade as never,
      runtimeGovernanceFacade as never,
      runtimeHostFacade as never,
      runtimeOperationHooksFacade as never,
      runtimeSubagentFacade as never,
    );
    orchestrator = new PluginRuntimeOrchestratorService(
      runtime,
      pluginService as never,
      cronService as never,
    );
  });

  function createTransport(overrides?: {
    invokeHook?: jest.Mock;
  }) {
    return {
      executeTool: jest.fn(),
      invokeHook: jest.fn(),
      invokeRoute: jest.fn(),
      ...overrides,
    };
  }

  const toolContext: PluginCallContext = {
    source: 'chat-tool',
    conversationId: 'conversation-1',
  };

  it('persists registration, caches runtime record, syncs cron, and emits plugin:loaded', async () => {
    const invokeHook = jest.fn().mockResolvedValue(null);

    await runtime.registerPlugin({
      manifest: {
        ...builtinManifest,
        id: 'builtin.lifecycle-observer',
        hooks: [
          {
            name: 'plugin:loaded',
          },
        ],
      },
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook,
      }),
    });

    await orchestrator.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    expect(pluginService.registerPlugin).toHaveBeenCalledWith(
      'builtin.memory-tools',
      'builtin',
      builtinManifest,
    );
    expect(cronService.onPluginRegistered).toHaveBeenCalledWith(
      'builtin.memory-tools',
      [],
    );
    expect(runtime.listPlugins()).toEqual([
      expect.objectContaining({
        pluginId: 'builtin.lifecycle-observer',
      }),
      expect.objectContaining({
        pluginId: 'builtin.memory-tools',
      }),
    ]);
    expect(invokeHook).toHaveBeenCalledWith({
      hookName: 'plugin:loaded',
      context: {
        source: 'plugin',
      },
      payload: {
        context: {
          source: 'plugin',
        },
        plugin: {
          id: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          manifest: builtinManifest,
        },
        loadedAt: expect.any(String),
      },
    });
  });

  it('refreshes governance snapshot through the kernel cache API', async () => {
    await runtime.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
      governance: governanceSnapshot,
    });
    expect(runtime.listTools(toolContext)).toHaveLength(1);

    pluginService.getGovernanceSnapshot.mockResolvedValueOnce({
      configSchema: null,
      resolvedConfig: {},
      scope: {
        defaultEnabled: true,
        conversations: {
          'conversation-1': false,
        },
      },
    });

    await orchestrator.refreshPluginGovernance('builtin.memory-tools');

    expect(runtime.listTools(toolContext)).toEqual([]);
  });

  it('emits plugin:unloaded, unschedules cron, and marks plugin offline on unregister', async () => {
    const invokeHook = jest.fn().mockResolvedValue(null);
    const manifest: PluginManifest = {
      ...builtinManifest,
      id: 'builtin.lifecycle-observer',
      hooks: [
        {
          name: 'plugin:unloaded',
        },
      ],
    };

    await runtime.registerPlugin({
      manifest,
      runtimeKind: 'builtin',
      transport: createTransport({
        invokeHook,
      }),
    });
    await runtime.registerPlugin({
      manifest: builtinManifest,
      runtimeKind: 'builtin',
      transport: createTransport(),
    });

    await orchestrator.unregisterPlugin('builtin.memory-tools');

    expect(invokeHook).toHaveBeenCalledWith({
      hookName: 'plugin:unloaded',
      context: {
        source: 'plugin',
      },
      payload: {
        context: {
          source: 'plugin',
        },
        plugin: {
          id: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          deviceType: 'builtin',
          manifest: builtinManifest,
        },
        unloadedAt: expect.any(String),
      },
    });
    expect(cronService.onPluginUnregistered).toHaveBeenCalledWith('builtin.memory-tools');
    expect(pluginService.setOffline).toHaveBeenCalledWith('builtin.memory-tools');
    expect(runtime.listPlugins()).toEqual([
      expect.objectContaining({
        pluginId: 'builtin.lifecycle-observer',
      }),
    ]);
  });

  it('ignores missing heartbeat targets', async () => {
    pluginService.heartbeat.mockRejectedValueOnce(new Error('unexpected'));
    await expect(orchestrator.touchPluginHeartbeat('remote.pc-host')).rejects.toThrow('unexpected');

    pluginService.heartbeat.mockRejectedValueOnce(new NotFoundException('missing'));

    await expect(orchestrator.touchPluginHeartbeat('remote.pc-host')).resolves.toBeUndefined();
  });
});

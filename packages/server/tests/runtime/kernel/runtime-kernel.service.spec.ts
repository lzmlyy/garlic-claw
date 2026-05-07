import { AiModelExecutionService } from '../../../src/modules/ai/ai-model-execution.service';
import { AiManagementService } from '../../../src/modules/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../../src/modules/ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../../src/modules/execution/automation/automation-execution.service';
import { AutomationService } from '../../../src/modules/execution/automation/automation.service';
import { ProjectSubagentTypeRegistryService } from '../../../src/modules/execution/project/project-subagent-type-registry.service';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { BuiltinPluginRegistryService } from '../../../src/modules/plugin/builtin/builtin-plugin-registry.service';
import { PluginBootstrapService } from '../../../src/modules/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/modules/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/modules/plugin/persistence/plugin-persistence.service';
import { PersonaService } from '../../../src/modules/persona/persona.service';
import { PersonaStoreService } from '../../../src/modules/persona/persona-store.service';
import { RuntimeGatewayConnectionLifecycleService } from '../../../src/modules/runtime/gateway/runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayRemoteTransportService } from '../../../src/modules/runtime/gateway/runtime-gateway-remote-transport.service';
import { ConversationMessageService } from '../../../src/modules/runtime/host/conversation-message.service';
import { ConversationStoreService } from '../../../src/modules/runtime/host/conversation-store.service';
import { KnowledgeReaderService } from '../../../src/modules/runtime/host/knowledge-reader.service';
import { PluginDispatchService } from '../../../src/modules/runtime/host/plugin-dispatch.service';
import { PluginRuntimeService } from '../../../src/modules/runtime/host/plugin-runtime.service';
import { SubagentRunnerService } from '../../../src/modules/runtime/host/subagent-runner.service';
import { PluginHostService } from '../../../src/modules/runtime/host/plugin-host.service';
import { UserContextService } from '../../../src/modules/runtime/host/user-context.service';
import { RuntimePluginGovernanceService } from '../../../src/modules/runtime/kernel/runtime-plugin-governance.service';

describe('RuntimePluginGovernanceService', () => {
  it('registers remote plugins and routes host/tool/hook/route calls', async () => {
    const fixture = createService();
    const { runtimeGatewayConnectionLifecycleService, pluginDispatch, service } = fixture;

    seedRemotePlugin(fixture);

    runtimeGatewayConnectionLifecycleService.registerRemotePlugin({
      connectionId: 'conn-1',
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        hooks: [
          {
            name: 'chat:before-model',
          },
        ],
        permissions: ['memory:read'],
        routes: [
          {
            methods: ['GET'],
            path: 'inspect/context',
          },
        ],
        tools: [
          {
            description: 'search memory',
            name: 'memory.search',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
      remoteEnvironment: 'api',
    });

    const toolPromise = pluginDispatch.executeTool({
      context: {
        conversationId: 'conversation-1',
        source: 'chat-tool',
        userId: 'user-1',
      },
      params: {
        query: 'coffee',
      },
      pluginId: 'remote.echo',
      toolName: 'memory.search',
    });
    const hookPromise = pluginDispatch.invokeHook({
      context: {
        conversationId: 'conversation-1',
        source: 'chat-hook',
        userId: 'user-1',
      },
      hookName: 'chat:before-model',
      payload: {
        content: 'hello',
      },
      pluginId: 'remote.echo',
    });
    const routePromise = pluginDispatch.invokeRoute({
      context: {
        conversationId: 'conversation-1',
        source: 'http-route',
        userId: 'user-1',
      },
      pluginId: 'remote.echo',
      request: {
        body: null,
        headers: {},
        method: 'GET',
        path: '/inspect/context/',
        query: {},
      },
    });

    const outbound = fixture.runtimeGatewayRemoteTransportService.consumeOutboundMessages('conn-1');
    expect(outbound).toHaveLength(3);
    fixture.runtimeGatewayRemoteTransportService.settlePendingRequest({
      requestId: outbound[0].requestId,
      result: {
        items: [{ id: 'memory-1' }],
      },
    });
    fixture.runtimeGatewayRemoteTransportService.settlePendingRequest({
      requestId: outbound[1].requestId,
      result: {
        action: 'continue',
      },
    });
    fixture.runtimeGatewayRemoteTransportService.settlePendingRequest({
      requestId: outbound[2].requestId,
      result: {
        body: {
          ok: true,
        },
        status: 200,
      },
    });

    await expect(toolPromise).resolves.toEqual({
      items: [{ id: 'memory-1' }],
    });
    await expect(hookPromise).resolves.toEqual({
      action: 'continue',
    });
    await expect(routePromise).resolves.toEqual({
      body: {
        ok: true,
      },
      status: 200,
    });
    expect(pluginDispatch.listPlugins()).toEqual([
      expect.objectContaining({
        pluginId: 'remote.echo',
      }),
    ]);
    expect(service.listSupportedActions('remote.echo')).toEqual([
      'health-check',
      'reload',
      'reconnect',
      'refresh-metadata',
    ]);
  });

  it('does not expose reload for ordinary local plugins and still reports health actions', async () => {
    const { pluginBootstrapService, service } = createService();
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'local.memory-context',
        name: 'Local Memory Context',
        runtime: 'local',
      },
      manifest: {
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.markPluginOffline('local.memory-context');

    expect(service.listSupportedActions('local.memory-context')).toEqual(['health-check']);
    await expect(
      service.runPluginAction({
        action: 'health-check',
        pluginId: 'local.memory-context',
      }),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      pluginId: 'local.memory-context',
      message: '插件健康检查失败',
    });
    await expect(
      service.runPluginAction({
        action: 'reload',
        pluginId: 'local.memory-context',
      }),
    ).rejects.toThrow('does not support action reload');
    expect(pluginBootstrapService.getPlugin('local.memory-context')).toMatchObject({
      connected: false,
      pluginId: 'local.memory-context',
    });
    await expect(
      service.runPluginAction({
        action: 'reconnect',
        pluginId: 'local.memory-context',
      }),
    ).rejects.toThrow('does not support action reconnect');
  });

  it('invokes builtin hooks through builtin plugin definitions', async () => {
    const { builtinPluginRegistryService, pluginBootstrapService, pluginDispatch } = createService();
    const beforeRunHook = jest.fn().mockResolvedValue({
      action: 'mutate',
      messages: [
        {
          content: 'builtin hook mutated prompt',
          role: 'user',
        },
      ],
    });

    (builtinPluginRegistryService as unknown as {
      definitions: Array<Record<string, unknown>>;
    }).definitions = [
      {
        hooks: {
          'subagent:before-run': beforeRunHook,
        },
        manifest: {
          hooks: [{ name: 'subagent:before-run' }],
          id: 'builtin.subagent-observer',
          name: 'Builtin Subagent Observer',
          permissions: [],
          runtime: 'local',
          tools: [],
          version: '1.0.0',
        },
      },
    ];
    pluginBootstrapService.bootstrapBuiltins();

    await expect(
      pluginDispatch.invokeHook({
        context: {
          conversationId: 'conversation-1',
          source: 'plugin',
          userId: 'user-1',
        },
        hookName: 'subagent:before-run',
        payload: {
          request: {
            messages: [
              {
                content: 'original prompt',
                role: 'user',
              },
            ],
          },
        },
        pluginId: 'builtin.subagent-observer',
      }),
    ).resolves.toEqual({
      action: 'mutate',
      messages: [
        {
          content: 'builtin hook mutated prompt',
          role: 'user',
        },
      ],
    });
    expect(beforeRunHook).toHaveBeenCalledWith({
      request: {
        messages: [
          {
            content: 'original prompt',
            role: 'user',
          },
        ],
      },
    }, expect.objectContaining({
      callContext: {
        conversationId: 'conversation-1',
        source: 'plugin',
        userId: 'user-1',
      },
      host: expect.any(Object),
    }));
  });

  it('performs remote health checks through the remote transport ping path', async () => {
    const fixture = createService();
    const { runtimeGatewayConnectionLifecycleService, service } = fixture;

    seedRemotePlugin(fixture);
    runtimeGatewayConnectionLifecycleService.registerRemotePlugin({
      connectionId: 'conn-1',
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
      remoteEnvironment: 'api',
    });
    runtimeGatewayConnectionLifecycleService.probePluginHealth = jest.fn().mockResolvedValue({ ok: false });

    await expect(
      service.runPluginAction({
        action: 'health-check',
        pluginId: 'remote.echo',
      }),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      pluginId: 'remote.echo',
      message: '插件健康检查失败',
    });
    expect(runtimeGatewayConnectionLifecycleService.probePluginHealth).toHaveBeenCalledWith('remote.echo');
  });

  it('keeps the previous lastSuccessAt when a later remote health check fails', async () => {
    const fixture = createService();
    const { runtimeGatewayConnectionLifecycleService, service } = fixture;

    seedRemotePlugin(fixture);
    runtimeGatewayConnectionLifecycleService.registerRemotePlugin({
      connectionId: 'conn-1',
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
      remoteEnvironment: 'api',
    });
    runtimeGatewayConnectionLifecycleService.probePluginHealth = jest.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });

    const first = await service.readPluginHealthSnapshot('remote.echo');
    const second = await service.readPluginHealthSnapshot('remote.echo');

    expect(first.status).toBe('healthy');
    expect(first.lastSuccessAt).toEqual(expect.any(String));
    expect(second.status).toBe('offline');
    expect(second.lastSuccessAt).toBe(first.lastSuccessAt);
  });

  it('refreshes remote metadata cache after the plugin reconnects with a changed manifest', async () => {
    const fixture = createService();
    const { pluginBootstrapService, runtimeGatewayConnectionLifecycleService, service } = fixture;

    seedRemotePlugin(fixture);
    runtimeGatewayConnectionLifecycleService.registerRemotePlugin({
      connectionId: 'conn-1',
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        description: 'initial manifest',
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
      remoteEnvironment: 'api',
    });

    const initialPlugin = pluginBootstrapService.getPlugin('remote.echo');
    const initialLastSyncedAt = initialPlugin.remote?.metadataCache.lastSyncedAt;
    const initialManifestHash = initialPlugin.remote?.metadataCache.manifestHash;

    await expect(
      service.runPluginAction({
        action: 'refresh-metadata',
        pluginId: 'remote.echo',
      }),
    ).resolves.toEqual({
      accepted: true,
      action: 'refresh-metadata',
      pluginId: 'remote.echo',
      message: '已请求远程插件重新同步元数据',
    });
    expect(pluginBootstrapService.getPlugin('remote.echo')).toMatchObject({
      connected: false,
      status: 'offline',
    });

    runtimeGatewayConnectionLifecycleService.openConnection({
      connectionId: 'conn-2',
    });
    runtimeGatewayConnectionLifecycleService.authenticateConnection({
      accessKey: 'smoke-access-key',
      connectionId: 'conn-2',
      pluginName: 'remote.echo',
      remoteEnvironment: 'api',
    });
    runtimeGatewayConnectionLifecycleService.registerRemotePlugin({
      connectionId: 'conn-2',
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        description: 'refreshed manifest',
        permissions: [],
        tools: [],
        version: '1.0.1',
      } as never,
      remoteEnvironment: 'api',
    });

    const refreshedPlugin = pluginBootstrapService.getPlugin('remote.echo');
    expect(refreshedPlugin).toMatchObject({
      connected: true,
      manifest: {
        description: 'refreshed manifest',
        version: '1.0.1',
      },
      remote: {
        metadataCache: {
          status: 'cached',
        },
      },
    });
    expect(Date.parse(refreshedPlugin.remote?.metadataCache.lastSyncedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(initialLastSyncedAt ?? ''),
    );
    expect(refreshedPlugin.remote?.metadataCache.manifestHash).not.toBe(initialManifestHash);
  });
});

function seedRemotePlugin(input: ReturnType<typeof createService>) {
  input.pluginBootstrapService.upsertRemotePlugin({
    access: {
      accessKey: 'smoke-access-key',
      serverUrl: 'ws://127.0.0.1:23331',
    },
    displayName: 'Remote Echo',
    pluginName: 'remote.echo',
    remote: {
      auth: {
        mode: 'required',
      },
      capabilityProfile: 'query',
      remoteEnvironment: 'api',
    },
    version: '1.0.0',
  });
  input.runtimeGatewayConnectionLifecycleService.authenticateConnection({
    accessKey: 'smoke-access-key',
    connectionId: 'conn-1',
    pluginName: 'remote.echo',
    remoteEnvironment: 'api',
  });
}

function createService(options?: { projectPluginRegistryService?: unknown }) {
  const builtinPluginRegistryService = new BuiltinPluginRegistryService();
  const pluginBootstrapService = new PluginBootstrapService(
    new PluginGovernanceService(),
    new PluginPersistenceService(),
    builtinPluginRegistryService,
    options?.projectPluginRegistryService as never,
  );
  const runtimeGatewayConnectionLifecycleService = new RuntimeGatewayConnectionLifecycleService(
    pluginBootstrapService,
  );
  const runtimePluginGovernanceService = new RuntimePluginGovernanceService(
    pluginBootstrapService,
    runtimeGatewayConnectionLifecycleService,
  );
  const runtimeGatewayRemoteTransportService = new RuntimeGatewayRemoteTransportService(
    runtimeGatewayConnectionLifecycleService,
  );
  runtimeGatewayConnectionLifecycleService.openConnection({
    connectionId: 'conn-1',
  });
  const conversationStore = new ConversationStoreService();
  const conversationMessages = new ConversationMessageService(
    conversationStore,
  );
  const aiManagementService = new AiManagementService(new AiProviderSettingsService());
  aiManagementService.upsertProvider('openai', {
    apiKey: 'test-openai-key',
    defaultModel: 'gpt-5.4',
    driver: 'openai',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });
  const aiModelExecutionService = new AiModelExecutionService();
  const subagentRunner = new SubagentRunnerService(
    aiModelExecutionService,
    conversationMessages,
    {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      invokeHook: jest.fn(),
    } as never,
    new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    {
      get: jest.fn().mockReturnValue(undefined),
    } as never,
    conversationStore,
  );
  const automationService = new AutomationService(
    new AutomationExecutionService(
      {
        executeTool: jest.fn(),
        invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      {
        sendMessage: async () => {
          throw new Error('ConversationMessageService is not available');
        },
      } as never,
      {
        executeRegisteredTool: jest.fn(),
      } as never,
    ),
  );
  const pluginDispatch = new PluginDispatchService(
    builtinPluginRegistryService,
    pluginBootstrapService,
    runtimeGatewayRemoteTransportService,
  );
  const pluginRuntime = new PluginRuntimeService();
  const pluginHost = new PluginHostService(
    pluginBootstrapService,
    automationService,
    conversationMessages,
    conversationStore,
    aiModelExecutionService as never,
    aiManagementService,
    new KnowledgeReaderService(),
    pluginDispatch,
    pluginRuntime,
    {} as never,
    subagentRunner,
    new UserContextService(),
    new PersonaService(new PersonaStoreService(new ProjectWorktreeRootService()), conversationStore),
  );
  pluginHost.onModuleInit();
  return {
    builtinPluginRegistryService,
    pluginBootstrapService,
    runtimeGatewayConnectionLifecycleService,
    runtimeGatewayRemoteTransportService,
    conversationStore,
    pluginDispatch,
    pluginRuntime,
    service: runtimePluginGovernanceService,
  };
}



import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AiModelExecutionService } from '../../../src/modules/ai/ai-model-execution.service';
import { AiManagementService } from '../../../src/modules/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../../src/modules/ai-management/ai-provider-settings.service';
import { createSingleUserProfile } from '../../../src/modules/auth/single-user-auth';
import { AutomationExecutionService } from '../../../src/modules/execution/automation/automation-execution.service';
import { AutomationService } from '../../../src/modules/execution/automation/automation.service';
import { BashToolService } from '../../../src/modules/execution/bash/bash-tool.service';
import { EditToolService } from '../../../src/modules/execution/edit/edit-tool.service';
import { HostFilesystemBackendService } from '../../../src/modules/execution/file/host-filesystem-backend.service';
import { GlobToolService } from '../../../src/modules/execution/glob/glob-tool.service';
import { GrepToolService } from '../../../src/modules/execution/grep/grep-tool.service';
import { ProjectSubagentTypeRegistryService } from '../../../src/modules/execution/project/project-subagent-type-registry.service';
import { ProjectWorktreeSearchOverlayService } from '../../../src/modules/execution/project/project-worktree-search-overlay.service';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { ReadToolService } from '../../../src/modules/execution/read/read-tool.service';
import { RuntimeCommandService } from '../../../src/modules/execution/runtime/runtime-command.service';
import { RuntimeCommandCaptureService } from '../../../src/modules/execution/runtime/runtime-command-capture.service';
import { RuntimeBackendRoutingService } from '../../../src/modules/execution/runtime/runtime-backend-routing.service';
import { RuntimeJustBashService } from '../../../src/modules/execution/runtime/runtime-just-bash.service';
import { RuntimeToolBackendService } from '../../../src/modules/execution/runtime/runtime-tool-backend.service';
import { RuntimeFilesystemBackendService } from '../../../src/modules/execution/runtime/runtime-filesystem-backend.service';
import { RuntimeToolPermissionService } from '../../../src/modules/execution/runtime/runtime-tool-permission.service';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';
import { RuntimeToolsSettingsService } from '../../../src/modules/execution/runtime/runtime-tools-settings.service';
import { WriteToolService } from '../../../src/modules/execution/write/write-tool.service';
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
import { ToolGatewayService } from '../../../src/modules/runtime/host/tool-gateway.service';
import { SubagentRunnerService } from '../../../src/modules/runtime/host/subagent-runner.service';
import { PluginHostService } from '../../../src/modules/runtime/host/plugin-host.service';
import { UserContextService } from '../../../src/modules/runtime/host/user-context.service';

const conversationStorePaths: string[] = [];
const runtimeWorkspaceRoots: string[] = [];
let fixtureConversationId = 'conversation-1';
const fixtureConversationTitle = 'Conversation conversation-1';

describe('PluginHostService', () => {
  beforeEach(() => {
    const conversationStorePath = path.join(os.tmpdir(), `gc-server-host-conversation-${Date.now()}-${Math.random()}.json`);
    process.env.GARLIC_CLAW_CONVERSATIONS_PATH = conversationStorePath;
    conversationStorePaths.push(conversationStorePath);
  });

  afterEach(() => {
    while (conversationStorePaths.length > 0) {
      const nextPath = conversationStorePaths.pop();
      if (nextPath && fs.existsSync(nextPath)) {
        fs.unlinkSync(nextPath);
      }
    }
    while (runtimeWorkspaceRoots.length > 0) {
      const nextPath = runtimeWorkspaceRoots.pop();
      if (nextPath && fs.existsSync(nextPath)) {
        fs.rmSync(nextPath, { force: true, recursive: true });
      }
    }
    delete process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH;
    delete process.env.GARLIC_CLAW_CONVERSATIONS_PATH;
  });

  it('rejects unmigrated host methods', async () => {
    const { service } = createFixture();

    await expect(service.call({
      context: hookContext(),
      method: 'plugin.unknown' as never,
      params: {},
      pluginId: 'builtin.memory',
    })).rejects.toThrow('当前服务运行时未实现 Host API plugin.unknown');
  });

  it('registers the host caller so builtin tools can round-trip into host config reads', async () => {
    const builtinPluginRegistryService = new BuiltinPluginRegistryService();
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
      builtinPluginRegistryService,
    );
    const runtimeGatewayConnectionLifecycleService = new RuntimeGatewayConnectionLifecycleService(
      pluginBootstrapService,
    );
    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const hostFilesystemBackend = new HostFilesystemBackendService(
      runtimeSessionEnvironmentService,
    );
    const runtimeCommandService = new RuntimeCommandService(
      [new RuntimeJustBashService(runtimeSessionEnvironmentService)],
      new RuntimeCommandCaptureService(runtimeSessionEnvironmentService),
    );
    const runtimeFilesystemBackendService = new RuntimeFilesystemBackendService([
      hostFilesystemBackend,
    ]);
    const _runtimeToolBackendService = new RuntimeToolBackendService(
      new RuntimeBackendRoutingService(),
      runtimeCommandService,
      runtimeFilesystemBackendService,
    );
    const _runtimeToolPermissionService = new RuntimeToolPermissionService();
    const _projectWorktreeSearchOverlayService = new ProjectWorktreeSearchOverlayService(
      runtimeSessionEnvironmentService,
      new ProjectWorktreeRootService(),
    );
    const pluginDispatch = new PluginDispatchService(
      builtinPluginRegistryService,
      pluginBootstrapService,
      new RuntimeGatewayRemoteTransportService(runtimeGatewayConnectionLifecycleService),
    );
    const conversationStore = new ConversationStoreService();
    const pluginHost = new PluginHostService(
      pluginBootstrapService,
      {} as never,
      {} as never,
      conversationStore,
      {} as never,
      new AiManagementService(new AiProviderSettingsService()),
      new KnowledgeReaderService(),
      pluginDispatch,
      new PluginRuntimeService(),
      {} as never,
      {} as never,
      new UserContextService(),
      new PersonaService(new PersonaStoreService(new ProjectWorktreeRootService()), conversationStore),
    );

    (builtinPluginRegistryService as unknown as {
      definitions: Array<Record<string, unknown>>;
    }).definitions = [
      {
        manifest: {
          config: {
            type: 'object',
            items: {
              defaultLimit: {
                defaultValue: 5,
                type: 'int',
              },
            },
          },
          id: 'builtin.host-roundtrip',
          name: 'Host Roundtrip',
          permissions: ['config:read'],
          runtime: 'local',
          tools: [
            {
              description: 'read host config through builtin facade',
              name: 'read_limit',
              parameters: {},
            },
          ],
          version: '1.0.0',
        },
        tools: {
          read_limit: async (
            _params: unknown,
            context: { host: { getConfig: (key?: string) => Promise<unknown> } },
          ) => ({ value: await context.host.getConfig('defaultLimit') }),
        },
      },
    ];

    pluginHost.onModuleInit();
    pluginBootstrapService.bootstrapBuiltins();

    await expect(
      pluginDispatch.executeTool({
        context: { source: 'plugin' },
        params: {},
        pluginId: 'builtin.host-roundtrip',
        toolName: 'read_limit',
      }),
    ).resolves.toEqual({ value: 5 });
  });

  it('guards permissions and exposes plugin config, provider and self data', async () => {
    const { service } = createFixture({
      permissions: [
        'config:read',
        'provider:read',
        'user:read',
      ],
    });

    const providerContext = hookContext({
      activeModelId: 'gpt-5.4',
      activeProviderId: 'openai',
      conversationId: undefined,
    });

    await expect(callMemory(service, 'memory.search', { query: 'coffee' }, hookContext({ conversationId: undefined })))
      .rejects.toThrow('插件 builtin.memory 缺少权限 memory:read');
    await expect(callMemory(service, 'config.get', {}, providerContext)).resolves.toEqual({
      defaultLimit: 5,
    });
    await expect(callMemory(service, 'provider.current.get', {}, providerContext)).resolves.toEqual({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      source: 'context',
    });
    await expect(callMemory(service, 'provider.model.get', {
      modelId: 'gpt-5.4',
      providerId: 'openai',
    }, providerContext)).resolves.toEqual({
      capabilities: {
        input: {
          image: false,
          text: true,
        },
        output: {
          image: false,
          text: true,
        },
        reasoning: false,
        toolCall: true,
      },
      contextLength: 128 * 1024,
      id: 'gpt-5.4',
      name: 'gpt-5.4',
      providerId: 'openai',
      status: 'active',
    });
    await expect(callMemory(service, 'user.get', {}, hookContext({ conversationId: undefined }))).resolves.toEqual({
      ...createSingleUserProfile(),
    });
    await expect(callMemory(service, 'plugin.self.get', {}, pluginContext())).resolves.toMatchObject({
      connected: true,
      defaultEnabled: true,
      id: 'builtin.memory',
      name: 'Memory',
      runtimeKind: 'local',
      version: '1.0.0',
    });
  });

  it('isolates scoped state and storage by plugin, conversation and user', async () => {
    const { service } = createFixture({
      permissions: [
        'state:read',
        'state:write',
        'storage:read',
        'storage:write',
      ],
    });

    const conversationToolContext = toolContext({ conversationId: fixtureConversationId });

    await expect(callMemory(service, 'state.set', {
      key: 'draft.step',
      scope: 'conversation',
      value: 'collect-name',
    }, conversationToolContext)).resolves.toBe('collect-name');
    await expect(callMemory(service, 'storage.set', {
      key: 'cursor.lastMessageId',
      value: 'message-42',
    }, toolContext())).resolves.toBe('message-42');
    await expect(callMemory(service, 'state.list', {
      scope: 'conversation',
    }, conversationToolContext)).resolves.toEqual([
      {
        key: 'draft.step',
        value: 'collect-name',
      },
    ]);
    await expect(callMemory(service, 'storage.list', {
      prefix: 'cursor.',
    }, toolContext())).resolves.toEqual([
      {
        key: 'cursor.lastMessageId',
        value: 'message-42',
      },
    ]);
    await expect(callMemory(service, 'state.delete', {
      key: 'draft.step',
      scope: 'conversation',
    }, conversationToolContext)).resolves.toBe(true);
    await expect(callMemory(service, 'state.get', {
      key: 'draft.step',
      scope: 'conversation',
    }, conversationToolContext)).resolves.toBeNull();
  });

  it('tracks conversation sessions and cron jobs as runtime-owned resources', async () => {
    const { service } = createFixture({
      permissions: [
        'conversation:write',
        'cron:read',
        'cron:write',
      ],
    });

    await expect(memoryHookCall(service, 'conversation.session.start', {
      captureHistory: true,
      metadata: {
        flow: 'memory',
      },
      timeoutMs: 60_000,
    })).resolves.toMatchObject({
      captureHistory: true,
      conversationId: fixtureConversationId,
      historyMessages: [],
      metadata: {
        flow: 'memory',
      },
      pluginId: 'builtin.memory',
      timeoutMs: 60_000,
    });
    await expect(memoryHookCall(service, 'conversation.session.keep', {
      resetTimeout: false,
      timeoutMs: 30_000,
    })).resolves.toMatchObject({
      conversationId: fixtureConversationId,
      pluginId: 'builtin.memory',
      timeoutMs: 90_000,
    });
    await expect(memoryHookCall(service, 'conversation.session.get', {})).resolves.toMatchObject({
      conversationId: fixtureConversationId,
      pluginId: 'builtin.memory',
      timeoutMs: 90_000,
    });
    await expect(memoryPluginCall(service, 'cron.register', {
      cron: '10s',
      data: {
        channel: 'default',
      },
      description: 'heartbeat',
      name: 'heartbeat',
    }, { userId: 'user-1' })).resolves.toMatchObject({
      cron: '10s',
      name: 'heartbeat',
      pluginId: 'builtin.memory',
      source: 'host',
    });
    await expect(memoryPluginCall(service, 'cron.list', {})).resolves.toEqual([
      expect.objectContaining({
        name: 'heartbeat',
      }),
    ]);
    await expect(memoryPluginCall(service, 'cron.delete', { jobId: 'cron-job-1' })).resolves.toBe(true);
    await expect(memoryHookCall(service, 'conversation.session.finish', {})).resolves.toBe(true);
    await expect(memoryHookCall(service, 'conversation.session.get', {})).resolves.toBeNull();
  });

  it('serves kb list/search/get through runtime-owned snapshots', async () => {
    const { service } = createFixture({
      permissions: ['kb:read'],
    });

    await expect(memoryHookCall(service, 'kb.list', { limit: 5 })).resolves.toEqual([
      {
        createdAt: '2026-03-28T02:00:00.000Z',
        excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        id: 'kb-plugin-runtime',
        tags: ['plugin', 'runtime'],
        title: '统一插件运行时',
        updatedAt: '2026-03-28T02:00:00.000Z',
      },
    ]);
    await expect(memoryHookCall(service, 'kb.search', {
      limit: 3,
      query: '插件运行时',
    })).resolves.toEqual([
      {
        content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        createdAt: '2026-03-28T02:00:00.000Z',
        excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
        id: 'kb-plugin-runtime',
        tags: ['plugin', 'runtime'],
        title: '统一插件运行时',
        updatedAt: '2026-03-28T02:00:00.000Z',
      },
    ]);
    await expect(memoryHookCall(service, 'kb.get', {
      entryId: 'kb-plugin-runtime',
    })).resolves.toEqual({
      content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
      createdAt: '2026-03-28T02:00:00.000Z',
      excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
      id: 'kb-plugin-runtime',
      tags: ['plugin', 'runtime'],
      title: '统一插件运行时',
      updatedAt: '2026-03-28T02:00:00.000Z',
    });
  });

  it('spawns、等待并继续输入子代理会话', async () => {
    jest.useFakeTimers();
    const { service } = createFixture({
      permissions: ['conversation:read', 'conversation:write', 'subagent:run'],
    });

    const spawned = await memoryPluginCall(service, 'subagent.spawn', {
      description: '当前对话总结',
      messages: [
        {
          content: '请帮我总结当前对话',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.2',
      providerId: 'openai',
    }, { userId: 'user-1', conversationId: fixtureConversationId });
    expect(spawned).toMatchObject({
      conversationId: expect.any(String),
      status: 'queued',
    });
    await jest.runAllTimersAsync();
    const loaded = await memoryPluginCall(service, 'subagent.wait', {
      conversationId: (spawned as { conversationId: string }).conversationId,
      timeoutMs: 50,
    }, { userId: 'user-1', conversationId: fixtureConversationId });
    expect(loaded).toMatchObject({
      conversationId: (spawned as { conversationId: string }).conversationId,
      result: 'Generated: 请帮我总结当前对话',
      status: 'completed',
    });
    await expect(memoryPluginCall(service, 'subagent.list', {}, {
      userId: 'user-1',
      conversationId: fixtureConversationId,
    })).resolves.toEqual([
      expect.objectContaining({
        conversationId: (spawned as { conversationId: string }).conversationId,
        status: 'completed',
      }),
    ]);

    const continued = await memoryPluginCall(service, 'subagent.send-input', {
      conversationId: (spawned as { conversationId: string }).conversationId,
      description: '继续补充总结',
      messages: [
        {
          content: '再补充一句结论',
          role: 'user',
        },
      ],
    }, { userId: 'user-1', conversationId: fixtureConversationId });
    expect(continued).toMatchObject({
      conversationId: (spawned as { conversationId: string }).conversationId,
      status: 'queued',
    });
    await jest.runAllTimersAsync();
    await expect(memoryPluginCall(service, 'subagent.get', {
      conversationId: (spawned as { conversationId: string }).conversationId,
    }, { userId: 'user-1', conversationId: fixtureConversationId })).resolves.toMatchObject({
      conversationId: (spawned as { conversationId: string }).conversationId,
      description: '继续补充总结',
      messageCount: 4,
      result: {
        text: 'Generated: 再补充一句结论',
      },
      status: 'completed',
    });
    await expect(memoryPluginCall(service, 'conversation.messages.list', {}, {
      userId: 'user-1',
      conversationId: fixtureConversationId,
    })).resolves.toEqual([]);
    jest.useRealTimers();
  });

  it('records subagent failures without fabricating parent conversation messages', async () => {
    jest.useFakeTimers();
    const {
      subagentRunner,
      service,
    } = createFixture({
      permissions: ['subagent:run'],
    });
    const started = await memoryPluginCall(service, 'subagent.spawn', {
      messages: [
        {
          content: '请帮我总结当前对话',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.2',
      providerId: 'openai',
    }, { userId: 'user-1', conversationId: fixtureConversationId });
    expect(started).toMatchObject({
      status: 'queued',
    });
    await jest.runAllTimersAsync();
    await expect(memoryPluginCall(service, 'subagent.get', {
      conversationId: (started as { conversationId: string }).conversationId,
    }, { userId: 'user-1', conversationId: fixtureConversationId })).resolves.toMatchObject({
      status: 'completed',
    });

    (subagentRunner as any).executeSubagent = async () => {
      throw new Error('subagent failed');
    };
    const failed = await memoryPluginCall(service, 'subagent.spawn', {
      messages: [
        {
          content: '再次总结',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.2',
      providerId: 'openai',
    }, { userId: 'user-1', conversationId: fixtureConversationId });
    expect(failed).toMatchObject({
      conversationId: expect.any(String),
      status: 'queued',
    });
    await jest.runAllTimersAsync();
    await expect(memoryPluginCall(service, 'subagent.get', {
      conversationId: (failed as { conversationId: string }).conversationId,
    }, { userId: 'user-1', conversationId: fixtureConversationId })).resolves.toMatchObject({
      error: 'subagent failed',
      status: 'error',
    });
    jest.useRealTimers();
  });

  it('generates text and assistant output through runtime-owned llm host methods', async () => {
    const { pluginBootstrapService, pluginPersistenceService, llmService, service } = createFixture({
      permissions: ['llm:generate'],
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.conversation-title',
        name: 'Conversation Title',
        runtime: 'local',
      },
      manifest: {
        permissions: ['llm:generate'],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    await expect(
      service.call({
        context: {
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'llm.generate-text',
        params: {
          modelId: 'gpt-5.2',
          prompt: '请为这段对话生成标题',
          providerId: 'openai',
          transportMode: 'stream-collect',
        },
        pluginId: 'builtin.memory',
      }),
    ).resolves.toEqual({
      metadata: {
        customBlocks: [
          {
            id: 'custom-field:reasoning_content',
            kind: 'text',
            source: {
              key: 'reasoning_content',
              origin: 'ai-sdk.raw',
              providerId: 'openai',
            },
            state: 'done',
            text: '先生成标题再输出正文',
            title: 'Reasoning Content',
          },
        ],
      },
      modelId: 'gpt-5.2',
      providerId: 'openai',
      text: 'Generated: 请为这段对话生成标题',
      usage: {
        inputTokens: 7,
        outputTokens: 18,
        source: 'provider',
        totalTokens: 25,
      },
    });

    await expect(
      service.call({
        context: {
          activeModelId: 'claude-3-7-sonnet',
          activeProviderId: 'anthropic',
          source: 'chat-hook',
          userId: 'user-1',
        },
        method: 'llm.generate',
        params: {
          messages: [
            {
              content: [
                {
                  text: '请总结这段对话',
                  type: 'text',
                },
              ],
              role: 'user',
            },
          ],
          system: '你是一个总结助手',
          transportMode: 'stream-collect',
        },
        pluginId: 'builtin.conversation-title',
      }),
    ).resolves.toEqual({
      finishReason: 'stop',
      metadata: {
        customBlocks: [
          {
            id: 'custom-field:reasoning_content',
            kind: 'text',
            source: {
              key: 'reasoning_content',
              origin: 'ai-sdk.raw',
              providerId: 'anthropic',
            },
            state: 'done',
            text: '先生成标题再输出正文',
            title: 'Reasoning Content',
          },
        ],
      },
      message: {
        content: 'Generated: 请总结这段对话',
        metadata: {
          customBlocks: [
            {
              id: 'custom-field:reasoning_content',
              kind: 'text',
              source: {
                key: 'reasoning_content',
                origin: 'ai-sdk.raw',
                providerId: 'anthropic',
              },
              state: 'done',
              text: '先生成标题再输出正文',
              title: 'Reasoning Content',
            },
          ],
        },
        role: 'assistant',
      },
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      text: 'Generated: 请总结这段对话',
      toolCalls: [],
      toolResults: [],
      usage: {
        inputTokens: 7,
        outputTokens: 18,
        source: 'provider',
        totalTokens: 25,
      },
    });

    expect(llmService.generateText).toHaveBeenNthCalledWith(1, expect.objectContaining({
      transportMode: 'stream-collect',
    }));
    expect(llmService.generateText).toHaveBeenNthCalledWith(2, expect.objectContaining({
      transportMode: 'stream-collect',
    }));

    await expect(
      service.call({
        context: {
          activeModelId: 'gpt-5.4',
          activeProviderId: 'openai',
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'llm.generate-text',
        params: {
          prompt: '请总结当前插件行为',
        },
        pluginId: 'builtin.memory',
      }),
    ).resolves.toEqual({
      metadata: {
        customBlocks: [
          {
            id: 'custom-field:reasoning_content',
            kind: 'text',
            source: {
              key: 'reasoning_content',
              origin: 'ai-sdk.raw',
              providerId: 'openai',
            },
            state: 'done',
            text: '先生成标题再输出正文',
            title: 'Reasoning Content',
          },
        ],
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'Generated: 请总结当前插件行为',
      usage: {
        inputTokens: 7,
        outputTokens: 18,
        source: 'provider',
        totalTokens: 25,
      },
    });
    expect(llmService.generateText).toHaveBeenNthCalledWith(3, expect.objectContaining({
      transportMode: 'stream-collect',
    }));

    pluginPersistenceService.updatePluginLlmPreference('builtin.memory', {
      mode: 'override',
      modelId: 'deepseek-reasoner',
      providerId: 'ds2api',
    });

    await expect(
      service.call({
        context: {
          activeModelId: 'gpt-5.4',
          activeProviderId: 'openai',
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'llm.generate-text',
        params: {
          prompt: '请总结当前插件行为',
        },
        pluginId: 'builtin.memory',
      }),
    ).resolves.toEqual({
      metadata: {
        customBlocks: [
          {
            id: 'custom-field:reasoning_content',
            kind: 'text',
            source: {
              key: 'reasoning_content',
              origin: 'ai-sdk.raw',
              providerId: 'ds2api',
            },
            state: 'done',
            text: '先生成标题再输出正文',
            title: 'Reasoning Content',
          },
        ],
      },
      modelId: 'deepseek-reasoner',
      providerId: 'ds2api',
      text: 'Generated: 请总结当前插件行为',
      usage: {
        inputTokens: 7,
        outputTokens: 18,
        source: 'provider',
        totalTokens: 25,
      },
    });
    expect(llmService.generateText).toHaveBeenNthCalledWith(4, expect.objectContaining({
      transportMode: 'stream-collect',
    }));

    await expect(
      service.call({
        context: {
          activeModelId: 'gpt-5.4',
          activeProviderId: 'openai',
          source: 'plugin',
          userId: 'user-1',
        },
        method: 'llm.generate-text',
        params: {
          modelId: 'gpt-5.4',
          prompt: '请保留显式非流式接口',
          providerId: 'openai',
          transportMode: 'generate',
        },
        pluginId: 'builtin.memory',
      }),
    ).resolves.toEqual({
      metadata: {
        customBlocks: [
          {
            id: 'custom-field:reasoning_content',
            kind: 'text',
            source: {
              key: 'reasoning_content',
              origin: 'ai-sdk.response-body',
              providerId: 'openai',
            },
            state: 'done',
            text: '先生成标题再输出正文',
            title: 'Reasoning Content',
          },
        ],
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'Generated: 请保留显式非流式接口',
      usage: {
        inputTokens: 7,
        outputTokens: 18,
        source: 'provider',
        totalTokens: 25,
      },
    });
    expect(llmService.generateText).toHaveBeenNthCalledWith(5, expect.objectContaining({
      transportMode: 'generate',
    }));

    expect(llmService.generateText).toHaveBeenNthCalledWith(4, expect.objectContaining({
      modelId: 'deepseek-reasoner',
      providerId: 'ds2api',
    }));
    expect(llmService.generateText).toHaveBeenNthCalledWith(5, expect.objectContaining({
      modelId: 'gpt-5.4',
      providerId: 'openai',
    }));
  });

  it('persists conversation, persona, memory and log data in runtime-owned stores', async () => {
    const { service } = createFixture({
      permissions: [
        'conversation:read',
        'conversation:write',
        'log:read',
        'log:write',
        'memory:read',
        'memory:write',
        'persona:read',
        'persona:write',
      ],
    });
    await expect(memoryHookCall(service, 'message.send', {
      content: 'Plugin reply',
      parts: [
        {
          text: 'Plugin reply',
          type: 'text',
        },
      ],
    }, {
      activeProviderId: 'openai',
      activeModelId: 'gpt-5.4',
    })).resolves.toMatchObject({
      content: 'Plugin reply',
      model: 'gpt-5.4',
      provider: 'openai',
      role: 'assistant',
      status: 'completed',
      target: {
        id: fixtureConversationId,
        label: fixtureConversationTitle,
        type: 'conversation',
      },
    });
    await expect(memoryHookCall(service, 'conversation.title.set', {
      title: 'Coffee Notes',
    })).resolves.toMatchObject({
      id: fixtureConversationId,
      title: 'Coffee Notes',
    });
    await expect(memoryHookCall(service, 'persona.activate', {
      personaId: 'builtin.default-assistant',
    })).resolves.toMatchObject({
      personaId: 'builtin.default-assistant',
      source: 'conversation',
    });
    await expect(memoryHookCall(service, 'memory.save', {
      category: 'preference',
      content: 'User likes pour-over coffee',
      keywords: 'coffee,pour-over',
    })).resolves.toMatchObject({
      category: 'preference',
      content: 'User likes pour-over coffee',
      keywords: ['coffee', 'pour-over'],
    });
    await expect(memoryHookCall(service, 'log.write', {
      level: 'info',
      message: 'memory saved',
      type: 'plugin:memory',
    })).resolves.toBe(true);
    await expect(memoryHookCall(service, 'conversation.messages.list', {})).resolves.toEqual([
      expect.objectContaining({
        content: 'Plugin reply',
      }),
    ]);
    await expect(memoryHookCall(service, 'persona.current.get', {})).resolves.toMatchObject({
      personaId: 'builtin.default-assistant',
      source: 'default',
    });
    await expect(memoryHookCall(service, 'memory.search', {
      query: 'coffee',
    }, { conversationId: undefined })).resolves.toEqual([
      expect.objectContaining({
        content: 'User likes pour-over coffee',
      }),
    ]);
    await expect(memoryPluginCall(service, 'log.list', {})).resolves.toEqual({
      items: [
        expect.objectContaining({
          message: 'memory saved',
          type: 'plugin:memory',
        }),
      ],
      nextCursor: null,
    });
  });

  it('exposes conversation history read, preview and replace through the host facade', async () => {
    const { service } = createFixture({
      permissions: ['conversation:read', 'conversation:write'],
    });

    const history = await memoryHookCall(service, 'conversation.history.get', {});
    expect(history).toEqual({
      conversationId: fixtureConversationId,
      messages: [],
      revision: expect.any(String),
    });

    await expect(memoryHookCall(service, 'conversation.history.preview', {
      messages: [
        {
          content: '压缩摘要',
          createdAt: '2026-04-19T12:00:00.000Z',
          id: 'summary-1',
          metadata: {
            annotations: [
              {
                data: {
                  coveredCount: 3,
                  role: 'summary',
                },
                owner: 'builtin.context-compaction',
                type: 'context-compaction',
                version: '1',
              },
            ],
          },
          parts: [
            {
              text: '压缩摘要',
              type: 'text',
            },
          ],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T12:00:00.000Z',
        },
      ],
    })).resolves.toEqual({
      estimatedTokens: Math.ceil(Buffer.byteLength('assistant\n压缩摘要', 'utf8') / 4),
      messageCount: 1,
      source: 'estimated',
      textBytes: Buffer.byteLength('assistant\n压缩摘要', 'utf8'),
    });

    await expect(memoryHookCall(service, 'conversation.history.replace', {
      expectedRevision: (history as { revision: string }).revision,
      messages: [
        {
          content: '压缩摘要',
          createdAt: '2026-04-19T12:00:00.000Z',
          id: 'summary-1',
          metadata: {
            annotations: [
              {
                data: {
                  coveredCount: 3,
                  role: 'summary',
                },
                owner: 'builtin.context-compaction',
                type: 'context-compaction',
                version: '1',
              },
            ],
          },
          parts: [
            {
              text: '压缩摘要',
              type: 'text',
            },
          ],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T12:00:00.000Z',
        },
      ],
    })).resolves.toEqual({
      changed: true,
      conversationId: fixtureConversationId,
      messages: [
        expect.objectContaining({
          content: '压缩摘要',
          id: 'summary-1',
          metadata: {
            annotations: [
              {
                data: {
                  coveredCount: 3,
                  role: 'summary',
                },
                owner: 'builtin.context-compaction',
                type: 'context-compaction',
                version: '1',
              },
            ],
          },
        }),
      ],
      revision: expect.any(String),
    });
  });
});

function createFixture(input?: {
  permissions?: string[];
}) {
  const pluginPersistenceService = new PluginPersistenceService();
  const pluginBootstrapService = new PluginBootstrapService(
    new PluginGovernanceService(),
    pluginPersistenceService,
  );
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
  fixtureConversationId = (conversationStore.createConversation({
    title: fixtureConversationTitle,
    userId: 'user-1',
  }) as { id: string }).id;
  const llmService = {
    generateText: jest.fn(async (input: {
      messages: Array<{ content: unknown }>;
      modelId?: string;
      providerId?: string;
      transportMode?: string;
    }) => ({
      customBlocks: [
        {
          key: 'reasoning_content',
          kind: 'text',
          value: '先生成标题再输出正文',
        } as const,
      ],
      finishReason: 'stop',
      modelId: input.modelId ?? 'gpt-5.2',
      providerId: input.providerId ?? 'openai',
      text: `Generated: ${readStubLlmText({ messages: input.messages })}`,
      usage: {
        inputTokens: 7,
        outputTokens: 18,
        source: 'provider',
        totalTokens: 25,
      },
      ...(input.transportMode === 'stream-collect'
        ? { customBlockOrigin: 'ai-sdk.raw' as const }
        : { customBlockOrigin: 'ai-sdk.response-body' as const }),
    })),
  };
  const readStubLlmText = (request: { messages: Array<{ content: unknown; role?: string }> }) => {
    const userMessage = [...request.messages].reverse().find((message) => message.role === 'user');
    const content = userMessage?.content ?? request.messages[0]?.content;
    if (typeof content === 'string') {
      return content;
    }
    if (Array.isArray(content)) {
      const textPart = content.find(
        (part): part is { text: string; type: 'text' } =>
          typeof part === 'object'
          && part !== null
          && (part as { type?: unknown }).type === 'text'
          && typeof (part as { text?: unknown }).text === 'string',
      );
      if (textPart) {
        return textPart.text;
      }
    }
    return 'response';
  };
  const subagentRunner = new SubagentRunnerService(
    new AiModelExecutionService(),
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
  (subagentRunner as any).executeSubagent = async ({ request }: any) => ({
    finishReason: 'stop',
    message: {
      content: `Generated: ${readStubLlmText(request)}`,
      role: 'assistant',
    },
    modelId: request.modelId ?? 'gpt-5.2',
    providerId: request.providerId ?? 'openai',
    text: `Generated: ${readStubLlmText(request)}`,
    toolCalls: [],
    toolResults: [],
    usage: {
      inputTokens: 7,
      outputTokens: 18,
      source: 'provider',
      totalTokens: 25,
    },
  });
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
  pluginBootstrapService.registerPlugin({
    fallback: {
      id: 'builtin.memory',
      name: 'Memory',
      runtime: 'local',
    },
    manifest: {
      config: {
        type: 'object',
        items: {
          defaultLimit: {
            defaultValue: 5,
            type: 'int',
          },
        },
      },
      permissions: input?.permissions ?? [],
      tools: [],
      version: '1.0.0',
    } as never,
  });

  return {
    pluginPersistenceService,
    pluginBootstrapService,
    conversationMessages,
    llmService,
    subagentRunner,
    service: (() => {
      const runtimeWorkspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-host-'));
      process.env.GARLIC_CLAW_RUNTIME_WORKSPACES_PATH = runtimeWorkspaceRoot;
      runtimeWorkspaceRoots.push(runtimeWorkspaceRoot);
      const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
      const hostFilesystemBackend = new HostFilesystemBackendService(
        runtimeSessionEnvironmentService,
      );
      const runtimeBackendRoutingService = new RuntimeBackendRoutingService();
      const runtimeCommandService = new RuntimeCommandService([
        new RuntimeJustBashService(runtimeSessionEnvironmentService),
      ], new RuntimeCommandCaptureService(runtimeSessionEnvironmentService));
      const runtimeFilesystemBackendService = new RuntimeFilesystemBackendService(
        [hostFilesystemBackend],
      );
      const runtimeFileFreshnessService = {
        assertCanWrite: jest.fn().mockResolvedValue(undefined),
        rememberRead: jest.fn().mockResolvedValue(undefined),
        withFileLock: jest.fn().mockImplementation(async (_sessionId, _filePath, run) => run()),
      } as never;
      const runtimeToolBackendService = new RuntimeToolBackendService(
        runtimeBackendRoutingService,
        runtimeCommandService,
        runtimeFilesystemBackendService,
      );
      const runtimeToolPermissionService = new RuntimeToolPermissionService(conversationStore);
      const bashToolService = new BashToolService(
        runtimeCommandService,
        runtimeSessionEnvironmentService,
        runtimeToolBackendService,
      );
      const readToolService = new ReadToolService(
        runtimeSessionEnvironmentService,
        runtimeFilesystemBackendService,
        runtimeFileFreshnessService,
      );
      const globToolService = new GlobToolService(
        runtimeSessionEnvironmentService,
        runtimeFilesystemBackendService,
      );
      const grepToolService = new GrepToolService(
        runtimeSessionEnvironmentService,
        runtimeFilesystemBackendService,
      );
      const writeToolService = new WriteToolService(
        runtimeSessionEnvironmentService,
        runtimeFilesystemBackendService,
        runtimeFileFreshnessService,
      );
      const editToolService = new EditToolService(
        runtimeSessionEnvironmentService,
        runtimeFilesystemBackendService,
        runtimeFileFreshnessService,
      );
      const toolGateway = new ToolGatewayService(
        bashToolService,
        editToolService,
        globToolService,
        grepToolService,
        readToolService,
        runtimeFileFreshnessService,
        runtimeFilesystemBackendService,
        runtimeSessionEnvironmentService,
        runtimeToolBackendService,
        runtimeToolPermissionService,
        new RuntimeToolsSettingsService(),
        writeToolService,
      );
      const pluginDispatch = { registerHostCaller: jest.fn() } as never;
      const service = new PluginHostService(
        pluginBootstrapService,
        automationService,
        conversationMessages,
        conversationStore,
        llmService as never,
        aiManagementService,
        new KnowledgeReaderService(),
        pluginDispatch,
        new PluginRuntimeService(),
        toolGateway,
        subagentRunner,
        new UserContextService(),
        new PersonaService(new PersonaStoreService(new ProjectWorktreeRootService()), conversationStore),
      );
      service.onModuleInit();
      return service;
    })(),
  };
}

function callMemory(
  service: PluginHostService,
  method: string,
  params: import('@garlic-claw/shared').JsonObject,
  context: Record<string, unknown>,
) {
  return service.call({
    context: context as never,
    method: method as never,
    params,
    pluginId: 'builtin.memory',
  });
}

function hookContext(extra: Record<string, unknown> = {}) {
  return {
    source: 'chat-hook' as const,
    userId: 'user-1',
    conversationId: fixtureConversationId,
    ...extra,
  };
}

function toolContext(extra: Record<string, unknown> = {}) {
  return {
    source: 'chat-tool' as const,
    userId: 'user-1',
    ...extra,
  };
}

function pluginContext(extra: Record<string, unknown> = {}) {
  return {
    source: 'plugin' as const,
    ...extra,
  };
}

function memoryHookCall(
  service: PluginHostService,
  method: string,
  params: import('@garlic-claw/shared').JsonObject,
  context?: Record<string, unknown>,
) {
  return callMemory(service, method, params, hookContext(context));
}

function memoryPluginCall(
  service: PluginHostService,
  method: string,
  params: import('@garlic-claw/shared').JsonObject,
  context?: Record<string, unknown>,
) {
  return callMemory(service, method, params, pluginContext(context));
}



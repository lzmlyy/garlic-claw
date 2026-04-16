import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AiModelExecutionService } from '../../../src/ai/ai-model-execution.service';
import { AiManagementService } from '../../../src/ai-management/ai-management.service';
import { AiProviderSettingsService } from '../../../src/ai-management/ai-provider-settings.service';
import { AutomationExecutionService } from '../../../src/execution/automation/automation-execution.service';
import { AutomationService } from '../../../src/execution/automation/automation.service';
import { BuiltinPluginRegistryService } from '../../../src/plugin/builtin/builtin-plugin-registry.service';
import { PluginBootstrapService } from '../../../src/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/plugin/persistence/plugin-persistence.service';
import { RuntimeGatewayConnectionLifecycleService } from '../../../src/runtime/gateway/runtime-gateway-connection-lifecycle.service';
import { RuntimeGatewayRemoteTransportService } from '../../../src/runtime/gateway/runtime-gateway-remote-transport.service';
import { RuntimeHostConversationMessageService } from '../../../src/runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostKnowledgeService } from '../../../src/runtime/host/runtime-host-knowledge.service';
import { RuntimeHostPluginDispatchService } from '../../../src/runtime/host/runtime-host-plugin-dispatch.service';
import { RuntimeHostPluginRuntimeService } from '../../../src/runtime/host/runtime-host-plugin-runtime.service';
import { RuntimeHostSubagentRunnerService } from '../../../src/runtime/host/runtime-host-subagent-runner.service';
import { RuntimeHostSubagentTaskStoreService } from '../../../src/runtime/host/runtime-host-subagent-task-store.service';
import { RuntimeHostService } from '../../../src/runtime/host/runtime-host.service';
import { RuntimeHostUserContextService } from '../../../src/runtime/host/runtime-host-user-context.service';

const subagentTaskStorePaths: string[] = [];
let fixtureConversationId = 'conversation-1';
const fixtureConversationTitle = 'Conversation conversation-1';

describe('RuntimeHostService', () => {
  afterEach(() => {
    while (subagentTaskStorePaths.length > 0) {
      const nextPath = subagentTaskStorePaths.pop();
      if (nextPath && fs.existsSync(nextPath)) {
        fs.unlinkSync(nextPath);
      }
    }
    delete process.env.GARLIC_CLAW_SUBAGENT_TASKS_PATH;
  });

  it('rejects unmigrated host methods', async () => {
    const { service } = createFixture();

    await expect(service.call({
      context: hookContext(),
      method: 'plugin.unknown' as never,
      params: {},
      pluginId: 'builtin.memory-context',
    })).rejects.toThrow('Host API plugin.unknown is not implemented in the current server runtime');
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
    const runtimeHostPluginDispatchService = new RuntimeHostPluginDispatchService(
      builtinPluginRegistryService,
      pluginBootstrapService,
      new RuntimeGatewayRemoteTransportService(runtimeGatewayConnectionLifecycleService),
    );
    const runtimeHostService = new RuntimeHostService(
      pluginBootstrapService,
      {} as never,
      {} as never,
      new RuntimeHostConversationRecordService(),
      {} as never,
      new AiManagementService(new AiProviderSettingsService()),
      new RuntimeHostKnowledgeService(),
      runtimeHostPluginDispatchService,
      new RuntimeHostPluginRuntimeService(),
      {} as never,
      new RuntimeHostUserContextService(),
      { findById: jest.fn() } as never,
    );

    (builtinPluginRegistryService as unknown as {
      definitions: Array<Record<string, unknown>>;
    }).definitions = [
      {
        manifest: {
          config: {
            fields: [
              {
                defaultValue: 5,
                key: 'defaultLimit',
                type: 'number',
              },
            ],
          },
          id: 'builtin.host-roundtrip',
          name: 'Host Roundtrip',
          permissions: ['config:read'],
          runtime: 'builtin',
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

    runtimeHostService.onModuleInit();
    pluginBootstrapService.bootstrapBuiltins();

    await expect(
      runtimeHostPluginDispatchService.executeTool({
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
      .rejects.toThrow('Plugin builtin.memory-context is missing permission memory:read');
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
      id: 'gpt-5.4',
      name: 'gpt-5.4',
      providerId: 'openai',
      status: 'active',
    });
    await expect(callMemory(service, 'user.get', {}, hookContext({ conversationId: undefined }))).resolves.toEqual({
      createdAt: expect.any(String),
      email: 'user-1@example.com',
      id: 'user-1',
      role: 'user',
      updatedAt: expect.any(String),
      username: 'user-1',
    });
    await expect(callMemory(service, 'plugin.self.get', {}, pluginContext())).resolves.toMatchObject({
      connected: true,
      defaultEnabled: true,
      id: 'builtin.memory-context',
      name: 'Memory Context',
      runtimeKind: 'builtin',
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
      pluginId: 'builtin.memory-context',
      timeoutMs: 60_000,
    });
    await expect(memoryHookCall(service, 'conversation.session.keep', {
      resetTimeout: false,
      timeoutMs: 30_000,
    })).resolves.toMatchObject({
      conversationId: fixtureConversationId,
      pluginId: 'builtin.memory-context',
      timeoutMs: 90_000,
    });
    await expect(memoryHookCall(service, 'conversation.session.get', {})).resolves.toMatchObject({
      conversationId: fixtureConversationId,
      pluginId: 'builtin.memory-context',
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
      pluginId: 'builtin.memory-context',
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

  it('runs subagent requests and tracks background subagent tasks', async () => {
    jest.useFakeTimers();
    const { service } = createFixture({
      permissions: ['conversation:read', 'conversation:write', 'subagent:run'],
    });

    await expect(memoryPluginCall(service, 'subagent.run', {
      messages: [
        {
          content: '请帮我总结当前对话',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.2',
      providerId: 'openai',
    }, { userId: 'user-1', conversationId: fixtureConversationId })).resolves.toEqual({
      finishReason: 'stop',
      message: {
        content: 'Generated: 请帮我总结当前对话',
        role: 'assistant',
      },
      modelId: 'gpt-5.2',
      providerId: 'openai',
      text: 'Generated: 请帮我总结当前对话',
      toolCalls: [],
      toolResults: [],
      usage: {
        inputTokens: 7,
        outputTokens: 18,
      },
    });
    await memoryPluginCall(service, 'conversation.title.set', {
      title: fixtureConversationTitle,
    }, { userId: 'user-1', conversationId: fixtureConversationId });
    const started = await memoryPluginCall(service, 'subagent.task.start', {
      messages: [
        {
          content: '请帮我总结当前对话',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.2',
      providerId: 'openai',
      writeBack: {
        target: {
          id: fixtureConversationId,
          type: 'conversation',
        },
      },
    }, { userId: 'user-1', conversationId: fixtureConversationId });
    expect(started).toMatchObject({
      id: 'subagent-task-1',
      pluginDisplayName: 'Memory Context',
      status: 'queued',
      writeBackStatus: 'pending',
    });
    await jest.runAllTimersAsync();
    await expect(memoryPluginCall(service, 'subagent.task.list', {}, {
      userId: 'user-1',
      conversationId: fixtureConversationId,
    })).resolves.toEqual([
      expect.objectContaining({
        id: 'subagent-task-1',
        status: 'completed',
      }),
    ]);
    await expect(memoryPluginCall(service, 'subagent.task.get', {
      taskId: 'subagent-task-1',
    }, { userId: 'user-1', conversationId: fixtureConversationId })).resolves.toMatchObject({
      id: 'subagent-task-1',
      result: {
        text: 'Generated: 请帮我总结当前对话',
      },
      status: 'completed',
      writeBackMessageId: expect.any(String),
    });
    await expect(memoryPluginCall(service, 'conversation.messages.list', {}, {
      userId: 'user-1',
      conversationId: fixtureConversationId,
    })).resolves.toEqual([
      expect.objectContaining({
        content: 'Generated: 请帮我总结当前对话',
        id: expect.any(String),
      }),
    ]);
    jest.useRealTimers();
  });

  it('records subagent task failures and write-back failures without fabricating sent status', async () => {
    jest.useFakeTimers();
    const {
      runtimeHostConversationMessageService,
      runtimeHostSubagentRunnerService,
      service,
    } = createFixture({
      permissions: ['subagent:run'],
    });
    runtimeHostConversationMessageService.sendMessage = jest.fn(() => {
      throw new Error('message.send failed');
    });
    const started = await memoryPluginCall(service, 'subagent.task.start', {
      messages: [
        {
          content: '请帮我总结当前对话',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.2',
      providerId: 'openai',
      writeBack: {
        target: {
          id: fixtureConversationId,
          type: 'conversation',
        },
      },
    }, { userId: 'user-1', conversationId: fixtureConversationId });
    expect(started).toMatchObject({
      status: 'queued',
      writeBackStatus: 'pending',
    });
    await jest.runAllTimersAsync();
    await expect(memoryPluginCall(service, 'subagent.task.get', {
      taskId: 'subagent-task-1',
    }, { userId: 'user-1', conversationId: fixtureConversationId })).resolves.toMatchObject({
      status: 'completed',
      writeBackError: 'message.send failed',
      writeBackStatus: 'failed',
    });

    (runtimeHostSubagentRunnerService as any).executeSubagent = async () => {
      throw new Error('subagent failed');
    };
    const failed = await memoryPluginCall(service, 'subagent.task.start', {
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
      id: 'subagent-task-2',
      status: 'queued',
    });
    await jest.runAllTimersAsync();
    await expect(memoryPluginCall(service, 'subagent.task.get', {
      taskId: 'subagent-task-2',
    }, { userId: 'user-1', conversationId: fixtureConversationId })).resolves.toMatchObject({
      error: 'subagent failed',
      status: 'error',
      writeBackStatus: 'skipped',
    });
    jest.useRealTimers();
  });

  it('generates text and assistant output through runtime-owned llm host methods', async () => {
    const { pluginBootstrapService, service } = createFixture({
      permissions: ['llm:generate'],
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.conversation-title',
        name: 'Conversation Title',
        runtime: 'builtin',
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
        },
        pluginId: 'builtin.memory-context',
      }),
    ).resolves.toEqual({
      modelId: 'gpt-5.2',
      providerId: 'openai',
      text: 'Generated: 请为这段对话生成标题',
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
        },
        pluginId: 'builtin.conversation-title',
      }),
    ).resolves.toEqual({
      finishReason: 'stop',
      message: {
        content: 'Generated: 请总结这段对话',
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
      },
    });
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
    await expect(memoryPluginCall(service, 'log.list', {})).resolves.toEqual([
      expect.objectContaining({
        message: 'memory saved',
        type: 'plugin:memory',
      }),
    ]);
  });
});

function createFixture(input?: {
  permissions?: string[];
}) {
  const subagentStorePath = path.join(os.tmpdir(), `gc-server-host-subagent-${Date.now()}-${Math.random()}.json`);
  process.env.GARLIC_CLAW_SUBAGENT_TASKS_PATH = subagentStorePath;
  subagentTaskStorePaths.push(subagentStorePath);
  const pluginBootstrapService = new PluginBootstrapService(
    new PluginGovernanceService(),
    new PluginPersistenceService(),
  );
  const runtimeHostConversationRecordService = new RuntimeHostConversationRecordService();
  const runtimeHostConversationMessageService = new RuntimeHostConversationMessageService(
    runtimeHostConversationRecordService,
  );
  const aiManagementService = new AiManagementService(new AiProviderSettingsService());
  aiManagementService.upsertProvider('openai', {
    apiKey: 'test-openai-key',
    defaultModel: 'gpt-5.4',
    driver: 'openai',
    mode: 'protocol',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });
  const userService = {
    findById: jest.fn(async (userId: string) => ({
      createdAt: '2026-03-28T00:00:00.000Z',
      email: `${userId}@example.com`,
      id: userId,
      role: 'user',
      updatedAt: '2026-03-28T00:00:00.000Z',
      username: userId,
    })),
  } as never;
  fixtureConversationId = (runtimeHostConversationRecordService.createConversation({
    title: fixtureConversationTitle,
    userId: 'user-1',
  }) as { id: string }).id;
  const runtimeHostLlmService = {
    generateText: jest.fn(async (input: {
      messages: Array<{ content: unknown }>;
      modelId?: string;
      providerId?: string;
    }) => ({
      finishReason: 'stop',
      modelId: input.modelId ?? 'gpt-5.2',
      providerId: input.providerId ?? 'openai',
      text: `Generated: ${readStubLlmText({ messages: input.messages })}`,
      usage: {
        inputTokens: 7,
        outputTokens: 18,
      },
    })),
  };
  const readStubLlmText = (request: { messages: Array<{ content: unknown }> }) => {
    const content = request.messages[0]?.content;
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
  const runtimeHostSubagentRunnerService = new RuntimeHostSubagentRunnerService(
    new AiModelExecutionService(),
    runtimeHostConversationMessageService,
    {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      invokeHook: jest.fn(),
    } as never,
    new RuntimeHostSubagentTaskStoreService(),
  );
  (runtimeHostSubagentRunnerService as any).executeSubagent = async ({ request }: any) => ({
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
    },
  });
  const runtimeHostAutomationService = new AutomationService(
    new AutomationExecutionService(
      {
        executeTool: jest.fn(),
        invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
        listPlugins: jest.fn().mockReturnValue([]),
      } as never,
      {
        sendMessage: async () => {
          throw new Error('RuntimeHostConversationMessageService is not available');
        },
      } as never,
    ),
  );
  pluginBootstrapService.registerPlugin({
    fallback: {
      id: 'builtin.memory-context',
      name: 'Memory Context',
      runtime: 'builtin',
    },
    manifest: {
      config: {
        fields: [
          {
            defaultValue: 5,
            key: 'defaultLimit',
            type: 'number',
          },
        ],
      },
      permissions: input?.permissions ?? [],
      tools: [],
      version: '1.0.0',
    } as never,
  });

  return {
    pluginBootstrapService,
    runtimeHostConversationMessageService,
    runtimeHostSubagentRunnerService,
    service: (() => {
      const runtimeHostPluginDispatchService = { registerHostCaller: jest.fn() } as never;
      const service = new RuntimeHostService(
        pluginBootstrapService,
        runtimeHostAutomationService,
        runtimeHostConversationMessageService,
        runtimeHostConversationRecordService,
        runtimeHostLlmService as never,
        aiManagementService,
        new RuntimeHostKnowledgeService(),
        runtimeHostPluginDispatchService,
        new RuntimeHostPluginRuntimeService(),
        runtimeHostSubagentRunnerService,
        new RuntimeHostUserContextService(),
        userService,
      );
      service.onModuleInit();
      return service;
    })(),
  };
}

function callMemory(
  service: RuntimeHostService,
  method: string,
  params: import('@garlic-claw/shared').JsonObject,
  context: Record<string, unknown>,
) {
  return service.call({
    context: context as never,
    method: method as never,
    params,
    pluginId: 'builtin.memory-context',
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
  service: RuntimeHostService,
  method: string,
  params: import('@garlic-claw/shared').JsonObject,
  context?: Record<string, unknown>,
) {
  return callMemory(service, method, params, hookContext(context));
}

function memoryPluginCall(
  service: RuntimeHostService,
  method: string,
  params: import('@garlic-claw/shared').JsonObject,
  context?: Record<string, unknown>,
) {
  return callMemory(service, method, params, pluginContext(context));
}

const mockStepCountIs = jest.fn((count: number) => `stop-${count}`);
const mockStreamText = jest.fn();
const mockOpenAiChat = jest.fn(() => ({ id: 'mock-model' }));
const mockCreateOpenAI = jest.fn(() => ({ chat: mockOpenAiChat }));

jest.mock('ai', () => ({
  stepCountIs: mockStepCountIs,
  streamText: mockStreamText,
}));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: mockCreateOpenAI,
}));

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AiModelExecutionService } from '../../../src/ai/ai-model-execution.service';
import { AiProviderSettingsService } from '../../../src/ai-management/ai-provider-settings.service';
import { PluginBootstrapService } from '../../../src/plugin/bootstrap/plugin-bootstrap.service';
import { PluginGovernanceService } from '../../../src/plugin/governance/plugin-governance.service';
import { PluginPersistenceService } from '../../../src/plugin/persistence/plugin-persistence.service';
import { RuntimeHostConversationMessageService } from '../../../src/runtime/host/runtime-host-conversation-message.service';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';
import { RuntimeHostSubagentRunnerService } from '../../../src/runtime/host/runtime-host-subagent-runner.service';
import { RuntimeHostSubagentTaskStoreService } from '../../../src/runtime/host/runtime-host-subagent-task-store.service';

describe('RuntimeHostSubagentRunnerService', () => {
  let storagePath: string;

  beforeEach(() => {
    jest.clearAllMocks();
    storagePath = path.join(os.tmpdir(), `gc-server-runner-${Date.now()}-${Math.random()}.json`);
    process.env.GARLIC_CLAW_SUBAGENT_TASKS_PATH = storagePath;
    mockStreamText.mockReturnValue({
      finishReason: Promise.resolve('stop'),
      fullStream: (async function* () {
        yield {
          toolCallId: 'tool-call-1',
          toolName: 'memory.search',
          input: {
            query: 'coffee',
          },
          type: 'tool-call',
        };
        yield {
          toolCallId: 'tool-call-1',
          toolName: 'memory.search',
          output: {
            items: [{ id: 'memory-1' }],
          },
          type: 'tool-result',
        };
        yield {
          text: 'Done',
          type: 'text-delta',
        };
      })(),
    });
  });

  afterEach(() => {
    delete process.env.GARLIC_CLAW_SUBAGENT_TASKS_PATH;
    if (fs.existsSync(storagePath)) {
      fs.unlinkSync(storagePath);
    }
  });

  it('runs a real subagent stream with tool filter and step limit', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'builtin',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.echo',
        name: 'Remote Echo',
        runtime: 'remote',
      },
      manifest: {
        permissions: [],
        tools: [
          {
            description: 'search memory',
            name: 'memory.search',
            parameters: {
              query: {
                required: true,
                type: 'string',
              },
            },
          },
          {
            description: 'inspect web',
            name: 'web.search',
            parameters: {},
          },
        ],
        version: '1.0.0',
      } as never,
    });

    const runtimeGatewayService = {
      createRemoteTransport: jest.fn(() => ({
        executeTool: jest.fn().mockResolvedValue({
          items: [{ id: 'memory-1' }],
        }),
      })),
    };
    const conversationMessageService = new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService());
    const aiModelExecutionService = createAiModelExecutionService();
    const runner = new RuntimeHostSubagentRunnerService(
      aiModelExecutionService,
      conversationMessageService,
      {
        buildToolSet: jest.fn().mockResolvedValue({
          'memory.search': {},
        }),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentTaskStoreService(),
    );

    const result = await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      maxSteps: 3,
      messages: [
        {
          content: 'summarize this conversation',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      toolNames: ['memory.search'],
    });
    expect(result).toEqual({
      finishReason: 'stop',
      message: {
        content: 'Done',
        role: 'assistant',
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'Done',
      toolCalls: [
        {
          input: {
            query: 'coffee',
          },
          toolCallId: 'tool-call-1',
          toolName: 'memory.search',
        },
      ],
      toolResults: [
        {
          output: {
            items: [{ id: 'memory-1' }],
          },
          toolCallId: 'tool-call-1',
          toolName: 'memory.search',
        },
      ],
    });

    expect(mockStepCountIs).toHaveBeenCalledWith(3);
    expect(mockOpenAiChat).toHaveBeenCalledWith('gpt-5.4');
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      stopWhen: 'stop-3',
      tools: expect.objectContaining({
        'memory.search': expect.any(Object),
      }),
    }));
    expect(mockStreamText.mock.calls[0][0].tools).not.toHaveProperty('web.search');
  });

  it('runs remote subagent before/after hooks around the execution payload', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'builtin',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.hooker',
        name: 'Remote Hooker',
        runtime: 'remote',
      },
      governance: {
        defaultEnabled: true,
      },
      manifest: {
        hooks: [
          { name: 'subagent:before-run' },
          { name: 'subagent:after-run' },
        ],
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const runtimeGatewayService = {
      createRemoteTransport: jest.fn(() => ({
        executeTool: jest.fn(),
      })),
    };
    const conversationMessageService = new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService());
    const aiModelExecutionService = createAiModelExecutionService();
    const toolRegistryService = {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeKernelService = {
      invokeHook: jest.fn().mockImplementation(async ({ hookName }) =>
        hookName === 'subagent:before-run'
          ? {
              action: 'mutate',
              messages: [
                {
                  content: 'mutated prompt',
                  role: 'user',
                },
              ],
              toolNames: ['memory.search'],
            }
          : {
              action: 'mutate',
              text: 'Hooked result',
            }),
      listPlugins: () => pluginBootstrapService.listPlugins(),
    };
    const runner = new RuntimeHostSubagentRunnerService(
      aiModelExecutionService,
      conversationMessageService,
      toolRegistryService as never,
      runtimeKernelService as never,
      new RuntimeHostSubagentTaskStoreService(),
    );

    const hookedResult = await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'original prompt',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    expect(hookedResult).toMatchObject({
      text: 'Hooked result',
    });

    expect(runtimeKernelService.invokeHook).toHaveBeenCalledTimes(2);
    expect(runtimeKernelService.invokeHook.mock.calls[1][0].hookName).toBe('subagent:after-run');
    await expect(runtimeKernelService.invokeHook.mock.results[1].value).resolves.toEqual({
      action: 'mutate',
      text: 'Hooked result',
    });
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        {
          content: 'mutated prompt',
          role: 'user',
        },
      ],
    }));
    expect(toolRegistryService.buildToolSet).toHaveBeenCalledWith(expect.objectContaining({
      allowedToolNames: ['memory.search'],
    }));
  });

  it('runs builtin subagent hooks through the same hook chain', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'builtin',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.subagent-observer',
        name: 'Builtin Hooker',
        runtime: 'builtin',
      },
      governance: {
        defaultEnabled: true,
      },
      manifest: {
        hooks: [
          { name: 'subagent:before-run' },
          { name: 'subagent:after-run' },
        ],
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const toolRegistryService = {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    };
    const runtimeKernelService = {
      invokeHook: jest.fn().mockImplementation(async ({ hookName }) =>
        hookName === 'subagent:before-run'
          ? {
              action: 'mutate',
              messages: [
                {
                  content: 'builtin mutated prompt',
                  role: 'user',
                },
              ],
            }
          : {
              action: 'mutate',
              text: 'Builtin hooked result',
            }),
      listPlugins: () => pluginBootstrapService.listPlugins(),
    };
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      toolRegistryService as never,
      runtimeKernelService as never,
      new RuntimeHostSubagentTaskStoreService(),
    );

    const result = await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'original prompt',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    expect(result).toMatchObject({
      text: 'Builtin hooked result',
    });
    expect(runtimeKernelService.invokeHook).toHaveBeenCalledTimes(2);
    expect(runtimeKernelService.invokeHook.mock.calls[0][0]).toMatchObject({
      hookName: 'subagent:before-run',
      pluginId: 'builtin.subagent-observer',
    });
    expect(runtimeKernelService.invokeHook.mock.calls[1][0]).toMatchObject({
      hookName: 'subagent:after-run',
      pluginId: 'builtin.subagent-observer',
    });
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        {
          content: 'builtin mutated prompt',
          role: 'user',
        },
      ],
    }));
  });

  it('ignores hooks when the plugin is disabled for the current conversation scope', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'builtin',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'remote.hooker',
        name: 'Remote Hooker',
        runtime: 'remote',
      },
      manifest: {
        hooks: [{ name: 'subagent:before-run' }],
        permissions: [],
        tools: [],
        version: '1.0.0',
      } as never,
    });
    const persisted = (pluginBootstrapService as unknown as {
      pluginPersistenceService: PluginPersistenceService;
    }).pluginPersistenceService;
    persisted.upsertPlugin({
      connected: true,
      conversationScopes: {
        'conversation-1': false,
      },
      defaultEnabled: true,
      governance: { canDisable: true } as never,
      lastSeenAt: new Date().toISOString(),
      manifest: pluginBootstrapService.getPlugin('remote.hooker').manifest,
      pluginId: 'remote.hooker',
    });

    const runtimeKernelService = {
      invokeHook: jest.fn(),
      listPlugins: () => pluginBootstrapService.listPlugins(),
    };
    const runner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      runtimeKernelService as never,
      new RuntimeHostSubagentTaskStoreService(),
    );
    (runner as any).executeSubagent = async ({ request }: any) => ({
      finishReason: 'stop',
      message: {
        content: String(request.messages[0]?.content ?? ''),
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: String(request.messages[0]?.content ?? ''),
      toolCalls: [],
      toolResults: [],
    });

    await runner.runSubagent('builtin.memory-context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'original prompt',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    expect(runtimeKernelService.invokeHook).not.toHaveBeenCalled();
  });

  it('resumes queued tasks after restart and completes them', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'builtin',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const originalRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentTaskStoreService(),
    );
    originalRunner.startTask('builtin.memory-context', 'Memory Context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'resume me',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });

    const resumedRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentTaskStoreService(),
    );
    (resumedRunner as any).executeSubagent = async ({ request }: any) => ({
      finishReason: 'stop',
      message: {
        content: String(request.messages[0]?.content ?? ''),
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: String(request.messages[0]?.content ?? ''),
      toolCalls: [],
      toolResults: [],
    });

    resumedRunner.resumePendingTasks();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resumedRunner.getTask('builtin.memory-context', 'subagent-task-1')).toMatchObject({
      id: 'subagent-task-1',
      result: {
        text: 'resume me',
      },
      status: 'completed',
    });
  });

  it('does not fabricate write-back success when the target conversation no longer exists after restart', async () => {
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'builtin',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    const originalRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentTaskStoreService(),
    );
    await originalRunner.startTask('builtin.memory-context', 'Memory Context', {
      conversationId: 'conversation-1',
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'resume write-back',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      writeBack: {
        target: {
          id: 'conversation-1',
          type: 'conversation',
        },
      },
    });

    const resumedRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(new RuntimeHostConversationRecordService()),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentTaskStoreService(),
    );
    (resumedRunner as any).executeSubagent = async ({ request }: any) => ({
      finishReason: 'stop',
      message: {
        content: String(request.messages[0]?.content ?? ''),
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: String(request.messages[0]?.content ?? ''),
      toolCalls: [],
      toolResults: [],
    });

    resumedRunner.resumePendingTasks();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resumedRunner.getTask('builtin.memory-context', 'subagent-task-1')).toMatchObject({
      id: 'subagent-task-1',
      status: 'completed',
      writeBackError: 'Conversation not found: conversation-1',
      writeBackStatus: 'failed',
    });
  });

  it('does not treat a recreated conversation with the same id as a valid write-back target after restart', async () => {
    const conversationEnvKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
    const taskEnvKey = 'GARLIC_CLAW_SUBAGENT_TASKS_PATH';
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const originalConversationPath = path.join(process.cwd(), 'tmp', `runtime-host-subagent-runner.original-conversations.${suffix}.json`);
    const resumedConversationPath = path.join(process.cwd(), 'tmp', `runtime-host-subagent-runner.resumed-conversations.${suffix}.json`);
    const taskPath = path.join(process.cwd(), 'tmp', `runtime-host-subagent-runner.tasks.${suffix}.json`);
    const pluginBootstrapService = new PluginBootstrapService(
      new PluginGovernanceService(),
      new PluginPersistenceService(),
    );
    pluginBootstrapService.registerPlugin({
      fallback: {
        id: 'builtin.memory-context',
        name: 'Memory Context',
        runtime: 'builtin',
      },
      manifest: {
        permissions: ['subagent:run'],
        tools: [],
        version: '1.0.0',
      } as never,
    });

    process.env[taskEnvKey] = taskPath;
    process.env[conversationEnvKey] = originalConversationPath;
    const originalConversationService = new RuntimeHostConversationRecordService();
    const originalConversationId = (originalConversationService.createConversation({
      title: 'Conversation conversation-1',
    }) as { id: string }).id;
    const originalRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(originalConversationService),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentTaskStoreService(),
    );
    await originalRunner.startTask('builtin.memory-context', 'Memory Context', {
      conversationId: originalConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [
        {
          content: 'resume recreated conversation',
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      writeBack: {
        target: {
          id: originalConversationId,
          type: 'conversation',
        },
      },
    });

    process.env[conversationEnvKey] = resumedConversationPath;
    const recreatedConversation = {
      ...originalConversationService.requireConversation(originalConversationId),
      revision: `${originalConversationId}:recreated:1`,
      revisionVersion: 1,
      updatedAt: '2026-04-14T00:00:00.000Z',
    };
    fs.writeFileSync(resumedConversationPath, JSON.stringify({
      conversations: {
        [originalConversationId]: recreatedConversation,
      },
    }, null, 2), 'utf-8');
    const resumedConversationService = new RuntimeHostConversationRecordService();
    const resumedRunner = new RuntimeHostSubagentRunnerService(
      createAiModelExecutionService(),
      new RuntimeHostConversationMessageService(resumedConversationService),
      {
        buildToolSet: jest.fn().mockResolvedValue(undefined),
      } as never,
      {
        invokeHook: jest.fn(),
        listPlugins: () => pluginBootstrapService.listPlugins(),
      } as never,
      new RuntimeHostSubagentTaskStoreService(),
    );
    (resumedRunner as any).executeSubagent = async ({ request }: any) => ({
      finishReason: 'stop',
      message: {
        content: String(request.messages[0]?.content ?? ''),
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: String(request.messages[0]?.content ?? ''),
      toolCalls: [],
      toolResults: [],
    });

    resumedRunner.resumePendingTasks();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(resumedRunner.getTask('builtin.memory-context', 'subagent-task-1')).toMatchObject({
      id: 'subagent-task-1',
      status: 'completed',
      writeBackError: `Conversation revision changed: ${originalConversationId}`,
      writeBackStatus: 'failed',
    });
    delete process.env[conversationEnvKey];
    delete process.env[taskEnvKey];
    try {
      if (fs.existsSync(originalConversationPath)) fs.unlinkSync(originalConversationPath);
      if (fs.existsSync(resumedConversationPath)) fs.unlinkSync(resumedConversationPath);
      if (fs.existsSync(taskPath)) fs.unlinkSync(taskPath);
    } catch {}
  });
});

function createAiModelExecutionService(): AiModelExecutionService {
  const aiProviderSettingsService = new AiProviderSettingsService();
  aiProviderSettingsService.upsertProvider('openai', {
    apiKey: 'test-openai-key',
    baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-5.4',
    driver: 'openai',
    mode: 'protocol',
    models: ['gpt-5.4'],
    name: 'OpenAI',
  });

  return new AiModelExecutionService(aiProviderSettingsService);
}

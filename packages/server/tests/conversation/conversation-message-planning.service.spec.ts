import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createConversationHistorySignatureFromHistoryMessages } from '../../src/modules/conversation/conversation-history-signature';
import { ConversationAfterResponseCompactionService } from '../../src/modules/conversation/conversation-after-response-compaction.service';
import { ConversationMessagePlanningService } from '../../src/modules/conversation/conversation-message-planning.service';
import { ContextGovernanceService } from '../../src/modules/conversation/context-governance.service';
import { ContextGovernanceSettingsService } from '../../src/modules/conversation/context-governance-settings.service';
import { ConversationStoreService } from '../../src/modules/runtime/host/conversation-store.service';

describe('ConversationMessagePlanningService', () => {
  const aiManagementService = {
    getDefaultProviderSelection: jest.fn(),
    getProvider: jest.fn(),
    getProviderModel: jest.fn(),
    listProviders: jest.fn(),
  };
  const aiModelExecutionService = {
    generateText: jest.fn(),
    streamText: jest.fn(),
  };
  const aiVisionService = { resolveMessageParts: jest.fn() };
  const personaService = { readCurrentPersona: jest.fn() };
  const pluginDispatch = { invokeHook: jest.fn(), listPlugins: jest.fn().mockReturnValue([]) };
  const toolRegistryService = { buildToolSet: jest.fn(), listAvailableTools: jest.fn() };

  let settingsConfigPath: string;
  let conversationsPath: string;
  let conversationId: string;
  let conversationAfterResponseCompactionService: ConversationAfterResponseCompactionService;
  let contextGovernanceService: ContextGovernanceService;
  let contextGovernanceSettingsService: ContextGovernanceSettingsService;
  let conversationStore: ConversationStoreService;
  let service: ConversationMessagePlanningService;

  beforeEach(() => {
    jest.clearAllMocks();
    settingsConfigPath = path.join(
      os.tmpdir(),
      `settings-planning.spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    conversationsPath = path.join(
      os.tmpdir(),
      `conversation-message-planning.spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = settingsConfigPath;
    process.env.GARLIC_CLAW_CONVERSATIONS_PATH = conversationsPath;
    aiManagementService.getDefaultProviderSelection.mockReturnValue({ modelId: 'gpt-5.4', providerId: 'openai', source: 'default' });
    aiManagementService.getProvider.mockReturnValue({ defaultModel: 'gpt-5.4', id: 'openai', models: ['gpt-5.4'] });
    aiManagementService.getProviderModel.mockReturnValue({
      capabilities: {
        input: { image: false, text: true },
        output: { image: false, text: true },
        reasoning: false,
        toolCall: true,
      },
      contextLength: 512,
      id: 'gpt-5.4',
      name: 'gpt-5.4',
      providerId: 'openai',
      status: 'active',
    });
    aiManagementService.listProviders.mockReturnValue([{ id: 'openai' }]);
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: '压缩后的历史摘要',
    });
    conversationStore = new ConversationStoreService();
    contextGovernanceSettingsService = new ContextGovernanceSettingsService();
    contextGovernanceService = new ContextGovernanceService(
      aiManagementService as never,
      aiModelExecutionService as never,
      contextGovernanceSettingsService,
      conversationStore,
    );
    conversationAfterResponseCompactionService = new ConversationAfterResponseCompactionService(
      contextGovernanceService,
      conversationStore,
    );
    conversationId = (conversationStore.createConversation({ title: '窗口预览', userId: 'user-1' }) as { id: string }).id;
    service = new ConversationMessagePlanningService(
      aiModelExecutionService as never,
      aiVisionService as never,
      conversationAfterResponseCompactionService,
      contextGovernanceService,
      conversationStore,
      personaService as never,
      toolRegistryService as never,
      pluginDispatch as never,
    );
  });

  afterEach(() => {
    delete process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
    delete process.env.GARLIC_CLAW_CONVERSATIONS_PATH;
    for (const filePath of [settingsConfigPath, conversationsPath]) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch {
        // 忽略临时配置文件清理失败，避免影响测试主语义。
      }
    }
  });

  it('returns a sliding context window preview using the full configured context length budget', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        keepRecentMessages: 1,
        reservedTokens: 256,
        slidingWindowUsagePercent: 50,
        strategy: 'sliding',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'user', 'a'.repeat(220)),
      createMessage('history-2', 'assistant', 'b'.repeat(220)),
      createMessage('history-3', 'user', 'c'.repeat(220)),
    ]);

    await expect(service.getContextWindowPreview({ conversationId, modelId: 'gpt-5.4', providerId: 'openai', userId: 'user-1' })).resolves.toEqual(expect.objectContaining({
      contextLength: 512,
      enabled: true,
      excludedMessageIds: [],
      frontendMessageWindowSize: 200,
      includedMessageIds: ['history-1', 'history-2', 'history-3'],
      keepRecentMessages: 1,
      slidingWindowUsagePercent: 50,
      source: 'estimated',
      strategy: 'sliding',
    }));
  });

  it('routes /compact through the unified compaction owner instead of ContextGovernanceService command handling', async () => {
    const compactionOwnerSpy = jest.spyOn(conversationAfterResponseCompactionService, 'applyMessageReceived');

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-5.4',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'openai',
      userId: 'user-1',
    });

    expect(compactionOwnerSpy).toHaveBeenCalledWith({
      content: '/compact',
      conversationId,
      modelId: 'gpt-5.4',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'openai',
      userId: 'user-1',
    });
    expect(result).toEqual(expect.objectContaining({
      action: 'deferred-short-circuit',
      content: '/compact',
      deferred: expect.objectContaining({
        commandId: 'internal.context-governance:/compact:command',
        execute: expect.any(Function),
      }),
      modelId: 'gpt-5.4',
      providerId: 'openai',
    }));
  });

  it('returns summary context preview from rewritten history and excludes covered messages', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        keepRecentMessages: 2,
        strategy: 'summary',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '第一条历史消息', {
        annotations: [{
          data: {
            compactionId: 'compaction-1',
            coveredAt: '2026-04-25T00:00:00.000Z',
            markerVisible: true,
            role: 'covered',
            summaryMessageId: 'summary-1',
          },
          owner: 'conversation.context-governance',
          type: 'context-compaction',
          version: '1',
        }],
      }),
      createMessage('history-2', 'assistant', '第二条历史回复', {
        annotations: [{
          data: {
            compactionId: 'compaction-1',
            coveredAt: '2026-04-25T00:00:00.000Z',
            markerVisible: true,
            role: 'covered',
            summaryMessageId: 'summary-1',
          },
          owner: 'conversation.context-governance',
          type: 'context-compaction',
          version: '1',
        }],
      }),
      createMessage('summary-1', 'display', '压缩后的历史摘要', {
        annotations: [{
          data: {
            afterPreview: { estimatedTokens: 16, messageCount: 2, source: 'estimated', textBytes: 64 },
            beforePreview: { estimatedTokens: 32, messageCount: 3, source: 'estimated', textBytes: 128 },
            compactionId: 'compaction-1',
            coveredCount: 2,
            createdAt: '2026-04-25T00:00:00.000Z',
            modelId: 'gpt-5.4',
            providerId: 'openai',
            role: 'summary',
            trigger: 'manual',
          },
          owner: 'conversation.context-governance',
          type: 'context-compaction',
          version: '1',
        }],
      }),
      createMessage('history-3', 'user', '请基于摘要继续回答'),
    ]);

    await expect(service.getContextWindowPreview({ conversationId, userId: 'user-1' })).resolves.toEqual(expect.objectContaining({
      contextLength: 512,
      enabled: true,
      excludedMessageIds: ['history-1', 'history-2'],
      frontendMessageWindowSize: 200,
      includedMessageIds: ['summary-1', 'history-3'],
      keepRecentMessages: 2,
      slidingWindowUsagePercent: 50,
      strategy: 'summary',
    }));
  });

  it('falls back to plain history when context compaction is disabled', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        enabled: false,
        strategy: 'sliding',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '第一条消息'),
      createMessage('summary-1', 'display', '摘要展示壳'),
      createMessage('history-2', 'assistant', '第二条消息'),
    ]);

    await expect(service.getContextWindowPreview({ conversationId, userId: 'user-1' })).resolves.toEqual(expect.objectContaining({
      contextLength: 512,
      enabled: false,
      estimatedTokens: 12,
      excludedMessageIds: [],
      frontendMessageWindowSize: 200,
      includedMessageIds: ['history-1', 'history-2'],
      keepRecentMessages: 0,
      source: 'estimated',
      slidingWindowUsagePercent: 50,
      strategy: 'sliding',
    }));
  });

  it('sanitizes preview messages before estimating tokens', async () => {
    conversationStore.replaceMessages(conversationId, [
      {
        content: '第一条消息',
        createdAt: '2026-04-25T00:00:00.000Z',
        id: 'history-1',
        parts: [
          { text: '第一条消息', type: 'text' as const },
          undefined as unknown as { text: string; type: 'text' },
        ],
        role: 'user',
        status: 'completed',
        toolCalls: [
          { name: 'ok' },
          undefined as unknown as { name: string },
        ],
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ]);

    await expect(service.getContextWindowPreview({ conversationId, userId: 'user-1' })).resolves.toEqual(expect.objectContaining({
      enabled: true,
      excludedMessageIds: [],
      includedMessageIds: ['history-1'],
      strategy: 'summary',
    }));
  });

  it('prefers the last matching response usage annotation for context window preview tokens', async () => {
    const responseHistorySignature = createConversationHistorySignatureFromHistoryMessages([
      {
        content: '第一条消息',
        createdAt: '2026-04-25T00:00:00.000Z',
        id: 'history-1',
        parts: [{ text: '第一条消息', type: 'text' }],
        role: 'user',
        status: 'completed',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        content: '第二条消息',
        createdAt: '2026-04-25T00:00:00.000Z',
        id: 'history-2',
        parts: [{ text: '第二条消息', type: 'text' }],
        role: 'assistant',
        status: 'completed',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ]);
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '第一条消息'),
      createMessage('history-2', 'assistant', '第二条消息', {
        annotations: [{
          data: {
            inputTokens: 88,
            modelId: 'gpt-5.4',
            outputTokens: 12,
            providerId: 'openai',
            responseHistorySignature,
            source: 'provider',
            totalTokens: 100,
          },
          owner: 'conversation.model-usage',
          type: 'model-usage',
          version: '1',
        }],
      }),
    ]);

    await expect(service.getContextWindowPreview({
      conversationId,
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    })).resolves.toEqual(expect.objectContaining({
      estimatedTokens: 100,
      includedMessageIds: ['history-1', 'history-2'],
      source: 'provider',
    }));
  });

  it('falls back to the last matching provider usage when provider usage belongs to an old history snapshot', async () => {
    const staleSignature = createConversationHistorySignatureFromHistoryMessages([
      {
        content: '旧消息',
        createdAt: '2026-04-24T00:00:00.000Z',
        id: 'stale-history',
        parts: [{ text: '旧消息', type: 'text' }],
        role: 'assistant',
        status: 'completed',
        updatedAt: '2026-04-24T00:00:00.000Z',
      },
    ]);
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '现在的第一条消息'),
      createMessage('history-2', 'assistant', '现在的第二条消息', {
        annotations: [{
          data: {
            inputTokens: 88,
            modelId: 'gpt-5.4',
            outputTokens: 12,
            providerId: 'openai',
            responseHistorySignature: staleSignature,
            source: 'provider',
            totalTokens: 100,
          },
          owner: 'conversation.model-usage',
          type: 'model-usage',
          version: '1',
        }],
      }),
    ]);

    await expect(service.getContextWindowPreview({
      conversationId,
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    })).resolves.toEqual(expect.objectContaining({
      estimatedTokens: 100,
      includedMessageIds: ['history-1', 'history-2'],
      source: 'provider',
    }));
  });

  it('keeps the model message chain unchanged when session todo changes', async () => {
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'assistant', '先前回复'),
      createMessage('history-2', 'user', '当前问题'),
    ]);
    personaService.readCurrentPersona.mockReturnValue({
      beginDialogs: [],
      customErrorMessage: null,
      personaId: 'builtin.default-assistant',
      prompt: '你是测试助手',
      toolNames: null,
    });
    toolRegistryService.buildToolSet.mockResolvedValue(undefined);
    aiModelExecutionService.streamText.mockReturnValue({
      finishReason: undefined,
      fullStream: (async function* () { yield { text: 'ok', type: 'text-delta' as const }; })(),
      modelId: 'gpt-5.4',
      providerId: 'openai',
      usage: undefined,
    });

    await service.createStreamPlan({
      abortSignal: new AbortController().signal,
      conversationId,
      messageId: 'assistant-pending',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    });

    expect(aiModelExecutionService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        expect.objectContaining({ role: 'assistant' }),
        expect.objectContaining({ role: 'user' }),
      ],
      system: '你是测试助手',
    }));
  });

  it('includes compact tool and subagent facts in the next model request history', async () => {
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '请先创建子代理，再总结执行结果。'),
      {
        content: '子代理已经完成。',
        createdAt: '2026-05-02T12:00:00.000Z',
        id: 'history-2',
        parts: [{ text: '子代理已经完成。', type: 'text' as const }],
        role: 'assistant',
        status: 'completed',
        toolCalls: [
          {
            input: {
              description: '探索 smoke 流程',
              prompt: '请总结 smoke-http-flow 的用途',
              subagentType: 'general',
            },
            toolCallId: 'call-subagent-1',
            toolName: 'spawn_subagent',
          },
          {
            input: {
              conversationId: '019ddd0a-1234-7890-abcd-ef1234567890',
            },
            toolCallId: 'call-subagent-2',
            toolName: 'wait_subagent',
          },
        ],
        toolResults: [
          {
            output: {
              conversationId: '019ddd0a-1234-7890-abcd-ef1234567890',
              status: 'queued',
              title: 'Smoke Agent',
            },
            toolCallId: 'call-subagent-1',
            toolName: 'spawn_subagent',
          },
          {
            output: {
              conversationId: '019ddd0a-1234-7890-abcd-ef1234567890',
              result: 'Smoke HTTP Flow 用于后端烟测。',
              status: 'completed',
              title: 'Smoke Agent',
            },
            toolCallId: 'call-subagent-2',
            toolName: 'wait_subagent',
          },
        ],
        updatedAt: '2026-05-02T12:00:00.000Z',
      },
    ]);
    personaService.readCurrentPersona.mockReturnValue({
      beginDialogs: [],
      customErrorMessage: null,
      personaId: 'builtin.default-assistant',
      prompt: '你是测试助手',
      toolNames: null,
    });
    toolRegistryService.buildToolSet.mockResolvedValue(undefined);
    aiModelExecutionService.streamText.mockReturnValue({
      finishReason: undefined,
      fullStream: (async function* () { yield { text: 'ok', type: 'text-delta' as const }; })(),
      modelId: 'gpt-5.4',
      providerId: 'openai',
      usage: undefined,
    });

    await service.createStreamPlan({
      abortSignal: new AbortController().signal,
      conversationId,
      messageId: 'assistant-pending',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    });

    expect(aiModelExecutionService.streamText).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('spawn_subagent'),
          role: 'assistant',
        }),
        expect.objectContaining({
          content: expect.stringContaining('Smoke HTTP Flow 用于后端烟测。'),
          role: 'assistant',
        }),
      ]),
    }));
  });

  it('passes provider usage through the stream plan so completed replies can write model usage annotations', async () => {
    personaService.readCurrentPersona.mockReturnValue({
      beginDialogs: [],
      customErrorMessage: null,
      personaId: 'builtin.default-assistant',
      prompt: '你是测试助手',
      toolNames: null,
    });
    toolRegistryService.buildToolSet.mockResolvedValue(undefined);
    aiModelExecutionService.streamText.mockReturnValue({
      finishReason: Promise.resolve('stop'),
      fullStream: (async function* () {
        yield { text: 'ok', type: 'text-delta' as const };
      })(),
      modelId: 'deepseek-v4-flash',
      providerId: 'ds2api',
      usage: Promise.resolve({
        cachedInputTokens: 0,
        inputTokens: 273,
        outputTokens: 291,
        source: 'provider',
        totalTokens: 564,
      }),
    });

    const plan = await service.createStreamPlan({
      abortSignal: new AbortController().signal,
      conversationId,
      messageId: 'assistant-pending',
      modelId: 'deepseek-v4-flash',
      providerId: 'ds2api',
      userId: 'user-1',
    });

    await expect(plan.stream.usage).resolves.toEqual({
      cachedInputTokens: 0,
      inputTokens: 273,
      outputTokens: 291,
      source: 'provider',
      totalTokens: 564,
    });
  });

  it('compacts history immediately after a completed model reply is sent', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 30,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '第一条较长的历史消息，用于触发回复后压缩检查。'.repeat(4)),
      createMessage('history-2', 'assistant', '第二条较长的历史回复，用于确保压缩候选存在。'.repeat(4)),
      createMessage('history-3', 'user', '第三条消息，表示本轮提问。'.repeat(4)),
      createMessage('assistant-final', 'assistant', '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(4)),
    ]);

    const afterSend = await service.broadcastAfterSend(
      { conversationId, userId: 'user-1' },
      {
        assistantMessageId: 'assistant-final',
        content: '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(4),
        continuationState: {
          hasAssistantTextOutput: true,
          hasToolActivity: false,
        },
        conversationId,
        modelId: 'gpt-5.4',
        parts: [{ text: '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(4), type: 'text' }],
        providerId: 'openai',
        toolCalls: [],
        toolResults: [],
      },
      'model',
    );

    expect(afterSend).toEqual({
      compactionTriggered: true,
      continuation: {
        content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
        metadata: expect.objectContaining({
          annotations: expect.arrayContaining([
            expect.objectContaining({
              owner: 'conversation.context-governance',
              type: 'context-compaction',
            }),
          ]),
        }),
        parts: [{ text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.', type: 'text' }],
      },
    });

    const history = conversationStore.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string; metadata?: { annotations?: Array<{ data?: Record<string, unknown>; owner?: string; type?: string }> }; role: string }>;
    };
    const summaryMessage = history.messages.find((message) => message.content === '压缩后的历史摘要');
    expect(summaryMessage?.role).toBe('display');
    expect(summaryMessage?.metadata?.annotations?.some((annotation) =>
      annotation.owner === 'conversation.context-governance'
      && annotation.type === 'context-compaction'
      && annotation.data?.role === 'summary')).toBe(true);
  });

  it('prunes old tool outputs after a completed model reply is sent', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 100,
        enabled: false,
        keepRecentMessages: 1,
        reservedTokens: 1,
        strategy: 'summary',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      {
        content: '先查一下更早的天气',
        createdAt: '2026-04-25T00:00:00.000Z',
        id: 'history-0',
        parts: [{ text: '先查一下更早的天气', type: 'text' as const }],
        role: 'user',
        status: 'completed',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        content: '',
        createdAt: '2026-04-25T00:00:00.500Z',
        id: 'assistant-0',
        model: 'gpt-5.4',
        parts: [],
        provider: 'openai',
        role: 'assistant',
        status: 'completed',
        toolCalls: [{ input: { city: 'Hangzhou' }, toolCallId: 'tool-call-0', toolName: 'weather.search' }],
        toolResults: [{ output: { kind: 'tool:text', value: '天气详情'.repeat(30000) }, toolCallId: 'tool-call-0', toolName: 'weather.search' }],
        updatedAt: '2026-04-25T00:00:00.500Z',
      },
      {
        content: '先查一下天气',
        createdAt: '2026-04-25T00:00:00.000Z',
        id: 'history-1',
        parts: [{ text: '先查一下天气', type: 'text' as const }],
        role: 'user',
        status: 'completed',
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        content: '',
        createdAt: '2026-04-25T00:00:01.000Z',
        id: 'assistant-1',
        model: 'gpt-5.4',
        parts: [],
        provider: 'openai',
        role: 'assistant',
        status: 'completed',
        toolCalls: [{ input: { city: 'Shanghai' }, toolCallId: 'tool-call-1', toolName: 'weather.search' }],
        toolResults: [{ output: { kind: 'tool:text', value: '天气详情'.repeat(15000) }, toolCallId: 'tool-call-1', toolName: 'weather.search' }],
        updatedAt: '2026-04-25T00:00:01.000Z',
      },
      {
        content: '再查一下天气',
        createdAt: '2026-04-25T00:00:01.500Z',
        id: 'history-2',
        parts: [{ text: '再查一下天气', type: 'text' as const }],
        role: 'user',
        status: 'completed',
        updatedAt: '2026-04-25T00:00:01.500Z',
      },
      {
        content: '',
        createdAt: '2026-04-25T00:00:02.000Z',
        id: 'assistant-2',
        model: 'gpt-5.4',
        parts: [],
        provider: 'openai',
        role: 'assistant',
        status: 'completed',
        toolCalls: [{ input: { city: 'Suzhou' }, toolCallId: 'tool-call-2', toolName: 'weather.search' }],
        toolResults: [{ output: { kind: 'tool:text', value: '天气详情'.repeat(5000) }, toolCallId: 'tool-call-2', toolName: 'weather.search' }],
        updatedAt: '2026-04-25T00:00:02.000Z',
      },
      createMessage('history-3', 'user', '继续下一步'),
      createMessage('assistant-final', 'assistant', '当前轮已经完成'),
    ]);

    const afterSend = await service.broadcastAfterSend(
      { conversationId, userId: 'user-1' },
      {
        assistantMessageId: 'assistant-final',
        content: '当前轮已经完成',
        continuationState: {
          hasAssistantTextOutput: true,
          hasToolActivity: false,
        },
        conversationId,
        modelId: 'gpt-5.4',
        parts: [{ text: '当前轮已经完成', type: 'text' }],
        providerId: 'openai',
        toolCalls: [],
        toolResults: [],
      },
      'model',
    );

    expect(afterSend).toEqual({ compactionTriggered: false, continuation: null });

    const history = conversationStore.requireConversation(conversationId, 'user-1').messages;
    const prunedAssistant = history.find((message) => message.id === 'assistant-0');

    expect(prunedAssistant).toMatchObject({
      toolResults: [
        {
          output: {
            kind: 'tool:text',
            value: '[旧工具输出已从当前上下文裁剪]',
          },
          toolCallId: 'tool-call-0',
          toolName: 'weather.search',
        },
      ],
    });
  });

  it('keeps the completed reply successful and continues the next reply when post-response compaction fails', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 1,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '第一条较长的历史消息，用于触发回复后压缩检查。'.repeat(10)),
      createMessage('history-2', 'assistant', '第二条较长的历史回复，用于确保压缩候选存在。'.repeat(10)),
      createMessage('history-3', 'user', '第三条消息，表示本轮提问。'.repeat(10)),
      createMessage('assistant-final', 'assistant', '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(10)),
    ]);
    aiModelExecutionService.generateText.mockRejectedValueOnce(new Error('compaction api failed'));

    await expect(service.broadcastAfterSend(
      { conversationId, userId: 'user-1' },
      {
        assistantMessageId: 'assistant-final',
        content: '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(10),
        continuationState: {
          hasAssistantTextOutput: true,
          hasToolActivity: false,
        },
        conversationId,
        modelId: 'gpt-5.4',
        parts: [{ text: '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(10), type: 'text' }],
        providerId: 'openai',
        toolCalls: [],
        toolResults: [],
      },
      'model',
    )).resolves.toEqual({ compactionTriggered: false, continuation: null });

    const history = conversationStore.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string }>;
    };
    expect(history.messages.find((message) => message.content === '压缩后的历史摘要')).toBeUndefined();
    personaService.readCurrentPersona.mockReturnValue({
      beginDialogs: [],
      customErrorMessage: null,
      personaId: 'builtin.default-assistant',
      prompt: '你是测试助手',
      toolNames: null,
    });
    toolRegistryService.buildToolSet.mockResolvedValue(undefined);
    aiModelExecutionService.generateText.mockRejectedValueOnce(new Error('compaction api failed'));
    aiModelExecutionService.streamText.mockReturnValue({
      finishReason: undefined,
      fullStream: (async function* () { yield { text: 'ok', type: 'text-delta' as const }; })(),
      modelId: 'gpt-5.4',
      providerId: 'openai',
      usage: undefined,
    });

    const planAfterFailedAutoCompaction = await service.createStreamPlan({
      abortSignal: new AbortController().signal,
      conversationId,
      messageId: 'assistant-next',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    });

    expect(planAfterFailedAutoCompaction.responseSource).toBe('model');
    expect(planAfterFailedAutoCompaction.shortCircuitParts).toBeNull();
    expect(aiModelExecutionService.streamText).toHaveBeenCalled();
  });

  it('stops the next reply with a clear overflow message when the first completed turn already exceeds context and cannot be compacted', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 1,
        enabled: true,
        keepRecentMessages: 6,
        reservedTokens: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '请直接写一篇超长文章。'),
      createMessage('assistant-final', 'assistant', '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(300)),
    ]);
    personaService.readCurrentPersona.mockReturnValue({
      beginDialogs: [],
      customErrorMessage: null,
      personaId: 'builtin.default-assistant',
      prompt: '你是测试助手',
      toolNames: null,
    });
    toolRegistryService.buildToolSet.mockResolvedValue(undefined);
    aiModelExecutionService.streamText.mockReturnValue({
      finishReason: undefined,
      fullStream: (async function* () { yield { text: 'ok', type: 'text-delta' as const }; })(),
      modelId: 'gpt-5.4',
      providerId: 'openai',
      usage: undefined,
    });

    await expect(service.broadcastAfterSend(
      { conversationId, userId: 'user-1' },
      {
        assistantMessageId: 'assistant-final',
        content: '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(300),
        continuationState: {
          hasAssistantTextOutput: true,
          hasToolActivity: false,
        },
        conversationId,
        modelId: 'gpt-5.4',
        parts: [{ text: '第四条消息，表示本轮 assistant 已经完成回复。'.repeat(300), type: 'text' }],
        providerId: 'openai',
        toolCalls: [],
        toolResults: [],
      },
      'model',
    )).resolves.toEqual({ compactionTriggered: false, continuation: null });

    await expect(service.createStreamPlan({
      abortSignal: new AbortController().signal,
      conversationId,
      messageId: 'assistant-next',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    })).rejects.toThrow('压缩后的上下文仍超过预算');
    expect(aiModelExecutionService.streamText).not.toHaveBeenCalled();
  });

  it('continues the current reply when summary compaction fails before model execution', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 1,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createMessage('history-1', 'user', '第一条较长的历史消息，用于触发送模前压缩。'.repeat(10)),
      createMessage('history-2', 'assistant', '第二条较长的历史回复，用于确保压缩候选存在。'.repeat(10)),
      createMessage('history-3', 'user', '第三条消息，表示最近一次用户提问。'.repeat(10)),
    ]);
    personaService.readCurrentPersona.mockReturnValue({
      beginDialogs: [],
      customErrorMessage: null,
      personaId: 'builtin.default-assistant',
      prompt: '你是测试助手',
      toolNames: null,
    });
    toolRegistryService.buildToolSet.mockResolvedValue(undefined);
    aiModelExecutionService.generateText.mockRejectedValueOnce(new Error('compaction api failed'));
    aiModelExecutionService.streamText.mockReturnValue({
      finishReason: undefined,
      fullStream: (async function* () { yield { text: 'ok', type: 'text-delta' as const }; })(),
      modelId: 'gpt-5.4',
      providerId: 'openai',
      usage: undefined,
    });

    const pendingPlanAfterFailedAutoCompaction = await service.createStreamPlan({
      abortSignal: new AbortController().signal,
      conversationId,
      messageId: 'assistant-pending',
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    });

    expect(pendingPlanAfterFailedAutoCompaction.modelId).toBe('gpt-5.4');
    expect(pendingPlanAfterFailedAutoCompaction.providerId).toBe('openai');
    expect(pendingPlanAfterFailedAutoCompaction.responseSource).toBe('model');
    expect(pendingPlanAfterFailedAutoCompaction.shortCircuitParts).toBeNull();
    expect(aiModelExecutionService.streamText).toHaveBeenCalled();
  });
});

function createMessage(
  id: string,
  role: string,
  content: string,
  metadata?: { annotations?: Array<{ data: object; owner: string; type: string; version: string }> },
) {
  return {
    content,
    createdAt: '2026-04-25T00:00:00.000Z',
    id,
    ...(metadata ? { metadataJson: JSON.stringify(metadata) } : {}),
    parts: [{ text: content, type: 'text' as const }],
    role,
    status: 'completed',
    updatedAt: '2026-04-25T00:00:00.000Z',
  };
}

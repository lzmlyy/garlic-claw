import type { JsonObject } from '@garlic-claw/shared';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createConversationHistorySignatureFromHistoryMessages } from '../../src/modules/conversation/conversation-history-signature';
import { ContextGovernanceService } from '../../src/modules/conversation/context-governance.service';
import { ContextGovernanceSettingsService } from '../../src/modules/conversation/context-governance-settings.service';
import { ConversationStoreService } from '../../src/modules/runtime/host/conversation-store.service';

type GenerateTextInput = {
  allowFallbackChatModels?: boolean;
  messages: Array<{ content: string; role: 'user' }>;
  modelId?: string;
  providerId?: string;
  transportMode?: 'generate' | 'stream-collect';
};

describe('ContextGovernanceService', () => {
  let settingsConfigPath: string;
  let conversationsPath: string;
  let conversationId: string;
  let settingsService: ContextGovernanceSettingsService;
  let conversationRecordService: ConversationStoreService;
  let service: ContextGovernanceService;

  const aiManagementService = {
    getDefaultProviderSelection: jest.fn(),
    getProvider: jest.fn(),
    getProviderModel: jest.fn(),
    listProviders: jest.fn(),
  };
  const aiModelExecutionService = {
    generateText: jest.fn<Promise<{ modelId: string; providerId: string; text: string }>, [GenerateTextInput]>(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    settingsConfigPath = path.join(
      os.tmpdir(),
      `settings.service.spec-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    conversationsPath = path.join(
      os.tmpdir(),
      `context-governance.service.conversations-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = settingsConfigPath;
    process.env.GARLIC_CLAW_CONVERSATIONS_PATH = conversationsPath;
    aiManagementService.getDefaultProviderSelection.mockReturnValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      source: 'default',
    });
    aiManagementService.getProvider.mockImplementation((providerId: string) => {
      if (providerId === 'openai') {
        return {
          defaultModel: 'gpt-4.1-mini',
          id: 'openai',
          models: ['gpt-4.1-mini'],
        };
      }
      return {
        defaultModel: 'gpt-oss-20b',
        id: 'nvidia',
        models: ['gpt-oss-20b'],
      };
    });
    aiManagementService.getProviderModel.mockImplementation((providerId: string, modelId: string) => ({
      capabilities: {
        input: { image: false, text: true },
        output: { image: false, text: true },
        reasoning: false,
        toolCall: true,
      },
      contextLength: providerId === 'openai' ? 2048 : 1024,
      id: modelId,
      name: modelId,
      providerId,
      status: 'active',
    }));
    aiManagementService.listProviders.mockReturnValue([{ id: 'nvidia' }]);
    settingsService = new ContextGovernanceSettingsService();
    conversationRecordService = new ConversationStoreService();
    conversationId = (
      conversationRecordService.createConversation({
        title: '新的对话',
        userId: 'user-1',
      }) as { id: string }
    ).id;
    service = new ContextGovernanceService(
      aiManagementService as never,
      aiModelExecutionService as never,
      settingsService,
      conversationRecordService,
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
        // 测试临时文件清理失败不应覆盖主断言。
      }
    }
  });

  it('generates a conversation title through the model execution owner', async () => {
    settingsService.updateConfig({
      conversationTitle: {
        defaultTitle: '新的对话',
        enabled: true,
      },
    } as never);
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '帮我整理一下今天的代码评审结论'),
      createHistoryMessage('message-2', 'assistant', '今天主要处理 provider smoke、subagent 和上下文压缩'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '代码评审结论',
    });

    await service.generateConversationTitleIfNeeded({
      conversationId,
      userId: 'user-1',
    });

    expect(aiModelExecutionService.generateText).toHaveBeenCalledWith(expect.objectContaining({
      allowFallbackChatModels: true,
      messages: [
        expect.objectContaining({
          role: 'user',
        }),
      ],
      transportMode: 'stream-collect',
    }));
    expect(conversationRecordService.requireConversation(conversationId, 'user-1').title).toBe('代码评审结论');
  });

  it('does not intercept /compact at message-received stage anymore', async () => {
    await expect(service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    })).resolves.toEqual({ action: 'continue' });
  });

  it('does not secretly clamp the effective context budget to 256 when the configured context length is 10000', async () => {
    aiManagementService.getProviderModel.mockImplementation((providerId: string, modelId: string) => ({
      capabilities: {
        input: { image: false, text: true },
        output: { image: false, text: true },
        reasoning: false,
        toolCall: true,
      },
      contextLength: 10_000,
      id: modelId,
      name: modelId,
      providerId,
      status: 'active',
    }));
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 50,
        enabled: true,
        keepRecentMessages: 2,
        reservedTokens: 12_000,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一段历史消息，用来验证 10000 上下文长度不会被偷偷压成 256。'.repeat(12)),
      createHistoryMessage('message-2', 'assistant', '第二段历史回复，用来让当前上下文占用明显高于 128，但仍远低于 10000 的 50%。'.repeat(12)),
      createHistoryMessage('message-3', 'user', '第三段消息保留在最近窗口内。'),
    ], 'user-1');

    await service.rewriteHistoryBeforeModel({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });

    const preview = await service.getContextWindowPreview({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });
    const beforeModel = await service.applyBeforeModel({
      conversationId,
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '继续下一步', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
      userId: 'user-1',
    });

    expect(preview.contextLength).toBe(10_000);
    expect(preview.estimatedTokens).toBeGreaterThan(128);
    expect(preview.estimatedTokens).toBeLessThan(5_000);
    expect(preview.source).toBe('estimated');
    expect(aiModelExecutionService.generateText).not.toHaveBeenCalled();
    expect(beforeModel).toEqual({
      action: 'continue',
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '继续下一步', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
    });
  });

  it('auto compacts history before model execution without fabricating a short-circuit reply', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 20,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 900,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一段较长的历史消息，用来触发自动压缩阈值。'.repeat(10)),
      createHistoryMessage('message-2', 'assistant', '第二段较长的历史回复，用来确保压缩候选不为空。'.repeat(10)),
      createHistoryMessage('message-3', 'user', '第三段消息保留给最近窗口。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '自动摘要。',
    });

    await service.rewriteHistoryBeforeModel({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });

    const beforeModel = await service.applyBeforeModel({
      conversationId,
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '第三段消息保留给最近窗口。', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
      userId: 'user-1',
    });

    expect(aiModelExecutionService.generateText).toHaveBeenCalledTimes(1);
    expect(beforeModel.action).toBe('continue');
    if (beforeModel.action !== 'continue') {
      throw new Error(`unexpected action: ${beforeModel.action}`);
    }
    expect(beforeModel.modelId).toBe('gpt-oss-20b');
    expect(beforeModel.providerId).toBe('nvidia');
    expect(beforeModel.systemPrompt).toBe('你是测试助手');
    expect(beforeModel.messages).toEqual([
      { content: [{ text: '自动摘要。', type: 'text' }], role: 'assistant' },
      { content: [{ text: '第三段消息保留给最近窗口。', type: 'text' }], role: 'user' },
    ]);
    const history = conversationRecordService.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string }>;
    };
    expect(history.messages.some((message) => message.content === '自动摘要。')).toBe(true);
  });

  it('does not let stale provider usage suppress auto compaction threshold checks', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 10,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    const staleSignature = createConversationHistorySignatureFromHistoryMessages([
      {
        content: '旧历史',
        createdAt: '2026-04-26T00:00:00.000Z',
        id: 'stale-history',
        parts: [{ text: '旧历史', type: 'text' }],
        role: 'assistant',
        status: 'completed',
        updatedAt: '2026-04-26T00:00:00.000Z',
      },
    ]);
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一段较长的历史消息，用来确保当前真实历史已经超过自动压缩阈值。'.repeat(20)),
      {
        ...createHistoryMessage('message-2', 'assistant', '第二段较长的历史回复，附带的是上一轮旧 usage，不应该继续参与这轮阈值判断。'.repeat(20)),
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                inputTokens: 8,
                modelId: 'gpt-oss-20b',
                outputTokens: 2,
                providerId: 'nvidia',
                responseHistorySignature: staleSignature,
                source: 'provider',
                totalTokens: 10,
              },
              owner: 'conversation.model-usage',
              type: 'model-usage',
              version: '1',
            },
          ],
        }),
      },
      createHistoryMessage('message-3', 'user', '第三段消息保留给最近窗口。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '自动压缩摘要：当前历史过长，旧 usage 已失效。',
    });

    await service.rewriteHistoryBeforeModel({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });

    const history = conversationRecordService.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string }>;
    };
    expect(history.messages.some((message) => message.content === '自动压缩摘要：当前历史过长，旧 usage 已失效。')).toBe(true);
  });

  it('does not short-circuit the next reply when automatic compaction fails before model execution', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 20,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 900,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一段较长的历史消息，用来触发自动压缩阈值。'.repeat(10)),
      createHistoryMessage('message-2', 'assistant', '第二段较长的历史回复，用来确保压缩候选不为空。'.repeat(10)),
      createHistoryMessage('message-3', 'user', '第三段消息保留给最近窗口。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockRejectedValueOnce(new Error('compaction api failed'));

    await service.rewriteHistoryBeforeModel({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });

    await expect(service.applyBeforeModel({
      conversationId,
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '继续下一步', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
      userId: 'user-1',
    })).resolves.toEqual({
      action: 'continue',
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '继续下一步', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
    });
  });

  it('does not run post-response summary compaction before the configured threshold is reached', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 90,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    const currentHistory = [
      createHistoryMessage('history-1', 'user', '这是一条很短的历史消息。'),
      createHistoryMessage('assistant-final', 'assistant', '这是一条很短的完成回复。'),
    ];
    const responseHistorySignature = createConversationHistorySignatureFromHistoryMessages(currentHistory);
    conversationRecordService.replaceMessages(conversationId, [
      currentHistory[0],
      {
        ...currentHistory[1],
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                inputTokens: 20,
                modelId: 'gpt-oss-20b',
                outputTokens: 8,
                providerId: 'nvidia',
                responseHistorySignature,
                source: 'provider',
                totalTokens: 28,
              },
              owner: 'conversation.model-usage',
              type: 'model-usage',
              version: '1',
            },
          ],
        }),
      },
    ], 'user-1');

    await service.rewriteHistoryAfterCompletedResponse({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(aiModelExecutionService.generateText).not.toHaveBeenCalled();
    expect(service.consumePendingPreModelStop(conversationId)).toBeNull();
    const history = conversationRecordService.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string }>;
    };
    expect(history.messages.some((message) => message.content === '压缩后的历史摘要')).toBe(false);
  });

  it('surfaces provider token source in the context window preview when the current history matches real usage', async () => {
    const previewMessages = [
      {
        content: '第一条消息',
        createdAt: '2026-04-25T00:00:00.000Z',
        id: 'history-1',
        parts: [{ text: '第一条消息', type: 'text' as const }],
        role: 'user' as const,
        status: 'completed' as const,
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
      {
        content: '第二条消息',
        createdAt: '2026-04-25T00:01:00.000Z',
        id: 'history-2',
        parts: [{ text: '第二条消息', type: 'text' as const }],
        role: 'assistant' as const,
        status: 'completed' as const,
        updatedAt: '2026-04-25T00:01:00.000Z',
      },
    ];
    const responseHistorySignature = createConversationHistorySignatureFromHistoryMessages(previewMessages);
    conversationRecordService.replaceMessages(conversationId, [
      previewMessages[0],
      {
        ...previewMessages[1],
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                inputTokens: 88,
                modelId: 'gpt-oss-20b',
                outputTokens: 12,
                providerId: 'nvidia',
                responseHistorySignature,
                source: 'provider',
                totalTokens: 100,
              },
              owner: 'conversation.model-usage',
              type: 'model-usage',
              version: '1',
            },
          ],
        }),
      },
    ], 'user-1');

    await expect(service.getContextWindowPreview({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    })).resolves.toEqual(expect.objectContaining({
      estimatedTokens: 100,
      includedMessageIds: ['history-1', 'history-2'],
      source: 'provider',
    }));
  });

  it('reuses the latest provider total tokens for context window preview display after history rewrite invalidates the old response signature', async () => {
    const staleSignature = createConversationHistorySignatureFromHistoryMessages([
      {
        content: '旧历史',
        createdAt: '2026-04-25T00:00:00.000Z',
        id: 'stale-history-1',
        parts: [{ text: '旧历史', type: 'text' as const }],
        role: 'assistant' as const,
        status: 'completed' as const,
        updatedAt: '2026-04-25T00:00:00.000Z',
      },
    ]);
    conversationRecordService.replaceMessages(conversationId, [
      createHistoryMessage('history-1', 'user', '新的第一条消息'),
      {
        ...createHistoryMessage('history-2', 'assistant', '新的第二条消息'),
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                inputTokens: 88,
                modelId: 'gpt-oss-20b',
                outputTokens: 12,
                providerId: 'nvidia',
                responseHistorySignature: staleSignature,
                source: 'provider',
                totalTokens: 100,
              },
              owner: 'conversation.model-usage',
              type: 'model-usage',
              version: '1',
            },
          ],
        }),
      },
    ], 'user-1');

    await expect(service.getContextWindowPreview({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    })).resolves.toEqual(expect.objectContaining({
      estimatedTokens: 100,
      source: 'provider',
    }));
  });

  it('reuses the newest real provider total for context window preview even when the selected model has changed', async () => {
    conversationRecordService.replaceMessages(conversationId, [
      {
        ...createHistoryMessage('history-1', 'assistant', '前一条回复'),
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                inputTokens: 70,
                modelId: 'gpt-oss-20b',
                outputTokens: 20,
                providerId: 'nvidia',
                source: 'provider',
                totalTokens: 90,
              },
              owner: 'conversation.model-usage',
              type: 'model-usage',
              version: '1',
            },
          ],
        }),
      },
      {
        ...createHistoryMessage('history-2', 'assistant', '最后一条真实回复'),
        metadataJson: JSON.stringify({
          annotations: [
            {
              data: {
                inputTokens: 91,
                modelId: 'deepseek-v4-flash',
                outputTokens: 29,
                providerId: 'ds2api',
                source: 'provider',
                totalTokens: 120,
              },
              owner: 'conversation.model-usage',
              type: 'model-usage',
              version: '1',
            },
          ],
        }),
      },
    ], 'user-1');

    await expect(service.getContextWindowPreview({
      conversationId,
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      userId: 'user-1',
    })).resolves.toEqual(expect.objectContaining({
      estimatedTokens: 120,
      includedMessageIds: ['history-1', 'history-2'],
      source: 'provider',
    }));
  });

  it('does not block the next reply with “当前历史还不足以生成稳定摘要” when only raw tool payloads inflated the preview', async () => {
    settingsService.updateConfig({
      contextCompaction: {
        compressionThreshold: 50,
        enabled: true,
        keepRecentMessages: 1,
        reservedTokens: 900,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationRecordService.replaceMessages(conversationId, [
      {
        content: '工具已经执行完了。',
        createdAt: '2026-05-02T10:00:00.000Z',
        id: 'assistant-tool-heavy',
        parts: [{ text: '工具已经执行完了。', type: 'text' }],
        role: 'assistant',
        status: 'completed',
        toolResults: [
          {
            output: {
              data: {
                stderr: 'warn'.repeat(500),
                stdout: 'line'.repeat(2500),
              },
              kind: 'tool:text',
              value: '执行完成',
            },
            toolCallId: 'call-heavy-1',
            toolName: 'bash',
          },
        ],
        updatedAt: '2026-05-02T10:00:00.000Z',
      } as JsonObject,
    ], 'user-1');

    await service.rewriteHistoryBeforeModel({
      conversationId,
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      userId: 'user-1',
    });

    const beforeModel = await service.applyBeforeModel({
      conversationId,
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '继续下一步', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
      userId: 'user-1',
    });

    expect(aiModelExecutionService.generateText).not.toHaveBeenCalled();
    expect(beforeModel).toEqual({
      action: 'continue',
      messages: [
        { content: 'system prompt', role: 'system' },
        { content: '继续下一步', role: 'user' },
      ],
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      systemPrompt: '你是测试助手',
    });
  });
});

function createHistoryMessage(
  id: string,
  role: 'assistant' | 'user',
  content: string,
  extra?: {
    toolCalls?: JsonObject[];
    toolResults?: JsonObject[];
  },
): JsonObject {
  return {
    content,
    createdAt: '2026-04-27T00:00:00.000Z',
    id,
    parts: [{ text: content, type: 'text' }],
    role,
    status: 'completed',
    ...(extra?.toolCalls ? { toolCalls: extra.toolCalls } : {}),
    ...(extra?.toolResults ? { toolResults: extra.toolResults } : {}),
    updatedAt: '2026-04-27T00:00:00.000Z',
  };
}

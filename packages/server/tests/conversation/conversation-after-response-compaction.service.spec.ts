import type { JsonObject } from '@garlic-claw/shared';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConversationAfterResponseCompactionService } from '../../src/modules/conversation/conversation-after-response-compaction.service';
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

describe('ConversationAfterResponseCompactionService', () => {
  let settingsConfigPath: string;
  let conversationsPath: string;
  let conversationId: string;
  let contextGovernanceSettingsService: ContextGovernanceSettingsService;
  let conversationStore: ConversationStoreService;
  let contextGovernanceService: ContextGovernanceService;
  let service: ConversationAfterResponseCompactionService;

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
      `after-response-compaction.settings-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    conversationsPath = path.join(
      os.tmpdir(),
      `after-response-compaction.conversations-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
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
    contextGovernanceSettingsService = new ContextGovernanceSettingsService();
    conversationStore = new ConversationStoreService();
    contextGovernanceService = new ContextGovernanceService(
      aiManagementService as never,
      aiModelExecutionService as never,
      contextGovernanceSettingsService,
      conversationStore,
    );
    service = new ConversationAfterResponseCompactionService(
      contextGovernanceService,
      conversationStore,
    );
    conversationId = (
      conversationStore.createConversation({
        title: '新的对话',
        userId: 'user-1',
      }) as { id: string }
    ).id;
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
        // 临时文件清理失败不应覆盖主断言。
      }
    }
  });

  it('returns continue for non-compaction messages', async () => {
    await expect(service.applyMessageReceived({
      content: '继续下一步',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '继续下一步', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    })).resolves.toEqual({ action: 'continue' });
  });

  it('compacts conversation history through the unified /compact owner', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        enabled: true,
        keepRecentMessages: 1,
        strategy: 'summary',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一条历史消息，说明 smoke 需要真实 provider。'),
      createHistoryMessage('message-2', 'assistant', '第二条历史回复，说明默认 provider 不能落到占位 key。'),
      createHistoryMessage('message-3', 'user', '第三条历史消息，说明 subagent 结果需要回写。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '压缩摘要：真实 provider、默认选择、subagent 回写。',
    });

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result).toEqual(expect.objectContaining({
      action: 'deferred-short-circuit',
      deferred: expect.objectContaining({
        commandId: 'internal.context-governance:/compact:command',
        execute: expect.any(Function),
      }),
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    }));
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual({
      assistantContent: '已压缩上下文，覆盖 2 条历史消息。',
      assistantParts: [{ text: '已压缩上下文，覆盖 2 条历史消息。', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });
    expect(aiModelExecutionService.generateText).toHaveBeenCalledWith(expect.objectContaining({
      allowFallbackChatModels: true,
      modelId: 'gpt-oss-20b',
      messages: [
        expect.objectContaining({
          content: expect.stringContaining('最近用户目标 / 限制 / 待办 / 下一步事项'),
          role: 'user',
        }),
      ],
      providerId: 'nvidia',
      transportMode: 'stream-collect',
    }));
    const history = conversationStore.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{
        content?: string;
        metadata?: { annotations?: Array<{ data?: Record<string, unknown>; owner?: string; type?: string }> };
        role: string;
      }>;
    };
    const summaryMessage = history.messages.find((message) => message.content === '压缩摘要：真实 provider、默认选择、subagent 回写。');
    expect(summaryMessage?.role).toBe('display');
    expect(summaryMessage?.metadata?.annotations?.some((annotation) =>
      annotation.owner === 'conversation.context-governance'
      && annotation.type === 'context-compaction'
      && annotation.data?.role === 'summary')).toBe(true);
  });

  it('rejects unexpected args for /compact in the unified owner', async () => {
    const result = await service.applyMessageReceived({
      content: '/compact now',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact now', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual({
      assistantContent: '上下文压缩命令不接受额外参数。\n可用命令：/compact 或 /compress',
      assistantParts: [{ text: '上下文压缩命令不接受额外参数。\n可用命令：/compact 或 /compress', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });
  });

  it('allows keepRecentMessages to be zero so summary compaction can replace all recent raw history', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        enabled: true,
        keepRecentMessages: 0,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一条历史消息，记录用户目标。'),
      createHistoryMessage('message-2', 'assistant', '第二条历史回复，记录现有约束。'),
      createHistoryMessage('message-3', 'user', '第三条历史消息，记录下一步事项。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '压缩摘要：用户目标、现有约束、下一步事项。',
    });

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual({
      assistantContent: '已压缩上下文，覆盖 3 条历史消息。',
      assistantParts: [{ text: '已压缩上下文，覆盖 3 条历史消息。', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });

    const history = conversationStore.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string; role: string }>;
    };
    expect(history.messages.some((message) => message.role === 'display' && message.content === '压缩摘要：用户目标、现有约束、下一步事项。')).toBe(true);
    expect(history.messages.filter((message) => message.role !== 'display')).toHaveLength(3);
  });

  it('returns a clear failure message when /compact hits a compaction API error', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        enabled: true,
        keepRecentMessages: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一条历史消息，说明 smoke 需要真实 provider。'),
      createHistoryMessage('message-2', 'assistant', '第二条历史回复，说明默认 provider 不能落到占位 key。'),
      createHistoryMessage('message-3', 'user', '第三条历史消息，说明 subagent 结果需要回写。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockRejectedValueOnce(new Error('compaction api failed'));

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual({
      assistantContent: '当前上下文压缩失败，本次未替换历史。可稍后重试 /compact，或先清理部分历史后再继续。\n原因：compaction api failed',
      assistantParts: [{ text: '当前上下文压缩失败，本次未替换历史。可稍后重试 /compact，或先清理部分历史后再继续。\n原因：compaction api failed', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });
  });

  it('does not report compaction as successful when the summary still leaves history over budget', async () => {
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
      createHistoryMessage('message-1', 'user', '第一条历史消息。'.repeat(20)),
      createHistoryMessage('message-2', 'assistant', '第二条历史回复。'.repeat(20)),
      createHistoryMessage('message-3', 'user', '第三条消息保留给最近窗口。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '仍然过长的摘要。'.repeat(40),
    });

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual({
      assistantContent: '压缩后的上下文仍超过预算，本次未替换历史。',
      assistantParts: [{ text: '压缩后的上下文仍超过预算，本次未替换历史。', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });
    const history = conversationStore.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string }>;
    };
    expect(history.messages).toHaveLength(3);
    expect(history.messages.some((message) => typeof message.content === 'string' && message.content.includes('仍然过长的摘要'))).toBe(false);
  });

  it('returns a clear failure message when the last oversized reply still leaves the conversation over budget after compaction', async () => {
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
      createHistoryMessage('message-1', 'user', '请直接写一篇超长文章。'),
      createHistoryMessage('message-2', 'assistant', '超长回复。'.repeat(500)),
    ], 'user-1');

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual({
      assistantContent: '压缩后的上下文仍超过预算，本次未替换历史。',
      assistantParts: [{ text: '压缩后的上下文仍超过预算，本次未替换历史。', type: 'text' }],
      modelId: 'context-compaction-command',
      providerId: 'system',
      reason: 'context-compaction:command',
    });
    expect(aiModelExecutionService.generateText).toHaveBeenCalled();
  });

  it('uses the configured compression model while keeping context window budget bound to the active chat model', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        compressionModel: {
          modelId: 'gpt-4.1-mini',
          providerId: 'openai',
        },
        enabled: true,
        keepRecentMessages: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '第一条历史消息。'),
      createHistoryMessage('message-2', 'assistant', '第二条历史回复。'),
      createHistoryMessage('message-3', 'user', '第三条消息保留给最近窗口。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
      text: '压缩摘要：改用独立压缩模型。',
    });

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result.action).toBe('deferred-short-circuit');
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    });

    expect(aiModelExecutionService.generateText).toHaveBeenCalledWith(expect.objectContaining({
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
      transportMode: 'stream-collect',
    }));
    const history = conversationStore.readConversationHistory(conversationId, 'user-1') as {
      messages: Array<{ content?: string; metadata?: { annotations?: Array<{ data?: Record<string, unknown> }> } }>;
    };
    const summaryMessage = history.messages.find((message) => message.content === '压缩摘要：改用独立压缩模型。');
    const summaryAnnotation = summaryMessage?.metadata?.annotations?.find((annotation) => annotation.data?.role === 'summary');
    expect(summaryAnnotation?.data).toEqual(expect.objectContaining({
      modelId: 'gpt-4.1-mini',
      providerId: 'openai',
    }));
  });

  it('compacts history with subagent tool facts through the unified owner', async () => {
    contextGovernanceSettingsService.updateConfig({
      contextCompaction: {
        enabled: true,
        keepRecentMessages: 1,
        strategy: 'summary',
        summaryPrompt: '请整理下面的对话摘要',
      },
    });
    conversationStore.replaceMessages(conversationId, [
      createHistoryMessage('message-1', 'user', '先确认技能加载是否正常。'),
      createHistoryMessage('message-2', 'assistant', '技能已经加载。'),
      createHistoryMessage('message-3', 'user', '请创建一个子代理去探索 smoke 流程。'),
      createHistoryMessage('message-4', 'assistant', '子代理已完成：Smoke HTTP Flow 用于后端烟测。', {
        toolCalls: [
          {
            input: {
              description: '探索 smoke 技能',
              prompt: '请总结 smoke-http-flow 技能的用途',
              subagentType: 'review',
            },
            toolCallId: 'call_smoke_subagent_0',
            toolName: 'spawn_subagent',
          },
          {
            input: {
              conversationId: '019ddd0a-1234-7890-abcd-ef1234567890',
            },
            toolCallId: 'call_smoke_subagent_wait_0',
            toolName: 'wait_subagent',
          },
        ],
        toolResults: [
          {
            output: {
              conversationId: '019ddd0a-1234-7890-abcd-ef1234567890',
              description: '探索 smoke 技能',
              status: 'queued',
            },
            toolCallId: 'call_smoke_subagent_0',
            toolName: 'spawn_subagent',
          },
          {
            output: {
              conversationId: '019ddd0a-1234-7890-abcd-ef1234567890',
              result: {
                text: 'Smoke HTTP Flow 用于后端烟测。',
              },
              status: 'completed',
            },
            toolCallId: 'call_smoke_subagent_wait_0',
            toolName: 'wait_subagent',
          },
        ],
      }),
      createHistoryMessage('message-5', 'user', '最后再压缩一下上下文。'),
    ], 'user-1');
    aiModelExecutionService.generateText.mockResolvedValue({
      modelId: 'gpt-oss-20b',
      providerId: 'nvidia',
      text: '压缩摘要：技能加载、子代理探索、最终收口。',
    });

    const result = await service.applyMessageReceived({
      content: '/compact',
      conversationId,
      modelId: 'gpt-oss-20b',
      parts: [{ text: '/compact', type: 'text' }],
      providerId: 'nvidia',
      userId: 'user-1',
    });

    expect(result).toEqual(expect.objectContaining({
      action: 'deferred-short-circuit',
      reason: 'context-compaction:command',
    }));
    if (result.action !== 'deferred-short-circuit') {
      throw new Error(`unexpected action: ${result.action}`);
    }
    await expect(result.deferred.execute({
      assistantMessageId: 'assistant-1',
      conversationId,
      userId: 'user-1',
      userMessageId: 'user-1',
    })).resolves.toEqual(expect.objectContaining({
      assistantContent: '已压缩上下文，覆盖 4 条历史消息。',
      reason: 'context-compaction:command',
    }));
    expect(aiModelExecutionService.generateText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        expect.objectContaining({
          content: expect.stringContaining('spawn_subagent'),
          role: 'user',
        }),
      ],
    }));
    expect(aiModelExecutionService.generateText).toHaveBeenCalledWith(expect.objectContaining({
      messages: [
        expect.objectContaining({
          content: expect.stringContaining('Smoke HTTP Flow 用于后端烟测。'),
          role: 'user',
        }),
      ],
    }));
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

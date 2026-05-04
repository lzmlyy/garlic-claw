import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { SINGLE_USER_ID } from '../../../src/modules/auth/single-user-auth';
import { createConversationHistorySignatureFromHistoryMessages } from '../../../src/modules/conversation/conversation-history-signature';
import { RuntimeSessionEnvironmentService } from '../../../src/modules/execution/runtime/runtime-session-environment.service';
import { ConversationStoreService } from '../../../src/modules/runtime/host/conversation-store.service';
import { ConversationTodoService } from '../../../src/modules/runtime/host/conversation-todo.service';
import { PluginDispatchService } from '../../../src/modules/runtime/host/plugin-dispatch.service';

describe('ConversationStoreService', () => {
  const conversationsEnvKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
  const conversationTodosEnvKey = 'GARLIC_CLAW_CONVERSATION_TODOS_PATH';
  const runtimeWorkspaceEnvKey = 'GARLIC_CLAW_RUNTIME_WORKSPACES_PATH';
  const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let storagePath: string;
  let todoStoragePath: string;
  let runtimeWorkspaceRoot: string;

  beforeEach(() => {
    storagePath = path.join(os.tmpdir(), `conversation-store.service.spec-${Date.now()}-${Math.random()}.json`);
    todoStoragePath = path.join(os.tmpdir(), `conversation-todo.service.spec-${Date.now()}-${Math.random()}.json`);
    runtimeWorkspaceRoot = path.join(os.tmpdir(), `conversation-store.workspace-${Date.now()}-${Math.random()}`);
  });

  afterEach(() => {
    delete process.env[conversationsEnvKey];
    delete process.env[conversationTodosEnvKey];
    delete process.env[runtimeWorkspaceEnvKey];
    try {
      for (const filePath of [storagePath, todoStoragePath]) {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
      fs.rmSync(runtimeWorkspaceRoot, { force: true, recursive: true });
    } catch {
      // 忽略临时文件清理失败，避免影响测试语义。
    }
  });

  it('creates, lists, persists and mutates conversation state', async () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const created = service.createConversation({ title: '新的对话' }) as { id: string };
    const conversationId = created.id;

    expect(created).toEqual({
      _count: { messages: 0 },
      createdAt: expect.any(String),
      id: expect.any(String),
      title: '新的对话',
      updatedAt: expect.any(String),
    });
    expect(conversationId).toMatch(uuidV7Pattern);
    expect(service.listConversations()).toEqual([
      {
        _count: { messages: 0 },
        createdAt: expect.any(String),
        id: conversationId,
        title: '新的对话',
        updatedAt: expect.any(String),
      },
    ]);
    expect(service.readRuntimePermissionApprovals(conversationId)).toEqual([]);
    expect(service.rememberRuntimePermissionApproval(conversationId, 'just-bash:command.execute')).toEqual([
      'just-bash:command.execute',
    ]);
    expect(service.rememberRuntimePermissionApproval(conversationId, 'just-bash:network.access')).toEqual([
      'just-bash:command.execute',
      'just-bash:network.access',
    ]);
    expect(service.readRuntimePermissionApprovals(conversationId)).toEqual([
      'just-bash:command.execute',
      'just-bash:network.access',
    ]);

    const beforeRevision = service.readConversationRevision(conversationId);
    service.replaceMessages(conversationId, [{
      content: 'hello',
      createdAt: '2026-04-11T00:00:00.000Z',
      id: '019dc88c-1a10-7d45-9c5b-c748bc2ce1b4',
      role: 'assistant',
      status: 'completed',
      updatedAt: '2026-04-11T00:00:00.000Z',
    }]);
    expect(service.readConversationRevision(conversationId)).not.toBe(beforeRevision);
    expect(service.getConversation(conversationId)).toEqual({
      _count: { messages: 1 },
      createdAt: expect.any(String),
      id: conversationId,
      messages: [
        {
          content: 'hello',
          createdAt: '2026-04-11T00:00:00.000Z',
          error: null,
          id: '019dc88c-1a10-7d45-9c5b-c748bc2ce1b4',
          metadataJson: null,
          model: null,
          partsJson: null,
          provider: null,
          role: 'assistant',
          status: 'completed',
          toolCalls: null,
          toolResults: null,
          updatedAt: '2026-04-11T00:00:00.000Z',
        },
      ],
      title: '新的对话',
      updatedAt: expect.any(String),
    });

    const reloaded = new ConversationStoreService();
    expect(reloaded.getConversation(conversationId)).toEqual(service.getConversation(conversationId));
    expect(reloaded.readRuntimePermissionApprovals(conversationId)).toEqual([
      'just-bash:command.execute',
      'just-bash:network.access',
    ]);
    await expect(service.deleteConversation(conversationId)).resolves.toEqual({ message: 'Conversation deleted' });
  });

  it('throws instead of auto-creating missing conversations on read paths', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();

    expect(() => service.requireConversation('missing')).toThrow(NotFoundException);
    expect(() => service.getConversation('missing')).toThrow(NotFoundException);
  });

  it('throws ForbiddenException when reading another user conversation', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: '新的对话', userId: 'user-1' }) as { id: string }).id;

    expect(() => service.requireConversation(conversationId, 'user-2')).toThrow(ForbiddenException);
  });

  it('broadcasts conversation:created when runtime kernel is available', async () => {
    process.env[conversationsEnvKey] = storagePath;
    const runtimeKernelService = {
      invokeHook: jest.fn().mockResolvedValue(null),
      listPlugins: jest.fn().mockReturnValue([
        {
          connected: true,
          conversationScopes: {},
          defaultEnabled: true,
          manifest: { hooks: [{ name: 'conversation:created' }] },
          pluginId: 'builtin.audit',
        },
      ]),
    };
    const service = new ConversationStoreService(runtimeKernelService as unknown as PluginDispatchService);

    service.createConversation({ title: '新的对话', userId: 'user-1' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runtimeKernelService.invokeHook).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ source: 'http-route', userId: 'user-1' }),
      hookName: 'conversation:created',
    }));
  });

  it('reads, previews and replaces conversation history with annotation metadata and revision protection', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: 'History Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as {
      revision: string;
    };

    const replaced = service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '你好',
          createdAt: '2026-04-19T10:00:00.000Z',
          id: 'message-1',
          metadata: {
            annotations: [
              {
                data: {
                  coveredCount: 2,
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
              text: '你好',
              type: 'text',
            },
          ],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:00:00.000Z',
        },
      ],
    }) as {
      changed: boolean;
      messages: Array<Record<string, unknown>>;
      revision: string;
    };

    expect(replaced.changed).toBe(true);
    expect(replaced.messages).toEqual([
      expect.objectContaining({
        content: '你好',
        id: 'message-1',
        metadata: {
          annotations: [
            {
              data: {
                coveredCount: 2,
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
            text: '你好',
            type: 'text',
          },
        ],
        role: 'assistant',
      }),
    ]);

    const preview = service.previewConversationHistory(conversationId, {}) as {
      estimatedTokens: number;
      messageCount: number;
      source: 'estimated' | 'provider';
      textBytes: number;
    };
    const expectedTextBytes = Buffer.byteLength('assistant\n你好', 'utf8');
    expect(preview).toEqual({
      estimatedTokens: Math.ceil(expectedTextBytes / 4),
      messageCount: 1,
      source: 'estimated',
      textBytes: expectedTextBytes,
    });

    expect(() => service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [],
    })).toThrow(ConflictException);
  });

  it('excludes display messages from conversation history token preview', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: 'Display Preview Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as {
      revision: string;
    };

    service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '/compact',
          createdAt: '2026-04-19T10:00:00.000Z',
          id: 'display-command',
          metadata: {
            annotations: [
              {
                data: {
                  variant: 'command',
                },
                owner: 'conversation.display-message',
                type: 'display-message',
                version: '1',
              },
            ],
          },
          parts: [
            {
              text: '/compact',
              type: 'text',
            },
          ],
          role: 'display',
          status: 'completed',
          updatedAt: '2026-04-19T10:00:00.000Z',
        },
        {
          content: '正常消息',
          createdAt: '2026-04-19T10:01:00.000Z',
          id: 'assistant-message',
          parts: [
            {
              text: '正常消息',
              type: 'text',
            },
          ],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:01:00.000Z',
        },
      ],
    });

    const preview = service.previewConversationHistory(conversationId, {}) as {
      estimatedTokens: number;
      messageCount: number;
      source: 'estimated' | 'provider';
      textBytes: number;
    };
    const expectedTextBytes = Buffer.byteLength('assistant\n正常消息', 'utf8');

    expect(preview).toEqual({
      estimatedTokens: Math.ceil(expectedTextBytes / 4),
      messageCount: 2,
      source: 'estimated',
      textBytes: expectedTextBytes,
    });
  });

  it('normalizes loose history objects with undefined optional fields during replacement', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: 'Loose History Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as { revision: string };
    const looseHistoryMessage = {
      content: '/compact',
      createdAt: '2026-04-30T08:00:00.000Z',
      error: undefined,
      id: 'display-command',
      metadata: {
        annotations: [
          {
            data: {
              nested: {
                kept: 'value',
                dropped: undefined,
              },
              variant: 'command',
            },
            owner: 'conversation.display-message',
            type: 'display-message',
            version: '1',
          },
        ],
      },
      model: undefined,
      parts: [
        {
          text: '/compact',
          type: 'text',
        },
      ],
      provider: undefined,
      role: 'display',
      status: 'completed',
      updatedAt: '2026-04-30T08:00:00.000Z',
    } as unknown;

    const replaced = service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [looseHistoryMessage] as unknown as never[],
    }) as { messages: Array<Record<string, unknown>> };

    expect(replaced.messages).toEqual([
      expect.objectContaining({
        content: '/compact',
        metadata: {
          annotations: [
            {
              data: {
                nested: {
                  kept: 'value',
                },
                variant: 'command',
              },
              owner: 'conversation.display-message',
              type: 'display-message',
              version: '1',
            },
          ],
        },
        role: 'display',
      }),
    ]);
  });

  it('prefers the latest matching response usage annotation when previewing history tokens', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: 'Usage Preview Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as { revision: string };
    const previewMessages = [
      {
        content: '你好',
        createdAt: '2026-04-19T10:00:00.000Z',
        id: 'user-message',
        parts: [{ text: '你好', type: 'text' as const }],
        role: 'user' as const,
        status: 'completed' as const,
        updatedAt: '2026-04-19T10:00:00.000Z',
      },
      {
        content: '世界',
        createdAt: '2026-04-19T10:01:00.000Z',
        id: 'assistant-message',
        parts: [{ text: '世界', type: 'text' as const }],
        role: 'assistant' as const,
        status: 'completed' as const,
        updatedAt: '2026-04-19T10:01:00.000Z',
      },
    ];
    const responseHistorySignature = createConversationHistorySignatureFromHistoryMessages(previewMessages);

    service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        previewMessages[0],
        {
          content: '世界',
          createdAt: '2026-04-19T10:01:00.000Z',
          id: 'assistant-message',
          metadata: {
            annotations: [
              {
                data: {
                  inputTokens: 77,
                  modelId: 'gpt-5.4',
                  outputTokens: 13,
                  providerId: 'openai',
                  responseHistorySignature,
                  source: 'provider',
                  totalTokens: 90,
                },
                owner: 'conversation.model-usage',
                type: 'model-usage',
                version: '1',
              },
            ],
          },
          parts: [{ text: '世界', type: 'text' }],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:01:00.000Z',
        },
      ],
    });

    expect(service.previewConversationHistory(conversationId, {
      modelId: 'gpt-5.4',
      providerId: 'openai',
    })).toEqual({
      estimatedTokens: 90,
      messageCount: 2,
      source: 'provider',
      textBytes: Buffer.byteLength('user\n你好\nassistant\n世界', 'utf8'),
    });
  });

  it('falls back to estimated history tokens when provider usage does not match the current history snapshot', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: 'Stale Usage Preview Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as { revision: string };
    const staleSignature = createConversationHistorySignatureFromHistoryMessages([
      {
        content: '旧历史',
        createdAt: '2026-04-19T09:59:00.000Z',
        id: 'stale-message',
        parts: [{ text: '旧历史', type: 'text' }],
        role: 'assistant',
        status: 'completed',
        updatedAt: '2026-04-19T09:59:00.000Z',
      },
    ]);

    service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '现在的第一条消息',
          createdAt: '2026-04-19T10:00:00.000Z',
          id: 'user-message',
          parts: [{ text: '现在的第一条消息', type: 'text' }],
          role: 'user',
          status: 'completed',
          updatedAt: '2026-04-19T10:00:00.000Z',
        },
        {
          content: '现在的第二条消息',
          createdAt: '2026-04-19T10:01:00.000Z',
          id: 'assistant-message',
          metadata: {
            annotations: [
              {
                data: {
                  inputTokens: 77,
                  modelId: 'gpt-5.4',
                  outputTokens: 13,
                  providerId: 'openai',
                  responseHistorySignature: staleSignature,
                  source: 'provider',
                  totalTokens: 90,
                },
                owner: 'conversation.model-usage',
                type: 'model-usage',
                version: '1',
              },
            ],
          },
          parts: [{ text: '现在的第二条消息', type: 'text' }],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:01:00.000Z',
        },
      ],
    });

    const expectedTextBytes = Buffer.byteLength('user\n现在的第一条消息\nassistant\n现在的第二条消息', 'utf8');
    expect(service.previewConversationHistory(conversationId, {
      modelId: 'gpt-5.4',
      providerId: 'openai',
    })).toEqual({
      estimatedTokens: Math.ceil(expectedTextBytes / 4),
      messageCount: 2,
      source: 'estimated',
      textBytes: expectedTextBytes,
    });
  });

  it('reuses the latest provider total tokens for preview display when explicitly requested', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: 'Latest Provider Usage Preview Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as { revision: string };
    const staleSignature = createConversationHistorySignatureFromHistoryMessages([
      {
        content: '旧历史',
        createdAt: '2026-04-19T09:59:00.000Z',
        id: 'stale-message',
        parts: [{ text: '旧历史', type: 'text' }],
        role: 'assistant',
        status: 'completed',
        updatedAt: '2026-04-19T09:59:00.000Z',
      },
    ]);

    service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '现在的第一条消息',
          createdAt: '2026-04-19T10:00:00.000Z',
          id: 'user-message',
          parts: [{ text: '现在的第一条消息', type: 'text' }],
          role: 'user',
          status: 'completed',
          updatedAt: '2026-04-19T10:00:00.000Z',
        },
        {
          content: '现在的第二条消息',
          createdAt: '2026-04-19T10:01:00.000Z',
          id: 'assistant-message',
          metadata: {
            annotations: [
              {
                data: {
                  inputTokens: 77,
                  modelId: 'gpt-5.4',
                  outputTokens: 13,
                  providerId: 'openai',
                  responseHistorySignature: staleSignature,
                  source: 'provider',
                  totalTokens: 90,
                },
                owner: 'conversation.model-usage',
                type: 'model-usage',
                version: '1',
              },
            ],
          },
          parts: [{ text: '现在的第二条消息', type: 'text' }],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:01:00.000Z',
        },
      ],
    });

    expect(service.previewConversationHistory(conversationId, {
      modelId: 'gpt-5.4',
      providerId: 'openai',
      usagePreference: 'latest-provider',
    })).toEqual({
      estimatedTokens: 90,
      messageCount: 2,
      source: 'provider',
      textBytes: Buffer.byteLength('user\n现在的第一条消息\nassistant\n现在的第二条消息', 'utf8'),
    });
  });

  it('reuses the newest real provider total for preview display even when the selected model no longer matches', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: 'Latest Provider Usage Fallback Preview Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as { revision: string };

    service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '前一条回复',
          createdAt: '2026-04-19T10:00:00.000Z',
          id: 'assistant-message-1',
          metadata: {
            annotations: [
              {
                data: {
                  inputTokens: 70,
                  modelId: 'gpt-5.4',
                  outputTokens: 20,
                  providerId: 'openai',
                  source: 'provider',
                  totalTokens: 90,
                },
                owner: 'conversation.model-usage',
                type: 'model-usage',
                version: '1',
              },
            ],
          },
          parts: [{ text: '前一条回复', type: 'text' }],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:00:00.000Z',
        },
        {
          content: '最后一条真实回复',
          createdAt: '2026-04-19T10:01:00.000Z',
          id: 'assistant-message-2',
          metadata: {
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
          },
          parts: [{ text: '最后一条真实回复', type: 'text' }],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:01:00.000Z',
        },
      ],
    });

    expect(service.previewConversationHistory(conversationId, {
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
      usagePreference: 'latest-provider',
    })).toEqual({
      estimatedTokens: 120,
      messageCount: 2,
      source: 'provider',
      textBytes: Buffer.byteLength('assistant\n前一条回复\nassistant\n最后一条真实回复', 'utf8'),
    });
  });

  it('falls back to estimated history tokens when the preview model changes', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: 'Model Switch Preview Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as { revision: string };
    const responseHistorySignature = createConversationHistorySignatureFromHistoryMessages([
      {
        content: '你好',
        createdAt: '2026-04-19T10:00:00.000Z',
        id: 'assistant-message',
        parts: [{ text: '你好', type: 'text' }],
        role: 'assistant',
        status: 'completed',
        updatedAt: '2026-04-19T10:00:00.000Z',
      },
    ]);

    service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '你好',
          createdAt: '2026-04-19T10:00:00.000Z',
          id: 'assistant-message',
          metadata: {
            annotations: [
              {
                data: {
                  inputTokens: 77,
                  modelId: 'gpt-5.4',
                  outputTokens: 13,
                  providerId: 'openai',
                  responseHistorySignature,
                  source: 'provider',
                  totalTokens: 90,
                },
                owner: 'conversation.model-usage',
                type: 'model-usage',
                version: '1',
              },
            ],
          },
          parts: [{ text: '你好', type: 'text' }],
          role: 'assistant',
          status: 'completed',
          updatedAt: '2026-04-19T10:01:00.000Z',
        },
      ],
    });

    const expectedTextBytes = Buffer.byteLength('assistant\n你好', 'utf8');
    expect(service.previewConversationHistory(conversationId, {
      modelId: 'claude-3-7-sonnet',
      providerId: 'anthropic',
    })).toEqual({
      estimatedTokens: Math.ceil(expectedTextBytes / 4),
      messageCount: 1,
      source: 'estimated',
      textBytes: expectedTextBytes,
    });
  });

  it('counts compact tool facts without reintroducing the raw oversized payloads when estimating history preview tokens', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: 'Tool Payload Preview Chat' }) as { id: string }).id;
    const initialHistory = service.readConversationHistory(conversationId) as { revision: string };

    service.replaceConversationHistory(conversationId, {
      expectedRevision: initialHistory.revision,
      messages: [
        {
          content: '请检查最近的工具结果。',
          createdAt: '2026-05-02T10:00:00.000Z',
          id: 'user-message',
          parts: [{ text: '请检查最近的工具结果。', type: 'text' }],
          role: 'user',
          status: 'completed',
          updatedAt: '2026-05-02T10:00:00.000Z',
        },
        {
          content: '已经检查完成。',
          createdAt: '2026-05-02T10:01:00.000Z',
          id: 'assistant-message',
          parts: [{ text: '已经检查完成。', type: 'text' }],
          role: 'assistant',
          status: 'completed',
          toolCalls: [
            {
              input: {
                command: 'echo verbose',
                huge: 'x'.repeat(5000),
              },
              toolCallId: 'call-1',
              toolName: 'bash',
            },
          ],
          toolResults: [
            {
              output: {
                data: {
                  stderr: 'warn'.repeat(500),
                  stdout: 'line'.repeat(2000),
                },
                kind: 'tool:text',
                value: 'ok',
              },
              toolCallId: 'call-1',
              toolName: 'bash',
            },
          ],
          updatedAt: '2026-05-02T10:01:00.000Z',
        },
      ],
    });

    const plainTextBytes = Buffer.byteLength('user\n请检查最近的工具结果。\nassistant\n已经检查完成。', 'utf8');
    const rawPayloadBytes = Buffer.byteLength(JSON.stringify({
      toolCalls: [
        {
          input: {
            command: 'echo verbose',
            huge: 'x'.repeat(5000),
          },
          toolCallId: 'call-1',
          toolName: 'bash',
        },
      ],
      toolResults: [
        {
          output: {
            data: {
              stderr: 'warn'.repeat(500),
              stdout: 'line'.repeat(2000),
            },
            kind: 'tool:text',
            value: 'ok',
          },
          toolCallId: 'call-1',
          toolName: 'bash',
        },
      ],
    }), 'utf8');
    const preview = service.previewConversationHistory(conversationId, {
      modelId: 'gpt-5.4',
      providerId: 'openai',
    });
    expect(preview).toEqual(expect.objectContaining({
      messageCount: 2,
      source: 'estimated',
    }));
    expect((preview as { textBytes: number }).textBytes).toBeGreaterThan(plainTextBytes);
    expect((preview as { textBytes: number }).textBytes).toBeLessThan(rawPayloadBytes);
    expect((preview as { estimatedTokens: number }).estimatedTokens).toBe(Math.ceil((preview as { textBytes: number }).textBytes / 4));
  });

  it('deletes runtime workspace together with the conversation', async () => {
    process.env[conversationsEnvKey] = storagePath;
    process.env[runtimeWorkspaceEnvKey] = runtimeWorkspaceRoot;
    const runtimeSessionEnvironmentService = new RuntimeSessionEnvironmentService();
    const service = new ConversationStoreService(undefined, runtimeSessionEnvironmentService);
    const conversationId = (service.createConversation({ title: 'Runtime Chat' }) as { id: string }).id;
    const sessionRoot = (await runtimeSessionEnvironmentService.getSessionEnvironment(conversationId)).sessionRoot;
    fs.mkdirSync(path.join(sessionRoot, 'notes'), { recursive: true });
    fs.writeFileSync(path.join(sessionRoot, 'notes', 'runtime.txt'), 'runtime');

    expect(fs.existsSync(path.join(sessionRoot, 'notes', 'runtime.txt'))).toBe(true);

    await expect(service.deleteConversation(conversationId)).resolves.toEqual({ message: 'Conversation deleted' });
    expect(fs.existsSync(sessionRoot)).toBe(false);
  });

  it('deletes child subagent conversations together with the parent conversation', async () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const parentConversationId = (service.createConversation({ title: 'Parent Chat', userId: 'user-1' }) as { id: string }).id;
    const childConversationId = (service.createConversation({
      kind: 'subagent',
      parentId: parentConversationId,
      subagent: {
        pluginDisplayName: 'Memory',
        pluginId: 'builtin.memory',
        requestPreview: '整理上下文',
        requestedAt: '2026-04-25T00:00:00.000Z',
        runtimeKind: 'local',
        status: 'queued',
        startedAt: null,
        finishedAt: null,
        closedAt: null,
      },
      title: 'Child Chat',
      userId: 'user-1',
    }) as { id: string }).id;

    await expect(service.deleteConversation(parentConversationId, 'user-1')).resolves.toEqual({ message: 'Conversation deleted' });

    expect(() => service.requireConversation(parentConversationId, 'user-1')).toThrow(NotFoundException);
    expect(() => service.requireConversation(childConversationId, 'user-1')).toThrow(NotFoundException);
    expect(service.listSubagentConversations('user-1')).toEqual([]);
  });

  it('deletes todos for the whole conversation tree inside the record owner', async () => {
    process.env[conversationsEnvKey] = storagePath;
    process.env[conversationTodosEnvKey] = todoStoragePath;
    const service = new ConversationStoreService();
    const todoService = new ConversationTodoService(service);
    Object.assign(service as unknown as { conversationTodoService?: ConversationTodoService }, {
      conversationTodoService: todoService,
    });
    const parentConversationId = (service.createConversation({ title: 'Parent Chat', userId: 'user-1' }) as { id: string }).id;
    const childConversationId = (service.createConversation({
      parentId: parentConversationId,
      title: 'Child Chat',
      userId: 'user-1',
    }) as { id: string }).id;

    todoService.replaceSessionTodo(parentConversationId, [
      { content: 'parent todo', priority: 'high', status: 'pending' },
    ], 'user-1');
    todoService.replaceSessionTodo(childConversationId, [
      { content: 'child todo', priority: 'medium', status: 'in_progress' },
    ], 'user-1');

    await expect(service.deleteConversation(parentConversationId, 'user-1')).resolves.toEqual({ message: 'Conversation deleted' });

    expect(() => service.requireConversation(parentConversationId, 'user-1')).toThrow(NotFoundException);
    expect(() => service.requireConversation(childConversationId, 'user-1')).toThrow(NotFoundException);
    expect(JSON.parse(fs.readFileSync(todoStoragePath, 'utf-8'))).toEqual({});
  });

  it('lists only true subagent child conversations for a parent conversation', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const parentConversationId = (service.createConversation({ title: 'Parent Chat', userId: 'user-1' }) as { id: string }).id;
    const subagentChildId = (service.createConversation({
      kind: 'subagent',
      parentId: parentConversationId,
      subagent: {
        pluginDisplayName: 'Memory',
        pluginId: 'builtin.memory',
        requestPreview: '整理上下文',
        requestedAt: '2026-04-25T00:00:00.000Z',
        runtimeKind: 'local',
        status: 'queued',
        startedAt: null,
        finishedAt: null,
        closedAt: null,
      },
      title: 'Subagent Child',
      userId: 'user-1',
    }) as { id: string }).id;
    service.createConversation({
      parentId: parentConversationId,
      title: 'Cron Child',
      userId: 'user-1',
    });

    expect(service.listChildConversations(parentConversationId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: subagentChildId }),
      expect.objectContaining({ title: 'Cron Child' }),
    ]));
    expect(service.listChildSubagentConversations(parentConversationId, 'user-1')).toEqual([
      expect.objectContaining({
        id: subagentChildId,
        kind: 'subagent',
        title: 'Subagent Child',
      }),
    ]);
  });

  it('persists plugin conversation sessions across service reloads', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const conversationId = (service.createConversation({ title: 'Session Chat', userId: 'user-1' }) as { id: string }).id;

    expect(service.startConversationSession('builtin.memory', {
      conversationId,
      source: 'chat-hook',
      userId: 'user-1',
    }, {
      captureHistory: true,
      metadata: {
        flow: 'memory',
      },
      timeoutMs: 60_000,
    })).toEqual({
      captureHistory: true,
      conversationId,
      expiresAt: expect.any(String),
      historyMessages: [],
      lastMatchedAt: null,
      metadata: {
        flow: 'memory',
      },
      pluginId: 'builtin.memory',
      startedAt: expect.any(String),
      timeoutMs: 60_000,
    });

    const reloaded = new ConversationStoreService();

    expect(reloaded.getConversationSession('builtin.memory', {
      conversationId,
      source: 'chat-hook',
      userId: 'user-1',
    })).toEqual({
      captureHistory: true,
      conversationId,
      expiresAt: expect.any(String),
      historyMessages: [],
      lastMatchedAt: null,
      metadata: {
        flow: 'memory',
      },
      pluginId: 'builtin.memory',
      startedAt: expect.any(String),
      timeoutMs: 60_000,
    });
  });

  it('deletes all conversation sessions for a plugin', () => {
    process.env[conversationsEnvKey] = storagePath;
    const service = new ConversationStoreService();
    const firstConversationId = (service.createConversation({ title: 'Session Chat 1', userId: 'user-1' }) as { id: string }).id;
    const secondConversationId = (service.createConversation({ title: 'Session Chat 2', userId: 'user-1' }) as { id: string }).id;

    service.startConversationSession('builtin.memory', {
      conversationId: firstConversationId,
      source: 'chat-hook',
      userId: 'user-1',
    }, {
      timeoutMs: 60_000,
    });
    service.startConversationSession('builtin.memory', {
      conversationId: secondConversationId,
      source: 'chat-hook',
      userId: 'user-1',
    }, {
      timeoutMs: 60_000,
    });
    service.startConversationSession('builtin.other', {
      conversationId: secondConversationId,
      source: 'chat-hook',
      userId: 'user-1',
    }, {
      timeoutMs: 60_000,
    });

    expect(service.deletePluginConversationSessions('builtin.memory')).toBe(2);

    const reloaded = new ConversationStoreService();
    expect(reloaded.listPluginConversationSessions('builtin.memory')).toEqual([]);
    expect(reloaded.listPluginConversationSessions('builtin.other')).toEqual([
      expect.objectContaining({
        conversationId: secondConversationId,
        pluginId: 'builtin.other',
      }),
    ]);
  });

  it('drops legacy todos from conversation storage payload after reload', () => {
    process.env[conversationsEnvKey] = storagePath;
    const legacyConversationId = '019dc88c-1a11-7806-a2ff-9f4ab8d4fb47';
    fs.writeFileSync(storagePath, JSON.stringify({
      conversations: {
        [legacyConversationId]: {
          createdAt: '2026-04-10T00:00:00.000Z',

          id: legacyConversationId,
          messages: [],
          revision: `${legacyConversationId}:seed:0`,
          revisionVersion: 0,
          title: 'Legacy Chat',
          updatedAt: '2026-04-10T00:00:00.000Z',
          userId: SINGLE_USER_ID,
        },
      },
      todos: {
        [legacyConversationId]: [
          { content: 'legacy todo', priority: 'high', status: 'pending' },
        ],
      },
    }, null, 2), 'utf-8');

    const service = new ConversationStoreService();
    const todoService = new ConversationTodoService(service);

    expect(todoService.readSessionTodo(legacyConversationId)).toEqual([
      { content: 'legacy todo', priority: 'high', status: 'pending' },
    ]);
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf-8'))).toEqual({
      conversations: {
        [legacyConversationId]: expect.objectContaining({
          id: legacyConversationId,
          title: 'Legacy Chat',
        }),
      },
    });
  });

  it('deletes persisted legacy user conversations that no longer符合单用户模型', () => {
    process.env[conversationsEnvKey] = storagePath;
    fs.writeFileSync(storagePath, JSON.stringify({
      conversations: {
        'conversation-legacy': {
          createdAt: '2026-04-10T00:00:00.000Z',

          id: 'conversation-legacy',
          messages: [],
          revision: 'conversation-legacy:seed:0',
          revisionVersion: 0,
          title: 'Legacy Chat',
          updatedAt: '2026-04-10T00:00:00.000Z',
          userId: 'legacy-user',
        },
      },
    }, null, 2), 'utf-8');

    const service = new ConversationStoreService();

    expect(service.listConversations(SINGLE_USER_ID)).toEqual([]);
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf-8'))).toEqual({
      conversations: {},
    });
  });

  it('deletes persisted legacy conversations with non-v7 conversation or message ids', () => {
    process.env[conversationsEnvKey] = storagePath;
    fs.writeFileSync(storagePath, JSON.stringify({
      conversations: {
        'conversation-legacy': {
          createdAt: '2026-04-10T00:00:00.000Z',

          id: 'conversation-legacy',
          messages: [],
          revision: 'conversation-legacy:seed:0',
          revisionVersion: 0,
          title: 'Legacy Chat',
          updatedAt: '2026-04-10T00:00:00.000Z',
          userId: SINGLE_USER_ID,
        },
        '0196f0d8-4d30-7b0a-9f4f-20f6db0ad250': {
          createdAt: '2026-04-10T00:00:00.000Z',

          id: '0196f0d8-4d30-7b0a-9f4f-20f6db0ad250',
          messages: [{
            content: 'legacy message',
            createdAt: '2026-04-10T00:00:00.000Z',
            id: '11111111-1111-4111-8111-111111111111',
            role: 'assistant',
            status: 'completed',
            updatedAt: '2026-04-10T00:00:00.000Z',
          }],
          revision: '0196f0d8-4d30-7b0a-9f4f-20f6db0ad250:seed:0',
          revisionVersion: 0,
          title: 'Legacy Message Chat',
          updatedAt: '2026-04-10T00:00:00.000Z',
          userId: SINGLE_USER_ID,
        },
      },
    }, null, 2), 'utf-8');

    const service = new ConversationStoreService();

    expect(service.listConversations(SINGLE_USER_ID)).toEqual([]);
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf-8'))).toEqual({
      conversations: {},
    });
  });

  it('settles lingering main-conversation assistant and display responses after restart', () => {
    process.env[conversationsEnvKey] = storagePath;
    const conversationId = '019dc88c-1a11-7806-a2ff-9f4ab8d4fb47';
    fs.writeFileSync(storagePath, JSON.stringify({
      conversations: {
        [conversationId]: {
          createdAt: '2026-04-10T00:00:00.000Z',
          id: conversationId,
          kind: 'main',
          messages: [
            {
              content: '仍在生成的主回复',
              createdAt: '2026-04-10T00:00:01.000Z',
              id: '019dc88c-1a11-7806-a2ff-9f4ab8d4fb48',
              role: 'assistant',
              status: 'streaming',
              updatedAt: '2026-04-10T00:00:01.000Z',
            },
            {
              content: '',
              createdAt: '2026-04-10T00:00:02.000Z',
              id: '019dc88c-1a11-7806-a2ff-9f4ab8d4fb49',
              role: 'display',
              status: 'pending',
              updatedAt: '2026-04-10T00:00:02.000Z',
            },
          ],
          revision: `${conversationId}:seed:0`,
          revisionVersion: 0,
          title: 'Legacy Chat',
          updatedAt: '2026-04-10T00:00:00.000Z',
          userId: SINGLE_USER_ID,
        },
      },
    }, null, 2), 'utf-8');

    const service = new ConversationStoreService();
    const reloaded = service.requireConversation(conversationId, SINGLE_USER_ID);

    expect(reloaded.messages).toMatchObject([
      {
        content: '仍在生成的主回复',
        error: '服务重启时中断了正在运行的回复',
        role: 'assistant',
        status: 'stopped',
      },
      {
        content: '',
        error: '服务重启时中断了正在运行的回复',
        role: 'display',
        status: 'stopped',
      },
    ]);
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf-8'))).toEqual({
      conversations: {
        [conversationId]: expect.objectContaining({
          id: conversationId,
          messages: expect.arrayContaining([
            expect.objectContaining({
              id: '019dc88c-1a11-7806-a2ff-9f4ab8d4fb48',
              status: 'stopped',
            }),
            expect.objectContaining({
              id: '019dc88c-1a11-7806-a2ff-9f4ab8d4fb49',
              status: 'stopped',
            }),
          ]),
        }),
      },
    });
  });
});

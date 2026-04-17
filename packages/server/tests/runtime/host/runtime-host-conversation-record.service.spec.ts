import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SINGLE_USER_ID } from '../../../src/auth/single-user-auth';
import { RuntimeHostConversationRecordService } from '../../../src/runtime/host/runtime-host-conversation-record.service';

describe('RuntimeHostConversationRecordService', () => {
  const envKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
  let storagePath: string;

  beforeEach(() => {
    storagePath = path.join(os.tmpdir(), `runtime-host-conversation-record.service.spec-${Date.now()}-${Math.random()}.json`);
  });

  afterEach(() => {
    delete process.env[envKey];
    try {
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
    } catch {
      // 忽略临时文件清理失败，避免影响测试语义。
    }
  });

  it('creates, lists, persists and mutates conversation state', () => {
    process.env[envKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();
    const created = service.createConversation({ title: 'New Chat' }) as { id: string };
    const conversationId = created.id;

    expect(created).toEqual({
      _count: { messages: 0 },
      createdAt: expect.any(String),
      id: expect.any(String),
      title: 'New Chat',
      updatedAt: expect.any(String),
    });
    expect(service.listConversations()).toEqual([
      {
        _count: { messages: 0 },
        createdAt: expect.any(String),
        id: conversationId,
        title: 'New Chat',
        updatedAt: expect.any(String),
      },
    ]);
    expect(service.readConversationHostServices(conversationId)).toEqual({
      llmEnabled: true,
      sessionEnabled: true,
      ttsEnabled: true,
    });
    expect(service.writeConversationHostServices(conversationId, { ttsEnabled: false })).toEqual({
      llmEnabled: true,
      sessionEnabled: true,
      ttsEnabled: false,
    });
    expect(service.writeConversationSkillState(conversationId, ['project/planner'])).toEqual({
      activeSkillIds: ['project/planner'],
      activeSkills: [{ id: 'project/planner', name: 'project/planner' }],
    });

    const beforeRevision = service.readConversationRevision(conversationId);
    service.replaceMessages(conversationId, [{
      content: 'hello',
      createdAt: '2026-04-11T00:00:00.000Z',
      id: '11111111-1111-4111-8111-111111111111',
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
          id: '11111111-1111-4111-8111-111111111111',
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
      title: 'New Chat',
      updatedAt: expect.any(String),
    });

    const reloaded = new RuntimeHostConversationRecordService();
    expect(reloaded.getConversation(conversationId)).toEqual(service.getConversation(conversationId));
    expect(service.deleteConversation(conversationId)).toEqual({ message: 'Conversation deleted' });
  });

  it('throws instead of auto-creating missing conversations on read paths', () => {
    process.env[envKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();

    expect(() => service.requireConversation('missing')).toThrow(NotFoundException);
    expect(() => service.getConversation('missing')).toThrow(NotFoundException);
    expect(() => service.readConversationHostServices('missing')).toThrow(NotFoundException);
  });

  it('throws ForbiddenException when reading another user conversation', () => {
    process.env[envKey] = storagePath;
    const service = new RuntimeHostConversationRecordService();
    const conversationId = (service.createConversation({ title: 'New Chat', userId: 'user-1' }) as { id: string }).id;

    expect(() => service.requireConversation(conversationId, 'user-2')).toThrow(ForbiddenException);
  });

  it('broadcasts conversation:created when runtime kernel is available', async () => {
    process.env[envKey] = storagePath;
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
    const service = new RuntimeHostConversationRecordService(runtimeKernelService);

    service.createConversation({ title: 'New Chat', userId: 'user-1' });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(runtimeKernelService.invokeHook).toHaveBeenCalledWith(expect.objectContaining({
      context: expect.objectContaining({ source: 'http-route', userId: 'user-1' }),
      hookName: 'conversation:created',
    }));
  });

  it('deletes persisted legacy user conversations that no longer符合单用户模型', () => {
    process.env[envKey] = storagePath;
    fs.writeFileSync(storagePath, JSON.stringify({
      conversations: {
        'conversation-legacy': {
          activeSkillIds: [],
          createdAt: '2026-04-10T00:00:00.000Z',
          hostServices: { llmEnabled: true, sessionEnabled: true, ttsEnabled: true },
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

    const service = new RuntimeHostConversationRecordService();

    expect(service.listConversations(SINGLE_USER_ID)).toEqual([]);
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf-8'))).toEqual({
      conversations: {},
    });
  });
});

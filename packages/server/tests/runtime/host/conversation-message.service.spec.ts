import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { PluginCallContext } from '@garlic-claw/shared';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SINGLE_USER_ID } from '../../../src/modules/auth/single-user-auth';
import { ConversationMessageService } from '../../../src/modules/runtime/host/conversation-message.service';
import { ConversationStoreService } from '../../../src/modules/runtime/host/conversation-store.service';

describe('ConversationMessageService', () => {
  const envKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
  const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let storagePath: string;

  beforeEach(() => {
    storagePath = path.join(os.tmpdir(), `conversation-message.service.spec-${Date.now()}-${Math.random()}.json`);
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

  it('appends, updates, persists, sends and deletes conversation messages', async () => {
    process.env[envKey] = storagePath;
    const recordService = new ConversationStoreService();
    const service = new ConversationMessageService(recordService);
    const conversationId = (recordService.createConversation({ title: 'Conversation One', userId: SINGLE_USER_ID }) as { id: string }).id;

    const first = service.createMessage(conversationId, { content: 'hello', role: 'user', status: 'completed' });
    const second = service.createMessage(conversationId, {
      content: 'draft',
      model: 'gpt-5.4',
      provider: 'openai',
      role: 'assistant',
      status: 'pending',
    });
    const sent = await service.sendMessage(
      {
        activeModelId: 'gpt-5.4',
        activeProviderId: 'openai',
        conversationId,
        source: 'chat-hook',
        userId: SINGLE_USER_ID,
      } satisfies PluginCallContext,
      { content: 'Plugin reply' },
    );

    expect(first).toMatchObject({ content: 'hello', id: expect.any(String), role: 'user', status: 'completed' });
    expect(second).toMatchObject({ content: 'draft', id: expect.any(String), model: 'gpt-5.4', provider: 'openai', role: 'assistant', status: 'pending' });
    expect((first as { id: string }).id).toMatch(uuidV7Pattern);
    expect((second as { id: string }).id).toMatch(uuidV7Pattern);
    expect(sent).toMatchObject({
      content: 'Plugin reply',
      id: expect.any(String),
      model: 'gpt-5.4',
      parts: [{ text: 'Plugin reply', type: 'text' }],
      provider: 'openai',
      role: 'assistant',
      status: 'completed',
      target: { id: conversationId, label: 'Conversation One', type: 'conversation' },
    });
    expect((sent as { id: string }).id).toMatch(uuidV7Pattern);

    const revisionBeforeUpdate = service.readConversationRevision(conversationId);
    await expect(service.updateMessage(conversationId, String((sent as { id: string }).id), { content: 'Updated reply' }, SINGLE_USER_ID)).resolves.toMatchObject({
      content: 'Updated reply',
      id: (sent as { id: string }).id,
      role: 'assistant',
      status: 'completed',
    });
    expect(service.readConversationRevision(conversationId)).not.toBe(revisionBeforeUpdate);

    const reloaded = new ConversationMessageService(new ConversationStoreService());
    await expect(reloaded.updateMessage(conversationId, String((sent as { id: string }).id), { content: 'Reloaded reply' }, SINGLE_USER_ID)).resolves.toMatchObject({
      content: 'Reloaded reply',
      id: (sent as { id: string }).id,
      role: 'assistant',
      status: 'completed',
    });
    await expect(service.deleteMessage(conversationId, String((sent as { id: string }).id), SINGLE_USER_ID)).resolves.toEqual({ success: true });
  });

  it('throws when writing to a missing conversation instead of auto-creating it', async () => {
    process.env[envKey] = storagePath;
    const service = new ConversationMessageService(new ConversationStoreService());

    await expect(
      service.sendMessage(
        {
          activeModelId: 'gpt-5.4',
          activeProviderId: 'openai',
          conversationId: 'missing',
          source: 'chat-hook',
        } satisfies PluginCallContext,
        { content: 'Plugin reply' },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('continues message ids after restart instead of reusing persisted ids', () => {
    process.env[envKey] = storagePath;
    const recordService = new ConversationStoreService();
    const service = new ConversationMessageService(recordService);
    const conversationId = (recordService.createConversation({ title: 'Conversation One' }) as { id: string }).id;

    const first = service.createMessage(conversationId, { content: 'hello', role: 'user', status: 'completed' });
    const second = service.createMessage(conversationId, { content: 'draft', role: 'assistant', status: 'pending' });

    const reloaded = new ConversationMessageService(new ConversationStoreService());
    const next = reloaded.createMessage(conversationId, { content: 'next', role: 'assistant', status: 'pending' }) as { id: string };
    expect(next.id).not.toBe((first as { id: string }).id);
    expect(next.id).not.toBe((second as { id: string }).id);
  });

  it('forbids writing into another user conversation through message.send', async () => {
    process.env[envKey] = storagePath;
    const recordService = new ConversationStoreService();
    const service = new ConversationMessageService(recordService);
    const conversationId = (recordService.createConversation({ title: 'Conversation One', userId: 'user-1' }) as { id: string }).id;

    await expect(
      service.sendMessage(
        {
          conversationId,
          source: 'http-route',
          userId: 'user-2',
        } satisfies PluginCallContext,
        { content: '越权写入' },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('applies message:created and message:updated metadata mutations', async () => {
    process.env[envKey] = storagePath;
    const metadata = {
      annotations: [
        {
          data: {
            inputTokens: 21,
            modelId: 'gpt-5.4',
            outputTokens: 9,
            providerId: 'openai',
            source: 'provider',
            totalTokens: 30,
          },
          owner: 'conversation.model-usage',
          type: 'model-usage',
          version: '1',
        },
      ],
    };
    const runtimeKernelService = {
      invokeHook: jest.fn()
        .mockResolvedValueOnce({
          action: 'mutate',
          model: 'claude-3-7-sonnet',
          provider: 'anthropic',
          status: 'pending',
        })
        .mockResolvedValueOnce({
          action: 'mutate',
          model: 'gpt-5.4',
          provider: 'openai',
          status: 'completed',
        })
        .mockResolvedValueOnce({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([
        {
          connected: true,
          conversationScopes: {},
          defaultEnabled: true,
          manifest: { hooks: [{ name: 'message:created' }, { name: 'message:updated' }, { name: 'message:deleted' }] },
          pluginId: 'builtin.audit',
        },
      ]),
    };
    const recordService = new ConversationStoreService();
    const service = new ConversationMessageService(recordService, runtimeKernelService);
    const conversationId = (recordService.createConversation({ title: 'Conversation One', userId: 'user-1' }) as { id: string }).id;

    const sent = await service.createMessageWithHooks(
      conversationId,
      { content: 'Plugin reply', metadata, role: 'assistant', status: 'completed' },
      'user-1',
    ) as { id: string; model?: string; provider?: string; status: string };

    expect(sent).toMatchObject({ model: 'claude-3-7-sonnet', provider: 'anthropic', status: 'pending' });
    expect(runtimeKernelService.invokeHook.mock.calls[0][0].payload).toMatchObject({
      message: {
        metadata,
      },
    });

    const updated = await service.updateMessage(conversationId, sent.id, { content: 'Updated reply' }, 'user-1') as { model?: string; provider?: string; status: string };
    expect(updated).toMatchObject({ model: 'gpt-5.4', provider: 'openai', status: 'completed' });
    expect(runtimeKernelService.invokeHook.mock.calls[1][0].payload).toMatchObject({
      currentMessage: {
        metadata,
      },
      nextMessage: {
        metadata,
      },
    });

    await expect(service.deleteMessage(conversationId, sent.id, 'user-1')).resolves.toEqual({ success: true });
    expect(runtimeKernelService.invokeHook.mock.calls[2][0].payload).toMatchObject({
      message: {
        metadata,
      },
    });
  });
});

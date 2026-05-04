import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SINGLE_USER_ID } from '../../src/modules/auth/single-user-auth';
import { AutomationExecutionService } from '../../src/modules/execution/automation/automation-execution.service';
import { AutomationService } from '../../src/modules/execution/automation/automation.service';
import { ConversationMessageService } from '../../src/modules/runtime/host/conversation-message.service';
import { ConversationStoreService } from '../../src/modules/runtime/host/conversation-store.service';

describe('AutomationService', () => {
  const envKey = 'GARLIC_CLAW_AUTOMATIONS_PATH';
  const conversationEnvKey = 'GARLIC_CLAW_CONVERSATIONS_PATH';
  let service: AutomationService;
  let storagePath: string;
  let conversationStoragePath: string;

  beforeEach(() => {
    jest.useFakeTimers();
    storagePath = path.join(os.tmpdir(), `automation.service.spec-${Date.now()}-${Math.random()}.json`);
    conversationStoragePath = path.join(os.tmpdir(), `automation.service.conversations-${Date.now()}-${Math.random()}.json`);
    process.env[envKey] = storagePath;
    process.env[conversationEnvKey] = conversationStoragePath;
    service = createService();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env[envKey];
    delete process.env[conversationEnvKey];
    try {
      if (fs.existsSync(storagePath)) {
        fs.unlinkSync(storagePath);
      }
      if (fs.existsSync(conversationStoragePath)) {
        fs.unlinkSync(conversationStoragePath);
      }
    } catch {
      // 忽略临时文件清理失败，避免影响测试语义。
    }
  });

  it('creates, lists, reads, toggles, runs and deletes automations for one user', async () => {
    const created = service.create('user-1', {
      actions: [],
      name: '自动化',
      trigger: { type: 'manual' },
    });

    expect(created).toMatchObject({
      id: 'automation-1',
      enabled: true,
      name: '自动化',
      trigger: { type: 'manual' },
    });
    expect(service.listByUser('user-1')).toEqual([expect.objectContaining({ id: 'automation-1' })]);
    expect(service.getById('user-1', 'automation-1')).toEqual(expect.objectContaining({ id: 'automation-1' }));
    expect(service.toggle('user-1', 'automation-1')).toEqual({ enabled: false, id: 'automation-1' });
    expect(service.toggle('user-1', 'automation-1')).toEqual({ enabled: true, id: 'automation-1' });
    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({ results: [], status: 'success' });
    expect(service.getLogs('user-1', 'automation-1')).toEqual([
      expect.objectContaining({ id: 'automation-log-automation-1-1', status: 'success' }),
    ]);
    expect(service.remove('user-1', 'automation-1')).toEqual({ count: 1 });
  });

  it('emits event triggers for enabled automations of the same user', async () => {
    service.create('user-1', {
      actions: [],
      name: '事件自动化',
      trigger: { event: 'coffee.ready', type: 'event' },
    });
    service.create('user-2', {
      actions: [],
      name: '其他用户自动化',
      trigger: { event: 'coffee.ready', type: 'event' },
    });

    await expect(service.emitEvent('user-1', 'coffee.ready')).resolves.toEqual({
      event: 'coffee.ready',
      matchedAutomationIds: ['automation-1'],
    });
    expect(service.getLogs('user-1', 'automation-1')).toHaveLength(1);
    expect(service.getLogs('user-2', 'automation-2')).toHaveLength(0);
  });

  it('keeps event dispatch order aligned with creation order after double-digit ids appear', async () => {
    for (let index = 1; index <= 10; index += 1) {
      service.create('user-1', {
        actions: [],
        name: `事件自动化-${index}`,
        trigger: { event: 'coffee.ready', type: 'event' },
      });
    }

    await expect(service.emitEvent('user-1', 'coffee.ready')).resolves.toEqual({
      event: 'coffee.ready',
      matchedAutomationIds: [
        'automation-1',
        'automation-2',
        'automation-3',
        'automation-4',
        'automation-5',
        'automation-6',
        'automation-7',
        'automation-8',
        'automation-9',
        'automation-10',
      ],
    });
  });

  it('continues dispatching later automations when one matched event automation throws unexpectedly', async () => {
    const automationExecutionService = {
      executeAutomation: jest.fn()
        .mockRejectedValueOnce(new Error('before-run hook crashed'))
        .mockResolvedValueOnce({ results: [], status: 'success' }),
    };
    service = new AutomationService(automationExecutionService as never);

    service.create('user-1', {
      actions: [],
      name: '第一条失败自动化',
      trigger: { event: 'coffee.ready', type: 'event' },
    });
    service.create('user-1', {
      actions: [],
      name: '第二条继续执行',
      trigger: { event: 'coffee.ready', type: 'event' },
    });

    await expect(service.emitEvent('user-1', 'coffee.ready')).resolves.toEqual({
      event: 'coffee.ready',
      matchedAutomationIds: ['automation-1', 'automation-2'],
    });
    expect(automationExecutionService.executeAutomation).toHaveBeenCalledTimes(2);
    expect(service.getLogs('user-1', 'automation-1')).toEqual([
      expect.objectContaining({
        status: 'error',
        result: expect.stringContaining('before-run hook crashed'),
      }),
    ]);
    expect(service.getLogs('user-1', 'automation-2')).toEqual([
      expect.objectContaining({
        status: 'success',
      }),
    ]);
  });

  it('routes device_command actions through runtime kernel execution', async () => {
    const pluginDispatch = {
      executeTool: jest.fn().mockResolvedValue({ saved: true, id: 'memory-1' }),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    service = createService({ pluginDispatch });

    service.create('user-1', {
      actions: [
        {
          type: 'device_command',
          plugin: 'builtin.memory',
          capability: 'save_memory',
          params: { content: '自动化保存的记忆' },
        },
      ],
      name: '记忆自动化',
      trigger: { type: 'manual' },
    });

    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({
      status: 'success',
      results: [
        {
          action: 'device_command',
          plugin: 'builtin.memory',
          capability: 'save_memory',
          result: { saved: true, id: 'memory-1' },
        },
      ],
    });
    expect(pluginDispatch.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory',
      toolName: 'save_memory',
      params: { content: '自动化保存的记忆' },
      context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
    });
  });

  it('records error logs when automation execution returns error status', async () => {
    const pluginDispatch = {
      executeTool: jest.fn().mockRejectedValue(new Error('tool failed')),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    service = createService({ pluginDispatch });

    service.create('user-1', {
      actions: [
        {
          type: 'device_command',
          plugin: 'builtin.memory',
          capability: 'save_memory',
          params: { content: '自动化保存失败' },
        },
      ],
      name: '失败自动化',
      trigger: { type: 'manual' },
    });

    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({
      status: 'error',
      results: [
        {
          action: 'device_command',
          error: 'tool failed',
        },
      ],
    });
    expect(service.getLogs('user-1', 'automation-1')).toEqual([
      expect.objectContaining({
        id: 'automation-log-automation-1-1',
        status: 'error',
      }),
    ]);
  });

  it('runs automation:after-run hooks even when action execution fails', async () => {
    const pluginDispatch = {
      executeTool: jest.fn().mockRejectedValue(new Error('tool failed')),
      invokeHook: jest.fn().mockImplementation(async ({ hookName }: { hookName: string }) => {
        if (hookName === 'automation:after-run') {
          return {
            action: 'mutate',
            results: [{ action: 'hook', result: 'after-error rewrite' }],
            status: 'after-error',
          };
        }
        return { action: 'pass' };
      }),
      listPlugins: jest.fn().mockReturnValue([
        {
          connected: true,
          conversationScopes: {},
          defaultEnabled: true,
          manifest: { hooks: [{ name: 'automation:after-run' }], id: 'builtin.automation-recorder' },
          pluginId: 'builtin.automation-recorder',
        },
      ]),
    };
    service = createService({ pluginDispatch });

    service.create('user-1', {
      actions: [
        {
          type: 'device_command',
          plugin: 'builtin.memory',
          capability: 'save_memory',
          params: { content: '失败后仍需 after-run' },
        },
      ],
      name: '失败后 after-run',
      trigger: { type: 'manual' },
    });

    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({
      status: 'after-error',
      results: [{ action: 'hook', result: 'after-error rewrite' }],
    });
    expect(pluginDispatch.invokeHook).toHaveBeenCalledWith({
      context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
      hookName: 'automation:after-run',
      pluginId: 'builtin.automation-recorder',
      payload: {
        context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
        automation: expect.objectContaining({
          id: 'automation-1',
          name: '失败后 after-run',
        }),
        status: 'error',
        results: [
          {
            action: 'device_command',
            error: 'tool failed',
          },
        ],
      },
    });
    expect(pluginDispatch.executeTool.mock.invocationCallOrder[0]).toBeLessThan(
      pluginDispatch.invokeHook.mock.invocationCallOrder[0],
    );
  });

  it('supports automation:before-run short-circuit and skips action execution', async () => {
    const pluginDispatch = {
      executeTool: jest.fn(),
      invokeHook: jest.fn().mockResolvedValue({
        action: 'short-circuit',
        status: 'success',
        results: [{ action: 'hook', result: '由插件直接完成' }],
      }),
      listPlugins: jest.fn().mockReturnValue([
        {
          connected: true,
          conversationScopes: {},
          defaultEnabled: true,
          manifest: { hooks: [{ name: 'automation:before-run' }, { name: 'automation:after-run' }], id: 'builtin.automation-recorder' },
          pluginId: 'builtin.automation-recorder',
        },
      ]),
    };
    service = createService({ pluginDispatch });

    service.create('user-1', {
      actions: [{ type: 'device_command', plugin: 'builtin.memory', capability: 'save_memory', params: { content: '原始内容' } }],
      name: '自动化短路',
      trigger: { type: 'manual' },
    });

    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({
      status: 'success',
      results: [{ action: 'hook', result: '由插件直接完成' }],
    });
    expect(pluginDispatch.executeTool).not.toHaveBeenCalled();
  });

  it('supports automation:after-run mutations on status and results', async () => {
    const pluginDispatch = {
      executeTool: jest.fn().mockResolvedValue({ saved: true }),
      invokeHook: jest.fn().mockImplementation(async ({ hookName }: { hookName: string }) => {
        if (hookName === 'automation:after-run') {
          return {
            action: 'mutate',
            results: [{ action: 'hook', result: 'after-run rewrite' }],
            status: 'mutated',
          };
        }
        return { action: 'pass' };
      }),
      listPlugins: jest.fn().mockReturnValue([
        {
          connected: true,
          conversationScopes: {},
          defaultEnabled: true,
          manifest: { hooks: [{ name: 'automation:after-run' }], id: 'builtin.automation-recorder' },
          pluginId: 'builtin.automation-recorder',
        },
      ]),
    };
    service = createService({ pluginDispatch });

    service.create('user-1', {
      actions: [{ type: 'device_command', plugin: 'builtin.memory', capability: 'save_memory', params: { content: '原始结果' } }],
      name: 'after-run 改写',
      trigger: { type: 'manual' },
    });

    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({
      status: 'mutated',
      results: [{ action: 'hook', result: 'after-run rewrite' }],
    });
    expect(pluginDispatch.executeTool).toHaveBeenCalledTimes(1);
    expect(pluginDispatch.listPlugins).toHaveBeenCalledTimes(2);
    expect(pluginDispatch.invokeHook).toHaveBeenCalledTimes(1);
    expect(pluginDispatch.invokeHook).toHaveBeenCalledWith({
      context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
      hookName: 'automation:after-run',
      pluginId: 'builtin.automation-recorder',
      payload: {
        context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
        automation: expect.objectContaining({
          actions: [
            {
              capability: 'save_memory',
              params: { content: '原始结果' },
              plugin: 'builtin.memory',
              type: 'device_command',
            },
          ],
          id: 'automation-1',
          name: 'after-run 改写',
          trigger: { type: 'manual' },
        }),
        status: 'success',
        results: [
          {
            action: 'device_command',
            capability: 'save_memory',
            plugin: 'builtin.memory',
            result: { saved: true },
          },
        ],
      },
    });
    expect(pluginDispatch.executeTool.mock.invocationCallOrder[0]).toBeLessThan(
      pluginDispatch.invokeHook.mock.invocationCallOrder[0],
    );
  });

  it('routes ai_message actions through the unified message lifecycle chain', async () => {
    const pluginDispatch = {
      executeTool: jest.fn(),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    const conversationMessageLifecycleService = {
      startMessageGeneration: jest.fn().mockResolvedValue({
        userMessage: {
          id: 'message-user-1',
          role: 'user',
          content: '咖啡已经煮好了',
          parts: [{ type: 'text', text: '咖啡已经煮好了' }],
          status: 'completed',
          createdAt: '2026-03-29T15:00:00.000Z',
          updatedAt: '2026-03-29T15:00:00.000Z',
        },
        assistantMessage: {
          id: 'message-assistant-1',
          role: 'assistant',
          content: '',
          parts: [],
          status: 'pending',
          createdAt: '2026-03-29T15:00:00.000Z',
          updatedAt: '2026-03-29T15:00:00.000Z',
        },
      }),
    };
    service = createService({ pluginDispatch, conversationMessageLifecycleService });

    service.create('user-1', {
      actions: [{ type: 'ai_message', message: '咖啡已经煮好了', target: { type: 'conversation', id: 'conversation-1' } }],
      name: '自动化消息通知',
      trigger: { type: 'manual' },
    });

    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({
      status: 'success',
      results: [
        {
          action: 'ai_message',
          target: { type: 'conversation', id: 'conversation-1' },
          result: {
            userMessage: expect.objectContaining({
              id: 'message-user-1',
              role: 'user',
              content: '咖啡已经煮好了',
            }),
            assistantMessage: expect.objectContaining({
              id: 'message-assistant-1',
              role: 'assistant',
              status: 'pending',
            }),
          },
        },
      ],
    });
    expect(conversationMessageLifecycleService.startMessageGeneration).toHaveBeenCalledWith(
      'conversation-1',
      { content: '咖啡已经煮好了' },
      'user-1',
    );
  });

  it('passes the first conversation target into later device_command action context', async () => {
    const pluginDispatch = {
      executeTool: jest.fn().mockResolvedValue({ conversationId: 'subagent-conversation-1' }),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    const toolRegistryService = {
      executeRegisteredTool: jest.fn().mockResolvedValue({ conversationId: 'subagent-conversation-1' }),
    };
    const conversationMessageLifecycleService = {
      startMessageGeneration: jest.fn().mockResolvedValue({
        userMessage: {
          id: 'message-user-1',
          role: 'user',
          content: '自动化主会话',
          parts: [{ type: 'text', text: '自动化主会话' }],
          status: 'completed',
          createdAt: '2026-03-29T15:00:00.000Z',
          updatedAt: '2026-03-29T15:00:00.000Z',
        },
        assistantMessage: {
          id: 'message-assistant-1',
          role: 'assistant',
          content: '',
          parts: [],
          status: 'pending',
          createdAt: '2026-03-29T15:00:00.000Z',
          updatedAt: '2026-03-29T15:00:00.000Z',
        },
      }),
    };
    service = createService({
      pluginDispatch,
      conversationMessageLifecycleService,
      toolRegistryService,
    });

    service.create('user-1', {
      actions: [
        {
          type: 'ai_message',
          message: '自动化主会话',
          target: { type: 'conversation', id: 'conversation-1' },
        },
        {
          type: 'device_command',
          sourceKind: 'internal',
          sourceId: 'subagent',
          capability: 'spawn_subagent',
          params: { prompt: '请继续处理' },
        },
      ],
      name: '会话绑定 subagent 自动化',
      trigger: { type: 'manual' },
    });

    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({
      status: 'success',
      results: [
        {
          action: 'ai_message',
          target: { type: 'conversation', id: 'conversation-1' },
          result: {
            userMessage: expect.objectContaining({
              id: 'message-user-1',
              role: 'user',
              content: '自动化主会话',
            }),
            assistantMessage: expect.objectContaining({
              id: 'message-assistant-1',
              role: 'assistant',
              status: 'pending',
            }),
          },
        },
        {
          action: 'device_command',
          capability: 'spawn_subagent',
          sourceKind: 'internal',
          sourceId: 'subagent',
          result: { conversationId: 'subagent-conversation-1' },
        },
      ],
    });
    expect(toolRegistryService.executeRegisteredTool).toHaveBeenNthCalledWith(1, {
      sourceKind: 'internal',
      sourceId: 'subagent',
      toolName: 'spawn_subagent',
      params: { prompt: '请继续处理' },
      context: {
        source: 'automation',
        userId: 'user-1',
        automationId: 'automation-1',
        conversationId: 'conversation-1',
      },
    });
  });

  it('schedules enabled cron automations and runs them on interval', async () => {
    const pluginDispatch = {
      executeTool: jest.fn().mockResolvedValue({ saved: true }),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    service = createService({ pluginDispatch });

    service.create('user-1', {
      actions: [{ type: 'device_command', plugin: 'builtin.memory', capability: 'save_memory', params: { content: '定时执行' } }],
      name: '定时自动化',
      trigger: { type: 'cron', cron: '10s' },
    });

    await jest.advanceTimersByTimeAsync(10000);

    expect(pluginDispatch.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory',
      toolName: 'save_memory',
      params: { content: '定时执行' },
      context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
    });
  });

  it('supports standard cron expressions for scheduled automations', async () => {
    const pluginDispatch = {
      executeTool: jest.fn().mockResolvedValue({ saved: true }),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    service = createService({ pluginDispatch });

    service.create('user-1', {
      actions: [{ type: 'device_command', plugin: 'builtin.memory', capability: 'save_memory', params: { content: 'cron 表达式执行' } }],
      name: 'cron 表达式自动化',
      trigger: { type: 'cron', cron: '*/1 * * * * *' },
    });

    await jest.advanceTimersByTimeAsync(1000);

    expect(pluginDispatch.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory',
      toolName: 'save_memory',
      params: { content: 'cron 表达式执行' },
      context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
    });
  });

  it('creates dedicated cron child conversations for ai_message automations and trims old history', async () => {
    const { conversationMessageLifecycleService, conversationRecordService } = createConversationServices();
    const parentConversation = conversationRecordService.createConversation({
      title: '自动化父会话',
      userId: 'user-1',
    }) as { id: string };
    service = createService({
      conversationMessageLifecycleService,
      conversationRecordService,
    });

    service.create('user-1', {
      actions: [
        {
          type: 'ai_message',
          message: '定时整理日报',
          target: {
            type: 'conversation',
            id: parentConversation.id,
            conversationMode: 'cron_child',
            maxHistoryConversations: 2,
          },
        },
      ],
      name: '日报自动化',
      trigger: { type: 'cron', cron: '10s' },
    });

    await jest.advanceTimersByTimeAsync(10000);
    await jest.advanceTimersByTimeAsync(10000);
    await jest.advanceTimersByTimeAsync(10000);

    const childConversations = conversationRecordService.listChildConversations(parentConversation.id) as Array<{ id: string }>;
    expect(childConversations).toHaveLength(2);

    const newestIds = childConversations.map((item) => item.id);
    const parentDetail = conversationRecordService.getConversation(parentConversation.id, 'user-1') as { messages: unknown[] };
    expect(parentDetail.messages).toHaveLength(0);

    for (const childConversationId of newestIds) {
      const childDetail = conversationRecordService.getConversation(childConversationId, 'user-1') as { messages: Array<{ content: string | null }> };
      expect(childDetail.messages).toHaveLength(2);
      expect(childDetail.messages[0]?.content).toBe('定时整理日报');
      expect(childDetail.messages[1]?.content).toBe('');
    }

    const automation = service.getById('user-1', 'automation-1') as { cronRunConversationIds?: string[]; logs?: unknown[] };
    expect(automation.cronRunConversationIds).toBeUndefined();
    expect(automation.logs).toHaveLength(3);
  });

  it('records failed cron child preparation when the parent conversation is missing', async () => {
    const { conversationMessageLifecycleService, conversationRecordService } = createConversationServices();
    const parentConversation = conversationRecordService.createConversation({
      title: '待删除父会话',
      userId: 'user-1',
    }) as { id: string };
    service = createService({
      conversationMessageLifecycleService,
      conversationRecordService,
    });

    service.create('user-1', {
      actions: [
        {
          type: 'ai_message',
          message: '这次会失败',
          target: {
            type: 'conversation',
            id: parentConversation.id,
            conversationMode: 'cron_child',
            maxHistoryConversations: 2,
          },
        },
      ],
      name: '失效父会话自动化',
      trigger: { type: 'cron', cron: '10s' },
    });
    await conversationRecordService.deleteConversation(parentConversation.id, 'user-1');

    await jest.advanceTimersByTimeAsync(10000);

    expect(service.getLogs('user-1', 'automation-1')).toEqual([
      expect.objectContaining({
        status: 'error',
        result: expect.stringContaining('Conversation not found'),
      }),
    ]);
    expect(service.getById('user-1', 'automation-1')).toEqual(expect.objectContaining({
      lastRunAt: expect.any(String),
    }));
  });

  it('persists automations and keeps sequence after restart', async () => {
    service.create(SINGLE_USER_ID, {
      actions: [],
      name: '自动化一',
      trigger: { type: 'manual' },
    });
    service.create(SINGLE_USER_ID, {
      actions: [],
      name: '自动化二',
      trigger: { type: 'manual' },
    });

    const reloaded = createService();

    expect(reloaded.listByUser(SINGLE_USER_ID)).toEqual([
      expect.objectContaining({ id: 'automation-1', name: '自动化一' }),
      expect.objectContaining({ id: 'automation-2', name: '自动化二' }),
    ]);

    expect(reloaded.create(SINGLE_USER_ID, {
      actions: [],
      name: '自动化三',
      trigger: { type: 'manual' },
    })).toMatchObject({ id: 'automation-3' });
  });

  it('updates an existing automation in place instead of creating a new record', () => {
    service.create('user-1', {
      actions: [{ type: 'ai_message', message: '旧消息', target: { type: 'conversation', id: 'conversation-1' } }],
      name: '旧自动化',
      trigger: { type: 'manual' },
    });

    expect((service as unknown as {
      update: (userId: string, automationId: string, params: Record<string, unknown>) => unknown;
    }).update('user-1', 'automation-1', {
      actions: [{ type: 'ai_message', message: '新消息', target: { type: 'conversation', id: 'conversation-2' } }],
      name: '新自动化',
      trigger: { type: 'event', event: 'coffee.ready' },
    })).toEqual(expect.objectContaining({
      id: 'automation-1',
      name: '新自动化',
      trigger: { type: 'event', event: 'coffee.ready' },
    }));

    expect(service.listByUser('user-1')).toEqual([
      expect.objectContaining({
        id: 'automation-1',
        name: '新自动化',
        actions: [
          expect.objectContaining({
            message: '新消息',
            target: { type: 'conversation', id: 'conversation-2' },
          }),
        ],
      }),
    ]);
  });

  it('restores cron automations on module init after restart', async () => {
    const pluginDispatch = {
      executeTool: jest.fn().mockResolvedValue({ saved: true }),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    service = createService({ pluginDispatch });

    service.create(SINGLE_USER_ID, {
      actions: [{ type: 'device_command', plugin: 'builtin.memory', capability: 'save_memory', params: { content: '恢复执行' } }],
      name: '定时自动化',
      trigger: { type: 'cron', cron: '10s' },
    });
    service.onModuleDestroy();

    const reloadedKernel = {
      executeTool: jest.fn().mockResolvedValue({ saved: true }),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    const reloaded = createService({ pluginDispatch: reloadedKernel });
    reloaded.onModuleInit();

    await jest.advanceTimersByTimeAsync(10000);

    expect(reloadedKernel.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory',
      toolName: 'save_memory',
      params: { content: '恢复执行' },
      context: { source: 'automation', userId: SINGLE_USER_ID, automationId: 'automation-1' },
    });
  });

  it('deletes persisted legacy user automations that no longer符合单用户模型', () => {
    fs.writeFileSync(storagePath, JSON.stringify({
      automations: {
        'legacy-user': [
          {
            actions: [],
            createdAt: '2026-04-10T00:00:00.000Z',
            enabled: true,
            id: 'automation-1',
            lastRunAt: null,
            logs: [],
            name: '历史自动化',
            trigger: { type: 'manual' },
            updatedAt: '2026-04-10T00:00:00.000Z',
            userId: 'legacy-user',
          },
        ],
      },
      sequence: 1,
    }, null, 2), 'utf-8');

    service = createService();

    expect(service.listByUser(SINGLE_USER_ID)).toEqual([]);
    expect(JSON.parse(fs.readFileSync(storagePath, 'utf-8'))).toEqual({
      automations: {},
      sequence: 1,
    });
  });
});

function createService(input?: {
  conversationMessageLifecycleService?: {
    startMessageGeneration: (conversationId: string, payload: { content: string }, userId?: string) => Promise<unknown>;
  };
  conversationRecordService?: ConversationStoreService;
  pluginDispatch?: {
    executeTool: (...args: unknown[]) => Promise<unknown>;
    invokeHook: (...args: unknown[]) => Promise<unknown>;
    listPlugins: () => unknown[];
  };
  toolRegistryService?: {
    executeRegisteredTool: (...args: unknown[]) => Promise<unknown>;
  };
}): AutomationService {
  const pluginDispatch = input?.pluginDispatch ?? {
    executeTool: jest.fn(),
    invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
    listPlugins: jest.fn().mockReturnValue([]),
  };
  const automationExecutionService = new AutomationExecutionService(
    pluginDispatch as never,
    (input?.conversationMessageLifecycleService ?? {
      startMessageGeneration: async () => {
        throw new Error('ConversationMessageLifecycleService is not available');
      },
    }) as never,
    (input?.toolRegistryService ?? {
      executeRegisteredTool: async ({ context, params, sourceId, toolName }: { context: unknown; params: unknown; sourceId: string; toolName: string }) => pluginDispatch.executeTool({ context, params, pluginId: sourceId, toolName }),
    }) as never,
  );
  return new AutomationService(
    automationExecutionService,
    input?.conversationRecordService,
  );
}

function createConversationServices(): {
  conversationMessageLifecycleService: {
    startMessageGeneration: (conversationId: string, payload: { content: string }, userId?: string) => Promise<unknown>;
  };
  conversationRecordService: ConversationStoreService;
} {
  const conversationRecordService = new ConversationStoreService();
  const conversationMessageService = new ConversationMessageService(conversationRecordService);
  return {
    conversationMessageLifecycleService: {
      startMessageGeneration: async (conversationId: string, payload: { content: string }) => {
        const userMessage = await conversationMessageService.createMessageWithHooks(conversationId, {
          content: payload.content,
          parts: payload.content ? [{ text: payload.content, type: 'text' as const }] : [],
          role: 'user',
          status: 'completed',
        });
        const assistantMessage = conversationMessageService.createMessage(conversationId, {
          content: '',
          parts: [],
          role: 'assistant',
          status: 'pending',
        });
        return { assistantMessage, userMessage };
      },
    },
    conversationRecordService,
  };
}

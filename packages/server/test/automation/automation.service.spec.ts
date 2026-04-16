import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { AutomationExecutionService } from '../../src/execution/automation/automation-execution.service';
import { AutomationService } from '../../src/execution/automation/automation.service';

describe('AutomationService', () => {
  const envKey = 'GARLIC_CLAW_AUTOMATIONS_PATH';
  let service: AutomationService;
  let storagePath: string;

  beforeEach(() => {
    jest.useFakeTimers();
    storagePath = path.join(os.tmpdir(), `automation.service.spec-${Date.now()}-${Math.random()}.json`);
    process.env[envKey] = storagePath;
    service = createService();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env[envKey];
    try {
      if (fs.existsSync(storagePath)) fs.unlinkSync(storagePath);
    } catch {}
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

  it('routes device_command actions through runtime kernel execution', async () => {
    const runtimeHostPluginDispatchService = {
      executeTool: jest.fn().mockResolvedValue({ saved: true, id: 'memory-1' }),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    service = createService({ runtimeHostPluginDispatchService });

    service.create('user-1', {
      actions: [
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          params: { content: '自动化保存的记忆' },
        },
      ],
      name: '记忆工具自动化',
      trigger: { type: 'manual' },
    });

    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({
      status: 'success',
      results: [
        {
          action: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
          result: { saved: true, id: 'memory-1' },
        },
      ],
    });
    expect(runtimeHostPluginDispatchService.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-tools',
      toolName: 'save_memory',
      params: { content: '自动化保存的记忆' },
      context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
    });
  });

  it('records error logs when automation execution returns error status', async () => {
    const runtimeHostPluginDispatchService = {
      executeTool: jest.fn().mockRejectedValue(new Error('tool failed')),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    service = createService({ runtimeHostPluginDispatchService });

    service.create('user-1', {
      actions: [
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
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
    const runtimeHostPluginDispatchService = {
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
    service = createService({ runtimeHostPluginDispatchService });

    service.create('user-1', {
      actions: [
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
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
    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenCalledWith({
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
    expect(runtimeHostPluginDispatchService.executeTool.mock.invocationCallOrder[0]).toBeLessThan(
      runtimeHostPluginDispatchService.invokeHook.mock.invocationCallOrder[0],
    );
  });

  it('supports automation:before-run short-circuit and skips action execution', async () => {
    const runtimeHostPluginDispatchService = {
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
    service = createService({ runtimeHostPluginDispatchService });

    service.create('user-1', {
      actions: [{ type: 'device_command', plugin: 'builtin.memory-tools', capability: 'save_memory', params: { content: '原始内容' } }],
      name: '自动化短路',
      trigger: { type: 'manual' },
    });

    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({
      status: 'success',
      results: [{ action: 'hook', result: '由插件直接完成' }],
    });
    expect(runtimeHostPluginDispatchService.executeTool).not.toHaveBeenCalled();
  });

  it('supports automation:after-run mutations on status and results', async () => {
    const runtimeHostPluginDispatchService = {
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
    service = createService({ runtimeHostPluginDispatchService });

    service.create('user-1', {
      actions: [{ type: 'device_command', plugin: 'builtin.memory-tools', capability: 'save_memory', params: { content: '原始结果' } }],
      name: 'after-run 改写',
      trigger: { type: 'manual' },
    });

    await expect(service.run('user-1', 'automation-1')).resolves.toEqual({
      status: 'mutated',
      results: [{ action: 'hook', result: 'after-run rewrite' }],
    });
    expect(runtimeHostPluginDispatchService.executeTool).toHaveBeenCalledTimes(1);
    expect(runtimeHostPluginDispatchService.listPlugins).toHaveBeenCalledTimes(2);
    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenCalledTimes(1);
    expect(runtimeHostPluginDispatchService.invokeHook).toHaveBeenCalledWith({
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
              plugin: 'builtin.memory-tools',
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
            plugin: 'builtin.memory-tools',
            result: { saved: true },
          },
        ],
      },
    });
    expect(runtimeHostPluginDispatchService.executeTool.mock.invocationCallOrder[0]).toBeLessThan(
      runtimeHostPluginDispatchService.invokeHook.mock.invocationCallOrder[0],
    );
  });

  it('routes ai_message actions through the unified message.send chain', async () => {
    const runtimeHostPluginDispatchService = {
      executeTool: jest.fn(),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    const runtimeHostConversationMessageService = {
      sendMessage: jest.fn().mockResolvedValue({
        id: 'message-1',
        target: {
          type: 'conversation',
          id: 'conversation-1',
          label: 'Coffee Chat',
        },
        role: 'assistant',
        content: '咖啡已经煮好了',
        parts: [{ type: 'text', text: '咖啡已经煮好了' }],
        status: 'completed',
        createdAt: '2026-03-29T15:00:00.000Z',
        updatedAt: '2026-03-29T15:00:00.000Z',
      }),
    };
    service = createService({ runtimeHostPluginDispatchService, conversationMessageService: runtimeHostConversationMessageService });

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
          target: { type: 'conversation', id: 'conversation-1', label: 'Coffee Chat' },
          result: {
            id: 'message-1',
            target: { type: 'conversation', id: 'conversation-1', label: 'Coffee Chat' },
            role: 'assistant',
            content: '咖啡已经煮好了',
            parts: [{ type: 'text', text: '咖啡已经煮好了' }],
            status: 'completed',
            createdAt: '2026-03-29T15:00:00.000Z',
            updatedAt: '2026-03-29T15:00:00.000Z',
          },
        },
      ],
    });
    expect(runtimeHostConversationMessageService.sendMessage).toHaveBeenCalledWith(
      { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
      { content: '咖啡已经煮好了', target: { type: 'conversation', id: 'conversation-1' } },
    );
  });

  it('schedules enabled cron automations and runs them on interval', async () => {
    const runtimeHostPluginDispatchService = {
      executeTool: jest.fn().mockResolvedValue({ saved: true }),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    service = createService({ runtimeHostPluginDispatchService });

    service.create('user-1', {
      actions: [{ type: 'device_command', plugin: 'builtin.memory-tools', capability: 'save_memory', params: { content: '定时执行' } }],
      name: '定时自动化',
      trigger: { type: 'cron', cron: '10s' },
    });

    await jest.advanceTimersByTimeAsync(10000);

    expect(runtimeHostPluginDispatchService.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-tools',
      toolName: 'save_memory',
      params: { content: '定时执行' },
      context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
    });
  });

  it('persists automations and keeps sequence after restart', async () => {
    service.create('user-1', {
      actions: [],
      name: '自动化一',
      trigger: { type: 'manual' },
    });
    service.create('user-1', {
      actions: [],
      name: '自动化二',
      trigger: { type: 'manual' },
    });

    const reloaded = createService();

    expect(reloaded.listByUser('user-1')).toEqual([
      expect.objectContaining({ id: 'automation-1', name: '自动化一' }),
      expect.objectContaining({ id: 'automation-2', name: '自动化二' }),
    ]);

    expect(reloaded.create('user-1', {
      actions: [],
      name: '自动化三',
      trigger: { type: 'manual' },
    })).toMatchObject({ id: 'automation-3' });
  });

  it('restores cron automations on module init after restart', async () => {
    const runtimeHostPluginDispatchService = {
      executeTool: jest.fn().mockResolvedValue({ saved: true }),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    service = createService({ runtimeHostPluginDispatchService });

    service.create('user-1', {
      actions: [{ type: 'device_command', plugin: 'builtin.memory-tools', capability: 'save_memory', params: { content: '恢复执行' } }],
      name: '定时自动化',
      trigger: { type: 'cron', cron: '10s' },
    });
    service.onModuleDestroy();

    const reloadedKernel = {
      executeTool: jest.fn().mockResolvedValue({ saved: true }),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    };
    const reloaded = createService({ runtimeHostPluginDispatchService: reloadedKernel });
    reloaded.onModuleInit();

    await jest.advanceTimersByTimeAsync(10000);

    expect(reloadedKernel.executeTool).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-tools',
      toolName: 'save_memory',
      params: { content: '恢复执行' },
      context: { source: 'automation', userId: 'user-1', automationId: 'automation-1' },
    });
  });
});

function createService(input?: {
  conversationMessageService?: { sendMessage: (...args: unknown[]) => Promise<unknown> };
  runtimeHostPluginDispatchService?: {
    executeTool: (...args: unknown[]) => Promise<unknown>;
    invokeHook: (...args: unknown[]) => Promise<unknown>;
    listPlugins: () => unknown[];
  };
}): AutomationService {
  const automationExecutionService = new AutomationExecutionService(
    (input?.runtimeHostPluginDispatchService ?? {
      executeTool: jest.fn(),
      invokeHook: jest.fn().mockResolvedValue({ action: 'pass' }),
      listPlugins: jest.fn().mockReturnValue([]),
    }) as never,
    (input?.conversationMessageService ?? {
      sendMessage: async () => {
        throw new Error('RuntimeHostConversationMessageService is not available');
      },
    }) as never,
  );
  return new AutomationService(
    automationExecutionService,
  );
}

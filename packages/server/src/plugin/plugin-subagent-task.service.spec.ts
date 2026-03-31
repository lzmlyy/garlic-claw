import { NotFoundException } from '@nestjs/common';
import { PluginSubagentTaskService } from './plugin-subagent-task.service';

describe('PluginSubagentTaskService', () => {
  const records: Array<Record<string, unknown>> = [];
  const prisma = {
    pluginSubagentTask: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  const pluginRuntime = {
    executeSubagentRequest: jest.fn(),
    callHost: jest.fn(),
  };

  let service: PluginSubagentTaskService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-30T12:00:00.000Z'));
    jest.clearAllMocks();
    records.length = 0;

    prisma.pluginSubagentTask.create.mockImplementation(async ({ data }) => {
      const now = new Date();
      const record = {
        id: `subagent-task-${records.length + 1}`,
        pluginId: data.pluginId,
        pluginDisplayName: data.pluginDisplayName ?? null,
        runtimeKind: data.runtimeKind,
        userId: data.userId ?? null,
        conversationId: data.conversationId ?? null,
        status: data.status,
        requestJson: data.requestJson,
        contextJson: data.contextJson,
        resultJson: data.resultJson ?? null,
        error: data.error ?? null,
        providerId: data.providerId ?? null,
        modelId: data.modelId ?? null,
        writeBackTargetJson: data.writeBackTargetJson ?? null,
        writeBackStatus: data.writeBackStatus,
        writeBackError: data.writeBackError ?? null,
        writeBackMessageId: data.writeBackMessageId ?? null,
        requestedAt: data.requestedAt ?? now,
        startedAt: data.startedAt ?? null,
        finishedAt: data.finishedAt ?? null,
        createdAt: now,
        updatedAt: now,
      };
      records.push(record);
      return { ...record };
    });
    prisma.pluginSubagentTask.update.mockImplementation(async ({ where, data }) => {
      const record = records.find((item) => item.id === where.id);
      if (!record) {
        throw new Error(`task not found: ${where.id}`);
      }
      Object.assign(record, data, {
        updatedAt: new Date(),
      });
      return { ...record };
    });
    prisma.pluginSubagentTask.findMany.mockImplementation(async () =>
      [...records]
        .sort(
          (left, right) =>
            new Date(right.requestedAt as string | Date).getTime()
            - new Date(left.requestedAt as string | Date).getTime(),
        )
        .map((record) => ({ ...record })));
    prisma.pluginSubagentTask.findUnique.mockImplementation(async ({ where }) => {
      const record = records.find((item) => item.id === where.id);
      return record ? { ...record } : null;
    });
    prisma.pluginSubagentTask.updateMany.mockResolvedValue({ count: 0 });

    pluginRuntime.executeSubagentRequest.mockResolvedValue({
      providerId: 'openai',
      modelId: 'gpt-5.2',
      text: '这是后台任务总结',
      message: {
        role: 'assistant',
        content: '这是后台任务总结',
      },
      finishReason: 'stop',
      toolCalls: [],
      toolResults: [],
    });
    pluginRuntime.callHost.mockResolvedValue({
      id: 'assistant-message-1',
      target: {
        type: 'conversation',
        id: 'conversation-1',
        label: '当前会话',
      },
      role: 'assistant',
      content: '这是后台任务总结',
      parts: [
        {
          type: 'text',
          text: '这是后台任务总结',
        },
      ],
      status: 'completed',
      createdAt: '2026-03-30T12:00:05.000Z',
      updatedAt: '2026-03-30T12:00:05.000Z',
    });

    service = new PluginSubagentTaskService(
      prisma as never,
      pluginRuntime as never,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('starts a background subagent task, persists completion, and writes the result back through message.send', async () => {
    const startedTask = await service.startTask({
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: '子代理委派',
      runtimeKind: 'builtin',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        messages: [
          {
            role: 'user',
            content: '请帮我总结当前对话',
          },
        ],
        maxSteps: 4,
      },
      writeBackTarget: {
        type: 'conversation',
        id: 'conversation-1',
      },
    });

    expect(startedTask).toEqual(
      expect.objectContaining({
        pluginId: 'builtin.subagent-delegate',
        status: 'queued',
        requestPreview: '请帮我总结当前对话',
        writeBackStatus: 'pending',
      }),
    );

    await jest.runOnlyPendingTimersAsync();

    expect(pluginRuntime.executeSubagentRequest).toHaveBeenCalledWith({
      pluginId: 'builtin.subagent-delegate',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      request: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        messages: [
          {
            role: 'user',
            content: '请帮我总结当前对话',
          },
        ],
        maxSteps: 4,
      },
    });
    expect(pluginRuntime.callHost).toHaveBeenCalledWith({
      pluginId: 'builtin.subagent-delegate',
      context: {
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'message.send',
      params: {
        target: {
          type: 'conversation',
          id: 'conversation-1',
        },
        content: '这是后台任务总结',
        provider: 'openai',
        model: 'gpt-5.2',
      },
    });

    await expect(service.listOverview()).resolves.toEqual({
      tasks: [
        expect.objectContaining({
          id: startedTask.id,
          status: 'completed',
          resultPreview: '这是后台任务总结',
          writeBackStatus: 'sent',
          writeBackMessageId: 'assistant-message-1',
        }),
      ],
    });
    await expect(
      service.listTasksForPlugin('builtin.subagent-delegate'),
    ).resolves.toEqual([
      expect.objectContaining({
        id: startedTask.id,
        status: 'completed',
      }),
    ]);
    await expect(
      service.getTaskForPlugin('builtin.subagent-delegate', startedTask.id),
    ).resolves.toEqual(
      expect.objectContaining({
        id: startedTask.id,
        status: 'completed',
        result: expect.objectContaining({
          text: '这是后台任务总结',
        }),
      }),
    );
  });

  it('marks the task as error when background subagent execution fails and blocks cross-plugin reads', async () => {
    pluginRuntime.executeSubagentRequest.mockRejectedValueOnce(
      new Error('模型调用失败'),
    );

    const startedTask = await service.startTask({
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: '子代理委派',
      runtimeKind: 'builtin',
      context: {
        source: 'plugin',
        userId: 'user-1',
      },
      request: {
        messages: [
          {
            role: 'user',
            content: '请继续分析',
          },
        ],
        maxSteps: 4,
      },
    });

    await jest.runOnlyPendingTimersAsync();

    expect(pluginRuntime.callHost).not.toHaveBeenCalled();

    await expect(service.getTaskOrThrow(startedTask.id)).resolves.toEqual(
      expect.objectContaining({
        id: startedTask.id,
        status: 'error',
        error: '模型调用失败',
        writeBackStatus: 'skipped',
      }),
    );
    await expect(
      service.getTaskForPlugin('builtin.other-plugin', startedTask.id),
    ).rejects.toThrow(NotFoundException);
  });

  it('falls back safely when persisted task json snapshots are malformed', async () => {
    records.push({
      id: 'subagent-task-bad-json',
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: '子代理委派',
      runtimeKind: 'builtin',
      userId: 'user-1',
      conversationId: 'conversation-1',
      status: 'completed',
      requestJson: JSON.stringify({
        messages: 'bad-messages',
        maxSteps: 'oops',
      }),
      contextJson: JSON.stringify({
        source: 42,
        userId: 9,
      }),
      resultJson: JSON.stringify({
        providerId: 'openai',
        modelId: 'gpt-5.2',
        text: 123,
      }),
      error: null,
      providerId: 'openai',
      modelId: 'gpt-5.2',
      writeBackTargetJson: JSON.stringify({
        type: 'invalid',
        id: 9,
      }),
      writeBackStatus: 'sent',
      writeBackError: null,
      writeBackMessageId: 'assistant-message-1',
      requestedAt: new Date('2026-03-30T12:00:09.000Z'),
      startedAt: new Date('2026-03-30T12:00:10.000Z'),
      finishedAt: new Date('2026-03-30T12:00:11.000Z'),
      createdAt: new Date('2026-03-30T12:00:09.000Z'),
      updatedAt: new Date('2026-03-30T12:00:11.000Z'),
    });

    await expect(service.listOverview()).resolves.toEqual({
      tasks: [
        expect.not.objectContaining({
          writeBackTarget: expect.anything(),
        }),
      ],
    });

    await expect(service.getTaskOrThrow('subagent-task-bad-json')).resolves.toEqual(
      expect.objectContaining({
        id: 'subagent-task-bad-json',
        request: {
          messages: [],
          maxSteps: 4,
        },
        context: {
          source: 'plugin',
        },
      }),
    );

    const detail = await service.getTaskOrThrow('subagent-task-bad-json');
    expect(detail.result).toBeUndefined();
  });
});

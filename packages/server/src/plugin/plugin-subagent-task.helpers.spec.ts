import {
  cloneJsonValue,
  readPluginMessageSendSummary,
  serializePluginSubagentTaskDetail,
  serializePluginSubagentTaskSummary,
  type PersistedPluginSubagentTaskRecord,
} from './plugin-subagent-task.helpers';

describe('plugin-subagent-task.helpers', () => {
  it('serializes persisted task snapshots and falls back safely for malformed json', () => {
    const record: PersistedPluginSubagentTaskRecord = {
      id: 'subagent-task-1',
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: '子代理委派',
      runtimeKind: 'builtin',
      userId: 'user-1',
      conversationId: 'conversation-1',
      status: 'completed',
      requestJson: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: 'data:image/png;base64,abc',
              },
            ],
          },
        ],
        maxSteps: 4,
      }),
      contextJson: JSON.stringify({
        source: 'plugin',
        userId: 'user-1',
        conversationId: 'conversation-1',
      }),
      resultJson: JSON.stringify({
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
      }),
      error: null,
      providerId: 'openai',
      modelId: 'gpt-5.2',
      writeBackTargetJson: JSON.stringify({
        type: 'conversation',
        id: 'conversation-1',
        label: '当前会话',
      }),
      writeBackStatus: 'sent',
      writeBackError: null,
      writeBackMessageId: 'assistant-message-1',
      requestedAt: new Date('2026-03-30T12:00:00.000Z'),
      startedAt: new Date('2026-03-30T12:00:01.000Z'),
      finishedAt: new Date('2026-03-30T12:00:02.000Z'),
      createdAt: new Date('2026-03-30T12:00:00.000Z'),
      updatedAt: new Date('2026-03-30T12:00:02.000Z'),
    };

    expect(serializePluginSubagentTaskSummary(record)).toEqual(
      expect.objectContaining({
        id: 'subagent-task-1',
        runtimeKind: 'builtin',
        status: 'completed',
        resultPreview: '这是后台任务总结',
        writeBackStatus: 'sent',
        writeBackTarget: {
          type: 'conversation',
          id: 'conversation-1',
          label: '当前会话',
        },
      }),
    );

    const malformed = {
      ...record,
      requestJson: JSON.stringify({
        messages: 'bad',
      }),
      contextJson: JSON.stringify({
        source: 42,
      }),
      resultJson: JSON.stringify({
        providerId: 'openai',
        text: 42,
      }),
      writeBackTargetJson: JSON.stringify({
        type: 'invalid',
        id: 9,
      }),
      status: 'not-real',
      writeBackStatus: 'not-real',
    } satisfies PersistedPluginSubagentTaskRecord;

    expect(serializePluginSubagentTaskDetail(malformed)).toEqual(
      expect.objectContaining({
        status: 'error',
        writeBackStatus: 'skipped',
        request: {
          messages: [],
          maxSteps: 4,
        },
        context: {
          source: 'plugin',
        },
      }),
    );
  });

  it('builds previews for image-only requests and validates message.send summaries', () => {
    const imageOnly: PersistedPluginSubagentTaskRecord = {
      id: 'subagent-task-2',
      pluginId: 'builtin.subagent-delegate',
      pluginDisplayName: null,
      runtimeKind: 'remote',
      userId: null,
      conversationId: null,
      status: 'queued',
      requestJson: JSON.stringify({
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                image: 'data:image/png;base64,abc',
              },
            ],
          },
        ],
      }),
      contextJson: JSON.stringify({
        source: 'plugin',
      }),
      resultJson: null,
      error: null,
      providerId: null,
      modelId: null,
      writeBackTargetJson: null,
      writeBackStatus: 'pending',
      writeBackError: null,
      writeBackMessageId: null,
      requestedAt: new Date('2026-03-30T12:00:00.000Z'),
      startedAt: null,
      finishedAt: null,
      createdAt: new Date('2026-03-30T12:00:00.000Z'),
      updatedAt: new Date('2026-03-30T12:00:00.000Z'),
    };

    expect(serializePluginSubagentTaskSummary(imageOnly)).toEqual(
      expect.objectContaining({
        runtimeKind: 'remote',
        requestPreview: '包含图片输入的后台子代理任务',
        writeBackStatus: 'pending',
      }),
    );

    expect(
      readPluginMessageSendSummary({
        id: 'assistant-message-1',
        target: {
          type: 'conversation',
          id: 'conversation-1',
          label: '当前会话',
        },
      }),
    ).toEqual({
      id: 'assistant-message-1',
      target: {
        type: 'conversation',
        id: 'conversation-1',
        label: '当前会话',
      },
    });
    expect(() => readPluginMessageSendSummary('bad')).toThrow(
      'message.send 返回值必须是对象',
    );
    expect(() =>
      readPluginMessageSendSummary({
        id: 'assistant-message-1',
        target: {
          type: 'plugin',
          id: 'conversation-1',
        },
      }),
    ).toThrow('message.send 返回值中的 target 不合法');
  });

  it('clones json-safe values without sharing object references', () => {
    const original = {
      request: {
        messages: [
          {
            role: 'user',
            content: '请继续分析',
          },
        ],
      },
    };

    const cloned = cloneJsonValue(original);
    expect(cloned).toEqual(original);
    expect(cloned).not.toBe(original);
    expect(cloned.request).not.toBe(original.request);
  });
});

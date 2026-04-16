import { BUILTIN_SUBAGENT_DELEGATE_PLUGIN } from '../../../../src/plugin/builtin/tools/builtin-subagent-delegate.plugin';

describe('BUILTIN_SUBAGENT_DELEGATE_PLUGIN', () => {
  it('delegates summary runs through the host subagent API', async () => {
    const runSubagent = jest.fn().mockResolvedValue({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'summary',
      toolCalls: [],
      toolResults: [],
    });

    const result = await BUILTIN_SUBAGENT_DELEGATE_PLUGIN.tools?.delegate_summary?.({
      prompt: 'Summarize this thread',
    } as never, {
      callContext: {
        conversationId: 'conversation-1',
      },
      host: {
        getConfig: jest.fn().mockResolvedValue({
          allowedToolNames: 'memory.search,web.search',
          maxSteps: 4,
          targetModelId: 'gpt-5.4',
          targetProviderId: 'openai',
        }),
        runSubagent,
      },
    } as never);

    expect(runSubagent).toHaveBeenCalledWith({
      maxSteps: 4,
      messages: [
        {
          content: [{ text: 'Summarize this thread', type: 'text' }],
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      toolNames: ['memory.search', 'web.search'],
    });
    expect(result).toEqual({
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: 'summary',
      toolCalls: [],
      toolResults: [],
    });
  });

  it('starts background tasks and defaults write-back to the current conversation', async () => {
    const startSubagentTask = jest.fn().mockResolvedValue({
      id: 'task-1',
      pluginId: 'builtin.subagent-delegate',
      requestPreview: 'Summarize this thread',
      status: 'queued',
      writeBackStatus: 'pending',
    });

    const result = await BUILTIN_SUBAGENT_DELEGATE_PLUGIN.tools?.delegate_summary_background?.({
      prompt: 'Summarize this thread',
    } as never, {
      callContext: {
        conversationId: 'conversation-1',
      },
      host: {
        getConfig: jest.fn().mockResolvedValue({
          maxSteps: 3,
          targetModelId: 'gpt-5.4',
          targetProviderId: 'openai',
        }),
        startSubagentTask,
      },
    } as never);

    expect(startSubagentTask).toHaveBeenCalledWith({
      maxSteps: 3,
      messages: [
        {
          content: [{ text: 'Summarize this thread', type: 'text' }],
          role: 'user',
        },
      ],
      modelId: 'gpt-5.4',
      providerId: 'openai',
      writeBack: {
        target: {
          id: 'conversation-1',
          type: 'conversation',
        },
      },
    });
    expect(result).toEqual({
      id: 'task-1',
      pluginId: 'builtin.subagent-delegate',
      requestPreview: 'Summarize this thread',
      status: 'queued',
      writeBackStatus: 'pending',
    });
  });
});

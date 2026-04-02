import { createBuiltinPluginHostFacade } from './builtin-plugin-host-facade.helpers';

describe('builtin-plugin-host-facade.helpers', () => {
  it('routes conversation and state host methods through call/callHost', async () => {
    const call = jest.fn().mockResolvedValue({
      ok: true,
    });
    const callHost = jest.fn().mockResolvedValue({
      ok: true,
    });
    const host = createBuiltinPluginHostFacade({
      call,
      callHost,
    });

    await host.sendMessage({
      content: 'hello',
      target: {
        type: 'conversation',
        id: 'conversation-1',
      },
    });
    await host.startConversationSession({
      timeoutMs: 30_000,
      captureHistory: true,
    });
    await host.getStorage('draft', {
      scope: 'conversation',
    });

    expect(callHost).toHaveBeenNthCalledWith(1, 'message.send', {
      content: 'hello',
      target: {
        type: 'conversation',
        id: 'conversation-1',
      },
    });
    expect(callHost).toHaveBeenNthCalledWith(2, 'conversation.session.start', {
      timeoutMs: 30_000,
      captureHistory: true,
    });
    expect(call).toHaveBeenCalledWith('storage.get', {
      key: 'draft',
      scope: 'conversation',
    });
  });

  it('routes ai and subagent methods through shared host param builders', async () => {
    const call = jest.fn().mockResolvedValue({
      ok: true,
    });
    const callHost = jest.fn().mockResolvedValue({
      ok: true,
    });
    const host = createBuiltinPluginHostFacade({
      call,
      callHost,
    });

    await host.generate({
      providerId: 'openai',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'hello',
            },
          ],
        },
      ],
    });
    await host.runSubagent({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'delegate',
            },
          ],
        },
      ],
      maxSteps: 2,
    });
    await host.startSubagentTask({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'background',
            },
          ],
        },
      ],
      toolNames: ['echo'],
    });
    await host.generateText({
      prompt: 'ping',
      maxOutputTokens: 64,
    });

    expect(callHost).toHaveBeenNthCalledWith(1, 'llm.generate', {
      providerId: 'openai',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'hello',
            },
          ],
        },
      ],
    });
    expect(callHost).toHaveBeenNthCalledWith(2, 'subagent.run', {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'delegate',
            },
          ],
        },
      ],
      maxSteps: 2,
    });
    expect(callHost).toHaveBeenNthCalledWith(3, 'subagent.task.start', {
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'background',
            },
          ],
        },
      ],
      toolNames: ['echo'],
    });
    expect(call).toHaveBeenCalledWith('llm.generate-text', {
      prompt: 'ping',
      maxOutputTokens: 64,
    });
  });
});

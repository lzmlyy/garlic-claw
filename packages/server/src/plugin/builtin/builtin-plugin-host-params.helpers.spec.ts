import {
  buildBuiltinGenerateParams,
  buildBuiltinMessageSendParams,
  buildBuiltinStartSubagentTaskParams,
  toHostJsonValue,
  toScopedStateParams,
} from './builtin-plugin-host-params.helpers';

describe('builtin-plugin-host-params.helpers', () => {
  it('normalizes host json values and scoped state params', () => {
    expect(toHostJsonValue({
      message: 'ok',
      skipped: undefined,
      createdAt: new Date('2026-04-02T12:00:00.000Z'),
      nested: {
        enabled: true,
        ignored: undefined,
      },
      list: [
        1,
        undefined,
        new Date('2026-04-02T12:01:00.000Z'),
      ],
    })).toEqual({
      message: 'ok',
      createdAt: '2026-04-02T12:00:00.000Z',
      nested: {
        enabled: true,
      },
      list: [
        1,
        '2026-04-02T12:01:00.000Z',
      ],
    });

    expect(toScopedStateParams()).toEqual({});
    expect(toScopedStateParams({
      scope: 'conversation',
    })).toEqual({
      scope: 'conversation',
    });
  });

  it('builds message send params while dropping absent fields', () => {
    expect(buildBuiltinMessageSendParams({
      target: {
        type: 'conversation',
        id: 'conversation-1',
      },
      content: 'hello',
      parts: [
        {
          type: 'text',
          text: 'hello',
        },
      ],
      model: 'gpt-5.2',
    })).toEqual({
      target: {
        type: 'conversation',
        id: 'conversation-1',
      },
      content: 'hello',
      parts: [
        {
          type: 'text',
          text: 'hello',
        },
      ],
      model: 'gpt-5.2',
    });
  });

  it('builds generate and subagent task params with only provided fields', () => {
    expect(buildBuiltinGenerateParams({
      providerId: 'openai',
      modelId: 'gpt-5.2',
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
      maxOutputTokens: 512,
    })).toEqual({
      providerId: 'openai',
      modelId: 'gpt-5.2',
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
      maxOutputTokens: 512,
    });

    expect(buildBuiltinStartSubagentTaskParams({
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
      toolNames: ['echo'],
      writeBack: {
        target: {
          type: 'conversation',
          id: 'conversation-1',
        },
      },
      maxSteps: 3,
    })).toEqual({
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
      toolNames: ['echo'],
      writeBack: {
        target: {
          type: 'conversation',
          id: 'conversation-1',
        },
      },
      maxSteps: 3,
    });
  });
});

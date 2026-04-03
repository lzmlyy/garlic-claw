import {
  applyAutomationAfterRunMutation,
  applyAutomationBeforeRunMutation,
  applyChatAfterModelMutation,
  applyChatBeforeModelHookResult,
  applyChatBeforeModelMutation,
  applyMessageCreatedMutation,
  applyMessageReceivedHookResult,
  applyMessageReceivedMutation,
  applyMessageUpdatedMutation,
  applyResponseBeforeSendMutation,
  applySubagentAfterRunMutation,
  applySubagentBeforeRunMutation,
  applyToolAfterCallMutation,
  applyToolBeforeCallMutation,
} from '@garlic-claw/shared';

describe('plugin-runtime-hook-mutation.helpers', () => {
  it('applies chat and message mutations', () => {
    expect(
      applyChatBeforeModelMutation(
        {
          providerId: 'provider-a',
          modelId: 'model-a',
          systemPrompt: 'old',
          messages: [{ role: 'user', content: 'hello' }],
          availableTools: [
            {
              name: 'search',
              description: 'search',
              parameters: {} as never,
            },
            {
              name: 'write',
              description: 'write',
              parameters: {} as never,
            },
          ],
        },
        {
          systemPrompt: 'new',
          toolNames: ['write'],
        } as never,
      ),
    ).toEqual({
      providerId: 'provider-a',
      modelId: 'model-a',
      systemPrompt: 'new',
      messages: [{ role: 'user', content: 'hello' }],
      availableTools: [
        {
          name: 'write',
          description: 'write',
          parameters: {},
        },
      ],
    });

    expect(
      applyChatBeforeModelHookResult({
        request: {
          providerId: 'provider-a',
          modelId: 'model-a',
          systemPrompt: 'old',
          messages: [{ role: 'user', content: 'hello' }],
          availableTools: [],
        },
        result: {
          action: 'short-circuit',
          assistantContent: 'done',
          assistantParts: null,
        },
      }),
    ).toEqual({
      action: 'short-circuit',
      request: {
        providerId: 'provider-a',
        modelId: 'model-a',
        systemPrompt: 'old',
        messages: [{ role: 'user', content: 'hello' }],
        availableTools: [],
      },
      assistantContent: 'done',
      assistantParts: [
        {
          type: 'text',
          text: 'done',
        },
      ],
      providerId: 'provider-a',
      modelId: 'model-a',
    });

    expect(
      applyMessageReceivedMutation(
        {
          context: { source: 'plugin' },
          conversationId: 'conversation-1',
          providerId: 'provider-a',
          modelId: 'model-a',
          message: {
            role: 'user',
            content: 'old',
            parts: [],
          },
          modelMessages: [{ role: 'user', content: 'old' }],
        } as never,
        {
          content: 'new',
          modelMessages: [{ role: 'user', content: 'new' }],
        } as never,
      ),
    ).toEqual({
      context: { source: 'plugin' },
      conversationId: 'conversation-1',
      providerId: 'provider-a',
      modelId: 'model-a',
      message: {
        role: 'user',
        content: 'new',
        parts: [],
      },
      modelMessages: [{ role: 'user', content: 'new' }],
    });

    expect(
      applyMessageReceivedHookResult({
        payload: {
          context: { source: 'plugin' },
          conversationId: 'conversation-1',
          providerId: 'provider-a',
          modelId: 'model-a',
          message: {
            role: 'user',
            content: 'old',
            parts: [],
          },
          modelMessages: [{ role: 'user', content: 'old' }],
        } as never,
        result: {
          action: 'short-circuit',
          assistantContent: 'handled',
          reason: 'session',
        },
      }),
    ).toEqual({
      action: 'short-circuit',
      payload: {
        context: { source: 'plugin' },
        conversationId: 'conversation-1',
        providerId: 'provider-a',
        modelId: 'model-a',
        message: {
          role: 'user',
          content: 'old',
          parts: [],
        },
        modelMessages: [{ role: 'user', content: 'old' }],
      },
      assistantContent: 'handled',
      assistantParts: [
        {
          type: 'text',
          text: 'handled',
        },
      ],
      providerId: 'provider-a',
      modelId: 'model-a',
      reason: 'session',
    });

    expect(
      applyChatAfterModelMutation(
        {
          providerId: 'provider-a',
          modelId: 'model-a',
          assistantMessageId: 'message-1',
          assistantContent: 'old',
          assistantParts: [],
          toolCalls: [],
          toolResults: [],
        },
        {
          assistantContent: 'new',
        } as never,
      ),
    ).toEqual({
      providerId: 'provider-a',
      modelId: 'model-a',
      assistantMessageId: 'message-1',
      assistantContent: 'new',
      assistantParts: [],
      toolCalls: [],
      toolResults: [],
    });

    expect(
      applyMessageCreatedMutation(
        {
          context: { source: 'plugin' },
          conversationId: 'conversation-1',
          message: {
            role: 'assistant',
            content: 'old',
            parts: [],
          },
          modelMessages: [],
        } as never,
        {
          content: 'new',
          status: 'completed',
        } as never,
      ).message,
    ).toEqual({
      role: 'assistant',
      content: 'new',
      parts: [],
      status: 'completed',
    });

    expect(
      applyMessageUpdatedMutation(
        {
          context: { source: 'plugin' },
          conversationId: 'conversation-1',
          messageId: 'message-1',
          currentMessage: {
            role: 'assistant',
            content: 'old',
            parts: [],
          },
          nextMessage: {
            role: 'assistant',
            content: 'old',
            parts: [],
          },
        } as never,
        {
          model: 'model-b',
        } as never,
      ).nextMessage,
    ).toEqual({
      role: 'assistant',
      content: 'old',
      parts: [],
      model: 'model-b',
    });
  });

  it('applies automation mutations', () => {
    expect(
      applyAutomationBeforeRunMutation(
        {
          context: { source: 'plugin' },
          automation: {
            id: 'automation-1',
            trigger: { type: 'event', event: 'demo' },
            actions: [],
          },
          actions: [],
        } as never,
        {
          actions: [
            {
              type: 'ai_message',
              message: 'done',
              target: {
                type: 'conversation',
                id: 'conversation-1',
              },
            },
          ],
        } as never,
      ).actions,
    ).toEqual([
      {
        type: 'ai_message',
        message: 'done',
        target: {
          type: 'conversation',
          id: 'conversation-1',
        },
      },
    ]);

    expect(
      applyAutomationAfterRunMutation(
        {
          context: { source: 'plugin' },
          automation: {
            id: 'automation-1',
            trigger: { type: 'event', event: 'demo' },
            actions: [],
          },
          status: 'pending',
          results: [],
        } as never,
        {
          status: 'completed',
          results: ['done'],
        } as never,
      ),
    ).toEqual({
      context: { source: 'plugin' },
      automation: {
        id: 'automation-1',
        trigger: { type: 'event', event: 'demo' },
        actions: [],
      },
      status: 'completed',
      results: ['done'],
    });
  });

  it('applies subagent mutations', () => {
    expect(
      applySubagentBeforeRunMutation(
        {
          context: { source: 'plugin' },
          pluginId: 'plugin-a',
          request: {
            messages: [{ role: 'user', content: 'hello' }],
            maxSteps: 2,
          },
        } as never,
        {
          providerId: 'provider-a',
          maxSteps: 4.8,
        } as never,
      ).request,
    ).toEqual({
      providerId: 'provider-a',
      messages: [{ role: 'user', content: 'hello' }],
      maxSteps: 4,
    });

    expect(
      applySubagentAfterRunMutation(
        {
          context: { source: 'plugin' },
          pluginId: 'plugin-a',
          request: {
            messages: [{ role: 'user', content: 'hello' }],
            maxSteps: 2,
          },
          result: {
            providerId: 'provider-a',
            modelId: 'model-a',
            text: 'old',
            message: {
              role: 'assistant',
              content: 'old',
            },
            finishReason: null,
            toolCalls: [],
            toolResults: [],
          },
        } as never,
        {
          text: 'new',
          finishReason: 'stop',
        } as never,
      ).result,
    ).toEqual({
      providerId: 'provider-a',
      modelId: 'model-a',
      text: 'new',
      message: {
        role: 'assistant',
        content: 'new',
      },
      finishReason: 'stop',
      toolCalls: [],
      toolResults: [],
    });
  });

  it('applies tool and response mutations', () => {
    expect(
      applyToolBeforeCallMutation(
        {
          context: { source: 'plugin' },
          source: { id: 'plugin-a', kind: 'plugin' },
          tool: {
            name: 'search',
            description: 'search',
            parameters: {} as never,
          },
          params: {
            query: 'old',
          },
        } as never,
        {
          params: {
            query: 'new',
          },
        } as never,
      ).params,
    ).toEqual({
      query: 'new',
    });

    expect(
      applyToolAfterCallMutation(
        {
          context: { source: 'plugin' },
          source: { id: 'plugin-a', kind: 'plugin' },
          tool: {
            name: 'search',
            description: 'search',
            parameters: {} as never,
          },
          params: {
            query: 'new',
          },
          output: 'old',
        } as never,
        {
          output: {
            ok: true,
          },
        } as never,
      ).output,
    ).toEqual({
      ok: true,
    });

    expect(
      applyResponseBeforeSendMutation(
        {
          context: { source: 'plugin' },
          responseSource: 'model',
          assistantMessageId: 'message-1',
          providerId: 'provider-a',
          modelId: 'model-a',
          assistantContent: 'old',
          assistantParts: [],
          toolCalls: [],
          toolResults: [],
        } as never,
        {
          assistantContent: 'new',
          toolCalls: [{ toolCallId: 'call-1' }],
          toolResults: [{ toolCallId: 'call-1' }],
        } as never,
      ),
    ).toEqual({
      context: { source: 'plugin' },
      responseSource: 'model',
      assistantMessageId: 'message-1',
      providerId: 'provider-a',
      modelId: 'model-a',
      assistantContent: 'new',
      assistantParts: [],
      toolCalls: [{ toolCallId: 'call-1' }],
      toolResults: [{ toolCallId: 'call-1' }],
    });
  });
});

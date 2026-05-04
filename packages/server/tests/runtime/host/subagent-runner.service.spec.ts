import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ProjectSubagentTypeRegistryService } from '../../../src/modules/execution/project/project-subagent-type-registry.service';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { ConversationMessageService } from '../../../src/modules/runtime/host/conversation-message.service';
import { ConversationStoreService } from '../../../src/modules/runtime/host/conversation-store.service';
import { SubagentRunnerService } from '../../../src/modules/runtime/host/subagent-runner.service';

describe('SubagentRunnerService', () => {
  let conversationsPath: string;

  beforeEach(() => {
    jest.useFakeTimers();
    conversationsPath = path.join(os.tmpdir(), `gc-subagent-runner-${Date.now()}-${Math.random()}.json`);
    process.env.GARLIC_CLAW_CONVERSATIONS_PATH = conversationsPath;
  });

  afterEach(() => {
    jest.useRealTimers();
    delete process.env.GARLIC_CLAW_CONVERSATIONS_PATH;
    if (fs.existsSync(conversationsPath)) {
      fs.unlinkSync(conversationsPath);
    }
  });

  it('spawns a child conversation and completes execution in the child conversation itself', async () => {
    const fixture = createFixture();
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => ({
      finishReason: 'stop',
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    })));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      description: '总结当前对话',
      messages: [{ content: '请帮我总结当前对话', role: 'user' }],
      modelId: 'gpt-5.4',
      providerId: 'openai',
    } as never) as { conversationId: string; status: string };

    expect(summary).toMatchObject({
      conversationId: expect.any(String),
      status: 'queued',
    });

    await jest.runAllTimersAsync();

    const detail = fixture.runner.getSubagent('builtin.memory', summary.conversationId);
    expect(detail).toMatchObject({
      conversationId: summary.conversationId,
      messageCount: 2,
      result: {
        text: 'Generated: 请帮我总结当前对话',
      },
      status: 'completed',
    });
    expect(fixture.recordService.requireConversation(summary.conversationId, 'user-1').parentId).toBe(fixture.parentConversationId);
    expect(fixture.recordService.requireConversation(fixture.parentConversationId, 'user-1').messages).toEqual([]);
  });

  it('continues the same child conversation through sendInputSubagent', async () => {
    const fixture = createFixture();
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => ({
      finishReason: 'stop',
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    })));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '第一轮', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };
    await jest.runAllTimersAsync();

    const continued = await fixture.runner.sendInputSubagent('builtin.memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      conversationId: summary.conversationId,
      description: '第二轮',
      messages: [{ content: '第二轮', role: 'user' }],
    });
    expect(continued).toMatchObject({
      conversationId: summary.conversationId,
      status: 'queued',
    });

    await jest.runAllTimersAsync();

    expect(fixture.runner.getSubagent('builtin.memory', summary.conversationId)).toMatchObject({
      conversationId: summary.conversationId,
      description: '第二轮',
      messageCount: 4,
      result: {
        text: 'Generated: 第二轮',
      },
      status: 'completed',
    });
    expect(fixture.afterResponseCompactionService.run).toHaveBeenCalledWith({
      conversationId: summary.conversationId,
      continuationState: {
        hasAssistantTextOutput: true,
        hasToolActivity: false,
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    });
    expect(fixture.contextGovernanceService.rewriteHistoryAfterCompletedResponse).not.toHaveBeenCalled();
  });

  it('runs post-completion auto compaction for subagent conversations without rewriting completed status on failure', async () => {
    const fixture = createFixture();
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => ({
      finishReason: 'stop',
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    })));
    fixture.afterResponseCompactionService.run.mockRejectedValueOnce(new Error('compaction failed'));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '压缩失败也不能改成 error', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };

    await jest.runAllTimersAsync();

    expect(fixture.afterResponseCompactionService.run).toHaveBeenCalledWith({
      conversationId: summary.conversationId,
      continuationState: {
        hasAssistantTextOutput: true,
        hasToolActivity: false,
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    });
    expect(fixture.contextGovernanceService.rewriteHistoryAfterCompletedResponse).not.toHaveBeenCalled();
    expect(fixture.runner.getSubagent('builtin.memory', summary.conversationId)).toMatchObject({
      conversationId: summary.conversationId,
      result: {
        text: 'Generated: 压缩失败也不能改成 error',
      },
      status: 'completed',
    });
  });

  it('auto-continues the same subagent conversation after post-response compaction only when the previous round had tool activity and no final text', async () => {
    const fixture = createFixture();
    fixture.afterResponseCompactionService.run
      .mockResolvedValueOnce({
        compactionTriggered: true,
        continuation: {
          content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
          metadata: { annotations: [{ data: { role: 'continue', synthetic: true, trigger: 'after-response' }, owner: 'conversation.context-governance', type: 'context-compaction', version: '1' }] },
          parts: [{ text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.', type: 'text' }],
        },
      })
      .mockResolvedValueOnce({ compactionTriggered: false, continuation: null });
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn()
      .mockResolvedValueOnce({
        finishReason: 'stop',
        message: {
          content: '',
          role: 'assistant',
        },
        modelId: 'gpt-5.4',
        providerId: 'openai',
        text: '',
        toolCalls: [{ input: { topic: 'smoke' }, toolCallId: 'tool-call-1', toolName: 'save_memory' }],
        toolResults: [{ output: { kind: 'tool:text', value: 'done' }, toolCallId: 'tool-call-1', toolName: 'save_memory' }],
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        message: {
          content: 'Generated: 自动续跑后的第二轮',
          role: 'assistant',
        },
        modelId: 'gpt-5.4',
        providerId: 'openai',
        text: 'Generated: 自动续跑后的第二轮',
        toolCalls: [],
        toolResults: [],
      }));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '先调用工具，再继续', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };

    const waitPromise = fixture.runner.waitSubagent('builtin.memory', {
      conversationId: summary.conversationId,
    });

    await jest.runAllTimersAsync();

    await expect(waitPromise).resolves.toMatchObject({
      conversationId: summary.conversationId,
      result: 'Generated: 自动续跑后的第二轮',
      status: 'completed',
    });

    const conversation = fixture.recordService.requireConversation(summary.conversationId, 'user-1');
    expect(conversation.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
        role: 'user',
      }),
      expect.objectContaining({
        content: 'Generated: 自动续跑后的第二轮',
        role: 'assistant',
        status: 'completed',
      }),
    ]));
    expect(fixture.afterResponseCompactionService.run).toHaveBeenCalledTimes(2);
    expect(fixture.contextGovernanceService.rewriteHistoryAfterCompletedResponse).not.toHaveBeenCalled();
  });

  it('emits subagent tool events and auto-compaction continuation starts through the live conversation subscription', async () => {
    const fixture = createFixture();
    const events: Array<Record<string, unknown>> = [];
    fixture.afterResponseCompactionService.run
      .mockResolvedValueOnce({
        compactionTriggered: true,
        continuation: {
          content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
          metadata: { annotations: [{ data: { role: 'continue', synthetic: true, trigger: 'after-response' }, owner: 'conversation.context-governance', type: 'context-compaction', version: '1' }] },
          parts: [{ text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.', type: 'text' }],
        },
      })
      .mockResolvedValueOnce({ compactionTriggered: false, continuation: null });
    fixture.aiModelExecutionService.streamText
      .mockReturnValueOnce({
        finishReason: Promise.resolve('tool-calls'),
        fullStream: (async function* () {
          yield { input: { topic: 'smoke' }, toolCallId: 'tool-call-1', toolName: 'save_memory', type: 'tool-call' };
          yield { output: { kind: 'tool:text', value: 'done' }, toolCallId: 'tool-call-1', toolName: 'save_memory', type: 'tool-result' };
        })(),
        modelId: 'gpt-5.4',
        providerId: 'openai',
        usage: Promise.resolve({
          inputTokens: 10,
          outputTokens: 5,
          source: 'provider',
          totalTokens: 15,
        }),
      })
      .mockReturnValueOnce({
        finishReason: Promise.resolve('stop'),
        fullStream: (async function* () {
          yield { text: 'Generated: 自动续跑后的第二轮', type: 'text-delta' };
        })(),
        modelId: 'gpt-5.4',
        providerId: 'openai',
        usage: Promise.resolve({
          inputTokens: 20,
          outputTokens: 10,
          source: 'provider',
          totalTokens: 30,
        }),
      });

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '先调用工具，再继续', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };

    const unsubscribe = fixture.runner.subscribe(summary.conversationId, (event) => {
      events.push(event as Record<string, unknown>);
    });

    await jest.runAllTimersAsync();
    unsubscribe();

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        assistantMessage: expect.objectContaining({ id: expect.any(String), role: 'assistant', status: 'pending' }),
        type: 'message-start',
        userMessage: expect.objectContaining({ id: expect.any(String), role: 'user' }),
      }),
      expect.objectContaining({
        input: { topic: 'smoke' },
        messageId: expect.any(String),
        toolCallId: 'tool-call-1',
        toolName: 'save_memory',
        type: 'tool-call',
      }),
      expect.objectContaining({
        messageId: expect.any(String),
        output: { kind: 'tool:text', value: 'done' },
        toolCallId: 'tool-call-1',
        toolName: 'save_memory',
        type: 'tool-result',
      }),
      expect.objectContaining({
        messageId: expect.any(String),
        text: 'Generated: 自动续跑后的第二轮',
        type: 'text-delta',
      }),
      expect.objectContaining({
        content: 'Generated: 自动续跑后的第二轮',
        messageId: expect.any(String),
        type: 'message-patch',
      }),
      expect.objectContaining({
        messageId: expect.any(String),
        status: 'completed',
        type: 'finish',
      }),
    ]));
    const toolCallIndex = events.findIndex((event) => event.type === 'tool-call' && event.toolCallId === 'tool-call-1');
    const toolResultIndex = events.findIndex((event) => event.type === 'tool-result' && event.toolCallId === 'tool-call-1');
    const firstFinishIndex = events.findIndex((event) => event.messageId && event.type === 'finish');
    const continuationStartIndex = events.findIndex((event) => event.type === 'message-start' && event.userMessage);
    expect(toolCallIndex).toBeGreaterThanOrEqual(0);
    expect(toolResultIndex).toBeGreaterThan(toolCallIndex);
    expect(firstFinishIndex).toBeGreaterThanOrEqual(0);
    expect(firstFinishIndex).toBeGreaterThan(toolResultIndex);
    expect(continuationStartIndex).toBeGreaterThan(firstFinishIndex);
  });

  it('rebuilds subagent continuation requests from compacted visible history instead of replaying covered raw turns', async () => {
    const fixture = createFixture();
    const executeSubagent = jest.fn()
      .mockResolvedValueOnce({
        finishReason: 'tool-calls',
        message: {
          content: '',
          role: 'assistant',
        },
        modelId: 'gpt-5.4',
        providerId: 'openai',
        text: '',
        toolCalls: [{ input: { topic: 'smoke' }, toolCallId: 'tool-call-1', toolName: 'save_memory' }],
        toolResults: [{ output: { kind: 'tool:text', value: 'done' }, toolCallId: 'tool-call-1', toolName: 'save_memory' }],
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        message: {
          content: 'Generated: 自动续跑后的第二轮',
          role: 'assistant',
        },
        modelId: 'gpt-5.4',
        providerId: 'openai',
        text: 'Generated: 自动续跑后的第二轮',
        toolCalls: [],
        toolResults: [],
      });
    Reflect.set(fixture.runner as object, 'executeSubagent', executeSubagent);
    fixture.afterResponseCompactionService.run
      .mockImplementationOnce(async ({ conversationId }) => {
        const conversation = fixture.recordService.requireConversation(conversationId, 'user-1');
        const compactionId = 'compaction-1';
        const summaryMessageId = 'context-compaction:summary-1';
        const coveredAnnotation = {
          owner: 'conversation.context-governance',
          type: 'context-compaction',
          version: '1',
          data: {
            compactionId,
            coveredAt: '2026-04-11T00:00:02.000Z',
            markerVisible: false,
            role: 'covered',
            summaryMessageId,
          },
        };
        fixture.recordService.replaceMessages(conversationId, [
          {
            ...conversation.messages[0],
            metadataJson: JSON.stringify({ annotations: [coveredAnnotation] }),
          } as never,
          {
            ...conversation.messages[1],
            metadataJson: JSON.stringify({ annotations: [coveredAnnotation] }),
          } as never,
          {
            content: '压缩摘要：保留工具结论与下一步。',
            createdAt: '2026-04-11T00:00:02.050Z',
            id: summaryMessageId,
            metadataJson: JSON.stringify({
              annotations: [{
                owner: 'conversation.context-governance',
                type: 'context-compaction',
                version: '1',
                data: {
                  compactionId,
                  role: 'summary',
                  trigger: 'after-response',
                },
              }],
            }),
            model: 'gpt-5.4',
            parts: [{ text: '压缩摘要：保留工具结论与下一步。', type: 'text' }],
            provider: 'openai',
            role: 'display',
            status: 'completed',
            updatedAt: '2026-04-11T00:00:02.050Z',
          } as never,
        ], 'user-1');
        return {
          compactionTriggered: true,
          continuation: {
            content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
            metadata: { annotations: [{ data: { role: 'continue', synthetic: true, trigger: 'after-response' }, owner: 'conversation.context-governance', type: 'context-compaction', version: '1' }] },
            parts: [{ text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.', type: 'text' }],
          },
        };
      })
      .mockResolvedValueOnce({ compactionTriggered: false, continuation: null });

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '第一轮原始输入', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };

    await jest.runAllTimersAsync();

    const secondRequestMessages = executeSubagent.mock.calls[1]?.[0]?.request?.messages;
    const serializedSecondRequest = JSON.stringify(secondRequestMessages);
    expect(serializedSecondRequest).toContain('压缩摘要：保留工具结论与下一步。');
    expect(serializedSecondRequest).toContain('Continue if you have next steps');
    expect(serializedSecondRequest).not.toContain('第一轮原始输入');
  });

  it('propagates finish-step threshold overflow from a subagent run into automatic compaction continuation', async () => {
    const fixture = createFixture();
    fixture.afterResponseCompactionService.run
      .mockResolvedValueOnce({
        compactionTriggered: true,
        continuation: {
          content: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.',
          metadata: { annotations: [{ data: { role: 'continue', synthetic: true, trigger: 'after-response' }, owner: 'conversation.context-governance', type: 'context-compaction', version: '1' }] },
          parts: [{ text: 'Continue if you have next steps, or stop and ask for clarification if you are unsure how to proceed.', type: 'text' }],
        },
      })
      .mockResolvedValueOnce({ compactionTriggered: false, continuation: null });
    fixture.contextGovernanceService.isAboveAutoCompactionThreshold
      .mockReturnValue(true);
    fixture.aiModelExecutionService.streamText
      .mockReturnValueOnce({
        finishReason: Promise.resolve('tool-calls'),
        fullStream: (async function* () {
          yield { type: 'start-step', request: { model: 'gpt-5.4' }, warnings: [] };
          yield { input: { topic: 'subagent' }, toolCallId: 'tool-call-1', toolName: 'save_memory', type: 'tool-call' };
          yield { output: { kind: 'tool:text', value: 'done' }, toolCallId: 'tool-call-1', toolName: 'save_memory', type: 'tool-result' };
          yield {
            finishReason: 'tool-calls',
            providerMetadata: undefined,
            rawFinishReason: 'tool_calls',
            response: { id: 'step-1' },
            type: 'finish-step',
            usage: {
              inputTokens: 180,
              outputTokens: 40,
              totalTokens: 220,
            },
          };
          yield { type: 'start-step', request: { model: 'gpt-5.4' }, warnings: [] };
          yield { text: '不应该出现在第一轮子代理结果里', type: 'text-delta' };
        })(),
        modelId: 'gpt-5.4',
        providerId: 'openai',
        usage: Promise.resolve({
          inputTokens: 180,
          outputTokens: 40,
          source: 'provider',
          totalTokens: 220,
        }),
      })
      .mockReturnValueOnce({
        finishReason: Promise.resolve('stop'),
        fullStream: (async function* () {
          yield { text: 'Generated: 自动续跑后的第二轮', type: 'text-delta' };
        })(),
        modelId: 'gpt-5.4',
        providerId: 'openai',
        usage: Promise.resolve({
          inputTokens: 40,
          outputTokens: 12,
          source: 'provider',
          totalTokens: 52,
        }),
      });

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '先调用工具，再继续', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };

    const waitPromise = fixture.runner.waitSubagent('builtin.memory', {
      conversationId: summary.conversationId,
    });

    await jest.runAllTimersAsync();

    await expect(waitPromise).resolves.toMatchObject({
      conversationId: summary.conversationId,
      result: 'Generated: 自动续跑后的第二轮',
      status: 'completed',
    });
    expect(fixture.afterResponseCompactionService.run).toHaveBeenNthCalledWith(1, {
      conversationId: summary.conversationId,
      continuationState: {
        hasAssistantTextOutput: false,
        hasToolActivity: true,
        reachedContextThreshold: true,
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      userId: 'user-1',
    });

    const conversation = fixture.recordService.requireConversation(summary.conversationId, 'user-1');
    expect(conversation.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        content: '',
        role: 'assistant',
        status: 'completed',
        toolCalls: expect.arrayContaining([
          expect.objectContaining({ toolCallId: 'tool-call-1', toolName: 'save_memory' }),
        ]),
        toolResults: expect.arrayContaining([
          expect.objectContaining({ toolCallId: 'tool-call-1', toolName: 'save_memory' }),
        ]),
      }),
      expect.objectContaining({
        content: 'Generated: 自动续跑后的第二轮',
        role: 'assistant',
        status: 'completed',
      }),
    ]));
  });

  it('prunes old tool outputs after a subagent conversation fully finishes', async () => {
    const fixture = createFixture();
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => ({
      finishReason: 'stop',
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: request.modelId ?? 'gpt-5.4',
      providerId: request.providerId ?? 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    })));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '完成后裁剪旧工具输出', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };

    await jest.runAllTimersAsync();

    expect(fixture.afterResponseCompactionService.pruneToolOutputs).toHaveBeenCalledWith({
      conversationId: summary.conversationId,
      userId: 'user-1',
    });
  });

  it('interrupts a queued subagent before it starts running', async () => {
    const fixture = createFixture();
    const executeSubagent = jest.fn(async ({ request }) => ({
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    }));
    Reflect.set(fixture.runner as object, 'executeSubagent', executeSubagent);

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '稍后执行', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };

    const interrupted = await fixture.runner.interruptSubagent('builtin.memory', summary.conversationId, 'user-1');
    expect(interrupted).toMatchObject({
      conversationId: summary.conversationId,
      status: 'interrupted',
    });

    await jest.runAllTimersAsync();

    expect(executeSubagent).not.toHaveBeenCalled();
    expect(fixture.runner.getSubagent('builtin.memory', summary.conversationId)).toMatchObject({
      conversationId: summary.conversationId,
      error: '子代理已被手动中断',
      status: 'interrupted',
    });
  });

  it('closes a completed subagent conversation', async () => {
    const fixture = createFixture();
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => ({
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    })));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '可关闭会话', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string };
    await jest.runAllTimersAsync();

    const closed = await fixture.runner.closeSubagent('builtin.memory', {
      conversationId: summary.conversationId,
    }, 'user-1');

    expect(closed).toMatchObject({
      conversationId: summary.conversationId,
      status: 'closed',
    });
  });

  it('waits successfully even if the subagent completes before the waiter is fully attached', async () => {
    const fixture = createFixture();
    let releaseExecution!: () => void
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => {
      await new Promise<void>((resolve) => {
        releaseExecution = resolve
      })
      return {
        message: {
          content: `Generated: ${readLatestPrompt(request.messages)}`,
          role: 'assistant',
        },
        modelId: 'gpt-5.4',
        providerId: 'openai',
        text: `Generated: ${readLatestPrompt(request.messages)}`,
        toolCalls: [],
        toolResults: [],
      }
    }));

    const summary = await fixture.runner.spawnSubagent('builtin.memory', 'Memory', {
      conversationId: fixture.parentConversationId,
      source: 'plugin',
      userId: 'user-1',
    }, {
      messages: [{ content: '快速完成', role: 'user' }],
      providerId: 'openai',
    } as never) as { conversationId: string }

    const waitPromise = fixture.runner.waitSubagent('builtin.memory', {
      conversationId: summary.conversationId,
    })

    await jest.advanceTimersByTimeAsync(0)
    releaseExecution()
    await jest.runAllTimersAsync()

    await expect(waitPromise).resolves.toMatchObject({
      conversationId: summary.conversationId,
      result: 'Generated: 快速完成',
      status: 'completed',
    })
  });

  it('resumes queued conversations and converts stale running conversations to interrupted', async () => {
    const fixture = createFixture();
    Reflect.set(fixture.runner as object, 'executeSubagent', jest.fn(async ({ request }) => ({
      message: {
        content: `Generated: ${readLatestPrompt(request.messages)}`,
        role: 'assistant',
      },
      modelId: 'gpt-5.4',
      providerId: 'openai',
      text: `Generated: ${readLatestPrompt(request.messages)}`,
      toolCalls: [],
      toolResults: [],
    })));

    const queuedConversationId = (fixture.recordService.createConversation({
      kind: 'subagent',
      parentId: fixture.parentConversationId,
      subagent: {
        pluginDisplayName: 'Memory',
        pluginId: 'builtin.memory',
        requestPreview: '恢复执行',
        requestedAt: '2026-04-30T10:00:00.000Z',
        runtimeKind: 'local',
        status: 'queued',
        startedAt: null,
        finishedAt: null,
        closedAt: null,
      },
      title: 'Queued',
      userId: 'user-1',
    }) as { id: string }).id;
    fixture.recordService.replaceMessages(queuedConversationId, [
      {
        content: '恢复执行',
        createdAt: '2026-04-30T10:00:00.000Z',
        id: 'user-message-1',
        parts: [{ text: '恢复执行', type: 'text' }],
        role: 'user',
        status: 'completed',
        updatedAt: '2026-04-30T10:00:00.000Z',
      } as never,
    ], 'user-1');

    const runningConversationId = (fixture.recordService.createConversation({
      kind: 'subagent',
      parentId: fixture.parentConversationId,
      subagent: {
        activeAssistantMessageId: 'running-assistant-1',
        pluginDisplayName: 'Memory',
        pluginId: 'builtin.memory',
        requestPreview: '重启中断',
        requestedAt: '2026-04-30T10:00:00.000Z',
        runtimeKind: 'local',
        status: 'running',
        startedAt: '2026-04-30T10:00:01.000Z',
        finishedAt: null,
        closedAt: null,
      },
      title: 'Running',
      userId: 'user-1',
    }) as { id: string }).id;
    fixture.recordService.replaceMessages(runningConversationId, [
      {
        content: '重启中断',
        createdAt: '2026-04-30T10:00:00.000Z',
        id: 'running-user-1',
        parts: [{ text: '重启中断', type: 'text' }],
        role: 'user',
        status: 'completed',
        updatedAt: '2026-04-30T10:00:00.000Z',
      } as never,
      {
        content: '执行到一半…',
        createdAt: '2026-04-30T10:00:01.000Z',
        id: 'running-assistant-1',
        parts: [{ text: '执行到一半…', type: 'text' }],
        role: 'assistant',
        status: 'streaming',
        updatedAt: '2026-04-30T10:00:01.000Z',
      } as never,
    ], 'user-1');

    fixture.runner.resumePendingSubagents('builtin.memory');
    await jest.runAllTimersAsync();

    expect(fixture.runner.getSubagent('builtin.memory', queuedConversationId)).toMatchObject({
      conversationId: queuedConversationId,
      status: 'completed',
    });
    expect(fixture.runner.getSubagent('builtin.memory', runningConversationId)).toMatchObject({
      conversationId: runningConversationId,
      error: '服务重启时中断了正在运行的子代理',
      status: 'interrupted',
    });
    expect(fixture.recordService.requireConversation(runningConversationId, 'user-1').messages.at(-1)).toMatchObject({
      error: '服务重启时中断了正在运行的子代理',
      id: 'running-assistant-1',
      role: 'assistant',
      status: 'stopped',
    });
  });
});

function createFixture() {
  const aiModelExecutionService = {
    streamText: jest.fn(),
  };
  const recordService = new ConversationStoreService();
  const contextGovernanceService = {
    isAboveAutoCompactionThreshold: jest.fn().mockReturnValue(false),
    rewriteHistoryAfterCompletedResponse: jest.fn().mockResolvedValue(undefined),
  };
  const afterResponseCompactionService = {
    pruneToolOutputs: jest.fn().mockResolvedValue(undefined),
    run: jest.fn().mockResolvedValue({ compactionTriggered: false, continuation: null }),
  };
  const parentConversationId = (recordService.createConversation({
    title: 'Parent Chat',
    userId: 'user-1',
  }) as { id: string }).id;
  const runner = new SubagentRunnerService(
    aiModelExecutionService as never,
    new ConversationMessageService(recordService),
    {
      buildToolSet: jest.fn().mockResolvedValue(undefined),
    } as never,
    {
      invokeHook: jest.fn(),
      listPlugins: jest.fn().mockReturnValue([]),
    } as never,
    new ProjectSubagentTypeRegistryService(new ProjectWorktreeRootService()),
    {
      get: jest.fn((token: { name?: string }) => {
        if (token?.name === 'ConversationAfterResponseCompactionService') {
          return afterResponseCompactionService;
        }
        return contextGovernanceService;
      }),
    } as never,
    recordService,
  );
  return {
    aiModelExecutionService,
    afterResponseCompactionService,
    contextGovernanceService,
    parentConversationId,
    recordService,
    runner,
  };
}

function readLatestPrompt(messages: Array<{ role?: string; content: string | Array<{ text?: string; type: string }> }>): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== 'user') {
      continue;
    }
    if (typeof message.content === 'string') {
      return message.content;
    }
    const text = message.content
      .filter((part) => part.type === 'text' && typeof part.text === 'string')
      .map((part) => part.text ?? '')
      .join('\n')
      .trim();
    if (text) {
      return text;
    }
  }
  return '';
}

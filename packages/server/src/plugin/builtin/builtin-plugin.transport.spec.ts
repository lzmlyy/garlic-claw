import type {
  ChatAfterModelHookPayload,
  ChatBeforeModelHookPayload,
} from '@garlic-claw/shared';
import { createConversationTitlePlugin } from './conversation-title.plugin';
import { createCoreToolsPlugin } from './core-tools.plugin';
import { createKbContextPlugin } from './kb-context.plugin';
import { createMemoryContextPlugin } from './memory-context.plugin';
import { createMemoryToolsPlugin } from './memory-tools.plugin';
import { createPersonaRouterPlugin } from './persona-router.plugin';
import { createProviderRouterPlugin } from './provider-router.plugin';
import { createRouteInspectorPlugin } from './route-inspector.plugin';
import { createToolAuditPlugin } from './tool-audit.plugin';
import {
  BuiltinPluginTransport,
  type BuiltinPluginDefinition,
} from './builtin-plugin.transport';

describe('BuiltinPluginTransport', () => {
  const hostService = {
    call: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reports builtin governance actions from declared handlers instead of exposing all transport methods', () => {
    const transport = new BuiltinPluginTransport(
      createMemoryToolsPlugin(),
      hostService as never,
      {
        reload: jest.fn(),
      },
    );

    expect(transport.listSupportedActions()).toEqual([
      'health-check',
      'reload',
    ]);
  });

  it('executes memory tools through the unified host api facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        id: 'memory-1',
        content: '记住我喜欢喝咖啡',
        category: 'preference',
        createdAt: '2026-03-27T09:00:00.000Z',
      })
      .mockResolvedValueOnce([
        {
          id: 'memory-1',
          content: '记住我喜欢喝咖啡',
          category: 'preference',
          createdAt: '2026-03-27T09:00:00.000Z',
        },
      ]);

    const transport = new BuiltinPluginTransport(
      createMemoryToolsPlugin(),
      hostService as never,
    );

    const saved = await transport.executeTool({
      toolName: 'save_memory',
      params: {
        content: '记住我喜欢喝咖啡',
        category: 'preference',
      },
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });
    const recalled = await transport.executeTool({
      toolName: 'recall_memory',
      params: {
        query: '咖啡',
      },
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.memory-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'memory.save',
      params: {
        content: '记住我喜欢喝咖啡',
        category: 'preference',
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.memory-tools',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'memory.search',
      params: {
        query: '咖啡',
        limit: 10,
      },
    });
    expect(saved).toEqual({
      saved: true,
      id: 'memory-1',
    });
    expect(recalled).toEqual({
      count: 1,
      memories: [
        {
          content: '记住我喜欢喝咖啡',
          category: 'preference',
          date: '2026-03-27',
        },
      ],
    });
  });

  it('returns an empty recall result when the host returns malformed memory search data', async () => {
    hostService.call.mockResolvedValueOnce({
      not: 'a-memory-array',
    });

    const transport = new BuiltinPluginTransport(
      createMemoryToolsPlugin(),
      hostService as never,
    );

    await expect(
      transport.executeTool({
        toolName: 'recall_memory',
        params: {
          query: '咖啡',
        },
        context: {
          source: 'chat-tool',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      }),
    ).resolves.toEqual({
      count: 0,
      memories: [],
    });
  });

  it('executes local core tools without going through the host facade', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-03T10:00:00.000Z'));

    try {
      const transport = new BuiltinPluginTransport(
        createCoreToolsPlugin(),
        hostService as never,
      );

      const currentTime = await transport.executeTool({
        toolName: 'getCurrentTime',
        params: {},
        context: {
          source: 'chat-tool',
          userId: 'user-1',
        },
      });
      const systemInfo = await transport.executeTool({
        toolName: 'getSystemInfo',
        params: {},
        context: {
          source: 'chat-tool',
          userId: 'user-1',
        },
      });
      const calculated = await transport.executeTool({
        toolName: 'calculate',
        params: {
          expression: '2 + 3 * 4',
        },
        context: {
          source: 'chat-tool',
          userId: 'user-1',
        },
      });
      const invalid = await transport.executeTool({
        toolName: 'calculate',
        params: {
          expression: 'Math.max(1, 2)',
        },
        context: {
          source: 'chat-tool',
          userId: 'user-1',
        },
      });

      expect(hostService.call).not.toHaveBeenCalled();
      expect(currentTime).toEqual({
        time: '2026-04-03T10:00:00.000Z',
      });
      expect(systemInfo).toEqual({
        platform: process.platform,
        nodeVersion: process.version,
        uptime: expect.any(Number),
        memoryUsage: expect.any(Number),
      });
      expect(calculated).toEqual({
        expression: '2 + 3 * 4',
        result: 14,
      });
      expect(invalid).toEqual({
        error: '无效的表达式。只允许数字和 +, -, *, /, (, )。',
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('records a summarized tool audit through unified storage/log host calls', async () => {
    hostService.call.mockResolvedValue(true);

    const transport = new BuiltinPluginTransport(
      createToolAuditPlugin(),
      hostService as never,
    );

    await expect(
      transport.invokeHook({
        hookName: 'tool:after-call',
        context: {
          source: 'chat-tool',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        payload: {
          context: {
            source: 'chat-tool',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          source: {
            kind: 'plugin',
            id: 'builtin.memory-tools',
          },
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          tool: {
            toolId: 'plugin:builtin.memory-tools:save_memory',
            callName: 'save_memory',
            name: 'save_memory',
          },
          params: {
            content: '记住我喜欢喝咖啡',
          },
          output: {
            saved: true,
            id: 'memory-1',
          },
        },
      }),
    ).resolves.toEqual({
      action: 'pass',
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.tool-audit',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'storage.set',
      params: {
        key: 'tool.builtin.memory-tools.save_memory.last-call',
        value: {
          sourceKind: 'plugin',
          sourceId: 'builtin.memory-tools',
          pluginId: 'builtin.memory-tools',
          runtimeKind: 'builtin',
          toolId: 'plugin:builtin.memory-tools:save_memory',
          callName: 'save_memory',
          toolName: 'save_memory',
          callSource: 'chat-tool',
          paramKeys: ['content'],
          outputKind: 'object',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
      },
    });
    expect(hostService.call).toHaveBeenCalledTimes(2);
    expect(hostService.call.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        pluginId: 'builtin.tool-audit',
        context: {
          source: 'chat-tool',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        params: {
          level: 'info',
          type: 'tool:observed',
          message: '工具 builtin.memory-tools:save_memory 执行完成',
          metadata: {
            sourceKind: 'plugin',
            sourceId: 'builtin.memory-tools',
            pluginId: 'builtin.memory-tools',
            runtimeKind: 'builtin',
            toolId: 'plugin:builtin.memory-tools:save_memory',
            callName: 'save_memory',
            toolName: 'save_memory',
            callSource: 'chat-tool',
            paramKeys: ['content'],
            outputKind: 'object',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
        },
      }),
    );
  });

  it('invokes chat:before-model hooks through the same host api facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        limit: 3,
        promptPrefix: '已知用户记忆',
      })
      .mockResolvedValueOnce([
        {
          id: 'memory-1',
          content: '用户喜欢咖啡',
          category: 'preference',
          createdAt: '2026-03-27T09:00:00.000Z',
        },
      ]);

    const transport = new BuiltinPluginTransport(
      createMemoryContextPlugin(),
      hostService as never,
    );

    const result = await transport.invokeHook({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '今天我想喝咖啡',
            },
          ],
          availableTools: [],
        },
      } satisfies ChatBeforeModelHookPayload,
    });

    expect(hostService.call).toHaveBeenCalledWith({
      pluginId: 'builtin.memory-context',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'config.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.memory-context',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'memory.search',
      params: {
        query: '今天我想喝咖啡',
        limit: 3,
      },
    });
    expect(result).toEqual({
      action: 'mutate',
      systemPrompt: '你是 Garlic Claw\n\n已知用户记忆：\n- [preference] 用户喜欢咖啡',
    });
  });

  it('skips memory context injection when the host returns malformed memory results', async () => {
    hostService.call
      .mockResolvedValueOnce({
        limit: 3,
        promptPrefix: '已知用户记忆',
      })
      .mockResolvedValueOnce({
        content: '这不是数组',
      });

    const transport = new BuiltinPluginTransport(
      createMemoryContextPlugin(),
      hostService as never,
    );

    await expect(
      transport.invokeHook({
        hookName: 'chat:before-model',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        payload: {
          context: {
            source: 'chat-hook',
            userId: 'user-1',
            conversationId: 'conversation-1',
          },
          request: {
            providerId: 'openai',
            modelId: 'gpt-5.2',
            systemPrompt: '你是 Garlic Claw',
            messages: [
              {
                role: 'user',
                content: '今天我想喝咖啡',
              },
            ],
            availableTools: [],
          },
        } satisfies ChatBeforeModelHookPayload,
      }),
    ).resolves.toBeNull();
  });

  it('invokes kb search through the same host api facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        limit: 2,
        promptPrefix: '与当前问题相关的系统知识',
      })
      .mockResolvedValueOnce([
        {
          id: 'kb-plugin-runtime',
          title: '统一插件运行时',
          excerpt: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
          content: 'Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
          tags: ['plugin', 'runtime'],
          createdAt: '2026-03-28T02:00:00.000Z',
          updatedAt: '2026-03-28T02:00:00.000Z',
        },
      ]);

    const transport = new BuiltinPluginTransport(
      createKbContextPlugin(),
      hostService as never,
    );

    const result = await transport.invokeHook({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '插件系统是怎么统一的？',
            },
          ],
          availableTools: [],
        },
      } satisfies ChatBeforeModelHookPayload,
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.kb-context',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'config.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.kb-context',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'kb.search',
      params: {
        query: '插件系统是怎么统一的？',
        limit: 2,
      },
    });
    expect(result).toEqual({
      action: 'mutate',
      systemPrompt:
        '你是 Garlic Claw\n\n与当前问题相关的系统知识：\n- [统一插件运行时] Garlic Claw 使用 builtin 与 remote 统一插件运行时。',
    });
  });

  it('invokes chat:after-model hooks through the same host api facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        defaultTitle: 'New Chat',
        maxMessages: 4,
      })
      .mockResolvedValueOnce({
        id: 'conversation-1',
        title: 'New Chat',
        createdAt: '2026-03-27T09:00:00.000Z',
        updatedAt: '2026-03-27T09:00:00.000Z',
      })
      .mockResolvedValueOnce([
        {
          id: 'message-1',
          role: 'user',
          content: '今天我想喝咖啡',
          parts: [],
          status: 'completed',
          createdAt: '2026-03-27T09:00:00.000Z',
          updatedAt: '2026-03-27T09:00:00.000Z',
        },
        {
          id: 'message-2',
          role: 'assistant',
          content: '好的，我来帮你总结咖啡偏好。',
          parts: [],
          status: 'completed',
          createdAt: '2026-03-27T09:00:01.000Z',
          updatedAt: '2026-03-27T09:00:01.000Z',
        },
      ])
      .mockResolvedValueOnce({
        text: '咖啡偏好总结',
        providerId: 'openai',
        modelId: 'gpt-5.2',
      })
      .mockResolvedValueOnce({
        id: 'conversation-1',
        title: '咖啡偏好总结',
        createdAt: '2026-03-27T09:00:00.000Z',
        updatedAt: '2026-03-27T09:00:02.000Z',
      });

    const transport = new BuiltinPluginTransport(
      createConversationTitlePlugin(),
      hostService as never,
    );

    await transport.invokeHook({
      hookName: 'chat:after-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        assistantMessageId: 'assistant-1',
        assistantContent: '好的，我来帮你总结咖啡偏好。',
        assistantParts: [
          {
            type: 'text',
            text: '好的，我来帮你总结咖啡偏好。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      } satisfies ChatAfterModelHookPayload,
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.conversation-title',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'config.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.conversation-title',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.conversation-title',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.messages.list',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.conversation-title',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'llm.generate-text',
      params: expect.objectContaining({
        system:
          '你是一个对话标题生成器。请基于给定对话生成一个简短、准确、自然的中文标题。',
        maxOutputTokens: 32,
      }),
    });
    expect(hostService.call).toHaveBeenNthCalledWith(5, {
      pluginId: 'builtin.conversation-title',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.title.set',
      params: {
        title: '咖啡偏好总结',
      },
    });
  });

  it('routes provider/model and trims tools through the same host api facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        targetProviderId: 'anthropic',
        targetModelId: 'claude-3-7-sonnet',
        allowedToolNames: 'recall_memory',
      })
      .mockResolvedValueOnce({
        source: 'context',
        providerId: 'openai',
        modelId: 'gpt-5.2',
      })
      .mockResolvedValueOnce({
        id: 'claude-3-7-sonnet',
        providerId: 'anthropic',
        name: 'Claude 3.7 Sonnet',
        capabilities: {
          input: { text: true, image: false },
          output: { text: true, image: false },
          reasoning: true,
          toolCall: true,
        },
      });

    const transport = new BuiltinPluginTransport(
      createProviderRouterPlugin(),
      hostService as never,
    );

    const result = await transport.invokeHook({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '帮我记住我喜欢咖啡',
            },
          ],
          availableTools: [
            {
              name: 'save_memory',
              description: '保存记忆',
              parameters: {
                content: {
                  type: 'string',
                  required: true,
                },
              },
              pluginId: 'builtin.memory-tools',
              runtimeKind: 'builtin',
            },
            {
              name: 'recall_memory',
              description: '读取记忆',
              parameters: {
                query: {
                  type: 'string',
                  required: true,
                },
              },
              pluginId: 'builtin.memory-tools',
              runtimeKind: 'builtin',
            },
          ],
        },
      } satisfies ChatBeforeModelHookPayload,
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.provider-router',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'config.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.provider-router',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'provider.current.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.provider-router',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'provider.model.get',
      params: {
        providerId: 'anthropic',
        modelId: 'claude-3-7-sonnet',
      },
    });
    expect(result).toEqual({
      action: 'mutate',
      providerId: 'anthropic',
      modelId: 'claude-3-7-sonnet',
      toolNames: ['recall_memory'],
    });
  });

  it('short-circuits replies through the provider router hook', async () => {
    hostService.call
      .mockResolvedValueOnce({
        shortCircuitKeyword: '#fast-reply',
        shortCircuitReply: '插件已经直接回复。',
      })
      .mockResolvedValueOnce({
        source: 'context',
        providerId: 'openai',
        modelId: 'gpt-5.2',
      });

    const transport = new BuiltinPluginTransport(
      createProviderRouterPlugin(),
      hostService as never,
    );

    const result = await transport.invokeHook({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activeProviderId: 'openai',
          activeModelId: 'gpt-5.2',
        },
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '请直接回复 #fast-reply',
            },
          ],
          availableTools: [],
        },
      } satisfies ChatBeforeModelHookPayload,
    });

    expect(result).toEqual({
      action: 'short-circuit',
      assistantContent: '插件已经直接回复。',
      providerId: 'openai',
      modelId: 'gpt-5.2',
      reason: 'matched-short-circuit-keyword',
    });
  });

  it('switches persona through the persona router hook', async () => {
    hostService.call
      .mockResolvedValueOnce({
        targetPersonaId: 'persona-writer',
        switchKeyword: '#writer',
      })
      .mockResolvedValueOnce({
        source: 'conversation',
        personaId: 'builtin.default-assistant',
        name: 'Default Assistant',
      })
      .mockResolvedValueOnce({
        id: 'persona-writer',
        prompt: '你是一个偏文学表达的写作助手。',
      })
      .mockResolvedValueOnce({
        source: 'conversation',
        personaId: 'persona-writer',
        prompt: '你是一个偏文学表达的写作助手。',
      });

    const transport = new BuiltinPluginTransport(
      createPersonaRouterPlugin(),
      hostService as never,
    );

    const result = await transport.invokeHook({
      hookName: 'chat:before-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
      },
      payload: {
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
          activePersonaId: 'builtin.default-assistant',
        },
        request: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          systemPrompt: '你是 Garlic Claw',
          messages: [
            {
              role: 'user',
              content: '请切到写作模式 #writer',
            },
          ],
          availableTools: [],
        },
      } satisfies ChatBeforeModelHookPayload,
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.persona-router',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activePersonaId: 'builtin.default-assistant',
      },
      method: 'config.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      action: 'mutate',
      systemPrompt: '你是一个偏文学表达的写作助手。',
    });
  });

  it('skips title generation when the conversation already has a custom title', async () => {
    hostService.call
      .mockResolvedValueOnce({
        defaultTitle: 'New Chat',
        maxMessages: 4,
      })
      .mockResolvedValueOnce({
        id: 'conversation-1',
        title: '我的咖啡计划',
        createdAt: '2026-03-27T09:00:00.000Z',
        updatedAt: '2026-03-27T09:00:00.000Z',
      });

    const transport = new BuiltinPluginTransport(
      createConversationTitlePlugin(),
      hostService as never,
    );

    await transport.invokeHook({
      hookName: 'chat:after-model',
      context: {
        source: 'chat-hook',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      payload: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        assistantMessageId: 'assistant-1',
        assistantContent: '好的，我来帮你总结咖啡偏好。',
        assistantParts: [
          {
            type: 'text',
            text: '好的，我来帮你总结咖啡偏好。',
          },
        ],
        toolCalls: [],
        toolResults: [],
      } satisfies ChatAfterModelHookPayload,
    });

    expect(hostService.call).toHaveBeenCalledTimes(2);
  });

  it('skips title generation when the host returns malformed conversation messages', async () => {
    hostService.call
      .mockResolvedValueOnce({
        defaultTitle: 'New Chat',
        maxMessages: 4,
      })
      .mockResolvedValueOnce({
        id: 'conversation-1',
        title: 'New Chat',
        createdAt: '2026-03-27T09:00:00.000Z',
        updatedAt: '2026-03-27T09:00:00.000Z',
      })
      .mockResolvedValueOnce({
        id: 'not-a-message-list',
      });

    const transport = new BuiltinPluginTransport(
      createConversationTitlePlugin(),
      hostService as never,
    );

    await expect(
      transport.invokeHook({
        hookName: 'chat:after-model',
        context: {
          source: 'chat-hook',
          userId: 'user-1',
          conversationId: 'conversation-1',
        },
        payload: {
          providerId: 'openai',
          modelId: 'gpt-5.2',
          assistantMessageId: 'assistant-1',
          assistantContent: '好的，我来帮你总结咖啡偏好。',
          assistantParts: [
            {
              type: 'text',
              text: '好的，我来帮你总结咖啡偏好。',
            },
          ],
          toolCalls: [],
          toolResults: [],
        } satisfies ChatAfterModelHookPayload,
      }),
    ).resolves.toBeNull();

    expect(hostService.call).toHaveBeenCalledTimes(3);
  });

  it('invokes builtin web routes through the same host api facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        id: 'builtin.route-inspector',
        name: '路由探针',
        runtimeKind: 'builtin',
        permissions: ['conversation:read', 'user:read'],
        hooks: [],
        routes: [
          {
            path: 'inspect/context',
            methods: ['GET'],
          },
        ],
      })
      .mockResolvedValueOnce({
        id: 'user-1',
        username: 'tester',
      })
      .mockResolvedValueOnce({
        id: 'conversation-1',
        title: '咖啡偏好总结',
      })
      .mockResolvedValueOnce([
        {
          id: 'message-1',
          role: 'user',
          content: '今天我想喝咖啡',
        },
      ]);

    const transport = new BuiltinPluginTransport(
      createRouteInspectorPlugin(),
      hostService as never,
    );

    const result = await transport.invokeRoute({
      request: {
        path: 'inspect/context',
        method: 'GET',
        headers: {},
        query: {
          conversationId: 'conversation-1',
        },
        body: null,
      },
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.route-inspector',
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'plugin.self.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.route-inspector',
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'user.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.route-inspector',
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.route-inspector',
      context: {
        source: 'http-route',
        userId: 'user-1',
        conversationId: 'conversation-1',
      },
      method: 'conversation.messages.list',
      params: {},
    });
    expect(result).toEqual({
      status: 200,
      body: {
        plugin: {
          id: 'builtin.route-inspector',
          name: '路由探针',
          runtimeKind: 'builtin',
          permissions: ['conversation:read', 'user:read'],
          hooks: [],
          routes: [
            {
              path: 'inspect/context',
              methods: ['GET'],
            },
          ],
        },
        user: {
          id: 'user-1',
          username: 'tester',
        },
        conversation: {
          id: 'conversation-1',
          title: '咖啡偏好总结',
        },
        messageCount: 1,
      },
    });
  });

  it('exposes provider read and structured llm helpers through the host facade', async () => {
    hostService.call
      .mockResolvedValueOnce({
        source: 'context',
        providerId: 'openai',
        modelId: 'gpt-5.2',
      })
      .mockResolvedValueOnce([
        {
          id: 'openai',
          name: 'OpenAI',
          mode: 'catalog',
          driver: 'openai',
          defaultModel: 'gpt-5.2',
          available: true,
        },
      ])
      .mockResolvedValueOnce({
        id: 'openai',
        name: 'OpenAI',
        mode: 'catalog',
        driver: 'openai',
        defaultModel: 'gpt-5.2',
        available: true,
      })
      .mockResolvedValueOnce({
        id: 'gpt-5.2',
        providerId: 'openai',
        name: 'GPT-5.2',
        capabilities: {
          reasoning: true,
          toolCall: true,
          input: { text: true, image: true },
          output: { text: true, image: false },
        },
        status: 'active',
      })
      .mockResolvedValueOnce({
        providerId: 'openai',
        modelId: 'gpt-5.2',
        text: '已完成总结',
        message: {
          role: 'assistant',
          content: '已完成总结',
        },
      });

    const definition: BuiltinPluginDefinition = {
      manifest: {
        id: 'builtin.provider-router',
        name: '模型路由',
        version: '1.0.0',
        runtime: 'builtin',
        permissions: ['provider:read', 'llm:generate'],
        tools: [
          {
            name: 'inspect_provider',
            description: '读取 provider 上下文',
            parameters: {},
          },
        ],
      },
      tools: {
        inspect_provider: async (_params, { host }) =>
          ({
            current: await host.getCurrentProvider(),
            providers: await host.listProviders(),
            provider: await host.getProvider('openai'),
            model: await host.getProviderModel('openai', 'gpt-5.2'),
            generated: await host.generate({
              providerId: 'openai',
              modelId: 'gpt-5.2',
              messages: [
                {
                  role: 'user',
                  content: [
                    {
                      type: 'text',
                      text: '请总结这段对话',
                    },
                  ],
                },
              ],
              maxOutputTokens: 64,
            }),
          }) as never,
      },
    };

    const transport = new BuiltinPluginTransport(
      definition,
      hostService as never,
    );

    const result = await transport.executeTool({
      toolName: 'inspect_provider',
      params: {},
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
    });

    expect(hostService.call).toHaveBeenNthCalledWith(1, {
      pluginId: 'builtin.provider-router',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'provider.current.get',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(2, {
      pluginId: 'builtin.provider-router',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'provider.list',
      params: {},
    });
    expect(hostService.call).toHaveBeenNthCalledWith(3, {
      pluginId: 'builtin.provider-router',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'provider.get',
      params: {
        providerId: 'openai',
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(4, {
      pluginId: 'builtin.provider-router',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'provider.model.get',
      params: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
      },
    });
    expect(hostService.call).toHaveBeenNthCalledWith(5, {
      pluginId: 'builtin.provider-router',
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
      },
      method: 'llm.generate',
      params: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: '请总结这段对话',
              },
            ],
          },
        ],
        maxOutputTokens: 64,
      },
    });
    expect(result).toEqual({
      current: {
        source: 'context',
        providerId: 'openai',
        modelId: 'gpt-5.2',
      },
      providers: [
        {
          id: 'openai',
          name: 'OpenAI',
          mode: 'catalog',
          driver: 'openai',
          defaultModel: 'gpt-5.2',
          available: true,
        },
      ],
      provider: {
        id: 'openai',
        name: 'OpenAI',
        mode: 'catalog',
        driver: 'openai',
        defaultModel: 'gpt-5.2',
        available: true,
      },
      model: {
        id: 'gpt-5.2',
        providerId: 'openai',
        name: 'GPT-5.2',
        capabilities: {
          reasoning: true,
          toolCall: true,
          input: { text: true, image: true },
          output: { text: true, image: false },
        },
        status: 'active',
      },
      generated: {
        providerId: 'openai',
        modelId: 'gpt-5.2',
        text: '已完成总结',
        message: {
          role: 'assistant',
          content: '已完成总结',
        },
      },
    });
  });

});

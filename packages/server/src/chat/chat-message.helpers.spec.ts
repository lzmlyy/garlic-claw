import type { Tool } from 'ai';
import {
  buildChatToolSet,
  listChatAvailableTools,
} from './chat-message.helpers';

describe('chat-message.helpers tool registry bridge', () => {
  const toolRegistry = {
    buildToolSet: jest.fn(),
    listAvailableToolSummaries: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('delegates chat tool-set construction to ToolRegistryService', async () => {
    const tools = {
      recall_memory: {
        description: '读取记忆',
        inputSchema: undefined,
        execute: jest.fn(),
      } as unknown as Tool,
    };
    toolRegistry.buildToolSet.mockResolvedValue(tools);

    await expect(
      buildChatToolSet({
        supportsToolCall: true,
        toolRegistry: toolRegistry as never,
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
        allowedToolNames: ['recall_memory'],
      }),
    ).resolves.toBe(tools);

    expect(toolRegistry.buildToolSet).toHaveBeenCalledWith({
      context: {
        source: 'chat-tool',
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      },
      allowedToolNames: ['recall_memory'],
    });
  });

  it('delegates available-tool summaries to ToolRegistryService', async () => {
    toolRegistry.listAvailableToolSummaries.mockResolvedValue([
      {
        name: 'save_memory',
        description: '保存记忆',
        parameters: {},
        sourceKind: 'plugin',
        sourceId: 'builtin.memory-tools',
      },
      {
        name: 'mcp__weather__get_forecast',
        description: '[MCP：weather] 获取天气预报',
        parameters: {},
        sourceKind: 'mcp',
        sourceId: 'weather',
      },
    ]);

    await expect(
      listChatAvailableTools({
        toolRegistry: toolRegistry as never,
        userId: 'user-1',
        conversationId: 'conversation-1',
        activeProviderId: 'openai',
        activeModelId: 'gpt-5.2',
        activePersonaId: 'builtin.default-assistant',
      }),
    ).resolves.toEqual([
      {
        name: 'save_memory',
        description: '保存记忆',
        parameters: {},
        sourceKind: 'plugin',
        sourceId: 'builtin.memory-tools',
      },
      {
        name: 'mcp__weather__get_forecast',
        description: '[MCP：weather] 获取天气预报',
        parameters: {},
        sourceKind: 'mcp',
        sourceId: 'weather',
      },
    ]);
  });
});

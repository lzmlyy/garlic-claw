import type { PluginCallContext } from '@garlic-claw/shared';
import { McpToolProvider } from './mcp-tool.provider';

describe('McpToolProvider', () => {
  const context: PluginCallContext = {
    source: 'chat-tool',
    userId: 'user-1',
    conversationId: 'conversation-1',
    activeProviderId: 'openai',
    activeModelId: 'gpt-5.2',
  };

  it('projects MCP source health and delegates execution back to McpService', async () => {
    const mcpService = {
      listServerStatuses: jest.fn().mockReturnValue([
        {
          name: 'weather',
          connected: true,
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T10:00:00.000Z',
        },
      ]),
      listToolDescriptors: jest.fn().mockResolvedValue([
        {
          serverName: 'weather',
          name: 'get_forecast',
          description: '获取天气预报',
          inputSchema: {
            type: 'object',
            properties: {
              city: {
                type: 'string',
                description: '城市',
              },
            },
            required: ['city'],
          },
        },
      ]),
      callTool: jest.fn().mockResolvedValue({
        weather: 'sunny',
      }),
    };
    const provider = new McpToolProvider(mcpService as never);

    const tools = await provider.listTools(context);

    expect(tools).toEqual([
      {
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T10:00:00.000Z',
          supportedActions: ['health-check'],
        },
        name: 'get_forecast',
        description: '获取天气预报',
        parameters: {
          city: {
            type: 'string',
            description: '城市',
            required: true,
          },
        },
      },
    ]);

    await expect(
      provider.executeTool({
        tool: tools[0],
        params: {
          city: 'Shanghai',
        },
        context,
      }),
    ).resolves.toEqual({
      weather: 'sunny',
    });

    expect(mcpService.callTool).toHaveBeenCalledWith({
      serverName: 'weather',
      toolName: 'get_forecast',
      arguments: {
        city: 'Shanghai',
      },
    });
  });
});

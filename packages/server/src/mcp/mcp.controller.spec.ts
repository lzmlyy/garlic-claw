import { McpController } from './mcp.controller';

describe('McpController', () => {
  const mcpConfig = {
    getSnapshot: jest.fn(),
    saveServer: jest.fn(),
    deleteServer: jest.fn(),
  };
  const mcpService = {
    reloadServersFromConfig: jest.fn(),
  };

  let controller: McpController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new McpController(
      mcpConfig as never,
      mcpService as never,
    );
  });

  it('lists MCP server config snapshot', async () => {
    mcpConfig.getSnapshot.mockResolvedValue({
      configPath: 'D:/repo/.mcp/mcp.json',
      servers: [
        {
          name: 'weather-server',
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
          env: {},
        },
      ],
    });

    await expect(controller.listServers()).resolves.toEqual({
      configPath: 'D:/repo/.mcp/mcp.json',
      servers: [
        expect.objectContaining({
          name: 'weather-server',
        }),
      ],
    });
  });

  it('creates and updates MCP server config then reloads runtime state', async () => {
    mcpConfig.saveServer
      .mockResolvedValueOnce({
        name: 'tavily',
        command: 'npx',
        args: ['-y', 'tavily-mcp@latest'],
        env: {
          TAVILY_API_KEY: '${TAVILY_API_KEY}',
        },
      })
      .mockResolvedValueOnce({
        name: 'tavily-search',
        command: 'node',
        args: ['dist/index.js'],
        env: {
          TAVILY_API_KEY: '${TAVILY_API_KEY}',
        },
      });

    await expect(
      controller.createServer({
        name: 'tavily',
        command: 'npx',
        args: ['-y', 'tavily-mcp@latest'],
        env: {
          TAVILY_API_KEY: '${TAVILY_API_KEY}',
        },
      } as never),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'tavily',
      }),
    );

    await expect(
      controller.updateServer('tavily', {
        name: 'tavily-search',
        command: 'node',
        args: ['dist/index.js'],
        env: {
          TAVILY_API_KEY: '${TAVILY_API_KEY}',
        },
      } as never),
    ).resolves.toEqual(
      expect.objectContaining({
        name: 'tavily-search',
      }),
    );

    expect(mcpConfig.saveServer).toHaveBeenNthCalledWith(1, {
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    });
    expect(mcpConfig.saveServer).toHaveBeenNthCalledWith(2, {
      name: 'tavily-search',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    }, 'tavily');
    expect(mcpService.reloadServersFromConfig).toHaveBeenCalledTimes(2);
  });

  it('deletes MCP server config then reloads runtime state', async () => {
    mcpConfig.deleteServer.mockResolvedValue({
      deleted: true,
      name: 'weather-server',
    });

    await expect(
      controller.deleteServer('weather-server'),
    ).resolves.toEqual({
      deleted: true,
      name: 'weather-server',
    });

    expect(mcpConfig.deleteServer).toHaveBeenCalledWith('weather-server');
    expect(mcpService.reloadServersFromConfig).toHaveBeenCalledTimes(1);
  });
});

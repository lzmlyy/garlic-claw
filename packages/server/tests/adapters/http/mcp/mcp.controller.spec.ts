import { McpController } from '../../../../src/adapters/http/mcp/mcp.controller';

describe('McpController', () => {
  const mcpService = {
    applyServerConfig: jest.fn(),
    deleteServer: jest.fn(),
    getSnapshot: jest.fn(),
    removeServer: jest.fn(),
    saveServer: jest.fn(),
  };

  let controller: McpController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new McpController(mcpService as never);
  });

  it('lists MCP server config snapshot', async () => {
    mcpService.getSnapshot.mockResolvedValue({
      configPath: 'mcp/mcp.json',
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
      configPath: 'mcp/mcp.json',
      servers: [
        expect.objectContaining({
          name: 'weather-server',
        }),
      ],
    });
  });

  it('creates and updates MCP server config', async () => {
    mcpService.saveServer
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

    expect(mcpService.saveServer).toHaveBeenNthCalledWith(1, {
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    });
    expect(mcpService.saveServer).toHaveBeenNthCalledWith(2, {
      name: 'tavily-search',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    }, 'tavily');
    expect(mcpService.applyServerConfig).toHaveBeenNthCalledWith(1, {
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    });
    expect(mcpService.applyServerConfig).toHaveBeenNthCalledWith(2, {
      name: 'tavily-search',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    }, 'tavily');
  });

  it('deletes MCP server config', async () => {
    mcpService.deleteServer.mockResolvedValue({
      deleted: true,
      name: 'weather-server',
    });

    await expect(
      controller.deleteServer('weather-server'),
    ).resolves.toEqual({
      deleted: true,
      name: 'weather-server',
    });

    expect(mcpService.deleteServer).toHaveBeenCalledWith('weather-server');
    expect(mcpService.removeServer).toHaveBeenCalledWith('weather-server');
  });
});

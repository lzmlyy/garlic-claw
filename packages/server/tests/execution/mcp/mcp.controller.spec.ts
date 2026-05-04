import { McpController } from '../../../src/modules/execution/mcp/mcp.controller';

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
      configPath: 'config/mcp/servers',
      servers: [
        {
          name: 'weather-server',
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
          env: {},
          eventLog: {
            maxFileSizeMb: 1,
          },
        },
      ],
    });

    await expect(controller.listServers()).resolves.toEqual({
      configPath: 'config/mcp/servers',
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
        eventLog: {
          maxFileSizeMb: 1,
        },
      })
      .mockResolvedValueOnce({
        name: 'tavily-search',
        command: 'node',
        args: ['dist/index.js'],
        env: {
          TAVILY_API_KEY: '${TAVILY_API_KEY}',
        },
        eventLog: {
          maxFileSizeMb: 1,
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
      eventLog: {
        maxFileSizeMb: 1,
      },
    });
    expect(mcpService.saveServer).toHaveBeenNthCalledWith(2, {
      name: 'tavily-search',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    }, 'tavily');
    expect(mcpService.applyServerConfig).toHaveBeenNthCalledWith(1, {
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    });
    expect(mcpService.applyServerConfig).toHaveBeenNthCalledWith(2, {
      name: 'tavily-search',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    }, 'tavily');
  });

  it('preserves env entry source metadata when creating a server with a stored secret', async () => {
    mcpService.saveServer.mockResolvedValue({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '',
      },
      envEntries: [
        {
          key: 'TAVILY_API_KEY',
          source: 'stored-secret',
          value: '',
          hasStoredValue: true,
        },
      ],
      eventLog: {
        maxFileSizeMb: 1,
      },
    });

    await controller.createServer({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      envEntries: [
        {
          key: 'TAVILY_API_KEY',
          value: 'real-secret-key',
          source: 'stored-secret',
        },
      ],
    } as never);

    expect(mcpService.saveServer).toHaveBeenCalledWith({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {},
      envEntries: [
        {
          key: 'TAVILY_API_KEY',
          value: 'real-secret-key',
          source: 'stored-secret',
        },
      ],
      eventLog: {
        maxFileSizeMb: 1,
      },
    });
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

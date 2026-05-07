import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { McpController } from '../../../src/modules/execution/mcp/mcp.controller';
import { McpServerDto } from '../../../src/modules/execution/mcp/dto/mcp-server.dto';

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

  it('marks MCP routes with jwt auth guard metadata', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, McpController) as Array<{ name?: string }> | undefined;
    expect(guards?.map((guard) => guard?.name)).toContain('JwtAuthGuard');
  });

  it('validates MCP server DTO body shape', () => {
    expect(validateSync(plainToInstance(McpServerDto, {
      args: ['-y', 'tavily-mcp@latest'],
      command: 'npx',
      envEntries: [
        {
          key: 'TAVILY_API_KEY',
          source: 'env-ref',
          value: '${TAVILY_API_KEY}',
        },
      ],
      eventLog: {
        maxFileSizeMb: 1,
      },
      name: 'tavily',
    }))).toEqual([]);
    expect(validateSync(plainToInstance(McpServerDto, {
      args: 'not-array',
      command: '',
      env: {
        NUMERIC_VALUE: 123,
      },
      envEntries: [
        {
          key: '',
          source: 'raw',
          value: 123,
        },
      ],
      eventLog: {
        maxFileSizeMb: 101,
      },
      name: '',
    })).length).toBeGreaterThan(0);
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

  it('normalizes env maps before saving server config', async () => {
    mcpService.saveServer.mockResolvedValue({
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

    await controller.createServer({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        ' TAVILY_API_KEY ': ' ${TAVILY_API_KEY} ',
        NUMERIC_VALUE: 123,
      },
    } as never);

    expect(mcpService.saveServer).toHaveBeenCalledWith({
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

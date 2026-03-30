import * as fs from 'node:fs';
import * as path from 'node:path';
import { McpConfigService } from './mcp-config.service';

describe('McpConfigService', () => {
  const tempConfigPath = path.join(
    process.cwd(),
    'tmp',
    'mcp-config.service.spec',
    'mcp.json',
  );
  const envKey = 'GARLIC_CLAW_MCP_CONFIG_PATH';

  beforeEach(() => {
    delete process.env[envKey];
    fs.rmSync(path.dirname(tempConfigPath), { recursive: true, force: true });
  });

  afterEach(() => {
    delete process.env[envKey];
    fs.rmSync(path.dirname(tempConfigPath), { recursive: true, force: true });
  });

  it('returns an empty snapshot when the MCP config file does not exist', async () => {
    process.env[envKey] = tempConfigPath;

    const service = new McpConfigService();

    await expect(service.getSnapshot()).resolves.toEqual({
      configPath: path.resolve(tempConfigPath),
      servers: [],
    });
  });

  it('creates and renames MCP server config entries while preserving other top-level fields', async () => {
    process.env[envKey] = tempConfigPath;
    fs.mkdirSync(path.dirname(tempConfigPath), { recursive: true });
    fs.writeFileSync(tempConfigPath, JSON.stringify({
      version: 1,
      mcpServers: {
        weather: {
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
        },
      },
    }, null, 2));

    const service = new McpConfigService();

    await expect(
      service.saveServer({
        name: 'tavily',
        command: 'npx',
        args: ['-y', 'tavily-mcp@latest'],
        env: {
          TAVILY_API_KEY: '${TAVILY_API_KEY}',
        },
      }),
    ).resolves.toEqual({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    });

    await expect(
      service.saveServer(
        {
          name: 'tavily-search',
          command: 'node',
          args: ['dist/index.js'],
          env: {
            TAVILY_API_KEY: '${TAVILY_API_KEY}',
            SEARCH_DEPTH: 'advanced',
          },
        },
        'tavily',
      ),
    ).resolves.toEqual({
      name: 'tavily-search',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
        SEARCH_DEPTH: 'advanced',
      },
    });

    const persisted = JSON.parse(fs.readFileSync(tempConfigPath, 'utf-8')) as {
      version: number;
      mcpServers: Record<string, {
        command: string;
        args: string[];
        env?: Record<string, string>;
      }>;
    };

    expect(persisted.version).toBe(1);
    expect(persisted.mcpServers).toEqual({
      weather: {
        command: 'npx',
        args: ['-y', '@mariox/weather-mcp-server'],
      },
      'tavily-search': {
        command: 'node',
        args: ['dist/index.js'],
        env: {
          TAVILY_API_KEY: '${TAVILY_API_KEY}',
          SEARCH_DEPTH: 'advanced',
        },
      },
    });
  });

  it('deletes MCP server entries from the config file', async () => {
    process.env[envKey] = tempConfigPath;
    fs.mkdirSync(path.dirname(tempConfigPath), { recursive: true });
    fs.writeFileSync(tempConfigPath, JSON.stringify({
      mcpServers: {
        weather: {
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
        },
        tavily: {
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
        },
      },
    }, null, 2));

    const service = new McpConfigService();

    await expect(service.deleteServer('weather')).resolves.toEqual({
      deleted: true,
      name: 'weather',
    });

    await expect(service.getSnapshot()).resolves.toEqual({
      configPath: path.resolve(tempConfigPath),
      servers: [
        {
          name: 'tavily',
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
          env: {},
        },
      ],
    });
  });
});

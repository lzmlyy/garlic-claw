import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { McpConfigStoreService } from '../../../src/execution/mcp/mcp-config-store.service';

describe('McpConfigStoreService', () => {
  const envKey = 'GARLIC_CLAW_MCP_CONFIG_PATH';
  let tempConfigPath: string;
  let originalCwd: string;

  beforeEach(() => {
    delete process.env[envKey];
    tempConfigPath = path.join(os.tmpdir(), `mcp-config.service.spec-${Date.now()}-${Math.random()}`, 'mcp.json');
    fs.rmSync(path.dirname(tempConfigPath), { recursive: true, force: true });
    originalCwd = process.cwd();
  });

  afterEach(() => {
    delete process.env[envKey];
    fs.rmSync(path.dirname(tempConfigPath), { recursive: true, force: true });
    process.chdir(originalCwd);
  });

  it('returns an empty snapshot when the MCP config file does not exist', async () => {
    process.env[envKey] = tempConfigPath;
    const service = new McpConfigStoreService();

    expect(service.getSnapshot()).toEqual({
      configPath: tempConfigPath,
      servers: [],
    });
  });

  it('defaults to the repository mcp/mcp.json path when no environment variable is set', () => {
    const workspaceRoot = path.join(os.tmpdir(), `mcp-config.service.workspace-${Date.now()}-${Math.random()}`);
    const nestedServerRoot = path.join(workspaceRoot, 'packages', 'server');
    const defaultConfigPath = path.join(workspaceRoot, 'mcp', 'mcp.json');
    fs.mkdirSync(nestedServerRoot, { recursive: true });
    fs.mkdirSync(path.dirname(defaultConfigPath), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'mcp-config-test' }), 'utf-8');
    fs.writeFileSync(defaultConfigPath, JSON.stringify({
      mcpServers: {
        'weather-server': {
          command: 'npx',
          args: ['-y', '@mariox/weather-mcp-server'],
        },
      },
    }, null, 2));

    process.chdir(nestedServerRoot);

    try {
      const service = new McpConfigStoreService();

      expect(service.getSnapshot()).toEqual({
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
      expect(fs.existsSync(defaultConfigPath)).toBe(true);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('creates and renames MCP server config entries while preserving legacy top-level fields', () => {
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

    const service = new McpConfigStoreService();

    expect(service.saveServer({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: { TAVILY_API_KEY: '${TAVILY_API_KEY}' },
    })).toEqual({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: { TAVILY_API_KEY: '${TAVILY_API_KEY}' },
    });

    expect(service.saveServer(
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
    )).toEqual({
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

  it('deletes MCP server entries from the config file', () => {
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

    const service = new McpConfigStoreService();

    expect(service.deleteServer('weather')).toEqual({
      deleted: true,
      name: 'weather',
    });

    expect(service.getSnapshot()).toEqual({
      configPath: tempConfigPath,
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

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { McpSecretStoreService } from '../../../src/modules/execution/mcp/mcp-secret-store.service';
import { McpServerStoreService } from '../../../src/modules/execution/mcp/mcp-server-store.service';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';

type McpServerConfigWithEntries = Parameters<McpServerStoreService['saveServer']>[0] & {
  envEntries: Array<{
    key: string;
    source: 'env-ref' | 'literal' | 'stored-secret';
    value: string;
    hasStoredValue?: boolean;
  }>;
};

describe('McpServerStoreService', () => {
  const envKey = 'GARLIC_CLAW_MCP_CONFIG_PATH';
  const secretEnvKey = 'GARLIC_CLAW_MCP_SECRET_STATE_PATH';
  let tempConfigRoot: string;
  let tempSecretStorePath: string;
  let originalCwd: string;
  let projectWorktreeRootService: ProjectWorktreeRootService;
  let mcpSecretStoreService: McpSecretStoreService;

  beforeEach(() => {
    delete process.env[envKey];
    delete process.env[secretEnvKey];
    tempConfigRoot = path.join(os.tmpdir(), `mcp-config.service.spec-${Date.now()}-${Math.random()}`, 'servers');
    tempSecretStorePath = path.join(os.tmpdir(), `mcp-secret.service.spec-${Date.now()}-${Math.random()}`, 'mcp-secrets.server.json');
    fs.rmSync(path.dirname(tempConfigRoot), { recursive: true, force: true });
    fs.rmSync(path.dirname(tempSecretStorePath), { recursive: true, force: true });
    originalCwd = process.cwd();
    projectWorktreeRootService = new ProjectWorktreeRootService();
    process.env[secretEnvKey] = tempSecretStorePath;
    mcpSecretStoreService = new McpSecretStoreService(projectWorktreeRootService);
  });

  afterEach(() => {
    delete process.env[envKey];
    delete process.env[secretEnvKey];
    fs.rmSync(path.dirname(tempConfigRoot), { recursive: true, force: true });
    fs.rmSync(path.dirname(tempSecretStorePath), { recursive: true, force: true });
    process.chdir(originalCwd);
  });

  it('returns an empty snapshot when the MCP config directory does not exist', async () => {
    process.env[envKey] = tempConfigRoot;
    const service = new McpServerStoreService(projectWorktreeRootService, mcpSecretStoreService);

    expect(service.getSnapshot()).toEqual({
      configPath: tempConfigRoot,
      servers: [],
    });
  });

  it('defaults to the repository config/mcp/servers path when no environment variable is set', () => {
    const workspaceRoot = path.join(os.tmpdir(), `mcp-config.service.workspace-${Date.now()}-${Math.random()}`);
    const nestedServerRoot = path.join(workspaceRoot, 'packages', 'server');
    const defaultConfigRoot = path.join(workspaceRoot, 'config', 'mcp', 'servers');
    fs.mkdirSync(nestedServerRoot, { recursive: true });
    fs.mkdirSync(defaultConfigRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), JSON.stringify({ name: 'mcp-config-test' }), 'utf-8');
    fs.writeFileSync(path.join(defaultConfigRoot, 'tavily-mcp.json'), JSON.stringify({
      name: 'tavily-mcp',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
      },
    }, null, 2));

    process.chdir(nestedServerRoot);

    try {
      const service = new McpServerStoreService(projectWorktreeRootService, mcpSecretStoreService);

      expect(service.getSnapshot()).toEqual({
        configPath: 'config/mcp/servers',
        servers: [
          {
            name: 'tavily-mcp',
            command: 'npx',
            args: ['-y', 'tavily-mcp@latest'],
            eventLog: {
              maxFileSizeMb: 1,
            },
            env: {
              TAVILY_API_KEY: '${TAVILY_API_KEY}',
            },
            envEntries: [
              {
                key: 'TAVILY_API_KEY',
                source: 'env-ref',
                value: '${TAVILY_API_KEY}',
              },
            ],
          },
        ],
      });
      expect(fs.existsSync(path.join(defaultConfigRoot, 'tavily-mcp.json'))).toBe(true);
    } finally {
      process.chdir(originalCwd);
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('creates and renames MCP server config files', () => {
    process.env[envKey] = tempConfigRoot;
    fs.mkdirSync(tempConfigRoot, { recursive: true });
    fs.writeFileSync(path.join(tempConfigRoot, 'weather.json'), JSON.stringify({
      name: 'weather',
      command: 'npx',
      args: ['-y', '@mariox/weather-mcp-server'],
    }, null, 2));

    const service = new McpServerStoreService(projectWorktreeRootService, mcpSecretStoreService);

    expect(service.saveServer({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: { TAVILY_API_KEY: '${TAVILY_API_KEY}' },
      eventLog: {
        maxFileSizeMb: 1,
      },
    })).toEqual({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: { TAVILY_API_KEY: '${TAVILY_API_KEY}' },
      eventLog: {
        maxFileSizeMb: 1,
      },
      envEntries: [
        {
          key: 'TAVILY_API_KEY',
          source: 'env-ref',
          value: '${TAVILY_API_KEY}',
        },
      ],
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
        eventLog: {
          maxFileSizeMb: 1,
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
      envEntries: [
        {
          key: 'SEARCH_DEPTH',
          source: 'literal',
          value: 'advanced',
        },
        {
          key: 'TAVILY_API_KEY',
          source: 'env-ref',
          value: '${TAVILY_API_KEY}',
        },
      ],
      eventLog: {
        maxFileSizeMb: 1,
      },
    });

    const weatherPersisted = JSON.parse(fs.readFileSync(path.join(tempConfigRoot, 'weather.json'), 'utf-8'));
    const tavilyPersisted = JSON.parse(fs.readFileSync(path.join(tempConfigRoot, 'tavily-search.json'), 'utf-8'));

    expect(weatherPersisted).toEqual({
      name: 'weather',
      command: 'npx',
      args: ['-y', '@mariox/weather-mcp-server'],
    });
    expect(tavilyPersisted).toEqual({
      name: 'tavily-search',
      command: 'node',
      args: ['dist/index.js'],
      env: {
        TAVILY_API_KEY: '${TAVILY_API_KEY}',
        SEARCH_DEPTH: 'advanced',
      },
      eventLog: {
        maxFileSizeMb: 1,
      },
    });
    expect(fs.existsSync(path.join(tempConfigRoot, 'tavily.json'))).toBe(false);
  });

  it('deletes MCP server files from the config directory', () => {
    process.env[envKey] = tempConfigRoot;
    fs.mkdirSync(tempConfigRoot, { recursive: true });
    fs.writeFileSync(path.join(tempConfigRoot, 'weather.json'), JSON.stringify({
      name: 'weather',
      command: 'npx',
      args: ['-y', '@mariox/weather-mcp-server'],
    }, null, 2));
    fs.writeFileSync(path.join(tempConfigRoot, 'tavily.json'), JSON.stringify({
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
    }, null, 2));

    const service = new McpServerStoreService(projectWorktreeRootService, mcpSecretStoreService);

    expect(service.deleteServer('weather')).toEqual({
      deleted: true,
      name: 'weather',
    });

    expect(service.getSnapshot()).toEqual({
      configPath: tempConfigRoot,
      servers: [
        {
          name: 'tavily',
          command: 'npx',
          args: ['-y', 'tavily-mcp@latest'],
          eventLog: {
            maxFileSizeMb: 1,
          },
          env: {},
        },
      ],
    });
    expect(fs.existsSync(path.join(tempConfigRoot, 'weather.json'))).toBe(false);
  });

  it('keeps stored secrets out of tracked config files and exposes stored-secret metadata in the snapshot', () => {
    process.env[envKey] = tempConfigRoot;

    const service = new McpServerStoreService(projectWorktreeRootService, mcpSecretStoreService);
    const payload: McpServerConfigWithEntries = {
      name: 'tavily',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      env: {},
      envEntries: [
        {
          key: 'TAVILY_API_KEY',
          source: 'stored-secret',
          value: 'real-secret-key',
        },
        {
          key: 'SEARCH_DEPTH',
          source: 'literal',
          value: 'advanced',
        },
        {
          key: 'TAVILY_PROFILE',
          source: 'env-ref',
          value: '${TAVILY_PROFILE}',
        },
      ],
      eventLog: {
        maxFileSizeMb: 1,
      },
    };

    service.saveServer(payload);

    const persisted = JSON.parse(
      fs.readFileSync(path.join(tempConfigRoot, 'tavily.json'), 'utf-8'),
    ) as {
      env?: Record<string, string>;
    };
    const snapshot = service.getSnapshot();

    expect(persisted.env).toEqual({
      SEARCH_DEPTH: 'advanced',
      TAVILY_PROFILE: '${TAVILY_PROFILE}',
    });
    expect(snapshot.servers).toEqual([
      expect.objectContaining({
        name: 'tavily',
        env: {
          SEARCH_DEPTH: 'advanced',
          TAVILY_API_KEY: '',
          TAVILY_PROFILE: '${TAVILY_PROFILE}',
        },
        envEntries: [
          {
            key: 'SEARCH_DEPTH',
            source: 'literal',
            value: 'advanced',
          },
          {
            key: 'TAVILY_API_KEY',
            source: 'stored-secret',
            value: '',
            hasStoredValue: true,
          },
          {
            key: 'TAVILY_PROFILE',
            source: 'env-ref',
            value: '${TAVILY_PROFILE}',
          },
        ],
      }),
    ]);
  });

});

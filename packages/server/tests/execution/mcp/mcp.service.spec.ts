import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { McpServerConfig } from '@garlic-claw/shared';
import { McpSecretStoreService } from '../../../src/modules/execution/mcp/mcp-secret-store.service';
import { McpServerStoreService } from '../../../src/modules/execution/mcp/mcp-server-store.service';
import { ProjectWorktreeRootService } from '../../../src/modules/execution/project/project-worktree-root.service';
import { McpService } from '../../../src/modules/execution/mcp/mcp.service';
import { ToolManagementSettingsService } from '../../../src/modules/execution/tool/tool-management-settings.service';
import { RuntimeEventLogService } from '../../../src/core/logging/runtime-event-log.service';
import { createServerTestArtifactPath } from '../../../src/core/runtime/server-workspace-paths';

type McpServerConfigWithEntries = McpServerConfig & {
  envEntries: Array<{
    key: string;
    source: 'env-ref' | 'literal' | 'stored-secret';
    value: string;
    hasStoredValue?: boolean;
  }>;
};

describe('McpService', () => {
  const envKey = 'GARLIC_CLAW_MCP_CONFIG_PATH';
  const secretEnvKey = 'GARLIC_CLAW_MCP_SECRET_STATE_PATH';
  const toolManagementEnvKey = 'GARLIC_CLAW_TOOL_MANAGEMENT_CONFIG_PATH';
  const configService = { get: jest.fn() };
  let tempConfigRoot: string;
  let tempLogRoot: string;
  let tempSecretStorePath: string;
  let tempToolManagementPath: string;
  let projectWorktreeRootService: ProjectWorktreeRootService;
  let mcpSecretStoreService: McpSecretStoreService;

  let service: McpService;

  function createServer(name: string): McpServerConfig {
    return {
      name,
      command: 'npx',
      args: ['-y', `${name}-mcp`],
      env: {},
      eventLog: {
        maxFileSizeMb: 1,
      },
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[envKey];
    delete process.env[secretEnvKey];
    delete process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
    tempConfigRoot = path.join(os.tmpdir(), `mcp.service.spec-${Date.now()}-${Math.random()}`, 'servers');
    tempLogRoot = path.join(os.tmpdir(), `mcp.service.logs-${Date.now()}-${Math.random()}`);
    tempSecretStorePath = path.join(os.tmpdir(), `mcp.service.secret-${Date.now()}-${Math.random()}`, 'mcp-secrets.server.json');
    tempToolManagementPath = path.join(os.tmpdir(), `mcp.service.tool-management-${Date.now()}-${Math.random()}`, 'tool-management.json');
    fs.rmSync(path.dirname(tempConfigRoot), { recursive: true, force: true });
    fs.rmSync(path.dirname(tempSecretStorePath), { recursive: true, force: true });
    fs.rmSync(path.dirname(tempToolManagementPath), { recursive: true, force: true });
    process.env[envKey] = tempConfigRoot;
    process.env.GARLIC_CLAW_LOG_ROOT = tempLogRoot;
    process.env[secretEnvKey] = tempSecretStorePath;
    process.env[toolManagementEnvKey] = tempToolManagementPath;
    process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH = tempToolManagementPath;
    projectWorktreeRootService = new ProjectWorktreeRootService();
    mcpSecretStoreService = new McpSecretStoreService(projectWorktreeRootService);
    service = new McpService(
      configService as never,
      new McpServerStoreService(projectWorktreeRootService, mcpSecretStoreService),
      new RuntimeEventLogService(),
      new ToolManagementSettingsService(),
    );
  });

  afterEach(() => {
    delete process.env[envKey];
    delete process.env[secretEnvKey];
    delete process.env.GARLIC_CLAW_LOG_ROOT;
    delete process.env.GARLIC_CLAW_SETTINGS_CONFIG_PATH;
    delete process.env[toolManagementEnvKey];
    fs.rmSync(path.dirname(tempConfigRoot), { recursive: true, force: true });
    fs.rmSync(tempLogRoot, { recursive: true, force: true });
    fs.rmSync(path.dirname(tempSecretStorePath), { recursive: true, force: true });
    fs.rmSync(path.dirname(tempToolManagementPath), { recursive: true, force: true });
  });

  it('connects and calls a real stdio MCP server through the launcher', async () => {
    const workspace = createServerTestArtifactPath({
      prefix: 'mcp-real',
      subdirectory: 'server',
    });
    const scriptPath = path.join(workspace, 'working-mcp.cjs');
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(scriptPath, [
      "const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');",
      "const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');",
      "const z = require('zod/v4');",
      "const server = new McpServer({ name: 'smoke-working-mcp', version: '1.0.0' });",
      "server.registerTool('echo_weather', {",
      "  description: 'Echo weather city',",
      "  inputSchema: { city: z.string() },",
      "}, async ({ city }) => ({",
      "  content: [{ type: 'text', text: `weather:${city}` }],",
      "}));",
      "const transport = new StdioServerTransport();",
      "transport.onerror = (error) => {",
      "  if (error && (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED')) { process.exit(0); }",
      "};",
      "server.connect(transport).catch((error) => {",
      "  console.error(error);",
      "  process.exit(1);",
      "});",
    ].join('\n'), 'utf8');

    try {
      await service.connectMcpServer('weather-real', {
        name: 'weather-real',
        command: process.execPath,
        args: [scriptPath],
        env: {},
        eventLog: {
          maxFileSizeMb: 1,
        },
      });

      const snapshot = service.getToolingSnapshot();
      expect(snapshot.statuses).toEqual(expect.arrayContaining([
        expect.objectContaining({
          name: 'weather-real',
          connected: true,
          health: 'healthy',
        }),
      ]));
      expect(snapshot.tools).toEqual(expect.arrayContaining([
        expect.objectContaining({
          serverName: 'weather-real',
          name: 'echo_weather',
        }),
      ]));

      await expect(service.callTool({
        serverName: 'weather-real',
        toolName: 'echo_weather',
        arguments: { city: 'Shanghai' },
      })).resolves.toEqual([
        {
          type: 'text',
          text: 'weather:Shanghai',
        },
      ]);
    } finally {
      await service.disconnectAllClients();
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });

  it('connects a source into runtime client state and discovers tools', async () => {
    const weather = createServer('weather');
    const connectSpy = jest.spyOn(service as any, 'connectClientSession').mockResolvedValue({
      client: { callTool: jest.fn(), close: jest.fn() },
      tools: [{ serverName: 'weather', name: 'get_forecast', description: 'Get forecast', inputSchema: { type: 'object' } }],
    });

    await service.connectMcpServer('weather', weather);

    expect(connectSpy).toHaveBeenCalledWith(expect.objectContaining({
      config: weather,
      name: 'weather',
    }));
    expect(service.getToolingSnapshot().statuses).toEqual([
      expect.objectContaining({
        name: 'weather',
        connected: true,
        health: 'healthy',
      }),
    ]);
    expect(service.getToolingSnapshot().tools).toEqual([
      expect.objectContaining({
        serverName: 'weather',
        name: 'get_forecast',
      }),
    ]);
  });

  it('closes temporary MCP clients when tool discovery fails after connect', async () => {
    const weather = createServer('weather');
    const connectSpy = jest.spyOn(Client.prototype, 'connect').mockResolvedValue(undefined as never);
    const listToolsSpy = jest.spyOn(Client.prototype, 'listTools').mockRejectedValue(new Error('list tools failed'));
    const closeSpy = jest.spyOn(Client.prototype, 'close').mockResolvedValue(undefined as never);

    await expect((service as any).connectClientSession({
      config: weather,
      name: 'weather',
    })).rejects.toThrow('list tools failed');
    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(listToolsSpy).toHaveBeenCalledTimes(2);
    expect(closeSpy).toHaveBeenCalledTimes(2);
  });

  it('reloads MCP sources from config with persisted enabled state', async () => {
    const weather = createServer('weather');
    const tavily = createServer('tavily');
    await service.saveServer(weather);
    await service.saveServer(tavily);
    await service.setServerEnabled('weather', false);
    const disconnectAllSpy = jest.spyOn(service as any, 'disconnectAllClients').mockResolvedValue(undefined);
    const connectSpy = jest.spyOn(service as any, 'connectMcpServer').mockResolvedValue(undefined);

    await service.reloadServersFromConfig();

    expect(disconnectAllSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledWith('tavily', tavily);
    expect(service.getToolingSnapshot().statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'weather', enabled: false }),
      expect.objectContaining({ name: 'tavily', enabled: true }),
    ]));
  });

  it('restores persisted disabled state after service reload', async () => {
    const weather = createServer('weather');
    await service.saveServer(weather);
    await service.setServerEnabled('weather', false);

    const reloaded = new McpService(
      configService as never,
      new McpServerStoreService(projectWorktreeRootService, mcpSecretStoreService),
      new RuntimeEventLogService(),
      new ToolManagementSettingsService(),
    );

    const connectSpy = jest.spyOn(reloaded as any, 'connectMcpServer').mockResolvedValue(undefined);

    reloaded.onModuleInit();
    await Promise.resolve();

    expect(reloaded.getToolingSnapshot()).toEqual({
      statuses: [
        expect.objectContaining({
          name: 'weather',
          enabled: false,
          connected: false,
          health: 'unknown',
        }),
      ],
      tools: [],
    });
    expect(connectSpy).not.toHaveBeenCalled();
  });

  it('starts MCP warmup in background during module init', async () => {
    const weather = createServer('weather');
    await service.saveServer(weather);
    let resolveReload!: () => void;
    const reloadPromise = new Promise<void>((resolve) => {
      resolveReload = resolve;
    });
    const reloadSpy = jest.spyOn(service, 'reloadServersFromConfig').mockReturnValue(reloadPromise);

    service.onModuleInit();

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(service.getToolingSnapshot()).toEqual({
      statuses: [
        expect.objectContaining({
          name: 'weather',
          connected: false,
          enabled: true,
          health: 'unknown',
        }),
      ],
      tools: [],
    });

    resolveReload();
    await reloadPromise;
  });

  it('disconnects runtime state and rejects tool calls when a source is disabled online', async () => {
    const weather = createServer('weather');
    const client = { callTool: jest.fn(), close: jest.fn() };

    await service.saveServer(weather);
    (service as any).clients.set('weather', client);
    (service as any).serverRecords.set('weather', {
      status: {
        name: 'weather',
        connected: true,
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-04-03T10:00:00.000Z',
      },
      tools: [
        { serverName: 'weather', name: 'get_forecast', description: 'Get forecast', inputSchema: null },
      ],
    });

    await service.setServerEnabled('weather', false);

    expect(client.close).toHaveBeenCalledTimes(1);
    expect(service.getToolingSnapshot()).toEqual({
      statuses: [expect.objectContaining({ name: 'weather', enabled: false, connected: false, health: 'unknown' })],
      tools: [],
    });
    expect(service.listToolSources()).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({
          id: 'weather',
          enabled: false,
          totalTools: 1,
          enabledTools: 0,
        }),
        tools: [
          expect.objectContaining({
            toolId: 'mcp:weather:get_forecast',
            enabled: false,
          }),
        ],
      }),
    ]);
    await expect(service.callTool({ serverName: 'weather', toolName: 'get_forecast', arguments: {} })).rejects.toThrow('MCP 服务器 "weather" 已禁用');
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it('closes and evicts a connected MCP client after tool call failure', async () => {
    const weather = createServer('weather');
    const client = {
      callTool: jest.fn().mockRejectedValue(new Error('tool crashed')),
      close: jest.fn().mockResolvedValue(undefined),
    };

    await service.saveServer(weather);
    (service as any).clients.set('weather', client);
    (service as any).serverRecords.set('weather', {
      status: {
        name: 'weather',
        connected: true,
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-04-03T10:00:00.000Z',
      },
      tools: [
        { serverName: 'weather', name: 'get_forecast', description: 'Get forecast', inputSchema: null },
      ],
    });

    await expect(service.callTool({
      serverName: 'weather',
      toolName: 'get_forecast',
      arguments: {},
    })).rejects.toThrow('tool crashed');

    expect(client.callTool).toHaveBeenCalledTimes(1);
    expect(client.close).toHaveBeenCalledTimes(1);
    expect((service as any).clients.has('weather')).toBe(false);
    expect(service.getToolingSnapshot()).toEqual({
      statuses: [
        expect.objectContaining({
          name: 'weather',
          connected: false,
          health: 'error',
          lastError: 'tool crashed',
          lastCheckedAt: expect.any(String),
        }),
      ],
      tools: [],
    });
    expect(service.listToolSources()).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({
          id: 'weather',
          enabled: true,
          totalTools: 1,
          enabledTools: 0,
          health: 'error',
        }),
        tools: [
          expect.objectContaining({
            toolId: 'mcp:weather:get_forecast',
            enabled: false,
          }),
        ],
      }),
    ]);
  });

  it('applies tool-level enabled overrides when listing MCP tools', async () => {
    (service as any).serverRecords.set('weather', {
      status: {
        name: 'weather',
        connected: true,
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-04-03T10:00:00.000Z',
      },
      tools: [
        { serverName: 'weather', name: 'get_forecast', description: 'Get forecast', inputSchema: null },
        { serverName: 'weather', name: 'get_alerts', description: 'Get alerts', inputSchema: null },
      ],
    });
    ((service as any).toolManagementSettingsService as ToolManagementSettingsService)
      .writeToolEnabledOverride('mcp:weather:get_alerts', false);

    const [entry] = service.listToolSources();

    expect(entry).toEqual(expect.objectContaining({
      source: expect.objectContaining({
        id: 'weather',
        enabled: true,
        totalTools: 2,
        enabledTools: 1,
      }),
      tools: expect.arrayContaining([
        expect.objectContaining({
          toolId: 'mcp:weather:get_forecast',
          enabled: true,
        }),
        expect.objectContaining({
          toolId: 'mcp:weather:get_alerts',
          enabled: false,
        }),
      ]),
    }));
  });

  it('disconnects all MCP clients when the module is destroyed', async () => {
    const disconnectAllSpy = jest.spyOn(service as any, 'disconnectAllClients').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnectAllSpy).toHaveBeenCalledTimes(1);
  });

  it('clears persisted MCP source and tool overrides when a server is removed', async () => {
    await service.saveServer(createServer('weather'));
    await service.setServerEnabled('weather', false);
    ((service as any).toolManagementSettingsService as ToolManagementSettingsService)
      .writeToolEnabledOverride('mcp:weather:get_forecast', false);

    await service.removeServer('weather');

    const reloadedSettings = new ToolManagementSettingsService();
    expect(reloadedSettings.readSourceEnabledOverride('mcp:weather')).toBeUndefined();
    expect(reloadedSettings.readToolEnabledOverride('mcp:weather:get_forecast')).toBeUndefined();
  });

  it('runs a real probe when executing health-check governance action', async () => {
    const weather = createServer('weather');
    const staleClient = { callTool: jest.fn(), close: jest.fn() };
    const freshClient = { callTool: jest.fn(), close: jest.fn() };
    await service.saveServer(weather);
    (service as any).clients.set('weather', staleClient);
    (service as any).serverRecords.set('weather', {
      status: {
        name: 'weather',
        connected: false,
        enabled: true,
        health: 'error',
        lastError: 'stale',
        lastCheckedAt: '2026-04-03T10:00:00.000Z',
      },
      tools: [],
    });
    const connectSpy = jest.spyOn(service as any, 'connectClientSession').mockResolvedValue({
      client: freshClient,
      tools: [{ serverName: 'weather', name: 'get_forecast', description: 'Get forecast', inputSchema: { type: 'object' } }],
    });

    await expect(service.runGovernanceAction('weather', 'health-check')).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceId: 'weather',
      sourceKind: 'mcp',
      message: 'MCP source health check passed',
    });
    expect(connectSpy).toHaveBeenCalledWith({
      config: weather,
      name: 'weather',
    });
    expect(staleClient.close).toHaveBeenCalledTimes(1);
    expect(service.getToolingSnapshot()).toEqual({
      statuses: [
        expect.objectContaining({
          name: 'weather',
          connected: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: expect.any(String),
        }),
      ],
      tools: [
        expect.objectContaining({
          serverName: 'weather',
          name: 'get_forecast',
        }),
      ],
    });
  });

  it('routes stdio MCP servers through the local launcher process', () => {
    const config = createServer('weather');

    const transport = (service as any).buildTransportConfig(config) as {
      args: string[];
      command: string;
      env: Record<string, string>;
    };

    expect(transport.command).toBe(process.execPath);
    expect(transport.args[0]).toMatch(/mcp-stdio-launcher\.js$/);
    expect(transport.args.slice(1)).toEqual(['npx', '-y', 'weather-mcp']);
    expect(typeof transport.env).toBe('object');
  });

  it('resolves stored-secret env entries from the local MCP secret store at runtime', async () => {
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
      ],
      eventLog: {
        maxFileSizeMb: 1,
      },
    };

    await service.saveServer(payload);
    const saved = service.getSnapshot().servers.find((entry) => entry.name === 'tavily');
    const buildTransportConfig = service as unknown as {
      buildTransportConfig(config: McpServerConfig): {
        args: string[];
        command: string;
        env: Record<string, string>;
      };
    };

    expect(saved).toBeTruthy();
    const transport = buildTransportConfig.buildTransportConfig(saved as McpServerConfig);

    expect(transport.env.TAVILY_API_KEY).toBe('real-secret-key');
    expect(transport.env.SEARCH_DEPTH).toBe('advanced');
  });
});

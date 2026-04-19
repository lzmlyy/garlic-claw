import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { McpServerConfig } from '@garlic-claw/shared';
import { McpConfigStoreService } from '../../../src/execution/mcp/mcp-config-store.service';
import { McpService } from '../../../src/execution/mcp/mcp.service';

describe('McpService', () => {
  const envKey = 'GARLIC_CLAW_MCP_CONFIG_PATH';
  const configService = { get: jest.fn() };
  let tempConfigPath: string;

  let service: McpService;

  function createServer(name: string): McpServerConfig {
    return { name, command: 'npx', args: ['-y', `${name}-mcp`], env: {} };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env[envKey];
    tempConfigPath = path.join(os.tmpdir(), `mcp.service.spec-${Date.now()}-${Math.random()}`, 'mcp.json');
    fs.rmSync(path.dirname(tempConfigPath), { recursive: true, force: true });
    process.env[envKey] = tempConfigPath;
    service = new McpService(configService as never, new McpConfigStoreService());
  });

  afterEach(() => {
    delete process.env[envKey];
    fs.rmSync(path.dirname(tempConfigPath), { recursive: true, force: true });
  });

  it('connects and calls a real stdio MCP server through the launcher', async () => {
    const workspace = path.join(process.cwd(), 'tmp', `mcp-real-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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

  it('reloads MCP sources from config with default enabled state', async () => {
    const weather = createServer('weather');
    const tavily = createServer('tavily');
    await service.saveServer(weather);
    await service.saveServer(tavily);
    await service.setServerEnabled('weather', false);
    const disconnectAllSpy = jest.spyOn(service as any, 'disconnectAllClients').mockResolvedValue(undefined);
    const connectSpy = jest.spyOn(service as any, 'connectMcpServer').mockResolvedValue(undefined);

    await service.reloadServersFromConfig();

    expect(disconnectAllSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(connectSpy).toHaveBeenCalledWith('weather', weather);
    expect(connectSpy).toHaveBeenCalledWith('tavily', tavily);
    expect(service.getToolingSnapshot().statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'weather', enabled: true }),
      expect.objectContaining({ name: 'tavily', enabled: true }),
    ]));
  });

  it('disconnects runtime state and rejects tool calls when a source is disabled online', async () => {
    const weather = createServer('weather');
    const client = { callTool: jest.fn(), close: jest.fn() };
    const disconnectSpy = jest.spyOn(service as any, 'disconnectServer').mockResolvedValue(undefined);

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

    expect(disconnectSpy).toHaveBeenCalledWith('weather');
    expect(service.getToolingSnapshot()).toEqual({
      statuses: [expect.objectContaining({ name: 'weather', enabled: false, connected: false, health: 'unknown' })],
      tools: [],
    });
    await expect(service.callTool({ serverName: 'weather', toolName: 'get_forecast', arguments: {} })).rejects.toThrow('MCP 服务器 "weather" 已禁用');
    expect(client.callTool).not.toHaveBeenCalled();
  });

  it('disconnects all MCP clients when the module is destroyed', async () => {
    const disconnectAllSpy = jest.spyOn(service as any, 'disconnectAllClients').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnectAllSpy).toHaveBeenCalledTimes(1);
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
});

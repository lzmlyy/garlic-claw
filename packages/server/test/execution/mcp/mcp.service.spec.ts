import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { McpServerConfig } from '@garlic-claw/shared';
import { McpConfigStoreService } from '../../../src/execution/mcp/mcp-config-store.service';
import { McpService } from '../../../src/execution/mcp/mcp.service';

describe('McpService', () => {
  const envKey = 'GARLIC_CLAW_MCP_CONFIG_PATH';
  const configService = { get: jest.fn() };
  const toolSettings = { getSourceEnabled: jest.fn() };
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
    toolSettings.getSourceEnabled.mockReturnValue(undefined);
    service = new McpService(configService as never, new McpConfigStoreService());
    (service as any).sourceEnabledReader = toolSettings.getSourceEnabled;
  });

  afterEach(() => {
    delete process.env[envKey];
    fs.rmSync(path.dirname(tempConfigPath), { recursive: true, force: true });
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

  it('skips disabled MCP sources during config reload warmup', async () => {
    const weather = createServer('weather');
    const tavily = createServer('tavily');
    await service.saveServer(weather);
    await service.saveServer(tavily);
    toolSettings.getSourceEnabled.mockImplementation((kind: string, id: string) =>
      kind === 'mcp' && id === 'weather' ? false : undefined);
    const disconnectAllSpy = jest.spyOn(service as any, 'disconnectAllClients').mockResolvedValue(undefined);
    const connectSpy = jest.spyOn(service as any, 'connectMcpServer').mockResolvedValue(undefined);

    await service.reloadServersFromConfig();

    expect(disconnectAllSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledWith('tavily', tavily);
    expect(service.getToolingSnapshot().statuses).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'weather', enabled: false, connected: false, health: 'unknown' }),
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
});

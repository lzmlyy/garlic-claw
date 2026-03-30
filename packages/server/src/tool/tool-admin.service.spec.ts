import { BadRequestException } from '@nestjs/common';
import { ToolAdminService } from './tool-admin.service';

describe('ToolAdminService', () => {
  const toolRegistry = {
    listSources: jest.fn(),
  };
  const pluginAdmin = {
    runAction: jest.fn(),
  };
  const mcpService = {
    listServerStatuses: jest.fn(),
  };

  let service: ToolAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ToolAdminService(
      toolRegistry as never,
      pluginAdmin as never,
      mcpService as never,
    );
  });

  it('delegates plugin governance actions through PluginAdminService', async () => {
    toolRegistry.listSources.mockResolvedValue([
      {
        kind: 'plugin',
        id: 'builtin.memory-tools',
        label: '记忆工具',
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-03-30T14:00:00.000Z',
        totalTools: 1,
        enabledTools: 1,
        supportedActions: ['health-check', 'reload'],
      },
    ]);
    pluginAdmin.runAction.mockResolvedValue({
      accepted: true,
      action: 'reload',
      pluginId: 'builtin.memory-tools',
      message: '已重新装载内建插件',
    });

    await expect(
      service.runSourceAction('plugin', 'builtin.memory-tools', 'reload'),
    ).resolves.toEqual({
      accepted: true,
      action: 'reload',
      sourceKind: 'plugin',
      sourceId: 'builtin.memory-tools',
      message: '已重新装载内建插件',
    });
  });

  it('projects MCP health-check actions through the current MCP status view', async () => {
    toolRegistry.listSources.mockResolvedValue([
      {
        kind: 'mcp',
        id: 'weather-server',
        label: 'weather-server',
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-03-30T14:00:00.000Z',
        totalTools: 1,
        enabledTools: 1,
        supportedActions: ['health-check'],
      },
    ]);
    mcpService.listServerStatuses.mockReturnValue([
      {
        name: 'weather-server',
        connected: true,
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-03-30T14:00:00.000Z',
      },
    ]);

    await expect(
      service.runSourceAction('mcp', 'weather-server', 'health-check'),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather-server',
      message: 'MCP source health check passed',
    });
  });

  it('rejects unsupported source actions', async () => {
    toolRegistry.listSources.mockResolvedValue([
      {
        kind: 'mcp',
        id: 'weather-server',
        label: 'weather-server',
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-03-30T14:00:00.000Z',
        totalTools: 1,
        enabledTools: 1,
        supportedActions: ['health-check'],
      },
    ]);

    await expect(
      service.runSourceAction('mcp', 'weather-server', 'reload'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

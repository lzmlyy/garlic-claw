import { ToolController } from './tool.controller';

describe('ToolController', () => {
  const toolRegistry = {
    listOverview: jest.fn(),
    listSources: jest.fn(),
    listToolInfos: jest.fn(),
    setSourceEnabled: jest.fn(),
    setToolEnabled: jest.fn(),
  };

  const toolAdmin = {
    runSourceAction: jest.fn(),
  };

  let controller: ToolController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ToolController(
      toolRegistry as never,
      toolAdmin as never,
    );
  });

  it('lists unified tool sources and tool records', async () => {
    toolRegistry.listOverview.mockResolvedValue({
      sources: [
        {
          kind: 'plugin',
          id: 'builtin.memory-tools',
          label: '记忆工具',
          enabled: true,
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T12:00:00.000Z',
          totalTools: 2,
          enabledTools: 2,
          supportedActions: ['health-check', 'reload'],
        },
      ],
      tools: [
        {
          toolId: 'plugin:builtin.memory-tools:save_memory',
          name: 'save_memory',
          callName: 'save_memory',
          description: '保存记忆',
          parameters: {},
          enabled: true,
          sourceKind: 'plugin',
          sourceId: 'builtin.memory-tools',
          sourceLabel: '记忆工具',
          health: 'healthy',
          lastError: null,
          lastCheckedAt: '2026-03-30T12:00:00.000Z',
        },
      ],
    });
    toolRegistry.listSources.mockResolvedValue([
      {
        kind: 'plugin',
        id: 'builtin.memory-tools',
        label: '记忆工具',
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-03-30T12:00:00.000Z',
        totalTools: 2,
        enabledTools: 2,
        supportedActions: ['health-check', 'reload'],
      },
    ]);
    toolRegistry.listToolInfos.mockResolvedValue([
      {
        toolId: 'plugin:builtin.memory-tools:save_memory',
        name: 'save_memory',
        callName: 'save_memory',
        description: '保存记忆',
        parameters: {},
        enabled: true,
        sourceKind: 'plugin',
        sourceId: 'builtin.memory-tools',
        sourceLabel: '记忆工具',
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-03-30T12:00:00.000Z',
      },
    ]);

    await expect(controller.listOverview()).resolves.toEqual({
      sources: [
        expect.objectContaining({
          id: 'builtin.memory-tools',
          totalTools: 2,
        }),
      ],
      tools: [
        expect.objectContaining({
          toolId: 'plugin:builtin.memory-tools:save_memory',
        }),
      ],
    });
    await expect(controller.listSources()).resolves.toEqual([
      expect.objectContaining({
        id: 'builtin.memory-tools',
        totalTools: 2,
      }),
    ]);
    await expect(controller.listTools()).resolves.toEqual([
      expect.objectContaining({
        toolId: 'plugin:builtin.memory-tools:save_memory',
      }),
    ]);
  });

  it('updates source and tool enabled flags through the registry', async () => {
    toolRegistry.setSourceEnabled.mockResolvedValue({
      kind: 'mcp',
      id: 'weather-server',
      enabled: false,
    });
    toolRegistry.setToolEnabled.mockResolvedValue({
      toolId: 'mcp:weather-server:get_forecast',
      enabled: false,
    });

    await expect(
      controller.updateSourceEnabled('mcp', 'weather-server', {
        enabled: false,
      } as never),
    ).resolves.toEqual({
      kind: 'mcp',
      id: 'weather-server',
      enabled: false,
    });
    await expect(
      controller.updateToolEnabled('mcp:weather-server:get_forecast', {
        enabled: false,
      } as never),
    ).resolves.toEqual({
      toolId: 'mcp:weather-server:get_forecast',
      enabled: false,
    });

    expect(toolRegistry.setSourceEnabled).toHaveBeenCalledWith('mcp', 'weather-server', false);
    expect(toolRegistry.setToolEnabled).toHaveBeenCalledWith(
      'mcp:weather-server:get_forecast',
      false,
    );
  });

  it('dispatches source actions through the tool admin service', async () => {
    toolAdmin.runSourceAction.mockResolvedValue({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather-server',
      message: 'MCP source health check passed',
    });

    await expect(
      controller.runSourceAction('mcp', 'weather-server', 'health-check'),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather-server',
      message: 'MCP source health check passed',
    });
  });
});

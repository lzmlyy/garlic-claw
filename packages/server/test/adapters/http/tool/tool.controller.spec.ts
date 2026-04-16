import { ToolController } from '../../../../src/adapters/http/tool/tool.controller';

describe('ToolController', () => {
  const toolRegistry = {
    listOverview: jest.fn(),
    runSourceAction: jest.fn(),
    setSourceEnabled: jest.fn(),
    setToolEnabled: jest.fn(),
  };

  let controller: ToolController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new ToolController(
      toolRegistry as never,
    );
  });

  it('lists the unified tool overview', async () => {
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
  });

  it('updates source and tool enabled flags through the registry', async () => {
    toolRegistry.setSourceEnabled.mockResolvedValue({
      kind: 'plugin',
      id: 'builtin.memory-tools',
      enabled: false,
    });
    toolRegistry.setToolEnabled.mockResolvedValue({
      toolId: 'plugin:builtin.memory-tools:save_memory',
      enabled: false,
    });

    await expect(
      controller.updateSourceEnabled('plugin', 'builtin.memory-tools', {
        enabled: false,
      } as never),
    ).resolves.toEqual({
      kind: 'plugin',
      id: 'builtin.memory-tools',
      enabled: false,
    });
    await expect(
      controller.updateToolEnabled('plugin:builtin.memory-tools:save_memory', {
        enabled: false,
      } as never),
    ).resolves.toEqual({
      toolId: 'plugin:builtin.memory-tools:save_memory',
      enabled: false,
    });
  });

  it('dispatches source actions through the unified tool registry', async () => {
    toolRegistry.runSourceAction.mockResolvedValue({
      accepted: true,
      action: 'health-check',
      sourceKind: 'plugin',
      sourceId: 'builtin.memory-tools',
      message: 'Plugin source health check passed',
    });

    await expect(
      controller.runSourceAction('plugin', 'builtin.memory-tools', 'health-check'),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceKind: 'plugin',
      sourceId: 'builtin.memory-tools',
      message: 'Plugin source health check passed',
    });
  });

  it('dispatches MCP source actions through the unified tool registry', async () => {
    toolRegistry.runSourceAction.mockResolvedValue({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather',
      message: 'MCP source health check passed',
    });

    await expect(
      controller.runSourceAction('mcp', 'weather', 'health-check'),
    ).resolves.toEqual({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather',
      message: 'MCP source health check passed',
    });
  });
});

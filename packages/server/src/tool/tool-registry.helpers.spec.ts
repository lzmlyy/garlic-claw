import {
  buildAvailableToolSummary,
  buildToolCallName,
  buildToolDescription,
  buildToolId,
  buildToolSourceKey,
  compareToolKeys,
  normalizeToolRecord,
} from './tool-registry.helpers';

describe('tool-registry.helpers', () => {
  it('builds stable ids and source keys', () => {
    expect(buildToolSourceKey('mcp', 'weather')).toBe('mcp:weather');
    expect(
      buildToolId({
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'weather',
        },
        name: 'get_forecast',
        description: '获取天气预报',
        parameters: {},
      }),
    ).toBe('mcp:weather:get_forecast');
    expect(compareToolKeys('mcp:weather', 'plugin:builtin.echo')).toBeLessThan(0);
  });

  it('builds call names and descriptions for plugin, mcp, and skill tools', () => {
    expect(
      buildToolCallName({
        source: {
          kind: 'plugin',
          id: 'builtin.echo',
          label: 'Echo',
        },
        name: 'echo',
        description: '回显文本',
        parameters: {},
        runtimeKind: 'builtin',
      }),
    ).toBe('echo');
    expect(
      buildToolCallName({
        source: {
          kind: 'plugin',
          id: 'remote.weather',
          label: 'Weather',
        },
        name: 'forecast',
        description: '天气',
        parameters: {},
        runtimeKind: 'remote',
      }),
    ).toBe('remote.weather__forecast');
    expect(
      buildToolCallName({
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'Weather',
        },
        name: 'get_forecast',
        description: '天气',
        parameters: {},
      }),
    ).toBe('mcp__weather__get_forecast');
    expect(
      buildToolCallName({
        source: {
          kind: 'skill',
          id: 'triage',
          label: 'Triage',
        },
        name: 'issue.create',
        description: '建 issue',
        parameters: {},
      }),
    ).toBe('skill__issue__create');

    expect(
      buildToolDescription({
        source: {
          kind: 'plugin',
          id: 'remote.weather',
          label: 'Weather',
        },
        name: 'forecast',
        description: '天气',
        parameters: {},
        runtimeKind: 'remote',
      }),
    ).toBe('[插件：remote.weather] 天气');
    expect(
      buildToolDescription({
        source: {
          kind: 'mcp',
          id: 'weather',
          label: 'Weather',
        },
        name: 'get_forecast',
        description: '天气',
        parameters: {},
      }),
    ).toBe('[MCP：weather] 天气');
    expect(
      buildToolDescription({
        source: {
          kind: 'skill',
          id: 'triage',
          label: 'Triage',
        },
        name: 'issue.create',
        description: '建 issue',
        parameters: {},
      }),
    ).toBe('[Skill] 建 issue');
  });

  it('normalizes provider tools and projects available summaries', () => {
    const normalized = normalizeToolRecord({
      source: {
        kind: 'plugin',
        id: 'builtin.echo',
        label: 'Echo',
        enabled: true,
      },
      name: 'echo',
      description: '回显文本',
      parameters: {
        text: {
          type: 'string',
          required: true,
        },
      },
      runtimeKind: 'builtin',
      pluginId: 'builtin.echo',
    });

    expect(normalized).toEqual({
      toolId: 'plugin:builtin.echo:echo',
      toolName: 'echo',
      callName: 'echo',
      description: '回显文本',
      parameters: {
        text: {
          type: 'string',
          required: true,
        },
      },
      enabled: true,
      source: {
        kind: 'plugin',
        id: 'builtin.echo',
        label: 'Echo',
        enabled: true,
        health: 'unknown',
        lastError: null,
        lastCheckedAt: null,
      },
      runtimeKind: 'builtin',
      pluginId: 'builtin.echo',
    });
    expect(buildAvailableToolSummary(normalized)).toEqual({
      name: 'echo',
      callName: 'echo',
      toolId: 'plugin:builtin.echo:echo',
      description: '回显文本',
      parameters: {
        text: {
          type: 'string',
          required: true,
        },
      },
      sourceKind: 'plugin',
      sourceId: 'builtin.echo',
      runtimeKind: 'builtin',
      pluginId: 'builtin.echo',
    });
  });
});

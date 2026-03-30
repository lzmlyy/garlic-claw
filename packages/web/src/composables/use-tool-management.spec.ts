import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ToolInfo, ToolSourceInfo } from '@garlic-claw/shared'
import { useToolManagement } from './use-tool-management'
import * as api from '../api'

vi.mock('../api', () => ({
  listToolSources: vi.fn(),
  listTools: vi.fn(),
  updateToolSourceEnabled: vi.fn(),
  updateToolEnabled: vi.fn(),
  runToolSourceAction: vi.fn(),
}))

function createFixtures() {
  return {
    sources: [
      {
        kind: 'plugin' as const,
        id: 'builtin.memory-tools',
        label: '记忆工具',
        enabled: true,
        health: 'healthy' as const,
        lastError: null,
        lastCheckedAt: '2026-03-30T16:00:00.000Z',
        totalTools: 1,
        enabledTools: 1,
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin' as const,
        supportedActions: ['health-check', 'reload'],
      },
      {
        kind: 'mcp' as const,
        id: 'weather-server',
        label: 'weather-server',
        enabled: true,
        health: 'error' as const,
        lastError: 'connection lost',
        lastCheckedAt: '2026-03-30T16:01:00.000Z',
        totalTools: 1,
        enabledTools: 1,
        supportedActions: ['health-check'],
      },
    ] satisfies ToolSourceInfo[],
    tools: [
      {
        toolId: 'plugin:builtin.memory-tools:save_memory',
        name: 'save_memory',
        callName: 'save_memory',
        description: '保存记忆',
        parameters: {},
        enabled: true,
        sourceKind: 'plugin' as const,
        sourceId: 'builtin.memory-tools',
        sourceLabel: '记忆工具',
        health: 'healthy' as const,
        lastError: null,
        lastCheckedAt: '2026-03-30T16:00:00.000Z',
        pluginId: 'builtin.memory-tools',
        runtimeKind: 'builtin' as const,
      },
      {
        toolId: 'mcp:weather-server:get_forecast',
        name: 'get_forecast',
        callName: 'mcp__weather-server__get_forecast',
        description: '获取天气预报',
        parameters: {},
        enabled: true,
        sourceKind: 'mcp' as const,
        sourceId: 'weather-server',
        sourceLabel: 'weather-server',
        health: 'error' as const,
        lastError: 'connection lost',
        lastCheckedAt: '2026-03-30T16:01:00.000Z',
      },
    ] satisfies ToolInfo[],
  }
}

describe('useToolManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const fixtures = createFixtures()
    vi.mocked(api.listToolSources).mockResolvedValue(fixtures.sources)
    vi.mocked(api.listTools).mockResolvedValue(fixtures.tools)
    vi.mocked(api.updateToolSourceEnabled).mockImplementation(async (kind, sourceId, enabled) => ({
      ...fixtures.sources.find((source) => source.kind === kind && source.id === sourceId)!,
      enabled,
    }))
    vi.mocked(api.updateToolEnabled).mockImplementation(async (toolId, enabled) => ({
      ...fixtures.tools.find((tool) => tool.toolId === toolId)!,
      enabled,
    }))
    vi.mocked(api.runToolSourceAction).mockResolvedValue({
      accepted: true,
      action: 'health-check',
      sourceKind: 'mcp',
      sourceId: 'weather-server',
      message: 'MCP source health check passed',
    })
  })

  it('loads sources and filters visible tools by the selected source', async () => {
    let state!: ReturnType<typeof useToolManagement>
    const Harness = defineComponent({
      setup() {
        state = useToolManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    expect(state.selectedSource.value?.id).toBe('builtin.memory-tools')
    expect(state.filteredSourceCount.value).toBe(2)
    expect(state.filteredToolCount.value).toBe(1)
    expect(state.pagedTools.value.map((tool) => tool.toolId)).toEqual([
      'plugin:builtin.memory-tools:save_memory',
    ])

    state.selectSource('mcp', 'weather-server')
    await flushPromises()

    expect(state.selectedSource.value?.id).toBe('weather-server')
    expect(state.pagedTools.value.map((tool) => tool.toolId)).toEqual([
      'mcp:weather-server:get_forecast',
    ])
  })

  it('updates source/tool enabled state and runs source actions through the API layer', async () => {
    let state!: ReturnType<typeof useToolManagement>
    const Harness = defineComponent({
      setup() {
        state = useToolManagement()
        return () => null
      },
    })

    mount(Harness)
    await flushPromises()

    const source = state.sources.value[0]
    const tool = state.tools.value[0]

    await state.setSourceEnabled(source, false)
    await state.setToolEnabled(tool, false)
    await state.runSourceAction(state.sources.value[1], 'health-check')

    expect(api.updateToolSourceEnabled).toHaveBeenCalledWith('plugin', 'builtin.memory-tools', false)
    expect(api.updateToolEnabled).toHaveBeenCalledWith(
      'plugin:builtin.memory-tools:save_memory',
      false,
    )
    expect(api.runToolSourceAction).toHaveBeenCalledWith(
      'mcp',
      'weather-server',
      'health-check',
    )
    expect(state.notice.value).toBe('MCP source health check passed')
  })
})

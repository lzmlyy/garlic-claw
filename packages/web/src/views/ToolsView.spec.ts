import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ToolsView from './ToolsView.vue'

vi.mock('../composables/use-tool-management', () => ({
  useToolManagement: () => ({
    loading: ref(false),
    mutatingSourceKey: ref(null),
    mutatingToolId: ref(null),
    runningActionKey: ref(null),
    error: ref(null),
    notice: ref(null),
    sources: shallowRef([
      {
        kind: 'mcp',
        id: 'weather-server',
        label: 'weather-server',
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-03-30T16:00:00.000Z',
        totalTools: 1,
        enabledTools: 1,
        supportedActions: ['health-check'],
      },
    ]),
    tools: shallowRef([
      {
        toolId: 'mcp:weather-server:get_forecast',
        name: 'get_forecast',
        callName: 'mcp__weather-server__get_forecast',
        description: '获取天气预报',
        parameters: {},
        enabled: true,
        sourceKind: 'mcp',
        sourceId: 'weather-server',
        sourceLabel: 'weather-server',
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-03-30T16:00:00.000Z',
      },
    ]),
    selectedSourceKey: ref('mcp:weather-server'),
    selectedSource: computed(() => ({
      kind: 'mcp',
      id: 'weather-server',
      label: 'weather-server',
      enabled: true,
      health: 'healthy',
      lastError: null,
      lastCheckedAt: '2026-03-30T16:00:00.000Z',
      totalTools: 1,
      enabledTools: 1,
      supportedActions: ['health-check'],
    })),
    sourceSearchKeyword: ref(''),
    toolSearchKeyword: ref(''),
    toolFilter: ref('all'),
    pagedSources: computed(() => [
      {
        kind: 'mcp',
        id: 'weather-server',
        label: 'weather-server',
        enabled: true,
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-03-30T16:00:00.000Z',
        totalTools: 1,
        enabledTools: 1,
        supportedActions: ['health-check'],
      },
    ]),
    sourcePage: ref(1),
    sourcePageCount: ref(1),
    sourceRangeStart: ref(1),
    sourceRangeEnd: ref(1),
    canGoPrevSourcePage: ref(false),
    canGoNextSourcePage: ref(false),
    goPrevSourcePage: vi.fn(),
    goNextSourcePage: vi.fn(),
    pagedTools: computed(() => [
      {
        toolId: 'mcp:weather-server:get_forecast',
        name: 'get_forecast',
        callName: 'mcp__weather-server__get_forecast',
        description: '获取天气预报',
        parameters: {},
        enabled: true,
        sourceKind: 'mcp',
        sourceId: 'weather-server',
        sourceLabel: 'weather-server',
        health: 'healthy',
        lastError: null,
        lastCheckedAt: '2026-03-30T16:00:00.000Z',
      },
    ]),
    toolPage: ref(1),
    toolPageCount: ref(1),
    toolRangeStart: ref(1),
    toolRangeEnd: ref(1),
    canGoPrevToolPage: ref(false),
    canGoNextToolPage: ref(false),
    goPrevToolPage: vi.fn(),
    goNextToolPage: vi.fn(),
    sourceCount: computed(() => 1),
    filteredSourceCount: computed(() => 1),
    enabledSourceCount: computed(() => 1),
    toolCount: computed(() => 1),
    filteredToolCount: computed(() => 1),
    enabledToolCount: computed(() => 1),
    attentionSourceCount: computed(() => 0),
    refreshAll: vi.fn(),
    selectSource: vi.fn(),
    setSourceEnabled: vi.fn(),
    setToolEnabled: vi.fn(),
    runSourceAction: vi.fn(),
  }),
}))

vi.mock('../components/tool-management/McpConfigPanel.vue', () => ({
  default: {
    name: 'McpConfigPanel',
    template: '<section data-test="mcp-config-panel">MCP Config Panel</section>',
  },
}))

describe('ToolsView', () => {
  it('renders the unified tool governance summary and selected tool list', () => {
    const wrapper = mount(ToolsView)

    expect(wrapper.text()).toContain('工具治理')
    expect(wrapper.text()).toContain('Unified Tool Governance')
    expect(wrapper.text()).toContain('weather-server')
    expect(wrapper.text()).toContain('mcp__weather-server__get_forecast')
    expect(wrapper.text()).toContain('获取天气预报')
    expect(wrapper.text()).toContain('工具总数')
    expect(wrapper.text()).toContain('MCP Config Panel')
  })
})

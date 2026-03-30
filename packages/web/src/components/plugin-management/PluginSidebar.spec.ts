import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import type { PluginInfo } from '@garlic-claw/shared'
import PluginSidebar from './PluginSidebar.vue'

describe('PluginSidebar', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('shows runtime pressure in the sidebar when a plugin is currently busy', () => {
    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: 'builtin.demo',
        error: null,
        plugins: [
          {
            id: 'plugin-1',
            name: 'builtin.demo',
            displayName: 'Demo Plugin',
            description: 'demo',
            deviceType: 'builtin',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'builtin',
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: '2026-03-28T00:00:00.000Z',
              lastCheckedAt: '2026-03-28T00:00:00.000Z',
              runtimePressure: {
                activeExecutions: 2,
                maxConcurrentExecutions: 6,
              },
            },
            lastSeenAt: '2026-03-28T00:00:00.000Z',
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('并发 2 / 6')
  })

  it('surfaces busy plugins before idle ones in the sidebar list', () => {
    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: null,
        error: null,
        plugins: [
          {
            id: 'plugin-1',
            name: 'builtin.alpha',
            displayName: 'Alpha Plugin',
            description: 'alpha',
            deviceType: 'builtin',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'builtin',
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: null,
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'plugin-2',
            name: 'builtin.busy',
            displayName: 'Busy Plugin',
            description: 'busy',
            deviceType: 'builtin',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'builtin',
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: null,
              runtimePressure: {
                activeExecutions: 6,
                maxConcurrentExecutions: 6,
              },
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
      },
    })

    const titles = wrapper.findAll('.plugin-item strong').map((node) => node.text())
    expect(titles[0]).toBe('Busy Plugin')
    expect(titles[1]).toBe('Alpha Plugin')
  })

  it('shows a short issue summary for busy and unhealthy plugins', () => {
    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: null,
        error: null,
        plugins: [
          {
            id: 'plugin-1',
            name: 'builtin.busy',
            displayName: 'Busy Plugin',
            description: 'busy',
            deviceType: 'builtin',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'builtin',
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: null,
              runtimePressure: {
                activeExecutions: 6,
                maxConcurrentExecutions: 6,
              },
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'plugin-2',
            name: 'remote.error',
            displayName: 'Error Plugin',
            description: 'error',
            deviceType: 'api',
            status: 'error',
            capabilities: [],
            connected: false,
            runtimeKind: 'remote',
            health: {
              status: 'error',
              failureCount: 3,
              consecutiveFailures: 2,
              lastError: 'route timeout while invoking remote endpoint',
              lastErrorAt: '2026-03-28T00:00:00.000Z',
              lastSuccessAt: null,
              lastCheckedAt: '2026-03-28T00:00:00.000Z',
            },
            lastSeenAt: '2026-03-28T00:00:00.000Z',
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('当前并发已打满')
    expect(wrapper.text()).toContain('最近错误：route timeout while invoking remote endpoint')
  })

  it('filters plugins by quick attention filter and keyword search', async () => {
    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: null,
        error: null,
        plugins: [
          {
            id: 'plugin-1',
            name: 'builtin.alpha',
            displayName: 'Alpha Plugin',
            description: 'healthy builtin plugin',
            deviceType: 'builtin',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'builtin',
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: null,
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'plugin-2',
            name: 'remote.error',
            displayName: 'Error Plugin',
            description: 'remote plugin',
            deviceType: 'api',
            status: 'error',
            capabilities: [],
            connected: false,
            runtimeKind: 'remote',
            health: {
              status: 'error',
              failureCount: 2,
              consecutiveFailures: 1,
              lastError: 'route timeout while invoking remote endpoint',
              lastErrorAt: '2026-03-28T00:00:00.000Z',
              lastSuccessAt: null,
              lastCheckedAt: '2026-03-28T00:00:00.000Z',
            },
            lastSeenAt: '2026-03-28T00:00:00.000Z',
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
      },
    })

    await wrapper.get('[data-test="plugin-sidebar-filter-attention"]').trigger('click')
    let titles = wrapper.findAll('.plugin-item strong').map((node) => node.text())
    expect(titles).toEqual(['Error Plugin'])

    await wrapper.get('[data-test="plugin-sidebar-search"]').setValue('alpha')
    titles = wrapper.findAll('.plugin-item strong').map((node) => node.text())
    expect(titles).toEqual([])
    expect(wrapper.text()).toContain('当前筛选下没有匹配插件。')

    await wrapper.get('[data-test="plugin-sidebar-filter-all"]').trigger('click')
    titles = wrapper.findAll('.plugin-item strong').map((node) => node.text())
    expect(titles).toEqual(['Alpha Plugin'])
  })

  it('shows result count and warns when the selected plugin is hidden by filters', async () => {
    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: 'builtin.alpha',
        error: null,
        plugins: [
          {
            id: 'plugin-1',
            name: 'builtin.alpha',
            displayName: 'Alpha Plugin',
            description: 'healthy builtin plugin',
            deviceType: 'builtin',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'builtin',
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: null,
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'plugin-2',
            name: 'remote.error',
            displayName: 'Error Plugin',
            description: 'remote plugin',
            deviceType: 'api',
            status: 'error',
            capabilities: [],
            connected: false,
            runtimeKind: 'remote',
            health: {
              status: 'error',
              failureCount: 2,
              consecutiveFailures: 1,
              lastError: 'route timeout while invoking remote endpoint',
              lastErrorAt: '2026-03-28T00:00:00.000Z',
              lastSuccessAt: null,
              lastCheckedAt: '2026-03-28T00:00:00.000Z',
            },
            lastSeenAt: '2026-03-28T00:00:00.000Z',
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('匹配 2 / 2')

    await wrapper.get('[data-test="plugin-sidebar-filter-attention"]').trigger('click')
    expect(wrapper.text()).toContain('匹配 1 / 2')
    expect(wrapper.text()).toContain('当前详情插件未命中筛选条件。')

    await wrapper.get('[data-test="plugin-sidebar-clear-filters"]').trigger('click')
    expect(wrapper.text()).toContain('匹配 2 / 2')
    expect(wrapper.text()).not.toContain('当前详情插件未命中筛选条件。')
  })

  it('paginates plugin index results and resets to the first page after searching', async () => {
    const plugins: PluginInfo[] = Array.from({ length: 11 }, (_, index): PluginInfo => ({
      id: `plugin-${index + 1}`,
      name: `builtin.plugin-${index + 1}`,
      displayName: `Plugin ${String(index + 1).padStart(2, '0')}`,
      description: `plugin ${index + 1}`,
      deviceType: 'builtin',
      status: 'online',
      capabilities: [],
      connected: true,
      runtimeKind: 'builtin',
      health: {
        status: 'healthy',
        failureCount: 0,
        consecutiveFailures: 0,
        lastError: null,
        lastErrorAt: null,
        lastSuccessAt: null,
        lastCheckedAt: null,
      },
      lastSeenAt: null,
      createdAt: '2026-03-28T00:00:00.000Z',
      updatedAt: '2026-03-28T00:00:00.000Z',
    }))

    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: null,
        error: null,
        plugins,
      },
    })

    expect(wrapper.findAll('.plugin-item')).toHaveLength(4)
    expect(wrapper.text()).toContain('匹配 11 / 11')
    expect(wrapper.text()).toContain('第 1 / 3 页')

    await wrapper.get('[data-test="plugin-sidebar-next-page"]').trigger('click')

    expect(wrapper.text()).toContain('第 2 / 3 页')
    expect(wrapper.find('.plugin-item strong').text()).toBe('Plugin 05')

    await wrapper.get('[data-test="plugin-sidebar-search"]').setValue('plugin-11')

    expect(wrapper.text()).toContain('匹配 1 / 11')
    expect(wrapper.text()).toContain('第 1 / 1 页')
    expect(wrapper.findAll('.plugin-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('Plugin 11')
  })

  it('hides system builtin plugins by default and reveals them on demand', async () => {
    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: null,
        error: null,
        plugins: [
          {
            id: 'plugin-1',
            name: 'builtin.tool-audit',
            displayName: 'Tool Audit',
            description: 'system builtin',
            deviceType: 'builtin',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'builtin',
            manifest: {
              id: 'builtin.tool-audit',
              name: 'Tool Audit',
              version: '1.0.0',
              runtime: 'builtin',
              permissions: ['storage:write'],
              tools: [],
            },
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: null,
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'plugin-2',
            name: 'builtin.provider-router',
            displayName: 'Provider Router',
            description: 'user-facing builtin',
            deviceType: 'builtin',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'builtin',
            manifest: {
              id: 'builtin.provider-router',
              name: 'Provider Router',
              version: '1.0.0',
              runtime: 'builtin',
              permissions: ['config:read', 'provider:read'],
              tools: [],
              config: {
                fields: [
                  {
                    key: 'targetProviderId',
                    type: 'string',
                  },
                ],
              },
            },
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: null,
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'plugin-3',
            name: 'remote.pc-host',
            displayName: 'PC Host',
            description: 'remote plugin',
            deviceType: 'api',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'remote',
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: null,
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('已隐藏 1 个系统内建插件')
    let titles = wrapper.findAll('.plugin-item strong').map((node) => node.text())
    expect(titles).toEqual(['PC Host', 'Provider Router'])
    expect(wrapper.text()).not.toContain('Tool Audit')

    await wrapper.get('[data-test="plugin-sidebar-toggle-system"]').trigger('click')

    titles = wrapper.findAll('.plugin-item strong').map((node) => node.text())
    expect(titles).toContain('Tool Audit')
    expect(wrapper.text()).toContain('已显示系统内建插件')
  })

  it('restores and persists the show-system-builtins preference', async () => {
    localStorage.setItem('garlic-claw:plugin-sidebar:show-system-builtins', 'true')

    const wrapper = mount(PluginSidebar, {
      props: {
        loading: false,
        selectedPluginName: null,
        error: null,
        plugins: [
          {
            id: 'plugin-1',
            name: 'builtin.tool-audit',
            displayName: 'Tool Audit',
            description: 'system builtin',
            deviceType: 'builtin',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'builtin',
            manifest: {
              id: 'builtin.tool-audit',
              name: 'Tool Audit',
              version: '1.0.0',
              runtime: 'builtin',
              permissions: ['storage:write'],
              tools: [],
            },
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: null,
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'plugin-2',
            name: 'remote.pc-host',
            displayName: 'PC Host',
            description: 'remote plugin',
            deviceType: 'api',
            status: 'online',
            capabilities: [],
            connected: true,
            runtimeKind: 'remote',
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: null,
            },
            lastSeenAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
      },
    })

    expect(wrapper.text()).toContain('已显示系统内建插件')
    expect(wrapper.text()).toContain('Tool Audit')

    await wrapper.get('[data-test="plugin-sidebar-toggle-system"]').trigger('click')

    expect(localStorage.getItem('garlic-claw:plugin-sidebar:show-system-builtins')).toBe('false')
  })
})

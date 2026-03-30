import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PluginActionName, PluginInfo } from '@garlic-claw/shared'
import PluginAttentionPanel from './PluginAttentionPanel.vue'

function createPlugin(input: Partial<PluginInfo> & Pick<PluginInfo, 'id' | 'name'>): PluginInfo {
  return {
    displayName: input.displayName ?? input.name,
    description: input.description,
    deviceType: input.deviceType ?? 'builtin',
    status: input.status ?? 'online',
    capabilities: input.capabilities ?? [],
    connected: input.connected ?? true,
    runtimeKind: input.runtimeKind ?? 'builtin',
    permissions: input.permissions ?? [],
    supportedActions: input.supportedActions ?? ['health-check'],
    crons: input.crons ?? [],
    hooks: input.hooks ?? [],
    routes: input.routes ?? [],
    manifest: input.manifest,
    health: input.health ?? {
      status: 'healthy',
      failureCount: 0,
      consecutiveFailures: 0,
      lastError: null,
      lastErrorAt: null,
      lastSuccessAt: null,
      lastCheckedAt: null,
    },
    lastSeenAt: input.lastSeenAt ?? null,
    createdAt: input.createdAt ?? '2026-03-30T00:00:00.000Z',
    updatedAt: input.updatedAt ?? '2026-03-30T00:00:00.000Z',
    ...input,
  }
}

describe('PluginAttentionPanel', () => {
  it('surfaces attention plugins with recommended recovery actions', () => {
    const wrapper = mount(PluginAttentionPanel, {
      props: {
        plugins: [
          createPlugin({
            id: 'plugin-1',
            name: 'remote.connector',
            displayName: 'Remote Connector',
            runtimeKind: 'remote',
            connected: false,
            supportedActions: ['reconnect', 'health-check'],
            health: {
              status: 'error',
              failureCount: 2,
              consecutiveFailures: 1,
              lastError: 'socket disconnected',
              lastErrorAt: '2026-03-30T00:00:00.000Z',
              lastSuccessAt: null,
              lastCheckedAt: '2026-03-30T00:00:00.000Z',
            },
          }),
          createPlugin({
            id: 'plugin-2',
            name: 'builtin.busy',
            displayName: 'Busy Plugin',
            supportedActions: ['health-check'],
            health: {
              status: 'healthy',
              failureCount: 0,
              consecutiveFailures: 0,
              lastError: null,
              lastErrorAt: null,
              lastSuccessAt: null,
              lastCheckedAt: '2026-03-30T00:00:00.000Z',
              runtimePressure: {
                activeExecutions: 4,
                maxConcurrentExecutions: 4,
              },
            },
          }),
        ],
        runningAction: null,
      },
    })

    expect(wrapper.text()).toContain('重点告警插件')
    expect(wrapper.text()).toContain('Remote Connector')
    expect(wrapper.text()).toContain('Busy Plugin')
    expect(wrapper.text()).toContain('请求重连')
    expect(wrapper.text()).toContain('健康检查')
    expect(wrapper.text()).toContain('socket disconnected')
    expect(wrapper.text()).toContain('当前并发已打满')
  })

  it('emits selection and recovery events for attention plugins', async () => {
    const wrapper = mount(PluginAttentionPanel, {
      props: {
        plugins: [
          createPlugin({
            id: 'plugin-1',
            name: 'builtin.broken',
            displayName: 'Broken Plugin',
            supportedActions: ['reload', 'health-check'],
            health: {
              status: 'error',
              failureCount: 1,
              consecutiveFailures: 1,
              lastError: 'config missing',
              lastErrorAt: '2026-03-30T00:00:00.000Z',
              lastSuccessAt: null,
              lastCheckedAt: '2026-03-30T00:00:00.000Z',
            },
          }),
        ],
        runningAction: null,
      },
    })

    await wrapper.get('[data-test="plugin-attention-open-builtin.broken"]').trigger('click')
    await wrapper.get('[data-test="plugin-attention-action-builtin.broken"]').trigger('click')

    expect(wrapper.emitted('select-plugin')).toEqual([['builtin.broken']])
    expect(wrapper.emitted('run-action')).toEqual([
      [{
        pluginName: 'builtin.broken',
        action: 'reload' satisfies PluginActionName,
      }],
    ])
  })
})

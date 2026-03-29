import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PluginCronJobSummary } from '@garlic-claw/shared'
import PluginCronList from './PluginCronList.vue'

describe('PluginCronList', () => {
  it('only exposes delete action for host cron jobs and emits the selected job id', async () => {
    const jobs: PluginCronJobSummary[] = [
      {
        id: 'cron-host-1',
        pluginId: 'builtin.cron-heartbeat',
        name: 'cleanup',
        cron: '15m',
        source: 'host',
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
      {
        id: 'cron-manifest-1',
        pluginId: 'builtin.cron-heartbeat',
        name: 'heartbeat',
        cron: '10s',
        source: 'manifest',
        enabled: true,
        lastRunAt: null,
        lastError: null,
        lastErrorAt: null,
        createdAt: '2026-03-28T00:00:00.000Z',
        updatedAt: '2026-03-28T00:00:00.000Z',
      },
    ]

    const wrapper = mount(PluginCronList, {
      props: {
        jobs,
        deletingJobId: null,
      },
    })

    const deleteButtons = wrapper.findAll('[data-test="cron-delete-button"]')

    expect(deleteButtons).toHaveLength(1)

    await deleteButtons[0].trigger('click')

    expect(wrapper.emitted('delete')).toEqual([
      ['cron-host-1'],
    ])
  })

  it('renders more accurate cron status text and last error time', () => {
    const wrapper = mount(PluginCronList, {
      props: {
        jobs: [
          {
            id: 'cron-host-2',
            pluginId: 'builtin.cron-heartbeat',
            name: 'failing cleanup',
            cron: '30m',
            source: 'host',
            enabled: true,
            lastRunAt: null,
            lastError: 'remote timeout',
            lastErrorAt: '2026-03-28T08:00:00.000Z',
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'cron-manifest-2',
            pluginId: 'builtin.cron-heartbeat',
            name: 'never-run heartbeat',
            cron: '10s',
            source: 'manifest',
            enabled: true,
            lastRunAt: null,
            lastError: null,
            lastErrorAt: null,
            createdAt: '2026-03-28T00:00:00.000Z',
            updatedAt: '2026-03-28T00:00:00.000Z',
          },
        ],
        deletingJobId: null,
      },
    })

    expect(wrapper.text()).toContain('状态：失败')
    expect(wrapper.text()).toContain('最后错误时间')
    expect(wrapper.text()).toContain('状态：未运行')
  })
})

import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PluginEventLog from './PluginEventLog.vue'

describe('PluginEventLog', () => {
  it('emits refresh with the selected server-side filters', async () => {
    const wrapper = mount(PluginEventLog, {
      props: {
        events: [],
        loading: false,
        query: {
          limit: 50,
        },
        nextCursor: null,
      },
    })

    await wrapper.get('[data-test="event-limit"]').setValue('100')
    expect(wrapper.emitted('refresh')).toEqual([[
      {
        limit: 100,
      },
    ]])

    await wrapper.get('[data-test="event-type-filter"]').setValue('tool:error')
    await wrapper.get('[data-test="event-search-filter"]').setValue('memory.search')

    await wrapper.get('[data-test="event-refresh"]').trigger('click')
    expect(wrapper.emitted('refresh')).toEqual([
      [
        {
          limit: 100,
        },
      ],
      [
        {
          limit: 100,
          type: 'tool:error',
          keyword: 'memory.search',
        },
      ],
    ])
  })

  it('emits load-more with the current query and cursor', async () => {
    const wrapper = mount(PluginEventLog, {
      props: {
        events: [
          {
            id: 'event-1',
            type: 'plugin:config',
            level: 'warn',
            message: '缺少 limit 配置，已回退默认值',
            metadata: {
              field: 'limit',
            },
            createdAt: '2026-03-28T00:00:00.000Z',
          },
          {
            id: 'event-2',
            type: 'tool:timeout',
            level: 'error',
            message: 'memory.search timeout',
            metadata: {
              toolName: 'memory.search',
            },
            createdAt: '2026-03-28T00:01:00.000Z',
          },
        ],
        loading: false,
        query: {
          limit: 50,
        },
        nextCursor: 'event-2',
      },
    })

    await wrapper.get('[data-test="event-level-filter"]').setValue('error')
    await wrapper.get('[data-test="event-search-filter"]').setValue('memory.search')
    await wrapper.get('[data-test="event-load-more"]').trigger('click')

    expect(wrapper.emitted('loadMore')).toEqual([[
      {
        limit: 50,
        level: 'error',
        keyword: 'memory.search',
        cursor: 'event-2',
      },
    ]])
  })

  it('shows an empty-result message when the current server-side query returns no events', () => {
    const wrapper = mount(PluginEventLog, {
      props: {
        events: [],
        loading: false,
        query: {
          limit: 50,
          type: 'tool:overloaded',
        },
        nextCursor: null,
      },
    })

    expect(wrapper.text()).toContain('当前筛选下没有事件日志。')
  })
})

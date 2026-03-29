import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { PluginStorageEntry } from '@garlic-claw/shared'
import PluginStoragePanel from './PluginStoragePanel.vue'

describe('PluginStoragePanel', () => {
  it('renders plugin storage entries and emits parsed save/delete actions', async () => {
    const entries: PluginStorageEntry[] = [
      {
        key: 'cursor.offset',
        value: 3,
      },
      {
        key: 'state.snapshot',
        value: {
          active: true,
        },
      },
    ]

    const wrapper = mount(PluginStoragePanel, {
      props: {
        entries,
        loading: false,
        saving: false,
        deletingKey: null,
        prefix: '',
      },
    })

    expect(wrapper.text()).toContain('cursor.offset')
    expect(wrapper.text()).toContain('state.snapshot')

    await wrapper.get('[data-test="storage-key-input"]').setValue('state.next')
    await wrapper.get('[data-test="storage-value-input"]').setValue('{"enabled":true}')
    await wrapper.get('[data-test="storage-save-button"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          key: 'state.next',
          value: {
            enabled: true,
          },
        },
      ],
    ])

    await wrapper.get('[data-test="storage-delete-button"]').trigger('click')

    expect(wrapper.emitted('delete')).toEqual([
      ['cursor.offset'],
    ])
  })

  it('shows an empty-result message when the current prefix filter returns no entries', () => {
    const wrapper = mount(PluginStoragePanel, {
      props: {
        entries: [],
        loading: false,
        saving: false,
        deletingKey: null,
        prefix: 'cursor.',
      },
    })

    expect(wrapper.text()).toContain('当前前缀筛选下没有持久化 KV 条目。')
  })
})

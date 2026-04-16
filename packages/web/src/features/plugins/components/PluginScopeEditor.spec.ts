import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PluginScopeEditor from './PluginScopeEditor.vue'

describe('PluginScopeEditor', () => {
  it('blocks save when a conversation override row is left blank', async () => {
    const wrapper = mount(PluginScopeEditor, {
      props: {
        saving: false,
        scope: {
          defaultEnabled: true,
          conversations: {},
        },
      },
    })

    await wrapper.get('[data-test="scope-add-row-button"]').trigger('click')
    await wrapper.get('[data-test="scope-save-button"]').trigger('click')

    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.text()).toContain('conversation id 不能为空')
  })

  it('blocks save when conversation override ids are duplicated', async () => {
    const wrapper = mount(PluginScopeEditor, {
      props: {
        saving: false,
        scope: {
          defaultEnabled: true,
          conversations: {
            'conversation-1': true,
          },
        },
      },
    })

    await wrapper.get('[data-test="scope-add-row-button"]').trigger('click')
    const inputs = wrapper.findAll('input[placeholder="conversation id"]')
    await inputs[1].setValue('conversation-1')
    await wrapper.get('[data-test="scope-save-button"]').trigger('click')

    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.text()).toContain('conversation id 不能重复')
  })

  it('emits normalized scope overrides when all rows are valid', async () => {
    const wrapper = mount(PluginScopeEditor, {
      props: {
        saving: false,
        scope: {
          defaultEnabled: false,
          conversations: {
            'conversation-1': true,
          },
        },
      },
    })

    await wrapper.get('[data-test="scope-save-button"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          'conversation-1': true,
        },
      ],
    ])
  })

  it('does not expose direct default enable/disable controls', () => {
    const wrapper = mount(PluginScopeEditor, {
      props: {
        saving: false,
        plugin: {
          id: 'plugin-1',
          name: 'builtin.memory-context',
          deviceType: 'builtin',
          status: 'online',
          connected: true,
          defaultEnabled: true,
          manifest: {
            id: 'builtin.memory-context',
            name: 'builtin.memory-context',
            version: '1.0.0',
            runtime: 'builtin',
            permissions: [],
            tools: [],
          },
          governance: {
            canDisable: true,
            builtinRole: 'user-facing',
          },
          lastSeenAt: null,
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
        },
        scope: {
          defaultEnabled: true,
          conversations: {
            'conversation-1': true,
          },
        },
      },
    })

    expect(wrapper.find('[data-test="scope-enable-button"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="scope-disable-button"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('统一工具治理页')
  })

  it('hides disable conversation options for protected builtin plugins', async () => {
    const wrapper = mount(PluginScopeEditor, {
      props: {
        saving: false,
        plugin: {
          id: 'plugin-1',
          name: 'builtin.core-tools',
          deviceType: 'builtin',
          status: 'online',
          connected: true,
          defaultEnabled: true,
          manifest: {
            id: 'builtin.core-tools',
            name: 'builtin.core-tools',
            version: '1.0.0',
            runtime: 'builtin',
            permissions: [],
            tools: [],
          },
          governance: {
            canDisable: false,
            disableReason: '基础内建工具属于宿主必需插件，不能禁用。',
            builtinRole: 'system-required',
          },
          lastSeenAt: null,
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:00.000Z',
        },
        scope: {
          defaultEnabled: true,
          conversations: {},
        },
      },
    })

    await wrapper.get('[data-test="scope-add-row-button"]').trigger('click')

    expect(wrapper.findAll('option').map((option) => option.text())).toEqual(['启用'])
    expect(wrapper.text()).toContain('基础内建工具属于宿主必需插件，不能禁用。')
  })
})

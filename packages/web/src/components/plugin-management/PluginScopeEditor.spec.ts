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
          defaultEnabled: false,
          conversations: {
            'conversation-1': true,
          },
        },
      ],
    ])
  })
})

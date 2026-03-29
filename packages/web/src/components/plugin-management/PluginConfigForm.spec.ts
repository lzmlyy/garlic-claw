import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PluginConfigForm from './PluginConfigForm.vue'

describe('PluginConfigForm', () => {
  it('blocks save when a required schema field is left empty', async () => {
    const wrapper = mount(PluginConfigForm, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            fields: [
              {
                key: 'apiKey',
                type: 'string',
                required: true,
              },
            ],
          },
          values: {},
        },
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.text()).toContain('apiKey 为必填项')
  })

  it('emits normalized values when required fields are present', async () => {
    const wrapper = mount(PluginConfigForm, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            fields: [
              {
                key: 'apiKey',
                type: 'string',
                required: true,
              },
              {
                key: 'maxRetries',
                type: 'number',
              },
            ],
          },
          values: {
            apiKey: 'demo-key',
            maxRetries: 3,
          },
        },
      },
    })

    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          apiKey: 'demo-key',
          maxRetries: 3,
        },
      ],
    ])
  })

  it('shows a clearer message when object fields contain invalid JSON', async () => {
    const wrapper = mount(PluginConfigForm, {
      props: {
        saving: false,
        snapshot: {
          schema: {
            fields: [
              {
                key: 'settings',
                type: 'object',
              },
            ],
          },
          values: {
            settings: {
              enabled: true,
            },
          },
        },
      },
    })

    await wrapper.get('textarea').setValue('{invalid json}')
    await wrapper.get('button').trigger('click')

    expect(wrapper.emitted('save')).toBeUndefined()
    expect(wrapper.text()).toContain('settings 必须是有效 JSON 对象')
  })
})

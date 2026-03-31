import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HostModelRoutingPanel from './HostModelRoutingPanel.vue'

describe('HostModelRoutingPanel', () => {
  it('edits fallback chat models and utility roles before emitting a save payload', async () => {
    const wrapper = mount(HostModelRoutingPanel, {
      props: {
        saving: false,
        config: {
          fallbackChatModels: [],
          utilityModelRoles: {},
        },
        options: [
          {
            providerId: 'openai',
            modelId: 'gpt-4.1-mini',
            label: 'OpenAI / GPT-4.1 Mini',
          },
          {
            providerId: 'anthropic',
            modelId: 'claude-3-7-sonnet',
            label: 'Anthropic / Claude 3.7 Sonnet',
          },
        ],
      },
    })

    await wrapper.get('[data-test="fallback-model-select"]').setValue(
      'anthropic::claude-3-7-sonnet',
    )
    await wrapper.get('[data-test="fallback-model-add"]').trigger('click')
    await wrapper.get('[data-test="compression-model-select"]').setValue(
      'openai::gpt-4.1-mini',
    )
    await wrapper.get('[data-test="utility-role-conversationTitle"]').setValue(
      'openai::gpt-4.1-mini',
    )
    await wrapper.get('[data-test="host-routing-save"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [
        {
          fallbackChatModels: [
            {
              providerId: 'anthropic',
              modelId: 'claude-3-7-sonnet',
            },
          ],
          compressionModel: {
            providerId: 'openai',
            modelId: 'gpt-4.1-mini',
          },
          utilityModelRoles: {
            conversationTitle: {
              providerId: 'openai',
              modelId: 'gpt-4.1-mini',
            },
          },
        },
      ],
    ])
  })
})

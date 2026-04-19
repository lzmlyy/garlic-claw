import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HostModelRoutingPanel from '@/features/ai-settings/components/HostModelRoutingPanel.vue'

describe('HostModelRoutingPanel', () => {
  it('只编辑聊天回退链并发出保存事件', async () => {
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
          utilityModelRoles: {},
        },
      ],
    ])
  })
})

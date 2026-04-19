import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import PluginLlmPreferencePanel from '@/features/plugins/components/PluginLlmPreferencePanel.vue'

describe('PluginLlmPreferencePanel', () => {
  it('emits override preference when provider and model are selected', async () => {
    const wrapper = mount(PluginLlmPreferencePanel, {
      props: {
        preference: {
          mode: 'inherit',
          modelId: null,
          providerId: null,
        },
        providers: [
          {
            id: 'ds2api',
            name: 'DeepSeek',
            mode: 'protocol',
            driver: 'openai',
            available: true,
            modelCount: 1,
          },
        ],
        options: [
          {
            providerId: 'ds2api',
            modelId: 'deepseek-reasoner',
            label: 'DeepSeek · deepseek-reasoner',
          },
        ],
        saving: false,
      },
    })

    await wrapper.get('select').setValue('override')
    await wrapper.get('[data-test="plugin-llm-provider"]').setValue('ds2api')
    await wrapper.get('[data-test="plugin-llm-model"]').setValue('deepseek-reasoner')
    await wrapper.get('[data-test="plugin-llm-save"]').trigger('click')

    expect(wrapper.emitted('save')).toEqual([
      [{
        mode: 'override',
        modelId: 'deepseek-reasoner',
        providerId: 'ds2api',
      }],
    ])
  })
})

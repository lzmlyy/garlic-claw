import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import VisionFallbackPanel from './VisionFallbackPanel.vue'

function createOptions(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    providerId: 'vision-provider',
    providerName: 'Vision Provider',
    modelId: `vision-model-${index + 1}`,
    label: `Vision Provider / Vision Model ${index + 1}`,
  }))
}

describe('VisionFallbackPanel', () => {
  it('filters and paginates model options inside AI settings', async () => {
    const wrapper = mount(VisionFallbackPanel, {
      props: {
        saving: false,
        config: {
          enabled: true,
          providerId: 'vision-provider',
          modelId: '',
        },
        options: createOptions(11),
      },
    })

    expect(wrapper.findAll('.model-option')).toHaveLength(6)
    expect(wrapper.text()).toContain('匹配 11 / 11')
    expect(wrapper.text()).toContain('第 1 / 2 页')

    await wrapper.get('[data-test="vision-model-next-page"]').trigger('click')

    expect(wrapper.text()).toContain('第 2 / 2 页')
    expect(wrapper.find('.model-option strong').text()).toBe('Vision Model 7')

    await wrapper.get('[data-test="vision-model-search"]').setValue('vision-model-11')

    expect(wrapper.text()).toContain('匹配 1 / 11')
    expect(wrapper.text()).toContain('第 1 / 1 页')
    expect(wrapper.findAll('.model-option')).toHaveLength(1)
    expect(wrapper.text()).toContain('Vision Model 11')
  })
})

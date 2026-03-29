import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AiModelDiscoveryDialog from './AiModelDiscoveryDialog.vue'

function createModels(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `model-${index + 1}`,
    name: `Model ${index + 1}`,
  }))
}

describe('AiModelDiscoveryDialog', () => {
  it('paginates discovered models and resets to the first page after search', async () => {
    const wrapper = mount(AiModelDiscoveryDialog, {
      props: {
        visible: true,
        loading: false,
        title: '从 Provider 拉取模型',
        models: createModels(13),
      },
    })

    expect(wrapper.findAll('.model-row')).toHaveLength(6)
    expect(wrapper.text()).toContain('共 13 个候选模型')
    expect(wrapper.text()).toContain('第 1 / 3 页')
    expect(wrapper.text()).toContain('显示 1-6 项')

    await wrapper.get('[data-test="model-discovery-next-page"]').trigger('click')

    expect(wrapper.text()).toContain('第 2 / 3 页')
    expect(wrapper.text()).toContain('显示 7-12 项')
    expect(wrapper.find('.model-row strong').text()).toBe('Model 7')

    await wrapper.get('[data-test="model-discovery-search"]').setValue('model-13')

    expect(wrapper.text()).toContain('共 1 个候选模型')
    expect(wrapper.text()).toContain('第 1 / 1 页')
    expect(wrapper.text()).toContain('显示 1-1 项')
    expect(wrapper.findAll('.model-row')).toHaveLength(1)
    expect(wrapper.text()).toContain('Model 13')
  })
})

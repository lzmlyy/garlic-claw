import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { AiProviderCatalogItem, AiProviderSummary } from '@garlic-claw/shared'
import AiProviderSidebar from './AiProviderSidebar.vue'
import { coreProviderCatalogFixture } from './provider-test.fixtures'

const catalog: AiProviderCatalogItem[] = coreProviderCatalogFixture

function createProviders(count: number): AiProviderSummary[] {
  return Array.from({ length: count }, (_, index): AiProviderSummary => ({
    id: `provider-${index + 1}`,
    name: `Provider ${index + 1}`,
    mode: index % 2 === 0 ? 'catalog' : 'protocol',
    driver:
      index % 2 === 0
        ? index % 3 === 0
          ? 'gemini'
          : 'openai'
        : 'openai',
    defaultModel: `model-${index + 1}`,
    baseUrl: 'https://example.com/v1',
    modelCount: index + 1,
    available: index % 2 === 0,
  }))
}

describe('AiProviderSidebar', () => {
  it('filters and paginates providers without rendering the full list at once', async () => {
    const wrapper = mount(AiProviderSidebar, {
      props: {
        catalog,
        providers: createProviders(11),
        selectedProviderId: null,
        loading: false,
        error: null,
      },
    })

    expect(wrapper.findAll('.provider-item')).toHaveLength(6)
    expect(wrapper.text()).toContain('匹配 11 / 11')
    expect(wrapper.text()).toContain('第 1 / 2 页')
    expect(wrapper.text()).toContain('核心协议族')

    await wrapper.get('[data-test="provider-sidebar-next-page"]').trigger('click')

    expect(wrapper.text()).toContain('第 2 / 2 页')
    expect(wrapper.find('.provider-item strong').text()).toBe('Provider 7')

    await wrapper.get('[data-test="provider-sidebar-search"]').setValue('provider-10')

    expect(wrapper.text()).toContain('匹配 1 / 11')
    expect(wrapper.text()).toContain('第 1 / 1 页')
    expect(wrapper.findAll('.provider-item')).toHaveLength(1)
    expect(wrapper.text()).toContain('Provider 10')
    expect(wrapper.text()).toContain('协议接入')
    expect(wrapper.text()).toContain('OpenAI 协议接入')
  })
})

import { RouterLinkStub, mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AiPluginQuickAccessPanel from './AiPluginQuickAccessPanel.vue'

describe('AiPluginQuickAccessPanel', () => {
  it('renders direct links for provider routing and persona business settings', () => {
    const wrapper = mount(AiPluginQuickAccessPanel, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    const links = wrapper.findAllComponents(RouterLinkStub)
    expect(links).toHaveLength(2)
    expect(links[0]?.props('to')).toEqual({
      name: 'plugins',
      query: {
        plugin: 'builtin.provider-router',
      },
    })
    expect(links[1]?.props('to')).toEqual({
      name: 'persona-settings',
    })
    expect(wrapper.text()).toContain('模型路由')
    expect(wrapper.text()).toContain('人设配置')
  })
})

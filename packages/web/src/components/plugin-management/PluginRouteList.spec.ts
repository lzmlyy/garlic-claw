import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import PluginRouteList from './PluginRouteList.vue'

const { invokePluginRoute } = vi.hoisted(() => ({
  invokePluginRoute: vi.fn(),
}))

vi.mock('../../api/plugins', () => ({
  invokePluginRoute,
}))

describe('PluginRouteList', () => {
  it('invokes the selected plugin route and renders the JSON response', async () => {
    invokePluginRoute.mockResolvedValue({
      status: 201,
      headers: {
        'x-route-source': 'plugin',
      },
      body: {
        ok: true,
        route: 'inspect/context',
      },
    })

    const wrapper = mount(PluginRouteList, {
      props: {
        pluginName: 'builtin.route-inspector',
        routes: [
          {
            path: 'inspect/context',
            methods: ['GET', 'POST'],
            description: 'inspect current route context',
          },
        ],
      },
    })

    await wrapper.get('[data-test="route-run-button"]').trigger('click')
    await flushPromises()

    expect(invokePluginRoute).toHaveBeenCalledWith(
      'builtin.route-inspector',
      'inspect/context',
      'GET',
      {
        query: '',
      },
    )
    expect(wrapper.text()).toContain('HTTP 201')
    expect(wrapper.text()).toContain('"ok": true')
    expect(wrapper.text()).toContain('inspect/context')
    expect(wrapper.text()).toContain('x-route-source')
  })
})

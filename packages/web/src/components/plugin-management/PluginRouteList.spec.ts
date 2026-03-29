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

  it('shows a clear error and skips invocation when JSON body is invalid', async () => {
    invokePluginRoute.mockReset()

    const wrapper = mount(PluginRouteList, {
      props: {
        pluginName: 'builtin.route-inspector',
        routes: [
          {
            path: 'inspect/context',
            methods: ['POST'],
            description: 'inspect current route context',
          },
        ],
      },
    })

    await wrapper.get('textarea').setValue('{invalid json}')
    await wrapper.get('[data-test="route-run-button"]').trigger('click')
    await flushPromises()

    expect(invokePluginRoute).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('JSON Body 必须是有效 JSON')
  })

  it('clears the previous response when the selected route changes', async () => {
    invokePluginRoute.mockResolvedValue({
      status: 200,
      headers: {},
      body: {
        ok: true,
      },
    })

    const wrapper = mount(PluginRouteList, {
      props: {
        pluginName: 'builtin.route-inspector',
        routes: [
          {
            path: 'inspect/context',
            methods: ['GET'],
            description: 'inspect current route context',
          },
          {
            path: 'inspect/health',
            methods: ['GET'],
            description: 'inspect current route health',
          },
        ],
      },
    })

    await wrapper.get('[data-test="route-run-button"]').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('HTTP 200')

    await wrapper.get('[data-test="route-path-select"]').setValue('inspect/health')

    expect(wrapper.text()).not.toContain('HTTP 200')
    expect(wrapper.text()).not.toContain('"ok": true')
  })
})

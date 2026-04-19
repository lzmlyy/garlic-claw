import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AdminConsoleLayout from '@/features/admin/layouts/AdminConsoleLayout.vue'

const authState = {
  logout: vi.fn(),
}

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => authState,
}))

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')

  return {
    ...actual,
    useRouter: () => ({
      push: vi.fn(),
    }),
    useRoute: () => ({
      name: 'chat',
    }),
  }
})

describe('AdminConsoleLayout', () => {
  it('renders the unified single-user navigation without the api key entry', () => {
    const wrapper = mount(AdminConsoleLayout, {
      global: {
        stubs: {
          RouterLink: {
            props: ['to'],
            template: '<a><slot /></a>',
          },
          RouterView: {
            template: '<div class="router-view-stub" />',
          },
        },
      },
    })

    expect(wrapper.text()).toContain('对话')
    expect(wrapper.text()).toContain('插件')
    expect(wrapper.text()).toContain('MCP')
    expect(wrapper.text()).toContain('技能')
    expect(wrapper.text()).toContain('AI 设置')
    expect(wrapper.text()).toContain('自动化')
    expect(wrapper.text()).toContain('控制台')
    expect(wrapper.text()).toContain('退出登录')
    expect(wrapper.text()).not.toContain('API Keys')
  })
})

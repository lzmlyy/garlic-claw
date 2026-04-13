import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AdminConsoleLayout from './AdminConsoleLayout.vue'

vi.mock('@/stores/auth', () => ({
  useAuthStore: () => ({
    user: {
      username: 'codex',
      role: 'admin',
    },
    isAdmin: true,
    logout: vi.fn(),
  }),
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
  it('renders the compact admin navigation with the chat entry', () => {
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
    expect(wrapper.text()).toContain('工具')
    expect(wrapper.text()).toContain('AI 设置')
    expect(wrapper.text()).toContain('控制台')
    expect(wrapper.text()).toContain('继续收起')
    expect(wrapper.findAll('svg').length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain('返回对话')
    expect(wrapper.text()).not.toContain('最近一次对话')
  })
})

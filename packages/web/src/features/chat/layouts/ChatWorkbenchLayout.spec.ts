import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatWorkbenchLayout from './ChatWorkbenchLayout.vue'

const authState = vi.hoisted(() => ({
  user: {
    username: 'codex',
    role: 'admin',
  },
  isAdmin: true,
  logout: vi.fn(),
}))

vi.mock('@/features/chat/store/chat', () => ({
  useChatStore: () => ({
    conversations: [
      {
        id: 'conversation-1',
        title: '最近一次对话',
      },
    ],
    currentConversationId: 'conversation-1',
    loadConversations: vi.fn(),
    createConversation: vi.fn(async () => ({
      id: 'conversation-2',
      title: '新对话',
    })),
    selectConversation: vi.fn(),
    deleteConversation: vi.fn(),
  }),
}))

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

describe('ChatWorkbenchLayout', () => {
  beforeEach(() => {
    authState.user = {
      username: 'codex',
      role: 'admin',
    }
    authState.isAdmin = true
    authState.logout.mockClear()
  })

  it('renders the conversation rail without admin workspace controls mixed into the main view', () => {
    const wrapper = mount(ChatWorkbenchLayout, {
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

    expect(wrapper.text()).toContain('最近一次对话')
    expect(wrapper.text()).toContain('新对话')
    expect(wrapper.text()).toContain('管理后台')
  })

  it('hides the admin entry for regular users', () => {
    authState.user = {
      username: 'guest',
      role: 'user',
    }
    authState.isAdmin = false

    const wrapper = mount(ChatWorkbenchLayout, {
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

    expect(wrapper.text()).not.toContain('管理后台')
  })
})

import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ChatConsoleView from './ChatConsoleView.vue'

const authState = vi.hoisted(() => ({
  user: {
    username: 'codex',
    role: 'admin',
  },
  logout: vi.fn(),
}))

const chatState = vi.hoisted(() => ({
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
}))

vi.mock('@/features/chat/store/chat', () => ({
  useChatStore: () => chatState,
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
  }
})

describe('ChatConsoleView', () => {
  beforeEach(() => {
    authState.user = {
      username: 'codex',
      role: 'admin',
    }
    authState.logout.mockClear()
    chatState.loadConversations.mockClear()
  })

  it('renders a dedicated conversation sidebar inside the chat page', () => {
    const wrapper = mount(ChatConsoleView, {
      global: {
        stubs: {
          ChatView: {
            template: '<div class="chat-view-stub" />',
          },
        },
      },
    })

    expect(chatState.loadConversations).toHaveBeenCalled()
    expect(wrapper.text()).toContain('最近一次对话')
    expect(wrapper.text()).toContain('新对话')
    expect(wrapper.find('.chat-rail').exists()).toBe(true)
    expect(wrapper.find('.chat-content').exists()).toBe(true)
  })
})

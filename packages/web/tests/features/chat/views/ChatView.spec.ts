import { ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import ChatView from '@/features/chat/views/ChatView.vue'

vi.mock('@/features/chat/store/chat', () => ({
  useChatStore: () => ({
    currentConversationId: 'conversation-1',
    selectedProvider: 'demo-provider',
    selectedModel: 'demo-model',
    messages: [],
    loading: false,
    streaming: false,
    stopStreaming: vi.fn(),
  }),
}))

vi.mock('@/features/chat/composables/use-chat-view', () => ({
  useChatView: () => ({
    inputText: ref(''),
    pendingImages: ref([]),
    selectedCapabilities: ref(null),
    conversationHostServices: ref({
      sessionEnabled: true,
      llmEnabled: true,
      ttsEnabled: true,
    }),
    conversationSkillState: ref({
      activeSkillIds: ['project/planner'],
      activeSkills: [
        {
          id: 'project/planner',
          name: '规划执行',
          description: '先拆任务，再逐步执行。',
          tags: ['planning'],
          sourceKind: 'project',
          entryPath: 'planner/SKILL.md',
          promptPreview: '把复杂请求拆成 3-5 步，再开始执行。',
          toolPolicy: {
            allow: ['kb.search'],
            deny: [],
          },
          governance: {
            trustLevel: 'asset-read',
          },
        },
      ],
    }),
    conversationSendDisabledReason: ref(null),
    uploadNotices: ref([]),
    canSend: ref(false),
    canTriggerRetryAction: ref(false),
    retryActionLabel: ref('发送'),
    handleModelChange: vi.fn(),
    send: vi.fn(),
    handleFileChange: vi.fn(),
    removeImage: vi.fn(),
    updateMessage: vi.fn(),
    deleteMessage: vi.fn(),
    triggerRetryAction: vi.fn(),
    setConversationLlmEnabled: vi.fn(),
    setConversationSessionEnabled: vi.fn(),
    removeConversationSkill: vi.fn(),
  }),
}))

vi.mock('@/features/personas/composables/persona-settings.data', () => ({
  loadCurrentPersona: vi.fn().mockResolvedValue({
    avatar: '/api/personas/persona.writer/avatar',
    name: 'Writer',
    personaId: 'persona.writer',
    source: 'conversation',
  }),
}))

describe('ChatView', () => {
  it('renders active skills and passes the current persona avatar into the message list', async () => {
    const wrapper = mount(ChatView, {
      global: {
        stubs: {
          ChatMessageList: {
            props: ['assistantPersona'],
            template: '<div class="chat-message-list">{{ assistantPersona?.name }}|{{ assistantPersona?.avatar }}</div>',
          },
          ChatComposer: { template: '<div class="chat-composer" />' },
          ModelQuickInput: { template: '<div class="model-quick-input" />' },
          RouterLink: {
            props: ['to'],
            template: '<a><slot /></a>',
          },
        },
      },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('当前 技能')
    expect(wrapper.text()).toContain('规划执行')
    expect(wrapper.text()).toContain('管理 技能')
    expect(wrapper.find('.chat-message-list').text()).toContain('Writer|/api/personas/persona.writer/avatar')
  })
})

import { computed, ref, shallowRef } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import AutomationsView from '@/modules/automations/views/AutomationsView.vue'

const hoisted = vi.hoisted(() => ({
  state: null as ReturnType<typeof createAutomationsState> | null,
}))

vi.mock('@/modules/automations/composables/use-automations', () => ({
  useAutomations: () => hoisted.state,
}))

describe('AutomationsView', () => {
  it('renders an explicit delete button for each automation card', async () => {
    hoisted.state = createAutomationsState()

    const wrapper = mount(AutomationsView, {
      global: {
        stubs: {
          ConsolePage: { template: '<div><slot /></div>' },
          ConsoleViewHeader: { template: '<div><slot /><slot name="actions" /></div>' },
        },
      },
    })

    expect(wrapper.find('[data-test="automation-delete-button"]').exists()).toBe(true)
  })
})

function createAutomationsState() {
  const automations = ref([
    {
      id: 'automation-1',
      name: '定时提醒',
      trigger: { type: 'manual' as const },
      actions: [
        {
          type: 'ai_message' as const,
          message: '继续执行',
          target: {
            type: 'conversation' as const,
            id: 'conversation-1',
          },
        },
      ],
      enabled: true,
      lastRunAt: null,
      createdAt: '2026-05-04T00:00:00.000Z',
      updatedAt: '2026-05-04T00:00:00.000Z',
    },
  ])

  return {
    automations,
    conversationOptions: computed(() => []),
    currentView: ref<'automations' | 'logs'>('automations'),
    conversations: shallowRef([]),
    loading: ref(false),
    error: ref<string | null>(null),
    form: ref({
      name: '',
      triggerType: 'manual' as const,
      cronInterval: '5m',
      eventName: '',
      actionType: 'ai_message' as const,
      plugin: '',
      capability: '',
      message: '',
      targetConversationId: '',
      targetConversationMode: 'existing' as const,
      maxHistoryConversations: 10,
    }),
    canCreate: computed(() => true),
    logsLoading: ref(false),
    logEntries: computed(() => []),
    handleCreate: vi.fn(),
    handleToggle: vi.fn(),
    handleRun: vi.fn(),
    handleDelete: vi.fn(),
    handleViewChange: vi.fn(),
    loadAutomationLogs: vi.fn(),
    describeAction: vi.fn(() => '消息→会话 · 继续执行'),
    formatTime: vi.fn(() => '刚刚'),
    formatTriggerLabel: vi.fn(() => '手动触发'),
  }
}

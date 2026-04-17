import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomationInfo, Conversation } from '@garlic-claw/shared'
import { useAutomations } from '@/features/automations/composables/use-automations'
import * as automationData from '@/features/automations/composables/automations.data'

vi.mock('@/features/automations/composables/automations.data', () => ({
  createAutomationRecord: vi.fn(),
  deleteAutomationRecord: vi.fn(),
  loadAutomationConversations: vi.fn(),
  loadAutomations: vi.fn(),
  runAutomationRequest: vi.fn(),
  toggleAutomationEnabled: vi.fn(),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

function createAutomationInfo(): AutomationInfo {
  return {
    id: 'automation-1',
    name: '咖啡完成提醒',
    trigger: {
      type: 'event',
      event: 'coffee.ready',
    },
    actions: [
      {
        type: 'device_command',
        plugin: 'builtin.memory-tools',
        capability: 'save_memory',
      },
    ],
    enabled: true,
    lastRunAt: null,
    createdAt: '2026-03-29T14:30:00.000Z',
    updatedAt: '2026-03-29T14:30:00.000Z',
  }
}

function createConversation(): Conversation {
  return {
    id: 'conversation-1',
    title: 'Coffee Chat',
    createdAt: '2026-03-29T14:00:00.000Z',
    updatedAt: '2026-03-29T14:00:00.000Z',
    _count: {
      messages: 3,
    },
  }
}

async function mountAutomationsHarness() {
  let state!: ReturnType<typeof useAutomations>
  const Harness = defineComponent({
    setup() {
      state = useAutomations()
      return () => null
    },
  })

  mount(Harness)
  await flushPromises()
  return state
}

describe('useAutomations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(automationData.loadAutomations).mockResolvedValue([])
    vi.mocked(automationData.loadAutomationConversations).mockResolvedValue([createConversation()])
  })

  it('creates event-triggered automations with the configured event name', async () => {
    vi.mocked(automationData.createAutomationRecord).mockResolvedValue(createAutomationInfo())

    const state = await mountAutomationsHarness()

    state.form.value.name = '咖啡完成提醒'
    state.form.value.triggerType = 'event'
    state.form.value.eventName = 'coffee.ready'
    state.form.value.plugin = 'builtin.memory-tools'
    state.form.value.capability = 'save_memory'

    expect(state.canCreate.value).toBe(true)

    await state.handleCreate()

    expect(automationData.createAutomationRecord).toHaveBeenCalledWith({
      name: '咖啡完成提醒',
      trigger: {
        type: 'event',
        event: 'coffee.ready',
      },
      actions: [
        {
          type: 'device_command',
          plugin: 'builtin.memory-tools',
          capability: 'save_memory',
        },
      ],
    })
  })

  it('creates ai_message automations with a conversation target', async () => {
    vi.mocked(automationData.createAutomationRecord).mockResolvedValue({
      ...createAutomationInfo(),
      actions: [
        {
          type: 'ai_message',
          message: '咖啡已经煮好了',
          target: {
            type: 'conversation',
            id: 'conversation-1',
          },
        },
      ],
    })

    const state = await mountAutomationsHarness()

    state.form.value.name = '咖啡提醒'
    state.form.value.triggerType = 'manual'
    state.form.value.actionType = 'ai_message'
    state.form.value.message = '咖啡已经煮好了'
    state.form.value.targetConversationId = 'conversation-1'

    expect(state.canCreate.value).toBe(true)

    await state.handleCreate()

    expect(automationData.createAutomationRecord).toHaveBeenCalledWith({
      name: '咖啡提醒',
      trigger: {
        type: 'manual',
        cron: undefined,
        event: undefined,
      },
      actions: [
        {
          type: 'ai_message',
          message: '咖啡已经煮好了',
          target: {
            type: 'conversation',
            id: 'conversation-1',
          },
        },
      ],
    })
  })
})

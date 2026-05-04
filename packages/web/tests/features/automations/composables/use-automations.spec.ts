import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomationInfo, Conversation } from '@garlic-claw/shared'
import { useAutomations } from '@/modules/automations/composables/use-automations'
import * as automationData from '@/modules/automations/composables/automations.data'

vi.mock('@/modules/automations/composables/automations.data', () => ({
  createAutomationRecord: vi.fn(),
  deleteAutomationRecord: vi.fn(),
  loadAutomationConversations: vi.fn(),
  loadAutomations: vi.fn(),
  runAutomationRequest: vi.fn(),
  toggleAutomationEnabled: vi.fn(),
  updateAutomationRecord: vi.fn(),
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
        plugin: 'builtin.memory',
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
    state.form.value.plugin = 'builtin.memory'
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
          plugin: 'builtin.memory',
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

  it('creates cron ai_message automations with dedicated cron conversation settings', async () => {
    vi.mocked(automationData.createAutomationRecord).mockResolvedValue({
      ...createAutomationInfo(),
      trigger: {
        type: 'cron',
        cron: '5m',
      },
      actions: [
        {
          type: 'ai_message',
          message: '整理日报',
          target: {
            type: 'conversation',
            id: 'conversation-1',
            conversationMode: 'cron_child',
            maxHistoryConversations: 6,
          },
        },
      ],
    })

    const state = await mountAutomationsHarness()

    state.form.value.name = '日报整理'
    state.form.value.triggerType = 'cron'
    state.form.value.cronInterval = '5m'
    state.form.value.actionType = 'ai_message'
    state.form.value.message = '整理日报'
    state.form.value.targetConversationId = 'conversation-1'
    state.form.value.targetConversationMode = 'cron_child'
    state.form.value.maxHistoryConversations = 6

    expect(state.canCreate.value).toBe(true)

    await state.handleCreate()

    expect(automationData.createAutomationRecord).toHaveBeenCalledWith({
      name: '日报整理',
      trigger: {
        type: 'cron',
        cron: '5m',
        event: undefined,
      },
      actions: [
        {
          type: 'ai_message',
          message: '整理日报',
          target: {
            type: 'conversation',
            id: 'conversation-1',
            conversationMode: 'cron_child',
            maxHistoryConversations: 6,
          },
        },
      ],
    })
  })

  it('disambiguates duplicated conversation titles in automation targets', async () => {
    vi.mocked(automationData.loadAutomationConversations).mockResolvedValue([
      {
        ...createConversation(),
        id: 'conversation-11111111',
        title: '新的对话',
      },
      {
        ...createConversation(),
        id: 'conversation-22222222',
        title: '新的对话',
      },
    ])
    vi.mocked(automationData.loadAutomations).mockResolvedValue([
      {
        ...createAutomationInfo(),
        actions: [
          {
            type: 'ai_message',
            message: '咖啡已经煮好了',
            target: {
              type: 'conversation',
              id: 'conversation-22222222',
            },
          },
        ],
      },
    ])

    const state = await mountAutomationsHarness()

    expect(state.conversationOptions.value).toEqual([
      { id: 'conversation-11111111', label: '新的对话 · 11111111' },
      { id: 'conversation-22222222', label: '新的对话 · 22222222' },
    ])
    expect(state.describeAction(state.automations.value[0].actions[0]!)).toContain('新的对话 · 22222222')
  })

  it('updates an existing ai_message automation in place', async () => {
    vi.mocked(automationData.loadAutomations).mockResolvedValue([
      {
        ...createAutomationInfo(),
        actions: [
          {
            type: 'ai_message',
            message: '旧提醒',
            target: {
              type: 'conversation',
              id: 'conversation-1',
            },
          },
        ],
      },
    ])
    const updateAutomationRecord = (
      automationData as unknown as { updateAutomationRecord: ReturnType<typeof vi.fn> }
    ).updateAutomationRecord
    updateAutomationRecord.mockResolvedValue({
      ...createAutomationInfo(),
      name: '更新后的提醒',
      actions: [
        {
          type: 'ai_message',
          message: '新提醒',
          target: {
            type: 'conversation',
            id: 'conversation-1',
          },
        },
      ],
    })

    const state = await mountAutomationsHarness()
    state.form.value.name = '更新后的提醒'
    state.form.value.triggerType = 'manual'
    state.form.value.actionType = 'ai_message'
    state.form.value.message = '新提醒'
    state.form.value.targetConversationId = 'conversation-1'

    const handleUpdate = (state as unknown as {
      handleUpdate: (automationId: string) => Promise<void>
    }).handleUpdate

    await handleUpdate('automation-1')

    expect(updateAutomationRecord).toHaveBeenCalledWith('automation-1', {
      name: '更新后的提醒',
      trigger: {
        type: 'manual',
        cron: undefined,
        event: undefined,
      },
      actions: [
        {
          type: 'ai_message',
          message: '新提醒',
          target: {
            type: 'conversation',
            id: 'conversation-1',
          },
        },
      ],
    })
    expect(automationData.createAutomationRecord).not.toHaveBeenCalled()
  })
})

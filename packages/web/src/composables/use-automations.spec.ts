import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AutomationInfo } from '@garlic-claw/shared'
import { useAutomations } from './use-automations'
import * as api from '../api'

vi.mock('../api', () => ({
  createAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
  listAutomations: vi.fn(),
  runAutomation: vi.fn(),
  toggleAutomation: vi.fn(),
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
    vi.mocked(api.listAutomations).mockResolvedValue([])
  })

  it('creates event-triggered automations with the configured event name', async () => {
    vi.mocked(api.createAutomation).mockResolvedValue(createAutomationInfo())

    const state = await mountAutomationsHarness()

    state.form.value.name = '咖啡完成提醒'
    state.form.value.triggerType = 'event'
    state.form.value.eventName = 'coffee.ready'
    state.form.value.plugin = 'builtin.memory-tools'
    state.form.value.capability = 'save_memory'

    expect(state.canCreate.value).toBe(true)

    await state.handleCreate()

    expect(api.createAutomation).toHaveBeenCalledWith({
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
})

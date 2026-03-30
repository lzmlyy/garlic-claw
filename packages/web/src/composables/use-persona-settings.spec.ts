import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginPersonaCurrentInfo, PluginPersonaSummary } from '@garlic-claw/shared'
import { usePersonaSettings } from './use-persona-settings'

const mockCurrentConversationId = ref<string | null>('conversation-1')
const mockConversations = ref([
  {
    id: 'conversation-1',
    title: '当前对话',
    createdAt: '2026-03-30T12:00:00.000Z',
    updatedAt: '2026-03-30T12:00:00.000Z',
  },
])

vi.mock('../api', () => ({
  listPersonas: vi.fn(),
  getCurrentPersona: vi.fn(),
  activateConversationPersona: vi.fn(),
}))

vi.mock('../stores/chat', () => ({
  useChatStore: () => ({
    currentConversationId: mockCurrentConversationId,
    conversations: mockConversations,
  }),
}))

const mountedWrappers: Array<ReturnType<typeof mount>> = []

async function mountPersonaSettingsHarness() {
  let state!: ReturnType<typeof usePersonaSettings>
  const Harness = defineComponent({
    setup() {
      state = usePersonaSettings()
      return () => null
    },
  })

  const wrapper = mount(Harness)
  mountedWrappers.push(wrapper)
  await flushPromises()
  return state
}

function createPersona(id: string, name = id): PluginPersonaSummary {
  return {
    id,
    name,
    prompt: `${name} prompt`,
    description: `${name} description`,
    isDefault: id === 'builtin.default-assistant',
    createdAt: '2026-03-30T12:00:00.000Z',
    updatedAt: '2026-03-30T12:00:00.000Z',
  }
}

function createCurrentPersona(personaId: string): PluginPersonaCurrentInfo {
  return {
    source: 'conversation',
    personaId,
    name: personaId,
    prompt: `${personaId} prompt`,
    description: `${personaId} description`,
    isDefault: personaId === 'builtin.default-assistant',
  }
}

describe('usePersonaSettings', () => {
  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockCurrentConversationId.value = 'conversation-1'
    mockConversations.value = [
      {
        id: 'conversation-1',
        title: '当前对话',
        createdAt: '2026-03-30T12:00:00.000Z',
        updatedAt: '2026-03-30T12:00:00.000Z',
      },
    ]
  })

  it('loads persona list and prefers the current conversation persona as selection', async () => {
    const api = await import('../api')

    vi.mocked(api.listPersonas).mockResolvedValue([
      createPersona('builtin.default-assistant', 'Default Assistant'),
      createPersona('persona.writer', 'Writer'),
    ])
    vi.mocked(api.getCurrentPersona).mockResolvedValue(
      createCurrentPersona('persona.writer'),
    )

    const state = await mountPersonaSettingsHarness()

    expect(api.listPersonas).toHaveBeenCalledTimes(1)
    expect(api.getCurrentPersona).toHaveBeenCalledWith('conversation-1')
    expect(state.selectedPersonaId.value).toBe('persona.writer')
    expect(state.currentPersona.value?.personaId).toBe('persona.writer')
    expect(state.currentConversationTitle.value).toBe('当前对话')
  })

  it('applies the selected persona to the current conversation and refreshes current state', async () => {
    const api = await import('../api')

    vi.mocked(api.listPersonas).mockResolvedValue([
      createPersona('builtin.default-assistant', 'Default Assistant'),
      createPersona('persona.writer', 'Writer'),
    ])
    vi.mocked(api.getCurrentPersona).mockResolvedValue(
      createCurrentPersona('builtin.default-assistant'),
    )
    vi.mocked(api.activateConversationPersona).mockResolvedValue(
      createCurrentPersona('persona.writer'),
    )

    const state = await mountPersonaSettingsHarness()
    state.selectPersona('persona.writer')

    await state.applySelectedPersona()

    expect(api.activateConversationPersona).toHaveBeenCalledWith(
      'conversation-1',
      'persona.writer',
    )
    expect(state.currentPersona.value?.personaId).toBe('persona.writer')
  })

  it('refreshes current persona when the selected conversation changes', async () => {
    const api = await import('../api')

    vi.mocked(api.listPersonas).mockResolvedValue([
      createPersona('builtin.default-assistant', 'Default Assistant'),
      createPersona('persona.writer', 'Writer'),
    ])
    vi.mocked(api.getCurrentPersona)
      .mockResolvedValueOnce(createCurrentPersona('builtin.default-assistant'))
      .mockResolvedValueOnce(createCurrentPersona('persona.writer'))

    const state = await mountPersonaSettingsHarness()

    mockConversations.value = [
      ...mockConversations.value,
      {
        id: 'conversation-2',
        title: '第二个对话',
        createdAt: '2026-03-30T12:01:00.000Z',
        updatedAt: '2026-03-30T12:01:00.000Z',
      },
    ]
    mockCurrentConversationId.value = 'conversation-2'
    await flushPromises()

    expect(api.getCurrentPersona).toHaveBeenLastCalledWith('conversation-2')
    expect(state.currentPersona.value?.personaId).toBe('persona.writer')
    expect(state.currentConversationTitle.value).toBe('第二个对话')
  })
})

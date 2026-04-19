import { defineComponent, ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PluginPersonaCurrentInfo, PluginPersonaDetail, PluginPersonaSummary } from '@garlic-claw/shared'
import { usePersonaSettings } from '@/features/personas/composables/use-persona-settings'
import * as personaData from '@/features/personas/composables/persona-settings.data'

const mockCurrentConversationId = ref<string | null>('conversation-1')
const mockConversations = ref([
  {
    id: 'conversation-1',
    title: '当前对话',
    createdAt: '2026-03-30T12:00:00.000Z',
    updatedAt: '2026-03-30T12:00:00.000Z',
  },
])

vi.mock('@/features/personas/composables/persona-settings.data', () => ({
  loadPersonas: vi.fn(),
  loadPersona: vi.fn(),
  createPersona: vi.fn(),
  updatePersona: vi.fn(),
  deletePersona: vi.fn(),
  loadCurrentPersona: vi.fn(),
  activateConversationPersona: vi.fn(),
  toErrorMessage: vi.fn((error: Error | undefined, fallback: string) => error?.message ?? fallback),
}))

vi.mock('@/features/chat/store/chat', () => ({
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
    avatar: null,
    id,
    name,
    description: `${name} description`,
    isDefault: id === 'builtin.default-assistant',
    createdAt: '2026-03-30T12:00:00.000Z',
    updatedAt: '2026-03-30T12:00:00.000Z',
  }
}

function createPersonaDetail(id: string, name = id): PluginPersonaDetail {
  return {
    ...createPersona(id, name),
    avatar: null,
    beginDialogs: [],
    customErrorMessage: null,
    prompt: `${name} prompt`,
    skillIds: null,
    toolNames: null,
  }
}

function createCurrentPersona(personaId: string): PluginPersonaCurrentInfo {
  return {
    ...createPersonaDetail(personaId, personaId),
    source: 'conversation',
    personaId,
  }
}

describe('usePersonaSettings', () => {
  afterEach(() => {
    while (mountedWrappers.length > 0) {
      mountedWrappers.pop()?.unmount()
    }
  })

  beforeEach(() => {
    vi.resetAllMocks()
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
    vi.mocked(personaData.loadPersonas).mockResolvedValue([
      createPersona('builtin.default-assistant', '默认助手'),
      createPersona('persona.writer', 'Writer'),
    ])
    vi.mocked(personaData.loadCurrentPersona).mockResolvedValue(
      createCurrentPersona('persona.writer'),
    )
    vi.mocked(personaData.loadPersona).mockResolvedValue(
      createPersonaDetail('persona.writer', 'Writer'),
    )

    const state = await mountPersonaSettingsHarness()

    expect(personaData.loadPersonas).toHaveBeenCalledTimes(1)
    expect(personaData.loadCurrentPersona).toHaveBeenCalledWith('conversation-1')
    expect(personaData.loadPersona).toHaveBeenCalledWith('persona.writer')
    expect(state.selectedPersonaId.value).toBe('persona.writer')
    expect(state.currentPersona.value?.personaId).toBe('persona.writer')
    expect(state.currentConversationTitle.value).toBe('当前对话')
    expect(state.selectedPersona.value?.prompt).toBe('Writer prompt')
  })

  it('applies the selected persona to the current conversation and refreshes current state', async () => {
    vi.mocked(personaData.loadPersonas).mockResolvedValue([
      createPersona('builtin.default-assistant', '默认助手'),
      createPersona('persona.writer', 'Writer'),
    ])
    vi.mocked(personaData.loadCurrentPersona).mockResolvedValue(
      createCurrentPersona('builtin.default-assistant'),
    )
    vi.mocked(personaData.loadPersona)
      .mockResolvedValueOnce(createPersonaDetail('builtin.default-assistant', '默认助手'))
      .mockResolvedValueOnce(createPersonaDetail('persona.writer', 'Writer'))
    vi.mocked(personaData.activateConversationPersona).mockResolvedValue(
      createCurrentPersona('persona.writer'),
    )

    const state = await mountPersonaSettingsHarness()
    state.selectPersona('persona.writer')

    await state.applySelectedPersona()

    expect(personaData.activateConversationPersona).toHaveBeenCalledWith(
      'conversation-1',
      'persona.writer',
    )
    expect(state.currentPersona.value?.personaId).toBe('persona.writer')
  })

  it('creates a new persona from the editor draft and switches into edit mode', async () => {
    vi.mocked(personaData.loadPersonas)
      .mockResolvedValueOnce([createPersona('builtin.default-assistant', '默认助手')])
      .mockResolvedValueOnce([
        createPersona('builtin.default-assistant', '默认助手'),
        createPersona('persona.reviewer', 'Reviewer'),
      ])
    vi.mocked(personaData.loadCurrentPersona).mockResolvedValue(
      createCurrentPersona('builtin.default-assistant'),
    )
    vi.mocked(personaData.loadPersona).mockResolvedValue(
      createPersonaDetail('builtin.default-assistant', '默认助手'),
    )
    vi.mocked(personaData.createPersona).mockResolvedValue({
      ...createPersonaDetail('persona.reviewer', 'Reviewer'),
      beginDialogs: [{ content: '先列提纲。', role: 'assistant' }],
      customErrorMessage: '当前人格暂时无法完成请求。',
      skillIds: ['project/planner'],
      toolNames: ['memory.search'],
    })

    const state = await mountPersonaSettingsHarness()
    state.beginCreatePersona()
    state.editorDraft.value.id = 'persona.reviewer'
    state.editorDraft.value.name = 'Reviewer'
    state.editorDraft.value.prompt = 'Review critically.'
    state.editorDraft.value.description = '审稿人格'
    state.editorDraft.value.customErrorMessage = '当前人格暂时无法完成请求。'
    state.editorDraft.value.skillMode = 'selected'
    state.editorDraft.value.skillInput = 'project/planner'
    state.editorDraft.value.toolMode = 'selected'
    state.editorDraft.value.toolInput = 'memory.search'
    state.addBeginDialog()
    state.editorDraft.value.beginDialogs[0].content = '先列提纲。'

    await state.savePersonaDraft()

    expect(personaData.createPersona).toHaveBeenCalledWith({
      beginDialogs: [{ content: '先列提纲。', role: 'assistant' }],
      customErrorMessage: '当前人格暂时无法完成请求。',
      description: '审稿人格',
      id: 'persona.reviewer',
      isDefault: false,
      name: 'Reviewer',
      prompt: 'Review critically.',
      skillIds: ['project/planner'],
      toolNames: ['memory.search'],
    })
    expect(state.editorMode.value).toBe('edit')
    expect(state.selectedPersonaId.value).toBe('persona.reviewer')
    expect(state.selectedPersona.value?.id).toBe('persona.reviewer')
  })

  it('deletes the selected persona and refreshes to the fallback selection', async () => {
    vi.mocked(personaData.loadPersonas)
      .mockResolvedValueOnce([
        createPersona('builtin.default-assistant', '默认助手'),
        createPersona('persona.writer', 'Writer'),
      ])
      .mockResolvedValueOnce([
        createPersona('builtin.default-assistant', '默认助手'),
      ])
    vi.mocked(personaData.loadCurrentPersona)
      .mockResolvedValueOnce(createCurrentPersona('persona.writer'))
      .mockResolvedValueOnce(createCurrentPersona('builtin.default-assistant'))
    vi.mocked(personaData.loadPersona)
      .mockResolvedValueOnce(createPersonaDetail('persona.writer', 'Writer'))
      .mockResolvedValueOnce(createPersonaDetail('builtin.default-assistant', '默认助手'))
    vi.mocked(personaData.deletePersona).mockResolvedValue({
      deletedPersonaId: 'persona.writer',
      fallbackPersonaId: 'builtin.default-assistant',
      reassignedConversationCount: 1,
    })

    const state = await mountPersonaSettingsHarness()

    await state.deleteSelectedPersona()

    expect(personaData.deletePersona).toHaveBeenCalledWith('persona.writer')
    expect(state.selectedPersonaId.value).toBe('builtin.default-assistant')
    expect(state.deleteResult.value).toEqual({
      deletedPersonaId: 'persona.writer',
      fallbackPersonaId: 'builtin.default-assistant',
      reassignedConversationCount: 1,
    })
  })

  it('refreshes current persona when the selected conversation changes', async () => {
    vi.mocked(personaData.loadPersonas).mockResolvedValue([
      createPersona('builtin.default-assistant', '默认助手'),
      createPersona('persona.writer', 'Writer'),
    ])
    vi.mocked(personaData.loadPersona).mockResolvedValue(
      createPersonaDetail('persona.writer', 'Writer'),
    )
    vi.mocked(personaData.loadCurrentPersona)
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

    expect(personaData.loadCurrentPersona).toHaveBeenLastCalledWith('conversation-2')
    expect(state.currentPersona.value?.personaId).toBe('persona.writer')
    expect(state.currentConversationTitle.value).toBe('第二个对话')
  })
})

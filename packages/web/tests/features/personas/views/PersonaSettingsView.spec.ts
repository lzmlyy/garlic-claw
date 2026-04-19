import { computed, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { PluginPersonaCurrentInfo, PluginPersonaDetail, PluginPersonaSummary } from '@garlic-claw/shared'
import PersonaSettingsView from '@/features/personas/views/PersonaSettingsView.vue'
import type { PersonaEditorDraft } from '@/features/personas/composables/use-persona-settings'

const selectedPersona = ref<PluginPersonaDetail | null>({
  avatar: 'https://example.com/writer.png',
  id: 'persona.writer',
  name: 'Writer',
  prompt: 'writer prompt',
  beginDialogs: [],
  customErrorMessage: null,
  description: 'writer description',
  isDefault: false,
  skillIds: ['project/planner'],
  toolNames: ['memory.search'],
  createdAt: '2026-03-30T12:00:00.000Z',
  updatedAt: '2026-03-30T12:00:00.000Z',
})

const currentPersona = ref<PluginPersonaCurrentInfo | null>({
  ...selectedPersona.value!,
  avatar: 'https://example.com/default.png',
  source: 'conversation',
  personaId: 'builtin.default-assistant',
  id: 'builtin.default-assistant',
  name: '默认助手',
  prompt: 'default prompt',
  description: 'default description',
  isDefault: true,
  beginDialogs: [],
  customErrorMessage: null,
  skillIds: null,
  toolNames: null,
  createdAt: '2026-03-30T12:00:00.000Z',
  updatedAt: '2026-03-30T12:00:00.000Z',
})

const editorDraft = ref<PersonaEditorDraft>({
  id: 'persona.writer',
  name: 'Writer',
  description: 'writer description',
  prompt: 'writer prompt',
  customErrorMessage: '',
  isDefault: false,
  beginDialogs: [],
  skillMode: 'selected',
  skillInput: 'project/planner',
  toolMode: 'selected',
  toolInput: 'memory.search',
})

vi.mock('@/features/personas/composables/use-persona-settings', () => ({
  usePersonaSettings: () => ({
    loading: ref(false),
    loadingCurrentPersona: ref(false),
    loadingSelectedPersona: ref(false),
    applyingPersona: ref(false),
    savingPersona: ref(false),
    deletingPersona: ref(false),
    error: ref(null),
    personas: ref<PluginPersonaSummary[]>([
      {
        avatar: 'https://example.com/default.png',
        id: 'builtin.default-assistant',
        name: '默认助手',
        description: 'default description',
        isDefault: true,
        createdAt: '2026-03-30T12:00:00.000Z',
        updatedAt: '2026-03-30T12:00:00.000Z',
      },
      selectedPersona.value!,
    ]),
    selectedPersonaId: ref('persona.writer'),
    selectedPersona: computed(() => selectedPersona.value),
    currentPersona,
    currentConversationId: ref('conversation-1'),
    currentConversationTitle: ref('当前对话'),
    hasCurrentConversation: computed(() => true),
    canApplySelectedPersona: computed(() => true),
    canDeleteSelectedPersona: computed(() => true),
    selectedPersonaStatus: computed(() => '当前使用：默认助手'),
    editorMode: ref<'create' | 'edit'>('edit'),
    editorDraft,
    deleteResult: ref(null),
    refreshAll: vi.fn(),
    selectPersona: vi.fn(),
    beginCreatePersona: vi.fn(),
    resetEditorDraft: vi.fn(),
    addBeginDialog: vi.fn(),
    removeBeginDialog: vi.fn(),
    savePersonaDraft: vi.fn(),
    deleteSelectedPersona: vi.fn(),
    applySelectedPersona: vi.fn(),
  }),
}))

describe('PersonaSettingsView', () => {
  it('renders persona editor details without persona-router deep links', () => {
    const wrapper = mount(PersonaSettingsView)

    expect(wrapper.text()).toContain('人设管理')
    expect(wrapper.text()).toContain('当前对话')
    expect(wrapper.text()).toContain('Writer')
    expect(wrapper.text()).toContain('Begin Dialogs')
    expect(wrapper.text()).toContain('应用到当前对话')
    expect(wrapper.text()).not.toContain('builtin.persona-router')
    expect(wrapper.find('[data-persona-avatar="current"] img').attributes('src')).toBe('https://example.com/default.png')
    expect(wrapper.find('[data-persona-avatar="selected-hero"] img').attributes('src')).toBe('https://example.com/writer.png')
    expect(wrapper.find('[data-persona-avatar="list-persona.writer"] img').attributes('src')).toBe('https://example.com/writer.png')
    expect((wrapper.find('textarea.prompt-textarea').element as HTMLTextAreaElement).value).toBe('writer prompt')
  })
})

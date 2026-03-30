import { computed, ref } from 'vue'
import { RouterLinkStub, mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import type { PluginPersonaCurrentInfo, PluginPersonaSummary } from '@garlic-claw/shared'
import PersonaSettingsView from './PersonaSettingsView.vue'

const selectedPersona = ref<PluginPersonaSummary | null>({
  id: 'persona.writer',
  name: 'Writer',
  prompt: 'writer prompt',
  description: 'writer description',
  isDefault: false,
  createdAt: '2026-03-30T12:00:00.000Z',
  updatedAt: '2026-03-30T12:00:00.000Z',
})

const currentPersona = ref<PluginPersonaCurrentInfo | null>({
  source: 'conversation',
  personaId: 'builtin.default-assistant',
  name: 'Default Assistant',
  prompt: 'default prompt',
  description: 'default description',
  isDefault: true,
})

vi.mock('../composables/use-persona-settings', () => ({
  usePersonaSettings: () => ({
    loading: ref(false),
    loadingCurrentPersona: ref(false),
    applyingPersona: ref(false),
    error: ref(null),
    personas: ref<PluginPersonaSummary[]>([
      {
        id: 'builtin.default-assistant',
        name: 'Default Assistant',
        prompt: 'default prompt',
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
    refreshAll: vi.fn(),
    selectPersona: vi.fn(),
    applySelectedPersona: vi.fn(),
  }),
}))

describe('PersonaSettingsView', () => {
  it('renders persona details and deep-links to persona router plugin config', () => {
    const wrapper = mount(PersonaSettingsView, {
      global: {
        stubs: {
          RouterLink: RouterLinkStub,
        },
      },
    })

    expect(wrapper.text()).toContain('Persona 设置')
    expect(wrapper.text()).toContain('当前对话')
    expect(wrapper.text()).toContain('Writer')
    expect(wrapper.text()).toContain('writer prompt')
    expect(wrapper.text()).toContain('builtin.persona-router')

    const routerLink = wrapper
      .findAllComponents(RouterLinkStub)
      .find((candidate) => candidate.text().includes('打开插件配置'))

    expect(routerLink?.props('to')).toEqual({
      name: 'plugins',
      query: {
        plugin: 'builtin.persona-router',
      },
    })
  })
})

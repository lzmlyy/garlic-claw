import { computed, onMounted, ref, unref, watch } from 'vue'
import type {
  PluginPersonaCurrentInfo,
  PluginPersonaDeleteResult,
  PluginPersonaDetail,
  PluginPersonaDialogEntry,
  PluginPersonaSummary,
  PluginPersonaUpdateInput,
  PluginPersonaUpsertInput,
} from '@garlic-claw/shared'
import { useAsyncState } from '@/composables/use-async-state'
import { useChatStore } from '@/features/chat/store/chat'
import {
  activateConversationPersona,
  createPersona,
  deletePersona,
  loadCurrentPersona,
  loadPersona,
  loadPersonas,
  updatePersona,
} from './persona-settings.data'

export type PersonaListMode = 'all' | 'none' | 'selected'

export interface PersonaEditorDraft {
  id: string
  name: string
  description: string
  prompt: string
  customErrorMessage: string
  isDefault: boolean
  beginDialogs: PluginPersonaDialogEntry[]
  skillMode: PersonaListMode
  skillInput: string
  toolMode: PersonaListMode
  toolInput: string
}

/**
 * Persona 设置页的状态与行为。
 * 输入:
 * - 当前聊天 store 的选中会话
 * 输出:
 * - persona 列表、详情、创建/编辑/删除、应用到当前对话
 * 预期行为:
 * - 页面只负责渲染
 * - persona 的读取、编辑与应用统一收口到此 composable
 */
export function usePersonaSettings() {
  const chat = useChatStore()
  const requestState = useAsyncState(false)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const loadingCurrentPersona = ref(false)
  const loadingSelectedPersona = ref(false)
  const applyingPersona = ref(false)
  const savingPersona = ref(false)
  const deletingPersona = ref(false)
  const personas = ref<PluginPersonaSummary[]>([])
  const selectedPersonaId = ref<string | null>(null)
  const selectedPersona = ref<PluginPersonaDetail | null>(null)
  const currentPersona = ref<PluginPersonaCurrentInfo | null>(null)
  const editorMode = ref<'create' | 'edit'>('edit')
  const editorDraft = ref<PersonaEditorDraft>(createEmptyDraft())
  const deleteResult = ref<PluginPersonaDeleteResult | null>(null)

  const currentConversationId = computed<string | null>(() => unref(chat.currentConversationId) ?? null)
  const currentConversationTitle = computed(() => {
    const conversationId = currentConversationId.value
    if (!conversationId) {
      return null
    }

    const conversations = unref(chat.conversations) ?? []
    return conversations.find((conversation) => conversation.id === conversationId)?.title ?? null
  })
  const hasCurrentConversation = computed(() => Boolean(currentConversationId.value))
  const canApplySelectedPersona = computed(() => {
    if (!hasCurrentConversation.value || !selectedPersonaId.value) {
      return false
    }

    return currentPersona.value?.personaId !== selectedPersonaId.value
  })
  const canDeleteSelectedPersona = computed(() => {
    if (editorMode.value !== 'edit' || !selectedPersona.value) {
      return false
    }
    return selectedPersona.value.id !== 'builtin.default-assistant'
  })
  const selectedPersonaStatus = computed(() => {
    if (loadingCurrentPersona.value) {
      return '读取中...'
    }
    if (!currentPersona.value || !selectedPersona.value) {
      return '未读取到当前会话人设'
    }
    return currentPersona.value.personaId === selectedPersona.value.id
      ? '当前对话已使用此人设'
      : `当前使用：${currentPersona.value.name}`
  })

  onMounted(() => {
    void refreshAll()
  })

  watch(
    () => currentConversationId.value,
    (nextConversationId, previousConversationId) => {
      if (nextConversationId === previousConversationId) {
        return
      }

      void refreshCurrentPersona()
    },
    {
      flush: 'sync',
    },
  )

  async function refreshAll() {
    loading.value = true
    requestState.clearError()
    deleteResult.value = null
    try {
      personas.value = await loadPersonas()
      await refreshCurrentPersona()
      const nextSelectedPersonaId = pickSelectedPersonaId(
        personas.value,
        selectedPersonaId.value,
        currentPersona.value?.personaId,
      )
      if (nextSelectedPersonaId) {
        await selectPersona(nextSelectedPersonaId)
        return
      }

      beginCreatePersona()
    } catch (caughtError) {
      requestState.setError(caughtError, '加载 Persona 列表失败')
    } finally {
      loading.value = false
    }
  }

  async function refreshCurrentPersona() {
    const conversationId = currentConversationId.value
    loadingCurrentPersona.value = true
    requestState.clearError()
    try {
      const current = await loadCurrentPersona(conversationId ?? undefined)
      if (currentConversationId.value !== conversationId) {
        return
      }

      currentPersona.value = current
    } catch (caughtError) {
      if (currentConversationId.value !== conversationId) {
        return
      }

      currentPersona.value = null
      requestState.setError(caughtError, '加载当前 Persona 失败')
    } finally {
      if (currentConversationId.value === conversationId) {
        loadingCurrentPersona.value = false
      }
    }
  }

  async function selectPersona(personaId: string) {
    selectedPersonaId.value = personaId
    editorMode.value = 'edit'
    loadingSelectedPersona.value = true
    requestState.clearError()
    try {
      const detail = await loadPersona(personaId)
      if (selectedPersonaId.value !== personaId || editorMode.value !== 'edit') {
        return
      }

      selectedPersona.value = detail
      editorDraft.value = createDraftFromPersona(detail)
    } catch (caughtError) {
      if (selectedPersonaId.value !== personaId) {
        return
      }

      selectedPersona.value = null
      requestState.setError(caughtError, '加载 Persona 详情失败')
    } finally {
      if (selectedPersonaId.value === personaId) {
        loadingSelectedPersona.value = false
      }
    }
  }

  function beginCreatePersona() {
    editorMode.value = 'create'
    selectedPersonaId.value = null
    selectedPersona.value = null
    deleteResult.value = null
    editorDraft.value = createEmptyDraft()
  }

  function resetEditorDraft() {
    deleteResult.value = null
    if (editorMode.value === 'edit' && selectedPersona.value) {
      editorDraft.value = createDraftFromPersona(selectedPersona.value)
      return
    }
    editorDraft.value = createEmptyDraft()
  }

  function addBeginDialog() {
    editorDraft.value.beginDialogs.push({
      content: '',
      role: 'assistant',
    })
  }

  function removeBeginDialog(index: number) {
    editorDraft.value.beginDialogs.splice(index, 1)
  }

  async function savePersonaDraft() {
    requestState.clearError()
    deleteResult.value = null
    savingPersona.value = true
    try {
      const payload = createPayloadFromDraft(editorDraft.value)
      const detail = editorMode.value === 'create'
        ? await createPersona(payload)
        : await updatePersona(selectedPersonaId.value as string, createUpdatePayload(payload))
      personas.value = await loadPersonas()
      await refreshCurrentPersona()
      selectedPersona.value = detail
      selectedPersonaId.value = detail.id
      editorMode.value = 'edit'
      editorDraft.value = createDraftFromPersona(detail)
    } catch (caughtError) {
      requestState.setError(caughtError, editorMode.value === 'create' ? '创建 Persona 失败' : '保存 Persona 失败')
    } finally {
      savingPersona.value = false
    }
  }

  async function deleteSelectedPersona() {
    if (!selectedPersonaId.value) {
      return
    }

    requestState.clearError()
    deletingPersona.value = true
    try {
      deleteResult.value = await deletePersona(selectedPersonaId.value)
      personas.value = await loadPersonas()
      await refreshCurrentPersona()
      const nextSelectedPersonaId = pickSelectedPersonaId(
        personas.value,
        currentPersona.value?.personaId ?? deleteResult.value.fallbackPersonaId,
        currentPersona.value?.personaId,
      )
      if (nextSelectedPersonaId) {
        await selectPersona(nextSelectedPersonaId)
        return
      }
      beginCreatePersona()
    } catch (caughtError) {
      requestState.setError(caughtError, '删除 Persona 失败')
    } finally {
      deletingPersona.value = false
    }
  }

  async function applySelectedPersona() {
    if (!currentConversationId.value || !selectedPersonaId.value) {
      return
    }

    const conversationId = currentConversationId.value
    const personaId = selectedPersonaId.value
    applyingPersona.value = true
    requestState.clearError()
    try {
      const current = await activateConversationPersona(conversationId, personaId)
      if (currentConversationId.value !== conversationId) {
        return
      }

      currentPersona.value = current
      if (editorMode.value === 'edit' && selectedPersonaId.value) {
        await selectPersona(selectedPersonaId.value)
      }
    } catch (caughtError) {
      if (currentConversationId.value !== conversationId) {
        return
      }

      requestState.setError(caughtError, '应用 Persona 失败')
    } finally {
      if (currentConversationId.value === conversationId) {
        applyingPersona.value = false
      }
    }
  }

  return {
    loading,
    loadingCurrentPersona,
    loadingSelectedPersona,
    applyingPersona,
    savingPersona,
    deletingPersona,
    error,
    appError,
    personas,
    selectedPersonaId,
    selectedPersona,
    currentPersona,
    currentConversationId,
    currentConversationTitle,
    hasCurrentConversation,
    canApplySelectedPersona,
    canDeleteSelectedPersona,
    selectedPersonaStatus,
    editorMode,
    editorDraft,
    deleteResult,
    refreshAll,
    selectPersona,
    beginCreatePersona,
    resetEditorDraft,
    addBeginDialog,
    removeBeginDialog,
    savePersonaDraft,
    deleteSelectedPersona,
    applySelectedPersona,
  }
}

function createEmptyDraft(): PersonaEditorDraft {
  return {
    id: '',
    name: '',
    description: '',
    prompt: '',
    customErrorMessage: '',
    isDefault: false,
    beginDialogs: [],
    skillMode: 'all',
    skillInput: '',
    toolMode: 'all',
    toolInput: '',
  }
}

function createDraftFromPersona(persona: PluginPersonaDetail): PersonaEditorDraft {
  return {
    id: persona.id,
    name: persona.name,
    description: persona.description ?? '',
    prompt: persona.prompt,
    customErrorMessage: persona.customErrorMessage ?? '',
    isDefault: persona.isDefault,
    beginDialogs: persona.beginDialogs.map((entry) => ({ ...entry })),
    skillMode: readDraftListMode(persona.skillIds),
    skillInput: (persona.skillIds ?? []).join('\n'),
    toolMode: readDraftListMode(persona.toolNames),
    toolInput: (persona.toolNames ?? []).join('\n'),
  }
}

function readDraftListMode(value: string[] | null): PersonaListMode {
  if (value === null) {
    return 'all'
  }
  return value.length === 0 ? 'none' : 'selected'
}

function createPayloadFromDraft(draft: PersonaEditorDraft): PluginPersonaUpsertInput {
  return {
    beginDialogs: draft.beginDialogs
      .map((entry) => ({
        content: entry.content.trim(),
        role: entry.role,
      }))
      .filter((entry) => entry.content),
    customErrorMessage: readNullableTextValue(draft.customErrorMessage),
    description: readOptionalText(draft.description),
    id: draft.id.trim(),
    isDefault: draft.isDefault,
    name: draft.name.trim(),
    prompt: draft.prompt.trim(),
    skillIds: readScopedIdList(draft.skillMode, draft.skillInput),
    toolNames: readScopedIdList(draft.toolMode, draft.toolInput),
  }
}

function createUpdatePayload(payload: PluginPersonaUpsertInput): PluginPersonaUpdateInput {
  return {
    beginDialogs: payload.beginDialogs,
    customErrorMessage: payload.customErrorMessage,
    description: payload.description,
    isDefault: payload.isDefault,
    name: payload.name,
    prompt: payload.prompt,
    skillIds: payload.skillIds,
    toolNames: payload.toolNames,
  }
}

function readScopedIdList(mode: PersonaListMode, rawText: string): string[] | null {
  if (mode === 'all') {
    return null
  }
  if (mode === 'none') {
    return []
  }
  return [...new Set(
    rawText
      .split(/[\n,]/)
      .map((entry) => entry.trim())
      .filter(Boolean),
  )]
}

function pickSelectedPersonaId(
  personas: PluginPersonaSummary[],
  preferredPersonaId?: string | null,
  currentPersonaId?: string | null,
): string | null {
  const orderedPersonaIds = [preferredPersonaId, currentPersonaId, personas[0]?.id]
  for (const personaId of orderedPersonaIds) {
    if (!personaId) {
      continue
    }
    if (personas.some((persona) => persona.id === personaId)) {
      return personaId
    }
  }
  return null
}

function readOptionalText(value: string): string | undefined {
  const normalized = value.trim()
  return normalized || undefined
}

function readNullableTextValue(value: string): string | null {
  return readOptionalText(value) ?? null
}

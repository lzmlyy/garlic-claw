import { computed, onMounted, ref, unref, watch } from 'vue'
import type { PluginPersonaCurrentInfo, PluginPersonaSummary } from '@garlic-claw/shared'
import * as api from '../api'
import { useChatStore } from '../stores/chat'

/**
 * Persona 设置页的状态与行为。
 * 输入:
 * - 当前聊天 store 的选中会话
 * 输出:
 * - persona 列表、当前会话 persona、选择与应用动作
 * 预期行为:
 * - 页面只负责渲染
 * - persona 数据读取与应用逻辑统一收口到此 composable
 */
export function usePersonaSettings() {
  const chat = useChatStore()
  const loading = ref(false)
  const loadingCurrentPersona = ref(false)
  const applyingPersona = ref(false)
  const error = ref<string | null>(null)
  const personas = ref<PluginPersonaSummary[]>([])
  const selectedPersonaId = ref<string | null>(null)
  const currentPersona = ref<PluginPersonaCurrentInfo | null>(null)

  const currentConversationId = computed(() => {
    return (unref(chat.currentConversationId as never) ?? null) as string | null
  })
  const currentConversationTitle = computed(() => {
    const conversationId = currentConversationId.value
    if (!conversationId) {
      return null
    }

    const conversations = (unref(chat.conversations as never) ?? []) as Array<{
      id: string
      title: string
    }>
    return conversations.find((conversation) => conversation.id === conversationId)?.title ?? null
  })
  const selectedPersona = computed(() => {
    return personas.value.find((persona) => persona.id === selectedPersonaId.value) ?? null
  })
  const hasCurrentConversation = computed(() => Boolean(currentConversationId.value))
  const canApplySelectedPersona = computed(() => {
    if (!hasCurrentConversation.value || !selectedPersonaId.value) {
      return false
    }

    return currentPersona.value?.personaId !== selectedPersonaId.value
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
    error.value = null
    try {
      personas.value = await api.listPersonas()
      ensureSelectedPersona()
      await refreshCurrentPersona()
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '加载 Persona 列表失败')
    } finally {
      loading.value = false
    }
  }

  async function refreshCurrentPersona() {
    const conversationId = currentConversationId.value
    loadingCurrentPersona.value = true
    error.value = null
    try {
      const current = await api.getCurrentPersona(conversationId ?? undefined)
      if (currentConversationId.value !== conversationId) {
        return
      }

      currentPersona.value = current
      ensureSelectedPersona(current.personaId)
    } catch (caughtError) {
      if (currentConversationId.value !== conversationId) {
        return
      }

      currentPersona.value = null
      ensureSelectedPersona()
      error.value = toErrorMessage(caughtError, '加载当前 Persona 失败')
    } finally {
      if (currentConversationId.value === conversationId) {
        loadingCurrentPersona.value = false
      }
    }
  }

  function selectPersona(personaId: string) {
    selectedPersonaId.value = personaId
  }

  async function applySelectedPersona() {
    if (!currentConversationId.value || !selectedPersonaId.value) {
      return
    }

    const conversationId = currentConversationId.value
    const personaId = selectedPersonaId.value
    applyingPersona.value = true
    error.value = null
    try {
      const current = await api.activateConversationPersona(conversationId, personaId)
      if (currentConversationId.value !== conversationId) {
        return
      }

      currentPersona.value = current
      ensureSelectedPersona(current.personaId)
    } catch (caughtError) {
      if (currentConversationId.value !== conversationId) {
        return
      }

      error.value = toErrorMessage(caughtError, '应用 Persona 失败')
    } finally {
      if (currentConversationId.value === conversationId) {
        applyingPersona.value = false
      }
    }
  }

  function ensureSelectedPersona(preferredPersonaId?: string | null) {
    const preferredId = preferredPersonaId
      ?? currentPersona.value?.personaId
      ?? selectedPersonaId.value
    const stillExists = preferredId
      ? personas.value.some((persona) => persona.id === preferredId)
      : false

    if (stillExists) {
      selectedPersonaId.value = preferredId ?? null
      return
    }

    selectedPersonaId.value = personas.value[0]?.id ?? null
  }

  return {
    loading,
    loadingCurrentPersona,
    applyingPersona,
    error,
    personas,
    selectedPersonaId,
    selectedPersona,
    currentPersona,
    currentConversationId,
    currentConversationTitle,
    hasCurrentConversation,
    canApplySelectedPersona,
    refreshAll,
    selectPersona,
    applySelectedPersona,
  }
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }

  return fallback
}

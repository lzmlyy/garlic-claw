import { computed, ref, watch } from 'vue'
import type {
  ConversationSkillState,
  SkillDetail,
  UpdateSkillGovernancePayload,
} from '@garlic-claw/shared'
import * as api from '../api'
import type { useChatStore } from '../stores/chat'

export function useSkillManagement(chat: ReturnType<typeof useChatStore>) {
  const loading = ref(false)
  const refreshing = ref(false)
  const error = ref<string | null>(null)
  const searchKeyword = ref('')
  const skills = ref<SkillDetail[]>([])
  const selectedSkillId = ref<string | null>(null)
  const conversationSkillState = ref<ConversationSkillState | null>(null)
  const mutatingSkillId = ref<string | null>(null)
  let conversationSkillRequestId = 0

  const filteredSkills = computed(() => {
    const keyword = searchKeyword.value.trim().toLowerCase()
    if (!keyword) {
      return skills.value
    }

    return skills.value.filter((skill) => {
      const haystack = [
        skill.id,
        skill.name,
        skill.description,
        skill.promptPreview,
        ...skill.tags,
      ].join(' ').toLowerCase()
      return haystack.includes(keyword)
    })
  })
  const selectedSkill = computed(() => {
    const currentSkillId = selectedSkillId.value
    if (currentSkillId) {
      return filteredSkills.value.find((skill) => skill.id === currentSkillId)
        ?? skills.value.find((skill) => skill.id === currentSkillId)
        ?? null
    }

    return filteredSkills.value[0] ?? skills.value[0] ?? null
  })
  const totalCount = computed(() => skills.value.length)
  const activeCount = computed(() => conversationSkillState.value?.activeSkillIds.length ?? 0)
  const restrictedCount = computed(() =>
    skills.value.filter((skill) => skill.toolPolicy.allow.length > 0 || skill.toolPolicy.deny.length > 0).length,
  )
  const packageCount = computed(() =>
    skills.value.filter((skill) => skill.assets.length > 0).length,
  )
  const disabledCount = computed(() =>
    skills.value.filter((skill) => !skill.governance.enabled).length,
  )

  watch(
    () => chat.currentConversationId,
    async (conversationId) => {
      await refreshConversationSkillState(conversationId)
    },
    { immediate: true },
  )

  void loadSkills()

  function replaceSkills(nextSkills: SkillDetail[]) {
    skills.value = nextSkills
    selectedSkillId.value = replaceSelectedSkillId(nextSkills, selectedSkillId.value)
  }

  async function loadSkills() {
    loading.value = true
    error.value = null

    try {
      replaceSkills(await api.listSkills())
    } catch (cause) {
      error.value = toErrorMessage(cause, '加载 skills 失败')
    } finally {
      loading.value = false
    }
  }

  async function refreshAll() {
    refreshing.value = true
    error.value = null

    try {
      replaceSkills(await api.refreshSkills())
      await refreshConversationSkillState(chat.currentConversationId)
    } catch (cause) {
      error.value = toErrorMessage(cause, '刷新 skills 失败')
    } finally {
      refreshing.value = false
    }
  }

  async function toggleSkill(skillId: string) {
    const currentIds = conversationSkillState.value?.activeSkillIds ?? []
    const activeSet = new Set(currentIds)
    if (activeSet.has(skillId)) {
      activeSet.delete(skillId)
    } else {
      activeSet.add(skillId)
    }

    await persistConversationSkills([...activeSet])
  }

  async function clearConversationSkills() {
    await persistConversationSkills([])
  }

  function selectSkill(skillId: string) {
    selectedSkillId.value = skillId
  }

  async function updateSkillGovernance(
    skillId: string,
    patch: UpdateSkillGovernancePayload,
  ) {
    mutatingSkillId.value = skillId
    error.value = null

    try {
      const updated = await api.updateSkillGovernance(skillId, patch)
      replaceSkills(applySkillUpdate(skills.value, updated))
      await refreshConversationSkillState(chat.currentConversationId)
    } catch (cause) {
      error.value = toErrorMessage(cause, '更新 skill 治理失败')
    } finally {
      if (mutatingSkillId.value === skillId) {
        mutatingSkillId.value = null
      }
    }
  }

  async function persistConversationSkills(activeSkillIds: string[]) {
    const conversationId = chat.currentConversationId
    if (!conversationId) {
      return
    }

    error.value = null

    try {
      conversationSkillState.value = await api.updateConversationSkills(conversationId, {
        activeSkillIds,
      })
    } catch (cause) {
      error.value = toErrorMessage(cause, '更新当前会话 skills 失败')
    }
  }

  async function refreshConversationSkillState(
    conversationId: string | null = chat.currentConversationId,
  ) {
    const requestId = ++conversationSkillRequestId
    if (!conversationId) {
      conversationSkillState.value = null
      return
    }

    try {
      const state = await api.getConversationSkills(conversationId)
      if (isConversationSkillRequestStale(
        requestId,
        conversationSkillRequestId,
        conversationId,
        chat.currentConversationId,
      )) {
        return
      }

      conversationSkillState.value = state
    } catch {
      if (isConversationSkillRequestStale(
        requestId,
        conversationSkillRequestId,
        conversationId,
        chat.currentConversationId,
      )) {
        return
      }

      conversationSkillState.value = createEmptyConversationSkillState()
    }
  }

  return {
    loading,
    refreshing,
    error,
    mutatingSkillId,
    searchKeyword,
    skills,
    filteredSkills,
    selectedSkillId,
    selectedSkill,
    conversationSkillState,
    totalCount,
    activeCount,
    restrictedCount,
    packageCount,
    disabledCount,
    selectSkill,
    toggleSkill,
    clearConversationSkills,
    updateSkillGovernance,
    refreshAll,
  }
}

function applySkillUpdate(skills: SkillDetail[], updated: SkillDetail): SkillDetail[] {
  const index = skills.findIndex((skill) => skill.id === updated.id)
  if (index === -1) {
    return skills
  }

  const next = [...skills]
  next.splice(index, 1, updated)
  return next
}

function replaceSelectedSkillId(
  skills: SkillDetail[],
  currentSkillId: string | null,
): string | null {
  if (currentSkillId && skills.some((skill) => skill.id === currentSkillId)) {
    return currentSkillId
  }

  return skills[0]?.id ?? null
}

function createEmptyConversationSkillState(): ConversationSkillState {
  return {
    activeSkillIds: [],
    activeSkills: [],
  }
}

function isConversationSkillRequestStale(
  requestId: number,
  activeRequestId: number,
  requestedConversationId: string,
  currentConversationId: string | null,
): boolean {
  return requestId !== activeRequestId || currentConversationId !== requestedConversationId
}

function toErrorMessage(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

import { computed, onMounted, ref, shallowRef } from 'vue'
import {
  type ApiKeyScope,
  type ApiKeySummary,
  type CreateApiKeyResponse,
} from '@garlic-claw/shared'
import { useAsyncState } from '@/composables/use-async-state'
import { ValidationError } from '@/utils/error'
import {
  createApiKeyRecord,
  loadApiKeys,
  revokeApiKeyRecord,
} from './api-key-management.data'

interface ApiKeyScopeOption {
  value: ApiKeyScope
  label: string
  description: string
}

export function useApiKeyManagement() {
  const requestState = useAsyncState(false)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const submitting = ref(false)
  const createdToken = ref<string | null>(null)
  const keys = shallowRef<ApiKeySummary[]>([])
  const formName = ref('')
  const formExpiresAt = ref('')
  const selectedScopes = ref<ApiKeyScope[]>([...DEFAULT_API_KEY_SCOPES])
  const scopeOptions = API_KEY_SCOPE_OPTIONS
  const orderedKeys = computed(() =>
    [...keys.value].sort((left, right) => {
      const revokedDiff = Number(Boolean(left.revokedAt)) - Number(Boolean(right.revokedAt))
      if (revokedDiff !== 0) {
        return revokedDiff
      }

      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
    }),
  )
  const activeCount = computed(() =>
    keys.value.filter((key) => !key.revokedAt).length,
  )
  const revokedCount = computed(() =>
    keys.value.filter((key) => Boolean(key.revokedAt)).length,
  )

  onMounted(() => {
    void refreshAll()
  })

  async function refreshAll() {
    loading.value = true
    requestState.clearError()
    try {
      keys.value = await loadApiKeys()
    } catch (caughtError) {
      requestState.setError(caughtError, '加载 API key 失败')
    } finally {
      loading.value = false
    }
  }

  async function submitCreate() {
    if (!formName.value.trim()) {
      requestState.setError(new ValidationError('请先填写 key 名称'), '请先填写 key 名称')
      return
    }
    if (selectedScopes.value.length === 0) {
      requestState.setError(new ValidationError('至少选择一个 scope'), '至少选择一个 scope')
      return
    }

    submitting.value = true
    requestState.clearError()
    try {
      const created = await createApiKeyRecord({
        name: formName.value.trim(),
        scopes: [...selectedScopes.value],
        ...(formExpiresAt.value
          ? { expiresAt: new Date(formExpiresAt.value).toISOString() }
          : {}),
      })
      createdToken.value = created.token
      keys.value = [stripToken(created), ...keys.value]
      formName.value = ''
      formExpiresAt.value = ''
      selectedScopes.value = [...DEFAULT_API_KEY_SCOPES]
    } catch (caughtError) {
      requestState.setError(caughtError, '创建 API key 失败')
    } finally {
      submitting.value = false
    }
  }

  async function revoke(id: string) {
    requestState.clearError()
    try {
      const revoked = await revokeApiKeyRecord(id)
      keys.value = keys.value.map((key) => (key.id === id ? revoked : key))
    } catch (caughtError) {
      requestState.setError(caughtError, '撤销 API key 失败')
    }
  }

  function toggleScope(scope: ApiKeyScope) {
    if (selectedScopes.value.includes(scope)) {
      selectedScopes.value = selectedScopes.value.filter((item) => item !== scope)
      return
    }

    selectedScopes.value = [...selectedScopes.value, scope]
  }

  function clearCreatedToken() {
    createdToken.value = null
  }

  return {
    loading,
    submitting,
    error,
    appError,
    createdToken,
    keys: orderedKeys,
    formName,
    formExpiresAt,
    selectedScopes,
    scopeOptions,
    activeCount,
    revokedCount,
    refreshAll,
    submitCreate,
    revoke,
    toggleScope,
    clearCreatedToken,
  }
}

const API_KEY_SCOPE_OPTIONS: ApiKeyScopeOption[] = [
  {
    value: 'plugin.route.invoke',
    label: '插件路由调用',
    description: '允许外部系统进入 plugin-routes。',
  },
  {
    value: 'conversation.message.write',
    label: '会话消息写回',
    description: '允许向现有对话追加 assistant 消息。',
  },
]

const DEFAULT_API_KEY_SCOPES: ApiKeyScope[] = [
  'plugin.route.invoke',
  'conversation.message.write',
]

function stripToken(created: CreateApiKeyResponse): ApiKeySummary {
  const { token: _token, ...summary } = created
  return summary
}

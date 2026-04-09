import { computed, onMounted, ref, shallowRef } from 'vue'
import type {
  McpConfigSnapshot,
  McpServerConfig,
} from '@garlic-claw/shared'
import { useAsyncState } from '@/composables/use-async-state'
import {
  createMcpServerConfig,
  deleteMcpServerConfig,
  loadMcpConfigSnapshot,
  updateMcpServerConfig,
} from './mcp-config-management.data'

const emptySnapshot = (): McpConfigSnapshot => ({
  configPath: '',
  servers: [],
})

export function useMcpConfigManagement() {
  const requestState = useAsyncState(false)
  const loading = requestState.loading
  const error = requestState.error
  const appError = requestState.appError
  const saving = ref(false)
  const deleting = ref(false)
  const notice = ref<string | null>(null)
  const snapshot = shallowRef<McpConfigSnapshot>(emptySnapshot())
  const selectedServerName = ref<string | null>(null)

  const servers = computed(() => snapshot.value.servers)
  const selectedServer = computed(() =>
    servers.value.find((server) => server.name === selectedServerName.value) ?? null,
  )

  onMounted(() => {
    void refresh()
  })

  async function refresh(preferredName = selectedServerName.value) {
    loading.value = true
    requestState.clearError()
    try {
      const nextSnapshot = await loadMcpConfigSnapshot()
      snapshot.value = nextSnapshot
      const fallback = nextSnapshot.servers.find((server) => server.name === preferredName)
        ?? nextSnapshot.servers[0]
        ?? null
      selectedServerName.value = fallback?.name ?? null
    } catch (caughtError) {
      requestState.setError(caughtError, '加载 MCP 配置失败')
    } finally {
      loading.value = false
    }
  }

  function selectServer(name: string | null) {
    selectedServerName.value = servers.value.some((server) => server.name === name)
      ? name
      : null
  }

  async function createServer(input: McpServerConfig) {
    saving.value = true
    requestState.clearError()
    notice.value = null
    try {
      const saved = await createMcpServerConfig(input)
      notice.value = 'MCP server 已创建'
      await refresh(saved.name)
      return saved
    } catch (caughtError) {
      throw requestState.setError(caughtError, '创建 MCP server 失败')
    } finally {
      saving.value = false
    }
  }

  async function updateServer(currentName: string, input: McpServerConfig) {
    saving.value = true
    requestState.clearError()
    notice.value = null
    try {
      const saved = await updateMcpServerConfig(currentName, input)
      notice.value = 'MCP server 已更新'
      await refresh(saved.name)
      return saved
    } catch (caughtError) {
      throw requestState.setError(caughtError, '更新 MCP server 失败')
    } finally {
      saving.value = false
    }
  }

  async function deleteServer(name: string) {
    deleting.value = true
    requestState.clearError()
    notice.value = null
    try {
      const result = await deleteMcpServerConfig(name)
      notice.value = 'MCP server 已删除'
      await refresh()
      return result
    } catch (caughtError) {
      throw requestState.setError(caughtError, '删除 MCP server 失败')
    } finally {
      deleting.value = false
    }
  }

  return {
    loading,
    saving,
    deleting,
    error,
    appError,
    notice,
    snapshot,
    servers,
    selectedServerName,
    selectedServer,
    refresh,
    selectServer,
    createServer,
    updateServer,
    deleteServer,
  }
}

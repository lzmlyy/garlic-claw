import { computed, onMounted, ref, shallowRef } from 'vue'
import type {
  McpConfigSnapshot,
  McpServerConfig,
} from '@garlic-claw/shared'
import * as api from '../api'

const emptySnapshot = (): McpConfigSnapshot => ({
  configPath: '',
  servers: [],
})

export function useMcpConfigManagement() {
  const loading = ref(false)
  const saving = ref(false)
  const deleting = ref(false)
  const error = ref<string | null>(null)
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
    error.value = null
    try {
      const nextSnapshot = await api.listMcpServers()
      snapshot.value = nextSnapshot
      const fallback = nextSnapshot.servers.find((server) => server.name === preferredName)
        ?? nextSnapshot.servers[0]
        ?? null
      selectedServerName.value = fallback?.name ?? null
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '加载 MCP 配置失败')
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
    error.value = null
    notice.value = null
    try {
      const saved = await api.createMcpServer(input)
      notice.value = 'MCP server 已创建'
      await refresh(saved.name)
      return saved
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '创建 MCP server 失败')
      throw caughtError
    } finally {
      saving.value = false
    }
  }

  async function updateServer(currentName: string, input: McpServerConfig) {
    saving.value = true
    error.value = null
    notice.value = null
    try {
      const saved = await api.updateMcpServer(currentName, input)
      notice.value = 'MCP server 已更新'
      await refresh(saved.name)
      return saved
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '更新 MCP server 失败')
      throw caughtError
    } finally {
      saving.value = false
    }
  }

  async function deleteServer(name: string) {
    deleting.value = true
    error.value = null
    notice.value = null
    try {
      const result = await api.deleteMcpServer(name)
      notice.value = 'MCP server 已删除'
      await refresh()
      return result
    } catch (caughtError) {
      error.value = toErrorMessage(caughtError, '删除 MCP server 失败')
      throw caughtError
    } finally {
      deleting.value = false
    }
  }

  return {
    loading,
    saving,
    deleting,
    error,
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

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error
    ? error.message
    : fallback
}

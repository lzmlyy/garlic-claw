<template>
  <section class="panel-section mcp-config-panel">
    <p v-if="panelError" class="page-banner error">{{ panelError }}</p>

    <div class="mcp-workspace">
      <aside class="mcp-server-sidebar">
        <div class="sidebar-header">
          <div class="sidebar-header-row">
            <span class="sidebar-title">MCP Server</span>
            <span v-if="!loading && servers.length > 0" class="sidebar-count">{{ filteredServers.length }} 个</span>
          </div>
          <p v-if="!loading && servers.length > 0" class="sidebar-subtitle">带变量 {{ withEnvCount }} 个</p>
        </div>

        <div v-if="!loading && servers.length > 0" class="sidebar-tools">
          <ElInput
            v-model="searchKeyword"
            class="field-input"
            data-test="mcp-sidebar-search"
            placeholder="搜索名称、命令或参数"
          />
          <p v-if="isCreating" class="sidebar-inline-hint">
            当前正在新建 Server，保存后会自动刷新并选中。
          </p>
        </div>

        <p v-if="selectedServerHidden" class="sidebar-hint">
          当前选中的 Server 未命中筛选条件。
        </p>

        <div v-if="loading" class="sidebar-state">
          加载中...
        </div>
        <div v-else-if="servers.length === 0" class="sidebar-state">
          还没有 MCP server 配置。
        </div>
        <div v-else-if="filteredServers.length === 0" class="sidebar-state">
          当前筛选下没有匹配的 MCP server。
        </div>
        <div v-else class="mcp-server-list">
          <button
            v-for="server in filteredServers"
            :key="server.name"
            type="button"
            class="mcp-server-row"
            :class="{ active: !isCreating && selectedServerName === server.name }"
            @click="selectExisting(server.name)"
          >
            <div class="mcp-server-row-top">
              <strong>{{ server.name }}</strong>
              <span class="mcp-server-badge">{{ server.command }}</span>
            </div>
            <p class="mcp-server-command">
              {{ renderCommandPreview(server) }}
            </p>
            <div class="mcp-server-meta">
              <span>{{ server.args.length }} 个参数</span>
              <span>{{ Object.keys(server.env).length }} 个环境变量</span>
            </div>
          </button>
        </div>
      </aside>

      <div class="mcp-detail">
        <header class="mcp-detail-header">
          <div class="mcp-detail-copy">
            <h2>{{ view === 'manage' ? 'MCP 配置' : 'MCP 日志' }}</h2>
            <p>
              {{ view === 'manage'
                ? '维护当前 Server 的启动命令、参数和环境变量。'
                : '查看当前 Server 的事件记录，并按需调整日志落盘策略。' }}
            </p>
          </div>
        </header>

        <div v-if="view === 'manage'" class="mcp-editor">
          <label class="mcp-field">
            <span>名称</span>
            <ElInput
              v-model="draftName"
              data-test="mcp-name-input"
              placeholder="weather-server"
            />
          </label>
          <label class="mcp-field">
            <span>命令</span>
            <ElInput
              v-model="draftCommand"
              data-test="mcp-command-input"
              placeholder="npx"
            />
          </label>
          <label class="mcp-field">
            <span>参数</span>
            <ElInput
              v-model="draftArgsText"
              data-test="mcp-args-input"
              type="textarea"
              :rows="6"
              placeholder="-y&#10;tavily-mcp@latest"
            />
            <small>每行一个参数，保存时会自动去掉空行。</small>
          </label>

          <section class="mcp-env-panel mcp-field-span">
            <div class="mcp-env-header">
              <div>
                <span>环境变量</span>
                <p>支持直接值或 `${VAR_NAME}` 占位符。</p>
              </div>
              <ElButton class="action-icon-button" title="新增变量" @click="addEnvRow">
                <Icon :icon="addCircleBold" class="action-icon" aria-hidden="true" />
              </ElButton>
            </div>

            <div v-if="envRows.length === 0" class="sidebar-state">
              没有环境变量。
            </div>
            <div v-else class="mcp-env-list">
              <div
                v-for="(entry, index) in envRows"
                :key="entry.id"
                class="mcp-env-row"
              >
                <div class="mcp-env-inputs">
                  <ElInput
                    :data-test="`mcp-env-key-${index}`"
                    v-model="entry.key"
                    placeholder="TAVILY_API_KEY"
                  />
                  <ElInput
                    :data-test="`mcp-env-value-${index}`"
                    v-model="entry.value"
                    :placeholder="entry.usesStoredSecret ? '输入新的 secret' : '${TAVILY_API_KEY}'"
                  />
                  <ElButton
                    :data-test="`mcp-env-secret-toggle-${index}`"
                    class="mcp-env-mode-button"
                    :type="entry.usesStoredSecret ? 'primary' : 'default'"
                    @click="toggleStoredSecret(index)"
                  >
                    {{ entry.usesStoredSecret ? '本地 secret' : '普通值 / 引用' }}
                  </ElButton>
                  <ElButton
                    data-test="mcp-env-delete-button"
                    class="action-icon-button danger-icon-button mcp-env-delete-button"
                    title="删除"
                    :disabled="envRows.length === 1"
                    @click="removeEnvRow(index)"
                  >
                    <Icon :icon="trashBinMinimalisticBold" class="action-icon" aria-hidden="true" />
                  </ElButton>
                </div>
                <p
                  v-if="entry.usesStoredSecret && entry.hasStoredValue && !entry.value.trim()"
                  class="sidebar-inline-hint"
                >
                  已保存本地 secret。留空则保留，输入新值则覆盖。
                </p>
              </div>
            </div>
          </section>

          <div class="mcp-editor-actions">
            <p class="sidebar-inline-hint" :data-test="saving ? 'mcp-autosave-saving' : 'mcp-autosave-idle'">
              {{ saving ? '正在自动保存...' : panelError ? panelError : '修改会自动保存。' }}
            </p>
            <ElButton
              v-if="!isCreating && selectedServer"
              type="danger"
              class="danger-icon-button"
              data-test="mcp-delete-button"
              :title="deleting ? '删除中...' : '删除 Server'"
              :disabled="deleting"
              @click="removeSelectedServer"
            >
              <Icon :icon="trashBinMinimalisticBold" class="action-icon" aria-hidden="true" />
              </ElButton>
          </div>
        </div>

        <div v-else-if="selectedServer" class="mcp-log-panel">
          <EventLogSettingsPanel
            v-if="showLogSettings"
            :settings="selectedServer.eventLog"
            :saving="savingEventLog"
            title="MCP 日志设置"
            description="此 MCP server 的事件日志会写入 log/mcp/<serverName>/ 目录。"
            @save="saveServerEventLog"
          />
          <EventLogPanel
            title="MCP 事件日志"
            description="查看此 server 最近的事件记录。"
            :events="eventLogs"
            :loading="eventLoading"
            :query="eventQuery"
            :next-cursor="eventNextCursor"
            @refresh="refreshServerEvents"
            @load-more="loadMoreServerEvents"
          />
        </div>

        <div v-else class="sidebar-state mcp-log-empty">
          请先在配置视图中创建或选择一个 MCP server。
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import addCircleBold from '@iconify-icons/solar/add-circle-bold'
import trashBinMinimalisticBold from '@iconify-icons/solar/trash-bin-minimalistic-bold'
import { Icon } from '@iconify/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ElButton, ElInput } from 'element-plus'
import type { McpServerConfig } from '@garlic-claw/shared'
import EventLogPanel from '@/modules/tools/components/EventLogPanel.vue'
import EventLogSettingsPanel from '@/modules/tools/components/EventLogSettingsPanel.vue'
import { useMcpConfigManagement } from '@/modules/tools/composables/use-mcp-config-management'

const props = withDefaults(defineProps<{
  preferredServerName?: string | null
  view?: 'manage' | 'logs'
}>(), {
  view: 'manage',
})

const emit = defineEmits<{
  changed: []
}>()

interface EnvRow {
  id: number
  key: string
  value: string
  usesStoredSecret: boolean
  hasStoredValue: boolean
}

const {
  loading,
  saving,
  savingEventLog,
  deleting,
  servers,
  selectedServerName,
  selectedServer,
  eventLoading,
  eventLogs,
  eventQuery,
  eventNextCursor,
  refresh,
  selectServer,
  createServer,
  updateServer,
  deleteServer,
  saveServerEventLog,
  refreshServerEvents,
  loadMoreServerEvents,
} = useMcpConfigManagement()

const draftName = ref('')
const draftCommand = ref('')
const draftArgsText = ref('')
const envRows = ref<EnvRow[]>([])
const panelError = ref<string | null>(null)
const isCreating = ref(false)
const showLogSettings = ref(false)
const searchKeyword = ref('')
const committedDraftSignature = ref<string | null>(null)
const pendingDraftSignature = ref<string | null>(null)
const failedDraftSignature = ref<string | null>(null)
const autoSaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const hydratedServerName = ref<string | null>(null)
let envRowId = 0
const MCP_AUTO_SAVE_DEBOUNCE_MS = 500
const MCP_AUTO_SAVE_RETRY_MS = 1500

const normalizedKeyword = computed(() =>
  searchKeyword.value.trim().toLocaleLowerCase(),
)
const filteredServers = computed(() =>
  servers.value.filter((server) => matchesServer(server, normalizedKeyword.value)),
)
const withEnvCount = computed(() =>
  servers.value.filter((server) => Object.keys(server.env).length > 0).length,
)
const selectedServerHidden = computed(() =>
  !isCreating.value
  && !!selectedServerName.value
  && !filteredServers.value.some((server) => server.name === selectedServerName.value),
)

watch(
  [() => props.preferredServerName, servers],
  ([nextName]) => {
    if (!nextName) {
      return
    }

    if (servers.value.some((server) => server.name === nextName)) {
      isCreating.value = false
      selectServer(nextName)
    }
  },
  { immediate: true },
)

watch(
  selectedServer,
  (server) => {
    if (isCreating.value) {
      return
    }

    if (!server) {
      hydratedServerName.value = null
      committedDraftSignature.value = null
      pendingDraftSignature.value = null
      failedDraftSignature.value = null
      resetDraft()
      return
    }

    const nextSignature = serializeServerDraft(server)
    const selectionChanged = hydratedServerName.value !== server.name
    if (selectionChanged) {
      applyCommittedServer(server)
      return
    }
    if (
      pendingDraftSignature.value
      && pendingDraftSignature.value !== nextSignature
    ) {
      return
    }
    if (
      !pendingDraftSignature.value
      && readDraftSignature() !== committedDraftSignature.value
    ) {
      return
    }
    applyCommittedServer(server)
  },
  { immediate: true },
)

watch(
  [draftName, draftCommand, draftArgsText, envRows],
  () => {
    panelError.value = null
    if (
      failedDraftSignature.value
      && failedDraftSignature.value !== readDraftSignature()
    ) {
      failedDraftSignature.value = null
    }
    scheduleAutoSave()
  },
  { deep: true },
)

watch(
  saving,
  (isSaving) => {
    if (isSaving) {
      return
    }
    if (hasPendingDraftToPersist()) {
      scheduleAutoSave(0)
    }
  },
)

onBeforeUnmount(() => {
  clearAutoSaveTimer()
})

function startCreate() {
  clearAutoSaveTimer()
  isCreating.value = true
  panelError.value = null
  showLogSettings.value = false
  hydratedServerName.value = null
  committedDraftSignature.value = null
  pendingDraftSignature.value = null
  failedDraftSignature.value = null
  resetDraft()
  selectServer(null)
}

function selectExisting(name: string) {
  clearAutoSaveTimer()
  isCreating.value = false
  panelError.value = null
  showLogSettings.value = false
  selectServer(name)
}

function addEnvRow() {
  envRows.value.push(createEnvRow())
}

function removeEnvRow(index: number) {
  if (envRows.value.length === 1) {
    envRows.value[0] = createEnvRow()
    return
  }

  envRows.value.splice(index, 1)
}

function toggleStoredSecret(index: number) {
  const entry = envRows.value[index]
  if (!entry) {
    return
  }
  entry.usesStoredSecret = !entry.usesStoredSecret
  if (!entry.usesStoredSecret) {
    entry.hasStoredValue = false
  }
}

async function removeSelectedServer() {
  if (!selectedServer.value) {
    return
  }

  panelError.value = null
  try {
    await deleteServer(selectedServer.value.name)
    if (servers.value.length === 0) {
      startCreate()
    }
    emit('changed')
  } catch (caughtError) {
    panelError.value = caughtError instanceof Error
      ? caughtError.message
      : '删除 MCP server 失败'
  }
}

function buildPayload(): McpServerConfig {
  const name = draftName.value.trim()
  const command = draftCommand.value.trim()
  if (!name) {
    throw new Error('名称不能为空')
  }
  if (!command) {
    throw new Error('命令不能为空')
  }

  const envEntries = envRows.value
    .map((entry) => ({
      key: entry.key.trim(),
      value: entry.value.trim(),
      usesStoredSecret: entry.usesStoredSecret,
      hasStoredValue: entry.hasStoredValue,
    }))
    .filter((entry) => entry.key.length > 0)
  const storedSecretEntries = envEntries
    .filter((entry) => entry.usesStoredSecret && (entry.value.length > 0 || entry.hasStoredValue))
    .map((entry) => ({
      key: entry.key,
      value: entry.value,
      source: 'stored-secret' as const,
      ...(entry.hasStoredValue ? { hasStoredValue: true } : {}),
    }))

  return {
    name,
    command,
    args: draftArgsText.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    env: Object.fromEntries(
      envEntries
        .filter((entry) => !entry.usesStoredSecret && entry.value.length > 0)
        .map((entry) => [entry.key, entry.value] as const),
    ),
    ...(storedSecretEntries.length > 0 ? { envEntries: storedSecretEntries } : {}),
    eventLog: selectedServer.value?.eventLog ?? {
      maxFileSizeMb: 1,
    },
  }
}

function tryBuildPayload() {
  try {
    return buildPayload()
  } catch {
    return null
  }
}

function matchesServer(server: McpServerConfig, keyword: string): boolean {
  if (!keyword) {
    return true
  }

  const haystack = [
    server.name,
    server.command,
    server.args.join(' '),
    ...Object.keys(server.env),
    ...Object.values(server.env),
  ]
    .join(' ')
    .toLocaleLowerCase()

  return haystack.includes(keyword)
}

function renderCommandPreview(server: McpServerConfig): string {
  const args = server.args.join(' ')
  return args ? `${server.command} ${args}` : server.command
}

function applyServerToDraft(server: McpServerConfig) {
  draftName.value = server.name
  draftCommand.value = server.command
  draftArgsText.value = server.args.join('\n')
  envRows.value = (server.envEntries && server.envEntries.length > 0
    ? server.envEntries.map((entry) => createEnvRow(
      entry.key,
      entry.source === 'stored-secret' ? '' : entry.value,
      entry.source === 'stored-secret',
      entry.hasStoredValue === true,
    ))
    : Object.entries(server.env).map(([key, value]) => createEnvRow(key, value)))
  if (envRows.value.length === 0) {
    envRows.value = [createEnvRow()]
  }
}

function resetDraft() {
  draftName.value = ''
  draftCommand.value = ''
  draftArgsText.value = ''
  envRows.value = [createEnvRow()]
}

function createEnvRow(
  key = '',
  value = '',
  usesStoredSecret = false,
  hasStoredValue = false,
): EnvRow {
  envRowId += 1
  return {
    id: envRowId,
    key,
    value,
    usesStoredSecret,
    hasStoredValue,
  }
}

function scheduleAutoSave(delayMs = MCP_AUTO_SAVE_DEBOUNCE_MS) {
  scheduleDraftPersist(delayMs, false)
}

function scheduleFailedDraftRetry(delayMs = MCP_AUTO_SAVE_RETRY_MS) {
  scheduleDraftPersist(delayMs, true)
}

function scheduleDraftPersist(
  delayMs: number,
  allowFailedRetry: boolean,
) {
  if (props.view !== 'manage') {
    return
  }
  clearAutoSaveTimer()
  autoSaveTimer.value = setTimeout(() => {
    autoSaveTimer.value = null
    if (saving.value || deleting.value) {
      return
    }
    if (!hasPendingDraftToPersist(allowFailedRetry)) {
      return
    }
    void persistDraft(allowFailedRetry)
  }, delayMs)
}

function clearAutoSaveTimer() {
  if (!autoSaveTimer.value) {
    return
  }
  clearTimeout(autoSaveTimer.value)
  autoSaveTimer.value = null
}

function hasPendingDraftToPersist(allowFailedRetry = false) {
  const signature = readDraftSignature()
  if (!signature) {
    return false
  }
  if (signature === committedDraftSignature.value) {
    return false
  }
  if (signature === pendingDraftSignature.value) {
    return false
  }
  if (!allowFailedRetry && signature === failedDraftSignature.value) {
    return false
  }
  return true
}

function readDraftSignature() {
  const payload = tryBuildPayload()
  return payload ? serializeServerDraft(payload) : null
}

function serializeServerDraft(server: McpServerConfig) {
  return JSON.stringify({
    args: [...server.args],
    command: server.command,
    env: Object.fromEntries(
      Object.entries(server.env)
        .sort(([left], [right]) => left.localeCompare(right)),
    ),
    envEntries: [...(server.envEntries ?? [])]
      .map((entry) => ({
        key: entry.key,
        source: entry.source,
        value: entry.value,
        ...(entry.hasStoredValue ? { hasStoredValue: true } : {}),
      }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    eventLog: server.eventLog,
    name: server.name,
  })
}

function applyCommittedServer(server: McpServerConfig) {
  applyServerToDraft(server)
  hydratedServerName.value = server.name
  committedDraftSignature.value = serializeServerDraft(server)
  pendingDraftSignature.value = null
  failedDraftSignature.value = null
}

function applyPersistedServer(server: McpServerConfig) {
  applyServerToDraft(server)
  hydratedServerName.value = server.name
  committedDraftSignature.value = serializeServerDraft(server)
  pendingDraftSignature.value = committedDraftSignature.value
  failedDraftSignature.value = null
}

async function persistDraft(allowFailedRetry = false) {
  const payload = tryBuildPayload()
  if (!payload) {
    return
  }

  const draftSignature = serializeServerDraft(payload)
  let shouldKeepPendingSignature = false
  if (
    !allowFailedRetry
    && draftSignature === failedDraftSignature.value
  ) {
    return
  }
  pendingDraftSignature.value = draftSignature
  panelError.value = null
  try {
    if (isCreating.value || !selectedServer.value) {
      const created = await createServer(payload) ?? payload
      isCreating.value = false
      applyPersistedServer(created)
      shouldKeepPendingSignature = true
      await refresh(created.name).catch(() => undefined)
      emit('changed')
      return
    }

    const saved = await updateServer(selectedServer.value.name, payload) ?? payload
    applyPersistedServer(saved)
    shouldKeepPendingSignature = true
    await refresh(saved.name).catch(() => undefined)
    emit('changed')
  } catch (caughtError) {
    failedDraftSignature.value = draftSignature
    panelError.value = caughtError instanceof Error
      ? caughtError.message
      : '保存 MCP server 失败'
    scheduleFailedDraftRetry()
  } finally {
    if (!shouldKeepPendingSignature) {
      pendingDraftSignature.value = null
    }
  }
}

function handleRefresh() {
  if (props.view === 'logs') {
    void refreshServerEvents(undefined, selectedServerName.value)
    return
  }
  void refresh(selectedServerName.value)
}

function toggleLogSettings() {
  showLogSettings.value = !showLogSettings.value
}

defineExpose({
  loading,
  selectedServer,
  showLogSettings,
  startCreate,
  handleRefresh,
  toggleLogSettings,
})
</script>

<style scoped>
.mcp-config-panel {
  display: grid;
  gap: 14px;
  padding: 0.35rem;
  background: transparent;
  border: none;
}

.mcp-workspace {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 0;
  min-height: 0;
}

.mcp-server-sidebar {
  display: grid;
  align-content: start;
  gap: 14px;
  min-width: 0;
  min-height: 0;
  padding-right: 16px;
  border-right: 1px solid var(--shell-border, #334155);
  overflow: hidden;
}

.sidebar-header,
.sidebar-header-row,
.mcp-detail-copy,
.mcp-detail,
.mcp-editor,
.mcp-log-panel,
.mcp-env-panel,
.mcp-env-list {
  display: grid;
  gap: 10px;
}

.sidebar-header-row {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
}

.sidebar-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--shell-text, #f1f5f9);
}

.sidebar-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: rgba(24, 160, 88, 0.14);
  color: var(--shell-active, #18a058);
  font-size: 12px;
  font-weight: 600;
}

.sidebar-subtitle,
.mcp-detail-copy p,
.sidebar-inline-hint,
.sidebar-hint,
.sidebar-state,
.mcp-field small,
.mcp-env-header p {
  margin: 0;
  color: var(--shell-text-tertiary, var(--text-muted));
  font-size: 0.85rem;
}

.sidebar-hint {
  color: #f5d38c;
}

.sidebar-tools,
.mcp-server-list {
  display: grid;
  gap: 14px;
}

.mcp-server-list {
  min-height: 0;
  overflow-y: auto;
}

.field-input {
  min-width: 0;
}

.field-input :deep(.el-input__wrapper) {
  background: var(--shell-bg, #0f172a);
  box-shadow: 0 0 0 1px var(--shell-border, #334155) inset;
}

.field-input :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--shell-active, #18a058) inset;
}

.field-input :deep(.el-input__inner) {
  color: var(--shell-text, #f1f5f9);
}

.mcp-server-row {
  position: relative;
  display: grid;
  gap: 8px;
  width: 100%;
  min-height: 68px;
  padding: 12px 10px 12px 18px;
  border: none;
  border-bottom: 1px solid var(--shell-border, #334155);
  border-radius: 0;
  background: transparent;
  color: var(--shell-text-secondary, #cbd5e1);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease, box-shadow 0.12s ease;
}

.mcp-server-row::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 3px;
  background: #22c55e;
  opacity: 0.9;
}

.mcp-server-row:last-child {
  border-bottom: none;
}

.mcp-server-row:hover {
  background: var(--provider-row-hover-bg);
}

.mcp-server-row.active {
  background: color-mix(in srgb, var(--shell-active, #18a058) 12%, transparent);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--shell-active, #18a058) 18%, transparent);
  color: var(--shell-text, #f1f5f9);
}

.mcp-server-row.active::before {
  width: 4px;
  opacity: 1;
}

.mcp-server-row-top,
.mcp-server-meta,
.mcp-env-header,
.mcp-env-row,
.mcp-editor-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}

.mcp-server-row-top strong {
  font-size: 0.92rem;
  line-height: 1.3;
  color: var(--shell-text, #f1f5f9);
  overflow-wrap: anywhere;
}

.mcp-server-badge {
  display: inline-flex;
  align-items: center;
  min-height: 18px;
  padding: 0 6px;
  border-radius: 6px;
  background: var(--shell-bg-hover, #334155);
  color: var(--shell-text-tertiary, #94a3b8);
  font-size: 11px;
  text-transform: uppercase;
}

.mcp-server-command {
  margin: 0;
  color: var(--shell-text-tertiary, #94a3b8);
  font-size: 0.8rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.mcp-server-meta {
  justify-content: flex-start;
  font-size: 0.78rem;
  color: var(--shell-text-tertiary, #94a3b8);
}

.mcp-detail {
  min-width: 0;
  min-height: 0;
  padding-left: 20px;
  align-content: start;
}

.mcp-detail-header {
  padding: 0;
}

.mcp-detail-copy h2 {
  margin: 0;
  font-size: 1.14rem;
  font-family: 'Aptos Display', 'Segoe UI Variable Display', 'Trebuchet MS', 'Segoe UI', sans-serif;
}

.mcp-editor,
.mcp-log-panel,
.mcp-log-empty {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
}

.mcp-field,
.mcp-field-span {
  display: grid;
  gap: 8px;
  width: 100%;
  min-width: 0;
}

.mcp-field-span {
  grid-column: 1 / -1;
}

.mcp-field :deep(.el-input__wrapper),
.mcp-env-inputs :deep(.el-input__wrapper) {
  min-height: 44px;
}

.mcp-field :deep(.el-input),
.mcp-field :deep(.el-textarea),
.mcp-field :deep(.el-select) {
  width: 100%;
  min-width: 0;
}

.mcp-field :deep(.el-select__wrapper),
.mcp-field :deep(.el-input__wrapper),
.mcp-field :deep(.el-textarea__inner) {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.mcp-field :deep(.el-textarea__inner) {
  width: 100%;
  border-radius: 14px;
  border: 1px solid var(--border, rgba(133, 163, 199, 0.18));
  background: var(--surface-panel-soft-strong);
  color: var(--text);
  padding: 12px 14px;
}

.mcp-field :deep(.el-textarea__inner:focus) {
  border-color: var(--shell-active, #18a058);
}

.mcp-env-panel {
  padding: 1rem;
  border: 1px solid rgba(133, 163, 199, 0.14);
  border-radius: 18px;
  background: var(--surface-panel-muted);
}

.mcp-env-row {
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
}

.mcp-env-inputs {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto auto;
  gap: 8px 10px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.7rem;
  border: 1px solid rgba(133, 163, 199, 0.14);
  border-radius: 12px;
  background: var(--surface-panel-hover-soft);
  align-items: center;
}

.mcp-env-inputs :deep(.el-input) {
  grid-column: 1;
}

.mcp-env-mode-button {
  grid-column: 1;
  justify-self: start;
}

.mcp-env-delete-button {
  grid-column: 2;
  grid-row: 1 / 4;
}

.action-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 10px;
  flex-shrink: 0;
}

.action-icon-button.active {
  border-color: rgba(103, 199, 207, 0.42);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.2);
}

.hero-action .action-icon {
  width: 20px;
  height: 20px;
}

.action-icon-button .action-icon,
.mcp-config-panel .action-icon {
  width: 18px;
  height: 18px;
}

.danger-icon-button,
.danger {
  color: #ffd1d1;
}

.mcp-log-empty {
  min-height: 240px;
  place-items: center;
}

@media (max-width: 1080px) {
  .mcp-workspace {
    grid-template-columns: 1fr;
  }

  .mcp-server-sidebar {
    padding-right: 0;
    padding-bottom: 12px;
    border-right: none;
    border-bottom: 1px solid var(--shell-border, #334155);
  }

  .mcp-detail {
    padding-top: 12px;
    padding-left: 0;
  }
}

@media (max-width: 720px) {
  .sidebar-header-row {
    grid-template-columns: 1fr;
    align-items: start;
  }

  .mcp-editor-actions > * {
    flex: 1 1 120px;
  }
}
</style>

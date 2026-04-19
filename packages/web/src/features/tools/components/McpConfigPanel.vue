<template>
  <section class="panel-section mcp-config-panel">
    <div class="mcp-config-header">
      <div>
        <span class="panel-kicker">MCP Config</span>
        <h3>MCP 配置</h3>
        <p>管理 `mcp/mcp.json` 中的 server 定义，保存后会自动重载运行时。</p>
      </div>
      <div class="mcp-config-actions">
        <button
          type="button"
          class="ghost-button action-icon-button"
          title="刷新配置"
          :disabled="loading"
          @click="refresh(selectedServerName)"
        >
          <Icon :icon="refreshBold" class="refresh-icon" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="ghost-button action-icon-button"
          data-test="mcp-new-button"
          title="新增 Server"
          @click="startCreate"
        >
          <Icon :icon="addCircleBold" class="action-icon" aria-hidden="true" />
        </button>
      </div>
    </div>

    <p class="mcp-config-path">{{ snapshot.configPath || '尚未解析配置路径' }}</p>
    <p v-if="panelError" class="page-banner error">{{ panelError }}</p>
    <p v-else-if="notice" class="page-banner success">{{ notice }}</p>

    <div class="mcp-config-layout">
      <aside class="mcp-server-sidebar">
        <div v-if="servers.length === 0" class="sidebar-state">
          当前还没有 MCP server 配置。
        </div>
        <button
          v-for="server in servers"
          :key="server.name"
          type="button"
          class="mcp-server-item"
          :class="{ active: !isCreating && selectedServerName === server.name }"
          @click="selectExisting(server.name)"
        >
          <strong>{{ server.name }}</strong>
          <span>{{ server.command }}</span>
          <small>{{ server.args.length }} 个参数 · {{ envCount(server.env) }} 个环境变量</small>
        </button>
      </aside>

      <form class="mcp-editor" @submit.prevent="submitForm">
        <label class="mcp-field">
          <span>Name</span>
          <input
            v-model="draftName"
            data-test="mcp-name-input"
            type="text"
            placeholder="weather-server"
          >
        </label>
        <label class="mcp-field">
          <span>Command</span>
          <input
            v-model="draftCommand"
            data-test="mcp-command-input"
            type="text"
            placeholder="npx"
          >
        </label>
        <label class="mcp-field mcp-field-span">
          <span>Args</span>
          <textarea
            v-model="draftArgsText"
            data-test="mcp-args-input"
            rows="6"
            placeholder="-y&#10;tavily-mcp@latest"
          />
          <small>每行一个参数，保存时会自动去掉空行。</small>
        </label>

        <section class="mcp-env-panel mcp-field-span">
          <div class="mcp-env-header">
            <div>
              <span>Env</span>
              <p>支持直接值或 `${VAR_NAME}` 占位符。</p>
            </div>
            <button type="button" class="ghost-button action-icon-button" title="新增变量" @click="addEnvRow">
              <Icon :icon="addCircleBold" class="action-icon" aria-hidden="true" />
            </button>
          </div>

          <div v-if="envRows.length === 0" class="sidebar-state">
            当前没有环境变量。
          </div>
          <div v-else class="mcp-env-list">
            <div
              v-for="(entry, index) in envRows"
              :key="entry.id"
              class="mcp-env-row"
            >
              <div class="mcp-env-inputs">
                <input
                  :data-test="`mcp-env-key-${index}`"
                  v-model="entry.key"
                  type="text"
                  placeholder="TAVILY_API_KEY"
                >
                <input
                  :data-test="`mcp-env-value-${index}`"
                  v-model="entry.value"
                  type="text"
                  placeholder="${TAVILY_API_KEY}"
                >
                <button
                  type="button"
                  class="ghost-button action-icon-button danger-icon-button"
                  title="删除"
                  :disabled="envRows.length === 1"
                  @click="removeEnvRow(index)"
                >
                  <Icon :icon="trashBinMinimalisticBold" class="action-icon" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </section>

        <div class="mcp-editor-actions">
          <button
            type="submit"
            class="hero-action"
            data-test="mcp-save-button"
            :title="saving ? '保存中...' : isCreating ? '创建 Server' : '保存修改'"
            :disabled="saving"
          >
            <Icon :icon="disketteBold" class="action-icon" aria-hidden="true" />
          </button>
          <button
            v-if="!isCreating && selectedServer"
            type="button"
            class="ghost-button danger-icon-button"
            data-test="mcp-delete-button"
            :title="deleting ? '删除中...' : '删除 Server'"
            :disabled="deleting"
            @click="removeSelectedServer"
          >
            <Icon :icon="trashBinMinimalisticBold" class="action-icon" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  </section>
</template>

<script setup lang="ts">
import addCircleBold from '@iconify-icons/solar/add-circle-bold'
import disketteBold from '@iconify-icons/solar/diskette-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import trashBinMinimalisticBold from '@iconify-icons/solar/trash-bin-minimalistic-bold'
import { Icon } from '@iconify/vue'
import { ref, watch } from 'vue'
import type { McpServerConfig } from '@garlic-claw/shared'
import { useMcpConfigManagement } from '@/features/tools/composables/use-mcp-config-management'

const props = defineProps<{
  preferredServerName?: string | null
}>()

const emit = defineEmits<{
  changed: []
}>()

interface EnvRow {
  id: number
  key: string
  value: string
}

const {
  loading,
  saving,
  deleting,
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
} = useMcpConfigManagement()

const draftName = ref('')
const draftCommand = ref('')
const draftArgsText = ref('')
const envRows = ref<EnvRow[]>([])
const panelError = ref<string | null>(null)
const isCreating = ref(false)
let envRowId = 0

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
      resetDraft()
      return
    }

    applyServerToDraft(server)
  },
  { immediate: true },
)

function startCreate() {
  isCreating.value = true
  panelError.value = null
  resetDraft()
  selectServer(null)
}

function selectExisting(name: string) {
  isCreating.value = false
  panelError.value = null
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

async function submitForm() {
  panelError.value = null
  try {
    const payload = buildPayload()
    if (isCreating.value || !selectedServer.value) {
      await createServer(payload)
      isCreating.value = false
      emit('changed')
      return
    }

    await updateServer(selectedServer.value.name, payload)
    emit('changed')
  } catch (caughtError) {
    panelError.value = caughtError instanceof Error
      ? caughtError.message
      : '保存 MCP server 失败'
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
    throw new Error('Name 不能为空')
  }
  if (!command) {
    throw new Error('Command 不能为空')
  }

  return {
    name,
    command,
    args: draftArgsText.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    env: Object.fromEntries(
      envRows.value
        .map((entry) => [entry.key.trim(), entry.value.trim()] as const)
        .filter(([key, value]) => key.length > 0 && value.length > 0),
    ),
  }
}

function applyServerToDraft(server: McpServerConfig) {
  draftName.value = server.name
  draftCommand.value = server.command
  draftArgsText.value = server.args.join('\n')
  envRows.value = Object.entries(server.env).map(([key, value]) => createEnvRow(key, value))
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

function createEnvRow(key = '', value = ''): EnvRow {
  envRowId += 1
  return {
    id: envRowId,
    key,
    value,
  }
}

function envCount(env: Record<string, string>): number {
  return Object.keys(env).length
}
</script>

<style scoped>
.mcp-config-panel,
.mcp-config-layout,
.mcp-editor,
.mcp-env-panel,
.mcp-env-list {
  display: grid;
  gap: 14px;
}

.mcp-config-header,
.mcp-config-actions,
.mcp-env-header,
.mcp-env-row,
.mcp-editor-actions {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
}

.mcp-config-path {
  font-size: 0.84rem;
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.mcp-config-layout {
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  align-items: start;
}

.mcp-server-sidebar,
.mcp-server-item {
  display: grid;
  gap: 10px;
}

.mcp-server-item {
  padding: 0.9rem 0.95rem;
  border: 1px solid rgba(133, 163, 199, 0.14);
  border-radius: 16px;
  background: rgba(12, 22, 36, 0.78);
  text-align: left;
}

.mcp-server-item small {
  color: var(--text-muted);
}

.mcp-server-item.active {
  border-color: rgba(103, 199, 207, 0.42);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.2);
}

.mcp-field,
.mcp-field-span {
  display: grid;
  gap: 8px;
}

.mcp-field-span {
  grid-column: 1 / -1;
}

.mcp-field small,
.mcp-env-header p {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.mcp-editor {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mcp-env-panel {
  padding: 1rem;
  border: 1px solid rgba(133, 163, 199, 0.14);
  border-radius: 18px;
  background: rgba(12, 22, 36, 0.52);
}

.mcp-env-row {
  align-items: stretch;
  justify-content: space-between;
  gap: 12px;
}

.mcp-env-inputs {
  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-rows: auto auto;
  gap: 8px 10px;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.7rem;
  border: 1px solid rgba(133, 163, 199, 0.14);
  border-radius: 12px;
  background: rgba(9, 17, 29, 0.42);
  align-items: center;
}

.mcp-env-inputs input {
  grid-column: 1;
  border-radius: 8px;
  background: rgba(11, 21, 35, 0.9);
  padding: 0.65rem 0.82rem;
}

.mcp-env-inputs button {
  grid-column: 2;
  grid-row: 1 / 3;
}

.refresh-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: auto;
  min-width: 36px;
  height: 36px;
  padding: 0 10px;
  border-radius: 10px;
}

.refresh-button .refresh-icon {
  width: 18px;
  height: 18px;
}

.refresh-label {
  font-size: 0.9rem;
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

.hero-action .action-icon {
  width: 20px;
  height: 20px;
}

.action-icon-button .action-icon {
  width: 18px;
  height: 18px;
}

.danger-icon-button {
  color: #ffd1d1;
}

.danger {
  color: #ffd1d1;
}

.mcp-config-panel .action-icon,
.mcp-config-panel .refresh-icon {
  width: 18px;
  height: 18px;
}

@media (max-width: 1080px) {
  .mcp-config-layout,
  .mcp-editor {
    grid-template-columns: 1fr;
  }
}
</style>

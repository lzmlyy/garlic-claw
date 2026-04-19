<template>
  <section class="tool-governance-panel">
    <header class="panel-header">
      <div>
        <span class="panel-kicker">{{ kicker }}</span>
        <h2>{{ title }}</h2>
        <p>{{ description }}</p>
      </div>
      <button
        type="button"
        class="ghost-button"
        :disabled="loading"
        @click="refresh"
      >
        刷新
      </button>
    </header>

    <p v-if="error" class="page-banner error">{{ error }}</p>
    <p v-else-if="notice" class="page-banner success">{{ notice }}</p>

    <div v-if="showSourceList" class="source-picker">
      <label class="field">
        <span>筛选 source</span>
        <input
          v-model="sourceKeyword"
          type="text"
          :placeholder="sourcePlaceholder"
        >
      </label>

      <div v-if="filteredSources.length === 0" class="empty-state compact">
        当前没有匹配的工具源。
      </div>
      <div v-else class="source-list">
        <button
          v-for="source in filteredSources"
          :key="source.id"
          type="button"
          class="source-item"
          :class="{ active: source.id === selectedSourceId }"
          @click="selectSource(source.id)"
        >
          <strong>{{ source.label }}</strong>
          <span>{{ source.enabledTools }} / {{ source.totalTools }} 工具</span>
        </button>
      </div>
    </div>

    <div v-if="selectedSource" class="governance-layout">
      <article class="panel-card">
        <div class="panel-card-header">
          <div>
            <span class="panel-kicker">Source</span>
            <h3>{{ selectedSource.label }}</h3>
            <p>{{ sourceKindLabel(selectedSource.kind) }} · {{ selectedSource.id }}</p>
          </div>
          <div class="action-row">
            <button
              type="button"
              class="ghost-button"
              :disabled="mutatingSource"
              @click="toggleSourceEnabled"
            >
              {{ selectedSource.enabled ? '禁用' : '启用' }}
            </button>
            <button
              v-for="action in selectedSourceActions"
              :key="action"
              type="button"
              class="ghost-button"
              :disabled="runningAction === action"
              @click="runSourceAction(action)"
            >
              {{ actionLabel(action) }}
            </button>
          </div>
        </div>

        <div class="pill-grid">
          <div class="overview-pill">
            <span>健康状态</span>
            <strong>{{ healthText(selectedSource.health) }}</strong>
          </div>
          <div class="overview-pill">
            <span>工具数量</span>
            <strong>{{ selectedSource.enabledTools }} / {{ selectedSource.totalTools }}</strong>
          </div>
          <div class="overview-pill">
            <span>最后检查</span>
            <strong>{{ formatTime(selectedSource.lastCheckedAt) }}</strong>
          </div>
          <div class="overview-pill">
            <span>最近错误</span>
            <strong>{{ selectedSource.lastError || '无' }}</strong>
          </div>
        </div>
      </article>

      <article class="panel-card">
        <div class="panel-card-header">
          <div>
            <span class="panel-kicker">Tools</span>
            <h3>工具列表</h3>
            <p>按 source 查看并覆盖单个工具的启用状态。</p>
          </div>
          <div class="tool-controls">
            <input
              v-model="toolKeyword"
              type="text"
              placeholder="搜索 tool id、call name 或描述"
            >
            <select v-model="toolFilter">
              <option value="all">全部</option>
              <option value="enabled">已启用</option>
              <option value="disabled">已禁用</option>
              <option value="attention">需关注</option>
            </select>
          </div>
        </div>

        <div v-if="filteredTools.length === 0" class="empty-state compact">
          当前 source 下没有匹配工具。
        </div>
        <div v-else class="tool-list">
          <article
            v-for="tool in filteredTools"
            :key="tool.toolId"
            class="tool-card"
          >
            <div class="tool-card-top">
              <div>
                <strong>{{ tool.callName }}</strong>
                <p>{{ tool.description }}</p>
              </div>
              <button
                type="button"
                class="ghost-button"
                :disabled="mutatingToolId === tool.toolId"
                @click="toggleToolEnabled(tool)"
              >
                {{ tool.enabled ? '禁用' : '启用' }}
              </button>
            </div>
            <div class="meta-row">
              <span class="meta-chip">{{ tool.enabled ? '已启用' : '已禁用' }}</span>
              <span class="meta-chip">{{ tool.name }}</span>
              <span class="meta-chip">{{ parameterSummary(tool.parameters) }}</span>
              <span v-if="tool.lastError" class="meta-chip warning">异常</span>
            </div>
            <p class="tool-id">{{ tool.toolId }}</p>
          </article>
        </div>
      </article>
    </div>

    <div v-else-if="!loading" class="empty-state">
      <h3>{{ emptyTitle }}</h3>
      <p>{{ emptyDescription }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type {
  PluginActionName,
  ToolInfo,
  ToolSourceInfo,
  ToolSourceKind,
} from '@garlic-claw/shared'
import {
  loadToolOverview,
  runToolSourceActionRequest,
  saveToolEnabled,
  saveToolSourceEnabled,
  toErrorMessage,
} from '@/features/tools/composables/tool-management.data'

const props = withDefaults(defineProps<{
  sourceKind: ToolSourceKind
  title: string
  description: string
  kicker?: string
  sourceId?: string | null
  showSourceList?: boolean
  emptyTitle?: string
  emptyDescription?: string
  sourcePlaceholder?: string
}>(), {
  kicker: 'Tool Governance',
  sourceId: null,
  showSourceList: true,
  emptyTitle: '暂无工具源',
  emptyDescription: '当前分类下还没有可治理的工具源。',
  sourcePlaceholder: '搜索 source',
})

const emit = defineEmits<{
  (event: 'update:selectedSourceId', value: string | null): void
}>()

const loading = ref(false)
const error = ref<string | null>(null)
const notice = ref<string | null>(null)
const mutatingSource = ref(false)
const mutatingToolId = ref<string | null>(null)
const runningAction = ref<PluginActionName | null>(null)
const sources = ref<ToolSourceInfo[]>([])
const tools = ref<ToolInfo[]>([])
const selectedSourceId = ref<string | null>(props.sourceId ?? null)
const sourceKeyword = ref('')
const toolKeyword = ref('')
const toolFilter = ref<'all' | 'attention' | 'disabled' | 'enabled'>('all')

const filteredSources = computed(() =>
  sources.value
    .filter((source) => source.kind === props.sourceKind)
    .filter((source) => !props.sourceId || source.id === props.sourceId)
    .filter((source) => {
      const keyword = sourceKeyword.value.trim().toLocaleLowerCase()
      if (!keyword) {
        return true
      }
      return [source.id, source.label, source.lastError ?? '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(keyword)
    }),
)
const showSourceList = computed(() =>
  props.showSourceList && !props.sourceId && filteredSources.value.length > 1,
)
const selectedSource = computed<ToolSourceInfo | null>(() => {
  const exact = filteredSources.value.find((source) => source.id === selectedSourceId.value)
  return exact ?? filteredSources.value[0] ?? null
})
const selectedSourceActions = computed<PluginActionName[]>(() =>
  selectedSource.value?.supportedActions ?? ['health-check'],
)
const filteredTools = computed(() => {
  if (!selectedSource.value) {
    return []
  }

  const keyword = toolKeyword.value.trim().toLocaleLowerCase()
  return tools.value
    .filter((tool) =>
      tool.sourceKind === selectedSource.value?.kind
      && tool.sourceId === selectedSource.value?.id)
    .filter((tool) => {
      if (toolFilter.value === 'enabled') {
        return tool.enabled
      }
      if (toolFilter.value === 'disabled') {
        return !tool.enabled
      }
      if (toolFilter.value === 'attention') {
        return tool.health === 'error'
      }
      return true
    })
    .filter((tool) => {
      if (!keyword) {
        return true
      }
      return [tool.toolId, tool.callName, tool.description, tool.lastError ?? '']
        .join(' ')
        .toLocaleLowerCase()
        .includes(keyword)
    })
})

watch(
  () => props.sourceId,
  (sourceId) => {
    selectedSourceId.value = sourceId ?? null
  },
)

watch(selectedSource, (source) => {
  emit('update:selectedSourceId', source?.id ?? null)
}, { immediate: true })

onMounted(() => {
  void refresh()
})

async function refresh() {
  loading.value = true
  error.value = null
  try {
    const overview = await loadToolOverview()
    sources.value = overview.sources
    tools.value = overview.tools
    if (props.sourceId) {
      selectedSourceId.value = props.sourceId
      return
    }
    const nextSource = overview.sources.find((source) =>
      source.kind === props.sourceKind && source.id === selectedSourceId.value)
      ?? overview.sources.find((source) => source.kind === props.sourceKind)
      ?? null
    selectedSourceId.value = nextSource?.id ?? null
  } catch (caughtError) {
    error.value = toErrorMessage(caughtError, '加载工具治理数据失败')
  } finally {
    loading.value = false
  }
}

async function toggleSourceEnabled() {
  if (!selectedSource.value) {
    return
  }

  mutatingSource.value = true
  error.value = null
  notice.value = null
  try {
    await saveToolSourceEnabled(
      selectedSource.value.kind,
      selectedSource.value.id,
      !selectedSource.value.enabled,
    )
    notice.value = selectedSource.value.enabled ? '工具源已禁用' : '工具源已启用'
    await refresh()
  } catch (caughtError) {
    error.value = toErrorMessage(caughtError, '更新工具源状态失败')
  } finally {
    mutatingSource.value = false
  }
}

async function runSourceAction(action: PluginActionName) {
  if (!selectedSource.value) {
    return
  }

  runningAction.value = action
  error.value = null
  notice.value = null
  try {
    const result = await runToolSourceActionRequest(
      selectedSource.value.kind,
      selectedSource.value.id,
      action,
    )
    notice.value = result.message
    await refresh()
  } catch (caughtError) {
    error.value = toErrorMessage(caughtError, '执行工具源动作失败')
  } finally {
    runningAction.value = null
  }
}

function selectSource(sourceId: string) {
  selectedSourceId.value = sourceId
}

async function toggleToolEnabled(tool: ToolInfo) {
  mutatingToolId.value = tool.toolId
  error.value = null
  notice.value = null
  try {
    await saveToolEnabled(tool.toolId, !tool.enabled)
    notice.value = tool.enabled ? '工具已禁用' : '工具已启用'
    await refresh()
  } catch (caughtError) {
    error.value = toErrorMessage(caughtError, '更新工具状态失败')
  } finally {
    mutatingToolId.value = null
  }
}

function actionLabel(action: PluginActionName): string {
  switch (action) {
    case 'reload':
      return '重载'
    case 'reconnect':
      return '重连'
    default:
      return '健康检查'
  }
}

function healthText(health: ToolSourceInfo['health'] | ToolInfo['health']): string {
  switch (health) {
    case 'healthy':
      return '健康'
    case 'error':
      return '异常'
    default:
      return '未知'
  }
}

function formatTime(value: string | null): string {
  if (!value) {
    return '尚未检查'
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleString('zh-CN', { hour12: false })
}

function sourceKindLabel(kind: ToolSourceKind): string {
  switch (kind) {
    case 'plugin':
      return '插件工具源'
    case 'mcp':
      return 'MCP 工具源'
    default:
      return '技能工具源'
  }
}

function parameterSummary(parameters: ToolInfo['parameters']) {
  const count = Object.keys(parameters).length
  return count === 0 ? '无参数' : `${count} 个参数`
}

defineExpose({
  refresh,
})
</script>

<style scoped>
.tool-governance-panel,
.panel-header,
.field,
.source-picker,
.governance-layout,
.panel-card {
  display: grid;
  gap: 14px;
}

.tool-governance-panel {
  min-width: 0;
}

.panel-header,
.panel-card {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: rgba(11, 21, 35, 0.72);
}

.panel-header {
  grid-template-columns: 1fr auto;
  align-items: start;
}

.panel-header h2,
.panel-header p,
.panel-card h3,
.panel-card p {
  margin: 0;
}

.panel-kicker,
.panel-header p,
.field span,
.tool-id {
  color: var(--text-muted);
}

.panel-kicker {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.source-list,
.pill-grid,
.action-row,
.meta-row,
.tool-controls {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.source-item,
.overview-pill,
.tool-card {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: rgba(7, 16, 27, 0.82);
}

.source-item {
  display: grid;
  gap: 6px;
  min-width: 180px;
  text-align: left;
}

.source-item.active {
  border-color: rgba(96, 165, 250, 0.5);
}

.panel-card-header,
.tool-card-top {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: start;
}

.tool-controls input,
.tool-controls select,
.field input,
.field select {
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(7, 16, 27, 0.9);
  color: var(--text);
}

.tool-list {
  display: grid;
  gap: 12px;
}

.meta-chip {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 12px;
}

.meta-chip.warning {
  color: #f59e0b;
}

.ghost-button {
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: transparent;
  color: var(--text);
}

@media (max-width: 720px) {
  .panel-header,
  .panel-card-header,
  .tool-card-top {
    grid-template-columns: 1fr;
    display: grid;
  }
}
</style>

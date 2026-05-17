<template>
  <ConsolePage class="tools-page" no-padding>
    <template #header>
      <ConsoleViewHeader
        title="工具管理"
        :icon="tuning2Bold"
      >
        <template #actions>
          <ElButton
            class="view-header-action"
            title="刷新工具总览"
            :disabled="loading"
            @click="refresh()"
          >
            <Icon :icon="refreshBold" class="view-header-action-icon" aria-hidden="true" />
          </ElButton>
        </template>
      </ConsoleViewHeader>
    </template>

    <div class="tools-inner">
      <aside class="tools-sidebar">
        <nav class="detail-nav" aria-label="工具治理面板切换">
          <div class="detail-nav-group">
            <ElButton
              v-for="panel in availablePanels"
              :key="panel.value"
              class="detail-nav-button"
              native-type="button"
              :title="panel.label"
              :class="{ active: activePanel === panel.value }"
              @click="activePanel = panel.value"
            >
              <Icon class="nav-icon" :icon="panel.icon" aria-hidden="true" />
              <span class="nav-label">{{ panel.label }}</span>
            </ElButton>
          </div>
        </nav>
      </aside>

      <main class="tools-main">
        <p v-if="error" class="page-banner error">{{ error }}</p>

        <section v-if="activeToolPanel" class="tools-grid">
          <ToolGovernancePanel
            :source-kind="activeToolPanel.sourceKind"
            :source-id="activeToolPanel.sourceId"
            :title="activeToolPanel.title"
            :description="activeToolPanel.description"
            :show-source-list="activeToolPanel.showSourceList"
            :empty-title="activeToolPanel.emptyTitle"
            :empty-description="activeToolPanel.emptyDescription"
          />
        </section>

        <section v-else-if="!loading" class="empty-state">
          <h2>当前还没有可管理的实际工具</h2>
          <p>只有已经接入并实际注册了工具的执行源，才会出现在这个页面。</p>
        </section>
      </main>
    </div>
  </ConsolePage>
</template>

<script setup lang="ts">
import type { ToolSourceInfo } from '@garlic-claw/shared'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import type { IconifyIcon } from '@iconify/types'
import tuning2Bold from '@iconify-icons/solar/tuning-2-bold'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import cpuBoltBold from '@iconify-icons/solar/cpu-bolt-bold'
import cpuBold from '@iconify-icons/solar/cpu-bold'
import widgetAddBold from '@iconify-icons/solar/widget-add-bold'
import widgetBold from '@iconify-icons/solar/widget-5-bold'
import { subscribeInternalConfigChanged } from '@/modules/ai-settings/internal-config-change'
import { subscribePluginConfigChanged } from '@/modules/plugins/plugin-config-change'
import ConsolePage from '@/shared/components/ConsolePage.vue'
import ConsoleViewHeader from '@/shared/components/ConsoleViewHeader.vue'
import ToolGovernancePanel from '@/modules/tools/components/ToolGovernancePanel.vue'
import { loadToolOverview, toErrorMessage } from '@/modules/tools/composables/tool-management.data'
import { ElButton } from 'element-plus'

const route = useRoute()
type ToolPanelId = 'runtime-tools' | 'subagent' | 'mcp' | 'plugin'

interface ToolPanelOption {
  value: ToolPanelId
  label: string
  icon: IconifyIcon
  title: string
  description: string
  sourceKind: 'internal' | 'plugin' | 'mcp'
  sourceId: string | null
  showSourceList: boolean
  emptyTitle: string
  emptyDescription: string
}

const loading = ref(false)
const error = ref<string | null>(null)
const sources = ref<ToolSourceInfo[]>([])
const activePanel = ref<ToolPanelId | null>(null)
let refreshRequestId = 0

const focusedSourceKind = computed(() =>
  typeof route.query.kind === 'string' ? route.query.kind : null,
)
const focusedSourceId = computed(() => {
  if (typeof route.query.source !== 'string') {
    return null
  }

  const sourceId = route.query.source.trim()
  return sourceId.length > 0 ? sourceId : null
})
const preferredMcpSourceId = computed(() =>
  focusedSourceKind.value === 'mcp' ? focusedSourceId.value : null,
)
const preferredPluginSourceId = computed(() =>
  focusedSourceKind.value === 'plugin' ? focusedSourceId.value : null,
)
const visibleSources = computed(() =>
  sources.value.filter((source) => source.totalTools > 0),
)
const hasRuntimeTools = computed(() =>
  hasSource('internal', 'runtime-tools'),
)
const hasSubagentTools = computed(() =>
  hasSource('internal', 'subagent'),
)
const hasMcpTools = computed(() =>
  hasSource('mcp', preferredMcpSourceId.value),
)
const hasPluginTools = computed(() =>
  hasSource('plugin', preferredPluginSourceId.value),
)
const availablePanels = computed<ToolPanelOption[]>(() => {
  const panels: ToolPanelOption[] = []

  if (hasRuntimeTools.value) {
    panels.push({
      value: 'runtime-tools',
      label: '执行工具',
      icon: cpuBoltBold,
      title: '执行工具管理',
      description: '内部执行工具的启用状态统一在这里调整。运行参数仍在 AI 设置页维护。',
      sourceKind: 'internal',
      sourceId: 'runtime-tools',
      showSourceList: false,
      emptyTitle: '暂无内部执行工具',
      emptyDescription: '当前运行时还没有注册内部执行工具。',
    })
  }

  if (hasSubagentTools.value) {
    panels.push({
      value: 'subagent',
      label: '子代理工具',
      icon: cpuBold,
      title: '子代理工具管理',
      description: '内部子代理工具的启用状态统一在这里调整。运行参数仍在 AI 设置页维护。',
      sourceKind: 'internal',
      sourceId: 'subagent',
      showSourceList: false,
      emptyTitle: '暂无内部子代理工具',
      emptyDescription: '当前运行时还没有注册内部子代理工具。',
    })
  }

  if (hasMcpTools.value) {
    panels.push({
      value: 'mcp',
      label: 'MCP 工具',
      icon: widgetAddBold,
      title: 'MCP 工具管理',
      description: '统一管理所有 MCP server 暴露的工具。server 配置仍在 MCP 页面维护。',
      sourceKind: 'mcp',
      sourceId: preferredMcpSourceId.value,
      showSourceList: !preferredMcpSourceId.value,
      emptyTitle: '暂无 MCP 工具源',
      emptyDescription: '先在 MCP 页面添加 server，保存后这里会出现对应工具源。',
    })
  }

  if (hasPluginTools.value) {
    panels.push({
      value: 'plugin',
      label: '插件工具',
      icon: widgetBold,
      title: '插件工具管理',
      description: '统一管理插件暴露给宿主的工具。插件配置、作用域和日志仍在插件详情页维护。',
      sourceKind: 'plugin',
      sourceId: preferredPluginSourceId.value,
      showSourceList: !preferredPluginSourceId.value,
      emptyTitle: '暂无插件工具源',
      emptyDescription: '插件接入并注册工具后，会在这里统一出现。',
    })
  }

  return panels
})
const activeToolPanel = computed(() =>
  availablePanels.value.find((panel) => panel.value === activePanel.value) ?? null,
)
let removeInternalConfigChangedListener = () => {}
let removePluginConfigChangedListener = () => {}

watch(availablePanels, (panels) => {
  if (panels.length === 0) {
    activePanel.value = null
    return
  }

  const preferred = readPreferredPanel()
  if (preferred && panels.some((panel) => panel.value === preferred)) {
    activePanel.value = preferred
    return
  }

  if (!activePanel.value || !panels.some((panel) => panel.value === activePanel.value)) {
    activePanel.value = panels[0].value
  }
}, { immediate: true })

onMounted(() => {
  removeInternalConfigChangedListener = subscribeInternalConfigChanged(({ scope }) => {
    if (scope !== 'runtime-tools' && scope !== 'subagent' && scope !== 'mcp') {
      return
    }
    void refresh()
  })
  removePluginConfigChangedListener = subscribePluginConfigChanged(() => {
    void refresh()
  })
  void refresh()
})

onUnmounted(() => {
  removeInternalConfigChangedListener()
  removePluginConfigChangedListener()
})

async function refresh() {
  const requestId = ++refreshRequestId
  loading.value = true
  error.value = null
  try {
    const overview = await loadToolOverview()
    if (requestId !== refreshRequestId) {
      return
    }
    sources.value = overview.sources
  } catch (caughtError) {
    if (requestId !== refreshRequestId) {
      return
    }
    error.value = toErrorMessage(caughtError, '加载工具管理总览失败')
  } finally {
    if (requestId === refreshRequestId) {
      loading.value = false
    }
  }
}

function hasSource(kind: ToolSourceInfo['kind'], sourceId?: string | null) {
  if (sourceId) {
    return visibleSources.value.some((source) => source.kind === kind && source.id === sourceId)
  }

  return visibleSources.value.some((source) => source.kind === kind)
}

function readPreferredPanel(): ToolPanelId | null {
  if (focusedSourceKind.value === 'plugin') {
    return 'plugin'
  }
  if (focusedSourceKind.value === 'mcp') {
    return 'mcp'
  }
  if (focusedSourceKind.value === 'internal' && focusedSourceId.value === 'runtime-tools') {
    return 'runtime-tools'
  }
  if (focusedSourceKind.value === 'internal' && focusedSourceId.value === 'subagent') {
    return 'subagent'
  }

  return null
}
</script>

<style scoped>
.tools-page {
  background: transparent;
}

.tools-inner {
  display: flex;
  height: 100%;
  overflow: visible;
}

.tools-sidebar {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  width: 200px;
  border-right: 1px solid var(--shell-border);
  color: var(--shell-text, var(--text));
  overflow-y: auto;
}

.tools-main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 24px;
  display: grid;
  gap: 16px;
}

.detail-nav {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow-y: auto;
  padding: 12px 8px;
}

.detail-nav-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-nav :deep(.detail-nav-button.el-button) {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 0 20px;
  border-radius: 8px;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  margin: 0;
  color: var(--shell-text-secondary, var(--text-muted));
  font-size: 14px;
  text-align: left;
  transition: background-color 0.2s ease, color 0.2s ease;
}

.detail-nav :deep(.detail-nav-button.el-button:hover) {
  border-color: transparent;
  background: var(--shell-bg-hover, #334155);
  color: var(--shell-text, var(--text));
}

.detail-nav :deep(.detail-nav-button.el-button.active) {
  border-color: transparent;
  color: var(--shell-active, var(--accent));
  background: color-mix(in srgb, var(--shell-active, var(--accent)) 10%, transparent);
}

.nav-icon {
  width: 20px;
  min-width: 20px;
  font-size: 20px;
  flex-shrink: 0;
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tools-grid {
  display: grid;
  gap: 18px;
}

.page-banner,
.empty-state {
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface-panel-soft);
}

.page-banner.error,
.empty-state p {
  color: var(--text-muted);
}

.empty-state {
  display: grid;
  gap: 8px;
}

.empty-state h2,
.empty-state p {
  margin: 0;
}

.tools-hero {
  display: grid;
  gap: 10px;
}

.hero-copy {
  display: grid;
  gap: 10px;
}

.hero-icon {
  vertical-align: -0.15em;
  margin-right: 6px;
}

.hero-copy h1 {
  margin: 0;
}

.tools-page :deep(.view-header-action.active) {
  border-color: var(--gc-accent);
  box-shadow: var(--gc-focus-shadow);
}

@media (max-width: 800px) {
  .tools-sidebar {
    width: 180px;
  }

  .tools-main {
    padding: 16px;
  }
}

@media (max-width: 720px) {
  .tools-inner {
    flex-direction: column;
  }

  .tools-sidebar {
    width: 100%;
    max-height: 110px;
    border-right: none;
    border-bottom: 1px solid var(--shell-border);
  }

  .detail-nav {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 0 12px 8px;
  }

  .detail-nav-group {
    flex-direction: row;
    gap: 4px;
  }

  .detail-nav :deep(.detail-nav-button.el-button) {
    min-height: 40px;
    padding: 0 14px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tools-main {
    padding: 12px;
  }
}

</style>

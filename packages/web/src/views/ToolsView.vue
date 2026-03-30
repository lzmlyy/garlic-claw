<template>
  <div class="plugins-page tools-page">
    <section class="tool-hero">
      <header class="tool-hero-header">
        <div class="tool-hero-copy">
          <span class="hero-kicker">Unified Tool Governance</span>
          <h1>工具治理</h1>
          <p>统一查看插件工具与 MCP 工具源的健康、开关状态和最小治理动作。</p>
        </div>
        <div class="tool-hero-side">
          <button type="button" class="hero-action" @click="refreshAll()">刷新全部</button>
          <div class="hero-note">
            <span class="hero-note-label">统一工具层</span>
            <strong>{{ heroHeadline }}</strong>
            <p>聊天链路与 `subagent.run` 都已经从这里读取统一工具集合。</p>
          </div>
        </div>
      </header>

      <div class="overview-grid">
        <article
          v-for="card in overviewCards"
          :key="card.label"
          class="overview-card"
          :class="card.tone"
        >
          <span class="overview-label">{{ card.label }}</span>
          <strong>{{ card.value }}</strong>
          <p>{{ card.note }}</p>
        </article>
      </div>
    </section>

    <p v-if="error" class="page-banner error">{{ error }}</p>
    <p v-else-if="notice" class="page-banner success">{{ notice }}</p>

    <div class="plugins-layout">
      <aside class="plugin-sidebar tool-sidebar">
        <div class="sidebar-header">
          <div class="sidebar-header-copy">
            <span class="sidebar-kicker">Tool Sources</span>
            <h2>工具源</h2>
            <p>按 source 管理当前统一工具可见性。</p>
          </div>
          <button type="button" class="ghost-button" @click="refreshAll()">刷新</button>
        </div>

        <div v-if="!loading && sources.length > 0" class="sidebar-tools">
          <input
            v-model="sourceSearchKeyword"
            data-test="tool-source-search"
            type="text"
            placeholder="搜索 source id、标签或错误摘要"
          >
        </div>

        <div v-if="!loading && sources.length > 0" class="sidebar-results">
          <span class="sidebar-results-text">
            匹配 {{ filteredSourceCount }} / {{ sources.length }}
            <span v-if="sources.length > 0">
              · 第 {{ sourcePage }} / {{ sourcePageCount }} 页
              · 显示 {{ sourceRangeStart }}-{{ sourceRangeEnd }} 项
            </span>
          </span>
        </div>

        <div v-if="loading" class="sidebar-state">加载中...</div>
        <div v-else-if="sources.length === 0" class="sidebar-state">
          当前还没有可治理的工具源。
        </div>
        <div v-else-if="pagedSources.length === 0" class="sidebar-state">
          当前搜索下没有匹配工具源。
        </div>
        <div v-else class="source-list">
          <button
            v-for="source in pagedSources"
            :key="buildSourceKey(source)"
            type="button"
            class="source-item"
            :class="{ active: buildSourceKey(source) === selectedSourceKey }"
            @click="selectSource(source.kind, source.id)"
          >
            <div class="source-item-top">
              <strong>{{ source.label }}</strong>
              <span class="runtime-badge">{{ source.kind === 'plugin' ? '插件' : 'MCP' }}</span>
            </div>
            <div class="source-item-meta">
              <span class="meta-chip">
                <span class="health-dot" :class="source.health" />
                {{ healthText(source.health) }}
              </span>
              <span class="meta-chip">{{ source.enabled ? '已启用' : '已禁用' }}</span>
              <span class="meta-chip">{{ source.enabledTools }} / {{ source.totalTools }} 工具</span>
            </div>
            <p v-if="source.lastError" class="source-item-issue">{{ source.lastError }}</p>
            <p class="source-item-desc">{{ source.id }}</p>
          </button>
        </div>

        <div v-if="sources.length > 0" class="sidebar-pagination">
          <button
            type="button"
            class="ghost-button"
            :disabled="!canGoPrevSourcePage"
            @click="goPrevSourcePage"
          >
            上一页
          </button>
          <button
            type="button"
            class="ghost-button"
            :disabled="!canGoNextSourcePage"
            @click="goNextSourcePage"
          >
            下一页
          </button>
        </div>
      </aside>

      <section v-if="selectedSource" class="plugin-detail">
        <article class="panel-section source-overview">
          <div class="source-overview-header">
            <div>
              <span class="panel-kicker">Selected Source</span>
              <h2>{{ selectedSource.label }}</h2>
              <p>{{ selectedSource.kind }} · {{ selectedSource.id }}</p>
            </div>
            <div class="source-overview-actions">
              <button
                type="button"
                class="hero-action"
                :disabled="mutatingSourceKey === buildSourceKey(selectedSource)"
                @click="setSourceEnabled(selectedSource, !selectedSource.enabled)"
              >
                {{ mutatingSourceKey === buildSourceKey(selectedSource)
                  ? '更新中...'
                  : selectedSource.enabled
                    ? '禁用源'
                    : '启用源' }}
              </button>
              <button
                v-for="action in sourceActions(selectedSource)"
                :key="action"
                type="button"
                class="ghost-button"
                :disabled="runningActionKey === `${buildSourceKey(selectedSource)}:${action}`"
                @click="runSourceAction(selectedSource, action)"
              >
                {{ runningActionKey === `${buildSourceKey(selectedSource)}:${action}`
                  ? pendingActionLabel(action)
                  : actionLabel(action) }}
              </button>
            </div>
          </div>

          <div class="source-overview-grid">
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
              <span>运行形态</span>
              <strong>{{ sourceRuntimeLabel(selectedSource) }}</strong>
            </div>
          </div>

          <p v-if="selectedSource.lastError" class="source-error">
            最近错误: {{ selectedSource.lastError }}
          </p>
        </article>

        <section class="panel-section detail-span tool-panel">
          <div class="tool-panel-header">
            <div>
              <span class="panel-kicker">Unified Tools</span>
              <h3>工具列表</h3>
              <p>按 source 查看当前可见工具，并单独覆盖每个工具的 enabled 状态。</p>
            </div>
            <div class="tool-panel-controls">
              <input
                v-model="toolSearchKeyword"
                data-test="tool-search"
                type="text"
                placeholder="搜索 call name、tool id 或描述"
              >
              <div class="filter-chips">
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ active: toolFilter === 'all' }"
                  @click="toolFilter = 'all'"
                >
                  全部
                </button>
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ active: toolFilter === 'enabled' }"
                  @click="toolFilter = 'enabled'"
                >
                  已启用
                </button>
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ active: toolFilter === 'disabled' }"
                  @click="toolFilter = 'disabled'"
                >
                  已禁用
                </button>
                <button
                  type="button"
                  class="filter-chip"
                  :class="{ active: toolFilter === 'attention' }"
                  @click="toolFilter = 'attention'"
                >
                  需关注
                </button>
              </div>
            </div>
          </div>

          <div class="sidebar-results tool-results">
            <span class="sidebar-results-text">
              当前 source 下匹配 {{ filteredToolCount }} / {{ toolCountForSource }} 个工具
              <span v-if="toolCountForSource > 0">
                · 第 {{ toolPage }} / {{ toolPageCount }} 页
                · 显示 {{ toolRangeStart }}-{{ toolRangeEnd }} 项
              </span>
            </span>
          </div>

          <div v-if="pagedTools.length === 0" class="sidebar-state">
            当前筛选下没有匹配工具。
          </div>
          <div v-else class="tool-list">
            <article
              v-for="tool in pagedTools"
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
                  @click="setToolEnabled(tool, !tool.enabled)"
                >
                  {{ mutatingToolId === tool.toolId
                    ? '更新中...'
                    : tool.enabled
                      ? '禁用'
                      : '启用' }}
                </button>
              </div>
              <div class="tool-card-meta">
                <span class="meta-chip">{{ tool.enabled ? '已启用' : '已禁用' }}</span>
                <span class="meta-chip">{{ tool.name }}</span>
                <span class="meta-chip">{{ parameterSummary(tool) }}</span>
                <span v-if="tool.lastError" class="meta-chip attention">异常</span>
              </div>
              <p class="tool-card-id">{{ tool.toolId }}</p>
            </article>
          </div>

          <div class="sidebar-pagination">
            <button
              type="button"
              class="ghost-button"
              :disabled="!canGoPrevToolPage"
              @click="goPrevToolPage"
            >
              上一页
            </button>
            <button
              type="button"
              class="ghost-button"
              :disabled="!canGoNextToolPage"
              @click="goNextToolPage"
            >
              下一页
            </button>
          </div>
        </section>
      </section>

      <section v-else class="plugin-empty">
        <span class="empty-kicker">等待工具源接入</span>
        <h2>暂无工具源</h2>
        <p>当插件工具或 MCP 工具源完成加载后，这里会展示统一治理面。</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PluginActionName, ToolInfo, ToolSourceInfo } from '@garlic-claw/shared'
import { computed } from 'vue'
import { useToolManagement } from '../composables/use-tool-management'

const {
  loading,
  mutatingSourceKey,
  mutatingToolId,
  runningActionKey,
  error,
  notice,
  sources,
  selectedSourceKey,
  selectedSource,
  sourceSearchKeyword,
  toolSearchKeyword,
  toolFilter,
  pagedSources,
  sourcePage,
  sourcePageCount,
  sourceRangeStart,
  sourceRangeEnd,
  canGoPrevSourcePage,
  canGoNextSourcePage,
  goPrevSourcePage,
  goNextSourcePage,
  pagedTools,
  toolPage,
  toolPageCount,
  toolRangeStart,
  toolRangeEnd,
  canGoPrevToolPage,
  canGoNextToolPage,
  goPrevToolPage,
  goNextToolPage,
  sourceCount,
  filteredSourceCount,
  enabledSourceCount,
  toolCount,
  filteredToolCount,
  enabledToolCount,
  attentionSourceCount,
  refreshAll,
  selectSource,
  setSourceEnabled,
  setToolEnabled,
  runSourceAction,
} = useToolManagement()

const heroHeadline = computed(() => {
  if (sourceCount.value === 0) {
    return '等待首个工具源接入'
  }

  return `${enabledToolCount.value} / ${toolCount.value} 工具已启用`
})
const overviewCards = computed(() => [
  {
    label: '工具源',
    value: String(sourceCount.value),
    note: `已启用 ${enabledSourceCount.value} 个 source`,
    tone: 'accent',
  },
  {
    label: '工具总数',
    value: String(toolCount.value),
    note: `已启用 ${enabledToolCount.value} 个工具`,
    tone: 'neutral',
  },
  {
    label: '需关注',
    value: String(attentionSourceCount.value),
    note: attentionSourceCount.value > 0 ? '存在异常 source' : '当前没有 source 告警',
    tone: attentionSourceCount.value > 0 ? 'warning' : 'neutral',
  },
  {
    label: '当前焦点',
    value: selectedSource.value?.label ?? '未选择 source',
    note: selectedSource.value
      ? `${sourceRuntimeLabel(selectedSource.value)} · ${healthText(selectedSource.value.health)}`
      : '从左侧选择一个工具源',
    tone: 'spotlight',
  },
])
const toolCountForSource = computed(() =>
  selectedSource.value?.totalTools ?? 0,
)

function buildSourceKey(source: Pick<ToolSourceInfo, 'kind' | 'id'>): string {
  return `${source.kind}:${source.id}`
}

function sourceRuntimeLabel(source: ToolSourceInfo): string {
  if (source.kind === 'plugin') {
    return source.runtimeKind === 'builtin' ? '内建插件工具' : '远程插件工具'
  }

  return 'MCP 工具源'
}

function sourceActions(source: ToolSourceInfo): PluginActionName[] {
  return source.supportedActions ?? ['health-check']
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

function pendingActionLabel(action: PluginActionName): string {
  switch (action) {
    case 'reload':
      return '重载中...'
    case 'reconnect':
      return '重连中...'
    default:
      return '检查中...'
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

function parameterSummary(tool: ToolInfo): string {
  const count = Object.keys(tool.parameters).length
  return count === 0 ? '无参数' : `${count} 个参数`
}
</script>

<style scoped src="./plugins-view.css"></style>
<style scoped src="./tools-view.css"></style>

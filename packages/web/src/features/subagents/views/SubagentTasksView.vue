<template>
  <div class="plugins-page subagent-tasks-page">
    <section class="task-hero">
      <header class="task-hero-header">
        <div>
          <span class="hero-kicker">Background Subagent Tasks</span>
          <h1>后台 Subagent 任务</h1>
          <p>统一查看插件发起的后台子代理任务、完成态结果和消息回写状态。</p>
        </div>
        <div class="task-hero-side">
          <button
            type="button"
            class="hero-action icon-only"
            title="刷新全部"
            @click="refreshAll()"
          >
            <Icon :icon="refreshBold" class="hero-action-icon" aria-hidden="true" />
          </button>
          <div class="hero-note">
            <span class="hero-note-label">当前任务面</span>
            <strong>{{ heroHeadline }}</strong>
            <p>同步调用继续保留给工具即时返回，长任务则在这里被持久化观察和追踪。</p>
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

    <section class="task-list-panel">
      <div class="panel-header">
        <div>
          <span class="panel-kicker">Task Ledger</span>
          <h2>任务账本</h2>
          <p>按插件、模型和状态查看后台子代理任务，不再让结果只停留在运行时内存里。</p>
        </div>
        <button
          type="button"
          class="ghost-button icon-only"
          title="刷新"
          @click="refreshAll()"
        >
          <Icon :icon="refreshBold" class="ghost-button-icon" aria-hidden="true" />
        </button>
      </div>

      <div class="panel-controls">
        <input
          v-model="searchKeyword"
          data-test="subagent-task-search"
          type="text"
          placeholder="搜索插件、请求摘要、结果摘要或模型"
        >
        <SegmentedSwitch v-model="filter" :options="filterOptions" />
      </div>

      <div class="sidebar-results">
        <span class="sidebar-results-text">
          匹配 {{ filteredTaskCount }} / {{ taskCount }} 个任务
          <span v-if="taskCount > 0">
            · 第 {{ page }} / {{ pageCount }} 页
            · 显示 {{ rangeStart }}-{{ rangeEnd }} 项
          </span>
        </span>
      </div>

      <div v-if="loading" class="sidebar-state">加载中...</div>
      <div v-else-if="pagedTasks.length === 0" class="sidebar-state">
        当前筛选下没有后台子代理任务。
      </div>
      <div v-else class="task-list">
        <article
          v-for="task in pagedTasks"
          :key="task.id"
          class="task-card"
        >
          <div class="task-card-top">
            <div>
              <div class="task-title-row">
                <strong>{{ task.pluginDisplayName || task.pluginId }}</strong>
                <span class="status-pill" :class="task.status">{{ statusLabel(task.status) }}</span>
              </div>
              <p>{{ task.requestPreview }}</p>
            </div>
            <RouterLink
              class="ghost-button link-button"
              :to="{ name: 'plugins', query: { plugin: task.pluginId } }"
            >
              打开插件治理
            </RouterLink>
          </div>

          <div class="meta-row">
            <span class="meta-chip">{{ task.runtimeKind === 'local' ? '本地' : '远程' }}</span>
            <span v-if="task.providerId" class="meta-chip">{{ task.providerId }}</span>
            <span v-if="task.modelId" class="meta-chip">{{ task.modelId }}</span>
            <span class="meta-chip writeback-chip" :class="task.writeBackStatus">
              {{ writeBackLabel(task.writeBackStatus) }}
            </span>
          </div>

          <p v-if="task.resultPreview" class="detail-line">
            结果摘要: {{ task.resultPreview }}
          </p>
          <p v-if="task.error" class="detail-line warning-text">
            失败原因: {{ task.error }}
          </p>
          <p v-if="task.writeBackError" class="detail-line warning-text">
            回写失败: {{ task.writeBackError }}
          </p>
          <p v-if="task.writeBackTarget" class="detail-line muted-text">
            回写目标: {{ task.writeBackTarget.label || task.writeBackTarget.id }}
          </p>
          <p class="detail-line muted-text">
            请求时间: {{ formatTime(task.requestedAt) }}
            <span v-if="task.finishedAt"> · 完成于 {{ formatTime(task.finishedAt) }}</span>
          </p>
        </article>
      </div>

      <div v-if="taskCount > 0" class="sidebar-pagination">
        <button
          type="button"
          class="ghost-button"
          :disabled="!canGoPrevPage"
          @click="goPrevPage"
        >
          上一页
        </button>
        <button
          type="button"
          class="ghost-button"
          :disabled="!canGoNextPage"
          @click="goNextPage"
        >
          下一页
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Icon } from '@iconify/vue'
import refreshBold from '@iconify-icons/solar/refresh-bold'
import SegmentedSwitch from '@/components/SegmentedSwitch.vue'
import { usePluginSubagentTasks } from '../composables/use-plugin-subagent-tasks'

const {
  loading,
  error,
  searchKeyword,
  filter,
  pagedTasks,
  page,
  pageCount,
  rangeStart,
  rangeEnd,
  canGoPrevPage,
  canGoNextPage,
  goPrevPage,
  goNextPage,
  taskCount,
  filteredTaskCount,
  runningTaskCount,
  errorTaskCount,
  writeBackAttentionCount,
  refreshAll,
} = usePluginSubagentTasks()

const heroHeadline = computed(() => {
  if (taskCount.value === 0) {
    return '等待首个后台任务排队'
  }
  if (runningTaskCount.value > 0) {
    return `${runningTaskCount.value} 个任务仍在执行中`
  }
  if (errorTaskCount.value > 0) {
    return `${errorTaskCount.value} 个任务需要人工关注`
  }

  return `${taskCount.value} 个任务都已落地可追踪`
})

const overviewCards = computed(() => [
  {
    label: '任务总数',
    value: String(taskCount.value),
    note: '后台子代理任务会被持久化记录，刷新页面也不会丢',
    tone: 'accent',
  },
  {
    label: '运行中',
    value: String(runningTaskCount.value),
    note: runningTaskCount.value > 0 ? '仍有任务在排队或运行' : '当前没有活跃任务',
    tone: runningTaskCount.value > 0 ? 'warning' : 'neutral',
  },
  {
    label: '回写关注项',
    value: String(writeBackAttentionCount.value),
    note: '重点关注等待回写或回写失败的任务',
    tone: writeBackAttentionCount.value > 0 ? 'warning' : 'neutral',
  },
  {
    label: '失败任务',
    value: String(errorTaskCount.value),
    note: errorTaskCount.value > 0 ? '失败任务需要回看请求和插件权限' : '当前没有失败任务',
    tone: errorTaskCount.value > 0 ? 'warning' : 'neutral',
  },
])

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'running', label: '运行中' },
  { value: 'completed', label: '已完成' },
  { value: 'error', label: '失败' },
  { value: 'writeback-failed', label: '回写失败' },
]

function statusLabel(status: 'queued' | 'running' | 'completed' | 'error') {
  switch (status) {
    case 'queued':
      return '排队中'
    case 'running':
      return '运行中'
    case 'completed':
      return '已完成'
    default:
      return '失败'
  }
}

function writeBackLabel(status: 'pending' | 'sent' | 'failed' | 'skipped') {
  switch (status) {
    case 'pending':
      return '回写等待中'
    case 'sent':
      return '已回写'
    case 'failed':
      return '回写失败'
    default:
      return '未回写'
  }
}

function formatTime(iso: string) {
  const date = new Date(iso)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString().slice(0, 5)}`
}
</script>

<style scoped>
.subagent-tasks-page {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  min-height: 0;
}

.task-hero,
.task-list-panel {
  border: 1px solid var(--border);
  border-radius: calc(var(--radius) * 1.2);
  background: var(--bg-card);
  padding: 1rem;
}

.task-hero-header,
.panel-header,
.task-card-top,
.panel-controls,
.meta-row {
  display: flex;
  gap: 0.75rem;
}

.task-hero-header,
.panel-header,
.task-card-top {
  justify-content: space-between;
}

.task-hero-side,
.hero-note,
.task-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.hero-kicker,
.panel-kicker,
.hero-note-label {
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

.overview-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.overview-card.warning {
  border-color: rgba(214, 162, 36, 0.4);
}

.panel-controls {
  flex-wrap: wrap;
  align-items: center;
  margin: 1rem 0 0.75rem;
}

.panel-controls input {
  flex: 1 1 240px;
}

.filter-chips,
.meta-row,
.task-title-row {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  align-items: center;
}

.filter-chip,
.meta-chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.3rem 0.65rem;
  font-size: 0.78rem;
  color: var(--text-muted);
  background: transparent;
}

.filter-chip.active,
.link-button:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.task-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.9rem;
}

.status-pill {
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  border: 1px solid var(--border);
  color: var(--text-muted);
}

.status-pill.running,
.status-pill.queued,
.writeback-chip.pending {
  border-color: rgba(214, 162, 36, 0.4);
  color: #b77c15;
}

.status-pill.completed,
.writeback-chip.sent {
  border-color: rgba(44, 125, 88, 0.4);
  color: #2c7d58;
}

.status-pill.error,
.writeback-chip.failed {
  border-color: rgba(184, 74, 74, 0.4);
  color: #b84a4a;
}

.detail-line,
.sidebar-state {
  color: var(--text-muted);
}

.warning-text {
  color: #b84a4a;
}

.muted-text {
  font-size: 0.85rem;
}

.link-button {
  align-self: flex-start;
}

.hero-action.icon-only,
.ghost-button.icon-only {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  padding: 0;
}

.hero-action-icon,
.ghost-button-icon {
  width: 18px;
  height: 18px;
}

@media (max-width: 980px) {
  .task-hero-header,
  .panel-header,
  .task-card-top {
    flex-direction: column;
  }
}
</style>

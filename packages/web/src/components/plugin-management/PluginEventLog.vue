<template>
  <section class="panel-section">
    <div class="section-header">
      <div>
        <h3>事件日志</h3>
        <p>查看插件最近的失败、治理动作与健康检查记录。</p>
      </div>
      <div class="section-actions">
        <label class="control-field">
          <span>最近</span>
          <select
            :value="selectedLimit"
            data-test="event-limit"
            @change="handleLimitChange"
          >
            <option v-for="option in limitOptions" :key="option" :value="option">
              {{ option }}
            </option>
          </select>
        </label>
        <button
          type="button"
          class="ghost-button"
          data-test="event-refresh"
          :disabled="loading"
          @click="emitRefresh()"
        >
          {{ loading ? '刷新中...' : '刷新日志' }}
        </button>
      </div>
    </div>

    <div class="filter-grid">
      <label class="control-field">
        <span>级别</span>
        <select v-model="levelFilter" data-test="event-level-filter">
          <option value="all">全部</option>
          <option value="info">info</option>
          <option value="warn">warn</option>
          <option value="error">error</option>
        </select>
      </label>
      <label class="control-field">
        <span>类型</span>
        <input
          v-model="typeFilter"
          data-test="event-type-filter"
          type="text"
          placeholder="如 tool:error"
        >
      </label>
      <label class="control-field control-span">
        <span>关键词</span>
        <input
          v-model="searchFilter"
          data-test="event-search-filter"
          type="text"
          placeholder="按 message / metadata 搜索"
        >
      </label>
    </div>

    <div v-if="loading && events.length === 0" class="section-empty">加载中...</div>
    <div v-else-if="events.length === 0 && hasActiveQueryFilters" class="section-empty">
      当前筛选下没有事件日志。
    </div>
    <div v-else-if="events.length === 0" class="section-empty">
      当前还没有事件日志。
    </div>
    <div v-else class="event-list">
      <article v-for="event in events" :key="event.id" class="event-item">
        <div class="event-top">
          <span class="event-level" :class="event.level">{{ event.level }}</span>
          <strong>{{ event.type }}</strong>
          <time>{{ formatTime(event.createdAt) }}</time>
        </div>
        <p>{{ event.message }}</p>
        <pre v-if="event.metadata" class="event-metadata">{{ JSON.stringify(event.metadata, null, 2) }}</pre>
      </article>
    </div>
    <button
      v-if="nextCursor"
      type="button"
      class="ghost-button load-more-button"
      data-test="event-load-more"
      :disabled="loading"
      @click="emitLoadMore()"
    >
      {{ loading ? '加载中...' : '加载更多' }}
    </button>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PluginEventQuery, PluginEventRecord } from '@garlic-claw/shared'

const props = defineProps<{
  events: PluginEventRecord[]
  loading: boolean
  query: PluginEventQuery
  nextCursor: string | null
}>()

const emit = defineEmits<{
  refresh: [query: PluginEventQuery]
  loadMore: [query: PluginEventQuery]
}>()

const limitOptions = [20, 50, 100, 200]
const selectedLimit = ref(props.query.limit ?? 50)
const levelFilter = ref<'all' | 'info' | 'warn' | 'error'>('all')
const typeFilter = ref('')
const searchFilter = ref('')
const hasActiveQueryFilters = computed(() =>
  Boolean(props.query.level || props.query.type || props.query.keyword),
)

watch(
  () => props.query,
  (query) => {
    selectedLimit.value = query.limit ?? 50
    levelFilter.value = query.level ?? 'all'
    typeFilter.value = query.type ?? ''
    searchFilter.value = query.keyword ?? ''
  },
  { immediate: true },
)

/**
 * 刷新事件日志列表。
 * @param query 查询条件
 */
function emitRefresh(query = buildQuery()) {
  emit('refresh', query)
}

/**
 * 继续加载下一页事件日志。
 */
function emitLoadMore() {
  if (!props.nextCursor) {
    return
  }

  emit('loadMore', {
    ...buildQuery(),
    cursor: props.nextCursor,
  })
}

/**
 * 在切换条数时同步刷新日志。
 * @param event 原生 change 事件
 */
function handleLimitChange(event: Event) {
  const nextValue = Number((event.target as HTMLSelectElement).value)
  selectedLimit.value = nextValue
  emitRefresh(buildQuery())
}

/**
 * 把 ISO 时间转成人类可读文案。
 * @param value 时间字符串
 * @returns 展示文案
 */
function formatTime(value: string): string {
  return new Date(value).toLocaleString()
}

/**
 * 根据当前表单状态构建服务端查询参数。
 * @returns 查询条件
 */
function buildQuery(): PluginEventQuery {
  return {
    limit: selectedLimit.value,
    ...(levelFilter.value !== 'all' ? { level: levelFilter.value } : {}),
    ...(typeFilter.value.trim() ? { type: typeFilter.value.trim() } : {}),
    ...(searchFilter.value.trim() ? { keyword: searchFilter.value.trim() } : {}),
  }
}
</script>

<style scoped>
.panel-section {
  display: grid;
  gap: 14px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-header h3 {
  font-size: 1rem;
}

.section-header p,
.section-empty {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.section-actions,
.filter-grid {
  display: grid;
  gap: 10px;
}

.section-actions {
  grid-auto-flow: column;
  align-items: end;
  justify-content: end;
}

.filter-grid {
  grid-template-columns: 160px 200px minmax(0, 1fr);
}

.control-field {
  display: grid;
  gap: 6px;
}

.control-field span {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.control-span {
  min-width: 0;
}

.ghost-button {
  background: transparent;
  border: 1px solid var(--border);
}

.load-more-button {
  justify-self: start;
}

.event-list {
  display: grid;
  gap: 10px;
  max-height: 420px;
  overflow-y: auto;
}

.event-item {
  display: grid;
  gap: 8px;
  padding: 0.9rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.event-top {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.event-top time {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.event-level {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  background: var(--bg-input);
  color: var(--text-muted);
}

.event-level.info {
  color: var(--accent-hover);
}

.event-level.warn {
  color: #f0b24b;
}

.event-level.error {
  color: var(--danger);
}

.event-metadata {
  padding: 0.8rem;
  background: var(--bg-input);
  border-radius: 8px;
  color: var(--text-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .section-header,
  .section-actions,
  .filter-grid {
    grid-template-columns: 1fr;
  }

  .section-actions {
    grid-auto-flow: row;
    justify-content: stretch;
  }
}
</style>

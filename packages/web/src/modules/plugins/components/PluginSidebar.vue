<template>
  <section class="plugin-sidebar">
    <div class="sidebar-header">
      <div class="sidebar-header-copy">
        <h2>插件</h2>
        <p>默认聚焦用户可感知插件，系统本地插件按需展开。</p>
      </div>
    </div>

    <div v-if="!loading && plugins.length > 0" class="sidebar-overview">
      <div class="sidebar-stat">
        <span>总数</span>
        <strong>{{ listedPlugins.length }}</strong>
      </div>
      <div class="sidebar-stat">
        <span>在线</span>
        <strong>{{ onlineCount }}</strong>
      </div>
      <div class="sidebar-stat attention">
        <span>需关注</span>
        <strong>{{ issueCount }}</strong>
      </div>
    </div>

    <div v-if="!loading && plugins.length > 0" class="sidebar-tools">
      <ElInput
        v-model="searchKeyword"
        data-test="plugin-sidebar-search"
        placeholder="搜索名称、描述或问题摘要"
      />
      <div v-if="systemBuiltinCount > 0" class="sidebar-system-hint">
        <span class="system-hint-text">
          {{ showSystemBuiltins ? `已显示 ${systemBuiltinCount} 个系统本地插件` : `已隐藏 ${systemBuiltinCount} 个系统本地插件` }}
        </span>
        <ElSwitch
          v-model="showSystemBuiltins"
          data-test="plugin-sidebar-toggle-system"
        />
      </div>
      <HeaderViewSwitch
        :model-value="activeFilter"
        :options="filterOptions"
        :full-width="true"
        size="small"
        aria-label="插件筛选"
        @update:model-value="emit('update:activeFilter', $event)"
      />
    </div>

    <div v-if="!loading && plugins.length > 0" class="sidebar-results">
      <span class="sidebar-results-text">
        匹配 {{ orderedPlugins.length }} / {{ listedPlugins.length }}
        <span v-if="orderedPlugins.length > 0">
          · 第 {{ currentPage }} / {{ pageCount }} 页 · 显示 {{ rangeStart }}-{{ rangeEnd }} 项
        </span>
      </span>
      <ElButton
        v-if="hasActiveFilter"
        class="results-clear"
        data-test="plugin-sidebar-clear-filters"
        @click="clearFilters"
      >
        清除筛选
      </ElButton>
    </div>

    <p v-if="!loading && selectedPluginHidden" class="sidebar-hint">
      当前详情插件未命中筛选条件。
    </p>

    <p v-if="error" class="sidebar-error">{{ error }}</p>

    <div v-if="loading" class="sidebar-state">加载中...</div>
    <div v-else-if="plugins.length === 0" class="sidebar-state">
      当前还没有可管理的插件。
    </div>
    <div v-else-if="orderedPlugins.length === 0" class="sidebar-state">
      {{ hasActiveFilter ? '当前筛选下没有匹配插件。' : '当前还没有可管理的插件。' }}
    </div>
    <div v-else class="plugin-list">
      <ElButton
        v-for="plugin in pagedPlugins"
        :key="plugin.name"
        class="plugin-item"
        :class="{ active: plugin.name === selectedPluginName }"
        @click="$emit('select', plugin.name)"
      >
        <div class="plugin-item-top">
          <strong>{{ plugin.displayName ?? plugin.name }}</strong>
          <span class="runtime-badge">{{ runtimeKindLabel(plugin) }}</span>
        </div>
        <div class="plugin-item-meta">
          <span class="meta-chip">
            <span class="health-dot" :class="healthClass(plugin)" />
            {{ healthLabel(plugin) }}
          </span>
          <span
            v-if="runtimePressureLabel(plugin)"
            class="pressure-badge"
            :class="{ busy: isPluginBusy(plugin) }"
          >
            {{ runtimePressureLabel(plugin) }}
          </span>
        </div>
        <p
          v-if="pluginIssueSummary(plugin)"
          class="plugin-item-issue"
          :class="issueClass(plugin)"
        >
          {{ pluginIssueSummary(plugin) }}
        </p>
        <p class="plugin-item-desc">{{ plugin.description ?? '未填写描述' }}</p>
        <div class="plugin-item-footer">
          <span>{{ pluginSurfaceSummary(plugin) }}</span>
        </div>
      </ElButton>
    </div>

    <div v-if="!loading && orderedPlugins.length > 0" class="sidebar-pagination">
      <ElButton
        class="ghost-button"
        data-test="plugin-sidebar-prev-page"
        :disabled="!canGoPrev"
        @click="goPrevPage"
      >
        上一页
      </ElButton>
      <ElButton
        class="ghost-button"
        data-test="plugin-sidebar-next-page"
        :disabled="!canGoNext"
        @click="goNextPage"
      >
        下一页
      </ElButton>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElInput, ElSwitch } from 'element-plus'
import HeaderViewSwitch from '@/shared/components/HeaderViewSwitch.vue'
import type { PluginInfo } from '@garlic-claw/shared'
import { usePagination } from '@/shared/composables/use-pagination'
import {
  hasPluginIssue,
  isPluginBusy,
  isSystemBuiltinPlugin,
  pluginIssueSummary,
} from '@/modules/plugins/composables/plugin-management.helpers'

const props = defineProps<{
  plugins: PluginInfo[]
  loading: boolean
  selectedPluginName: string | null
  error: string | null
  activeFilter: 'all' | 'attention' | 'local' | 'remote'
  filterOptions: ReadonlyArray<{ label: string; value: string }>
}>()

const emit = defineEmits<{
  (event: 'select', pluginName: string): void
  (event: 'update:activeFilter', value: string): void
}>()

const searchKeyword = ref('')
const showSystemBuiltins = ref(readShowSystemBuiltinsPreference())
const normalizedKeyword = computed(() =>
  searchKeyword.value.trim().toLocaleLowerCase(),
)
const listedPlugins = computed(() =>
  showSystemBuiltins.value
    ? props.plugins
    : props.plugins.filter((plugin) => !isSystemBuiltinPlugin(plugin)),
)
const filteredPlugins = computed(() =>
  listedPlugins.value.filter((plugin) =>
    matchesFilter(plugin) && matchesKeyword(plugin, normalizedKeyword.value),
  ),
)
const orderedPlugins = computed(() =>
  [...filteredPlugins.value].sort((left, right) => {
    const weightDiff = pluginSortWeight(left) - pluginSortWeight(right)
    if (weightDiff !== 0) {
      return weightDiff
    }

    return (left.displayName ?? left.name).localeCompare(right.displayName ?? right.name)
  }),
)
const {
  currentPage,
  pageCount,
  pagedItems: pagedPlugins,
  rangeStart,
  rangeEnd,
  canGoPrev,
  canGoNext,
  resetPage,
  goPrevPage,
  goNextPage,
} = usePagination(orderedPlugins, 8)
const onlineCount = computed(() =>
  listedPlugins.value.filter((plugin) => plugin.connected).length,
)
const issueCount = computed(() =>
  listedPlugins.value.filter((plugin) => hasPluginIssue(plugin)).length,
)
const systemBuiltinCount = computed(() =>
  props.plugins.filter((plugin) => isSystemBuiltinPlugin(plugin)).length,
)
const hasActiveFilter = computed(() =>
  props.activeFilter !== 'all' || normalizedKeyword.value.length > 0,
)
const selectedPluginHidden = computed(() =>
  !!props.selectedPluginName && !filteredPlugins.value.some((plugin) => plugin.name === props.selectedPluginName),
)

watch([searchKeyword, () => props.activeFilter, showSystemBuiltins], () => {
  resetPage()
})

watch(showSystemBuiltins, (value) => {
  persistShowSystemBuiltinsPreference(value)
})

/**
 * 清空当前关键字和快速筛选，恢复完整列表。
 */
function clearFilters() {
  searchKeyword.value = ''
  emit('update:activeFilter', 'all')
  resetPage()
}

/**
 * 判断插件是否符合当前快速筛选类型。
 * @param plugin 插件摘要
 * @returns 是否命中筛选
 */
function matchesFilter(plugin: PluginInfo): boolean {
  switch (props.activeFilter) {
    case 'attention':
      return hasPluginIssue(plugin)
    case 'local':
      return (plugin.runtimeKind ?? 'remote') === 'local'
    case 'remote':
      return (plugin.runtimeKind ?? 'remote') !== 'local'
    default:
      return true
  }
}

/**
 * 判断插件是否匹配当前关键字搜索。
 * @param plugin 插件摘要
 * @param keyword 标准化关键字
 * @returns 是否匹配
 */
function matchesKeyword(plugin: PluginInfo, keyword: string): boolean {
  if (!keyword) {
    return true
  }

  const haystack = [
    plugin.displayName ?? plugin.name,
    plugin.name,
    plugin.description ?? '',
    pluginIssueSummary(plugin) ?? '',
    pluginSurfaceSummary(plugin),
  ]
    .join(' ')
    .toLocaleLowerCase()

  return haystack.includes(keyword)
}

/**
 * 生成插件健康状态的展示文案。
 * @param plugin 插件摘要
 * @returns 健康文案
 */
function healthLabel(plugin: PluginInfo): string {
  switch (plugin.health?.status) {
    case 'healthy':
      return '健康'
    case 'degraded':
      return '降级'
    case 'error':
      return '异常'
    case 'offline':
      return '离线'
    default:
      return '未知'
  }
}

/**
 * 生成插件健康状态的样式类。
 * @param plugin 插件摘要
 * @returns CSS 类名
 */
function healthClass(plugin: PluginInfo): string {
  return plugin.health?.status ?? 'unknown'
}

/**
 * 生成插件运行形态的简短文案。
 * @param plugin 插件摘要
 * @returns `本地` 或 `远程`
 */
function runtimeKindLabel(plugin: PluginInfo): string {
  return (plugin.runtimeKind ?? 'remote') === 'local' ? '本地' : '远程'
}

/**
 * 生成插件运行时压力展示文案。
 * @param plugin 插件摘要
 * @returns 压力文本；缺失时返回 null
 */
function runtimePressureLabel(plugin: PluginInfo): string | null {
  const pressure = plugin.health?.runtimePressure
  if (!pressure) {
    return null
  }

  return `并发 ${pressure.activeExecutions} / ${pressure.maxConcurrentExecutions}`
}

/**
 * 判断插件当前是否已经把并发打满。
 * @param plugin 插件摘要
 * @returns 是否繁忙
 */
/**
 * 生成问题摘要对应的样式类。
 * @param plugin 插件摘要
 * @returns 样式类名
 */
function issueClass(plugin: PluginInfo): string {
  if (isPluginBusy(plugin)) {
    return 'busy'
  }

  return plugin.health?.status ?? 'unknown'
}

/**
 * 计算插件在侧栏中的排序优先级。
 * @param plugin 插件摘要
 * @returns 越小越靠前
 */
function pluginSortWeight(plugin: PluginInfo): number {
  if (!plugin.connected || plugin.health?.status === 'offline') {
    return 0
  }

  if (isPluginBusy(plugin)) {
    return 1
  }

  switch (plugin.health?.status) {
    case 'error':
      return 0
    case 'degraded':
      return 2
    case 'healthy':
      return 3
    default:
      return 4
  }
}

/**
 * 生成插件扩展面的简短摘要，提升侧栏扫描效率。
 * @param plugin 插件摘要
 * @returns 扩展摘要
 */
function pluginSurfaceSummary(plugin: PluginInfo): string {
  return `${plugin.manifest.tools.length} 工具 · ${plugin.manifest.hooks?.length ?? 0} 个钩子 · ${plugin.manifest.routes?.length ?? 0} 条路由`
}

function readShowSystemBuiltinsPreference(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.localStorage.getItem(SHOW_SYSTEM_BUILTINS_STORAGE_KEY) === 'true'
}

function persistShowSystemBuiltinsPreference(value: boolean) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(SHOW_SYSTEM_BUILTINS_STORAGE_KEY, String(value))
}

const SHOW_SYSTEM_BUILTINS_STORAGE_KEY = 'garlic-claw:plugin-sidebar:show-system-builtins'
</script>

<style scoped>
.plugin-sidebar {
  display: grid;
  gap: 14px;
  padding: 1rem;
  min-height: 0;
  position: sticky;
  top: 0.2rem;
}

.sidebar-header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.sidebar-header-copy {
  display: grid;
  gap: 4px;
}

.sidebar-header h2 {
  font-size: 1.14rem;
  font-family: 'Aptos Display', 'Segoe UI Variable Display', 'Trebuchet MS', 'Segoe UI', sans-serif;
}

.sidebar-header p {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.sidebar-overview {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.sidebar-stat {
  display: grid;
  gap: 4px;
  padding: 0.8rem 0.85rem;
  border-radius: 14px;
  border: 1px solid rgba(133, 163, 199, 0.14);
  background: var(--surface-panel-hover-soft);
}

.sidebar-stat span {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.sidebar-stat strong {
  font-size: 1.08rem;
  line-height: 1.1;
}

.sidebar-stat.attention strong {
  color: #f5d38c;
}

.sidebar-tools {
  display: grid;
  gap: 10px;
}

.sidebar-tools :deep(.el-input) {
  width: 100%;
}

.sidebar-system-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 0.65rem 0.8rem;
  border-radius: 12px;
  border: 1px solid rgba(133, 163, 199, 0.14);
  background: var(--surface-panel-hover-faint);
  color: var(--text-muted);
  font-size: 0.78rem;
}

.system-hint-text {
  color: var(--text-muted);
}

.sidebar-system-hint :deep(.el-switch) {
  flex-shrink: 0;
}

.filter-chips {
  --el-radio-button-checked-bg-color: color-mix(in srgb, var(--accent) 12%, transparent);
  --el-radio-button-checked-border-color: rgba(103, 199, 207, 0.22);
  --el-radio-button-checked-text-color: var(--accent);
  --el-radio-button-border-color: rgba(133, 163, 199, 0.14);
  --el-radio-button-bg-color: var(--surface-panel-hover-soft);
  --el-radio-button-text-color: var(--text-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.filter-chips :deep(.el-radio-button__inner) {
  min-height: 30px;
  padding: 0.24rem 0.65rem;
  border-radius: 999px;
  box-shadow: none;
}

.filter-chips :deep(.el-radio-button:first-child .el-radio-button__inner),
.filter-chips :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-radius: 999px;
}

.sidebar-results {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.sidebar-results-text,
.sidebar-hint {
  color: var(--text-muted);
  font-size: 0.8rem;
}

.results-clear {
  min-height: 28px;
  border-radius: 999px;
  font-size: 0.76rem;
}

.results-clear:hover:not(:disabled) {
  background: var(--surface-panel-soft);
}

.sidebar-hint {
  color: #f5d38c;
}

.ghost-button {
  background: var(--surface-panel-hover-soft);
  border: 1px solid var(--border);
  color: var(--text);
}

.ghost-button:hover:not(:disabled) {
  background: var(--surface-panel-muted-strong);
}

.sidebar-error {
  color: var(--danger);
  font-size: 0.85rem;
}

.sidebar-state {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.plugin-list {
  display: grid;
  gap: 6px;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.sidebar-pagination {
  display: flex;
  justify-content: flex-end;
  gap: 18px;
  flex-wrap: wrap;
}

.plugin-item {
  position: relative;
  display: grid;
  gap: 5px;
  text-align: left;
  padding: 0.55rem 0.75rem;
  border-radius: 10px;
  border: 1px solid rgba(133, 163, 199, 0.12);
  background: var(--surface-card-gradient);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
  overflow: hidden;
  transition:
    transform 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.plugin-item::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(120deg, rgba(103, 199, 207, 0.08), transparent 46%, rgba(240, 198, 118, 0.06));
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
}

.plugin-item:hover:not(.active) {
  transform: translateY(-1px);
  border-color: rgba(103, 199, 207, 0.22);
}

.plugin-item.active {
  border-color: rgba(103, 199, 207, 0.34);
  background: var(--surface-hero-gradient);
  box-shadow:
    0 16px 32px rgba(1, 6, 15, 0.26),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.plugin-item.active::after,
.plugin-item:hover::after {
  opacity: 1;
}

.plugin-item-top,
.plugin-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.plugin-item-top strong {
  font-size: 0.9rem;
  line-height: 1.3;
  overflow-wrap: anywhere;
}

.runtime-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(133, 163, 199, 0.16);
  background: var(--surface-panel-soft);
  color: var(--text);
  font-size: 0.75rem;
  text-transform: uppercase;
}

.plugin-item-meta {
  justify-content: flex-start;
  font-size: 0.8rem;
  flex-wrap: wrap;
}

.meta-chip,
.pressure-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0.16rem 0.45rem;
  border-radius: 999px;
  background: var(--surface-panel-hover-soft);
  color: var(--text-muted);
  border: 1px solid rgba(133, 163, 199, 0.1);
}

.plugin-item-desc {
  color: var(--text-muted);
  font-size: 0.78rem;
  line-height: 1.45;
}

.plugin-item-footer {
  padding-top: 0.1rem;
  border-top: 1px solid rgba(133, 163, 199, 0.08);
  color: var(--text);
  font-size: 0.74rem;
}

.plugin-item-issue {
  font-size: 0.8rem;
  line-height: 1.5;
  color: #f0b24b;
  overflow-wrap: anywhere;
}

.plugin-item-issue.busy,
.plugin-item-issue.error {
  color: var(--danger);
}

.pressure-badge {
  background: rgba(103, 199, 207, 0.12);
  color: var(--accent);
  border-color: rgba(103, 199, 207, 0.18);
}

.pressure-badge.busy {
  background: rgba(243, 108, 108, 0.12);
  color: var(--danger);
  border-color: rgba(243, 108, 108, 0.18);
}

.health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-muted);
}

.health-dot.healthy {
  background: var(--success);
}

.health-dot.degraded {
  background: var(--warning);
}

.health-dot.error {
  background: var(--danger);
}

.health-dot.offline {
  background: var(--text-muted);
}

@media (max-width: 960px) {
  .plugin-sidebar {
    position: static;
  }

  .plugin-list {
    grid-auto-flow: column;
    grid-auto-columns: minmax(248px, 82vw);
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 4px;
  }
}

@media (max-width: 720px) {
  .sidebar-header {
    display: grid;
    grid-template-columns: 1fr;
  }

  .filter-chips {
    gap: 6px;
  }

  .sidebar-results {
    display: grid;
    grid-template-columns: 1fr;
  }

  .sidebar-pagination {
    justify-content: stretch;
  }

  .sidebar-pagination > * {
    flex: 1 1 120px;
  }
}

@media (max-width: 540px) {
  .sidebar-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>

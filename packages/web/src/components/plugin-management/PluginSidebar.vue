<template>
  <section class="plugin-sidebar">
    <div class="sidebar-header">
      <div class="sidebar-header-copy">
        <span class="sidebar-kicker">Plugin Index</span>
        <h2>插件</h2>
        <p>默认聚焦用户可感知插件，系统内建按需展开。</p>
      </div>
      <button type="button" class="ghost-button" @click="$emit('refresh')">刷新</button>
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
      <input
        v-model="searchKeyword"
        data-test="plugin-sidebar-search"
        type="text"
        placeholder="搜索名称、描述或问题摘要"
      >
      <div v-if="systemBuiltinCount > 0" class="sidebar-system-hint">
        <span>
          {{ showSystemBuiltins ? `已显示系统内建插件（${systemBuiltinCount}）` : `已隐藏 ${systemBuiltinCount} 个系统内建插件` }}
        </span>
        <button
          type="button"
          class="results-clear"
          data-test="plugin-sidebar-toggle-system"
          @click="showSystemBuiltins = !showSystemBuiltins"
        >
          {{ showSystemBuiltins ? '隐藏系统内建' : '显示系统内建' }}
        </button>
      </div>
      <div class="filter-chips">
        <button
          type="button"
          class="filter-chip"
          data-test="plugin-sidebar-filter-all"
          :class="{ active: activeFilter === 'all' }"
          @click="activeFilter = 'all'"
        >
          全部
        </button>
        <button
          type="button"
          class="filter-chip"
          data-test="plugin-sidebar-filter-attention"
          :class="{ active: activeFilter === 'attention' }"
          @click="activeFilter = 'attention'"
        >
          需关注
        </button>
        <button
          type="button"
          class="filter-chip"
          :class="{ active: activeFilter === 'builtin' }"
          @click="activeFilter = 'builtin'"
        >
          内建
        </button>
        <button
          type="button"
          class="filter-chip"
          :class="{ active: activeFilter === 'remote' }"
          @click="activeFilter = 'remote'"
        >
          远程
        </button>
      </div>
    </div>

    <div v-if="!loading && plugins.length > 0" class="sidebar-results">
      <span class="sidebar-results-text">
        匹配 {{ orderedPlugins.length }} / {{ listedPlugins.length }}
        <span v-if="orderedPlugins.length > 0">
          · 第 {{ currentPage }} / {{ pageCount }} 页 · 显示 {{ rangeStart }}-{{ rangeEnd }} 项
        </span>
      </span>
      <button
        v-if="hasActiveFilter"
        type="button"
        class="results-clear"
        data-test="plugin-sidebar-clear-filters"
        @click="clearFilters"
      >
        清除筛选
      </button>
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
      <button
        v-for="plugin in pagedPlugins"
        :key="plugin.name"
        type="button"
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
          <span class="meta-chip">{{ plugin.connected ? '在线' : '离线' }}</span>
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
      </button>
    </div>

    <div v-if="!loading && orderedPlugins.length > 0" class="sidebar-pagination">
      <button
        type="button"
        class="ghost-button"
        data-test="plugin-sidebar-prev-page"
        :disabled="!canGoPrev"
        @click="goPrevPage"
      >
        上一页
      </button>
      <button
        type="button"
        class="ghost-button"
        data-test="plugin-sidebar-next-page"
        :disabled="!canGoNext"
        @click="goNextPage"
      >
        下一页
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PluginInfo } from '@garlic-claw/shared'
import { usePagination } from '../../composables/use-pagination'
import {
  hasPluginIssue,
  isPluginBusy,
  isSystemBuiltinPlugin,
  pluginIssueSummary,
} from '../../composables/plugin-management.helpers'

const props = defineProps<{
  plugins: PluginInfo[]
  loading: boolean
  selectedPluginName: string | null
  error: string | null
}>()

defineEmits<{
  (event: 'refresh'): void
  (event: 'select', pluginName: string): void
}>()

const searchKeyword = ref('')
const activeFilter = ref<'all' | 'attention' | 'builtin' | 'remote'>('all')
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
} = usePagination(orderedPlugins, 4)
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
  activeFilter.value !== 'all' || normalizedKeyword.value.length > 0,
)
const selectedPluginHidden = computed(() =>
  !!props.selectedPluginName && !filteredPlugins.value.some((plugin) => plugin.name === props.selectedPluginName),
)

watch([searchKeyword, activeFilter, showSystemBuiltins], () => {
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
  activeFilter.value = 'all'
  resetPage()
}

/**
 * 判断插件是否符合当前快速筛选类型。
 * @param plugin 插件摘要
 * @returns 是否命中筛选
 */
function matchesFilter(plugin: PluginInfo): boolean {
  switch (activeFilter.value) {
    case 'attention':
      return hasPluginIssue(plugin)
    case 'builtin':
      return (plugin.runtimeKind ?? 'remote') === 'builtin'
    case 'remote':
      return (plugin.runtimeKind ?? 'remote') !== 'builtin'
    default:
      return true
  }
}

/**
 * 判断插件是否匹配当前关键字搜索。
 * @param plugin 插件摘要
 * @param keyword 归一化关键字
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
 * @returns `内建` 或 `远程`
 */
function runtimeKindLabel(plugin: PluginInfo): string {
  return (plugin.runtimeKind ?? 'remote') === 'builtin' ? '内建' : '远程'
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
  return `${plugin.capabilities.length} 工具 · ${plugin.hooks?.length ?? 0} Hook · ${plugin.routes?.length ?? 0} Route`
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

<style scoped src="./plugin-sidebar.css"></style>

<template>
  <section class="plugin-sidebar">
    <div class="sidebar-header">
      <div class="sidebar-header-copy">
        <span class="sidebar-kicker">Plugin Index</span>
        <h2>插件</h2>
        <p>统一查看内建插件与远程插件。</p>
      </div>
      <button type="button" class="ghost-button" @click="$emit('refresh')">刷新</button>
    </div>

    <div v-if="!loading && plugins.length > 0" class="sidebar-overview">
      <div class="sidebar-stat">
        <span>总数</span>
        <strong>{{ plugins.length }}</strong>
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
      <span class="sidebar-results-text">匹配 {{ orderedPlugins.length }} / {{ plugins.length }}</span>
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
        v-for="plugin in orderedPlugins"
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
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { PluginInfo } from '@garlic-claw/shared'

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
const normalizedKeyword = computed(() =>
  searchKeyword.value.trim().toLocaleLowerCase(),
)
const filteredPlugins = computed(() =>
  props.plugins.filter((plugin) =>
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
const onlineCount = computed(() =>
  props.plugins.filter((plugin) => plugin.connected).length,
)
const issueCount = computed(() =>
  props.plugins.filter((plugin) => hasPluginIssue(plugin)).length,
)
const hasActiveFilter = computed(() =>
  activeFilter.value !== 'all' || normalizedKeyword.value.length > 0,
)
const selectedPluginHidden = computed(() =>
  !!props.selectedPluginName && !filteredPlugins.value.some((plugin) => plugin.name === props.selectedPluginName),
)

/**
 * 清空当前关键字和快速筛选，恢复完整列表。
 */
function clearFilters() {
  searchKeyword.value = ''
  activeFilter.value = 'all'
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
function isPluginBusy(plugin: PluginInfo): boolean {
  const pressure = plugin.health?.runtimePressure
  return !!pressure && pressure.activeExecutions >= pressure.maxConcurrentExecutions
}

/**
 * 判断插件是否处于需要被优先关注的状态。
 * @param plugin 插件摘要
 * @returns 是否需要关注
 */
function hasPluginIssue(plugin: PluginInfo): boolean {
  return isPluginBusy(plugin) || plugin.health?.status === 'error' || plugin.health?.status === 'degraded'
}

/**
 * 生成插件当前最值得优先关注的问题摘要。
 * @param plugin 插件摘要
 * @returns 问题摘要；无问题时返回 null
 */
function pluginIssueSummary(plugin: PluginInfo): string | null {
  const pressure = plugin.health?.runtimePressure
  if (pressure && isPluginBusy(plugin)) {
    return `当前并发已打满（${pressure.activeExecutions} / ${pressure.maxConcurrentExecutions}）`
  }

  const lastError = plugin.health?.lastError?.trim()
  if (lastError && (plugin.health?.status === 'error' || plugin.health?.status === 'degraded')) {
    return `最近错误：${truncateText(lastError, 72)}`
  }

  return null
}

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
  if (isPluginBusy(plugin)) {
    return 0
  }

  switch (plugin.health?.status) {
    case 'error':
      return 1
    case 'degraded':
      return 2
    case 'healthy':
      return 3
    case 'offline':
      return 4
    default:
      return 5
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

/**
 * 截断侧栏中的长文本，避免问题摘要撑爆布局。
 * @param value 原始文本
 * @param maxLength 最大长度
 * @returns 截断后的文本
 */
function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, maxLength - 1)}...`
}
</script>

<style scoped src="./plugin-sidebar.css"></style>

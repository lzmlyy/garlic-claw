<template>
  <section class="plugin-sidebar">
    <div class="sidebar-header">
      <div>
        <h2>插件</h2>
        <p>统一查看内建插件与远程插件。</p>
      </div>
      <button type="button" class="ghost-button" @click="$emit('refresh')">刷新</button>
    </div>

    <p v-if="error" class="sidebar-error">{{ error }}</p>

    <div v-if="loading" class="sidebar-state">加载中...</div>
    <div v-else-if="plugins.length === 0" class="sidebar-state">
      当前还没有可管理的插件。
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
          <span class="runtime-badge">{{ plugin.runtimeKind ?? 'remote' }}</span>
        </div>
        <div class="plugin-item-meta">
          <span class="health-dot" :class="healthClass(plugin)" />
          <span>{{ healthLabel(plugin) }}</span>
          <span>{{ plugin.connected ? '在线' : '离线' }}</span>
          <span
            v-if="runtimePressureLabel(plugin)"
            class="pressure-badge"
            :class="{ busy: isPluginBusy(plugin) }"
          >
            {{ runtimePressureLabel(plugin) }}
          </span>
        </div>
        <p class="plugin-item-desc">{{ plugin.description ?? '未填写描述' }}</p>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
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

const orderedPlugins = computed(() =>
  [...props.plugins].sort((left, right) => {
    const weightDiff = pluginSortWeight(left) - pluginSortWeight(right)
    if (weightDiff !== 0) {
      return weightDiff
    }

    return (left.displayName ?? left.name).localeCompare(right.displayName ?? right.name)
  }),
)

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
</script>

<style scoped>
.plugin-sidebar {
  display: grid;
  gap: 14px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  min-height: 0;
}

.sidebar-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.sidebar-header h2 {
  font-size: 1.1rem;
}

.sidebar-header p {
  color: var(--text-muted);
  font-size: 0.85rem;
}

.ghost-button {
  background: transparent;
  border: 1px solid var(--border);
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
  gap: 10px;
  min-height: 0;
  overflow-y: auto;
}

.plugin-item {
  display: grid;
  gap: 8px;
  text-align: left;
  padding: 0.9rem;
  background: var(--bg);
  border: 1px solid transparent;
}

.plugin-item.active {
  border-color: var(--accent);
  background: rgba(124, 106, 246, 0.14);
}

.plugin-item-top,
.plugin-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.plugin-item-top strong {
  font-size: 0.95rem;
  overflow-wrap: anywhere;
}

.runtime-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  background: var(--bg-input);
  color: var(--text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
}

.plugin-item-meta {
  justify-content: flex-start;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.plugin-item-desc {
  color: var(--text-muted);
  font-size: 0.82rem;
  line-height: 1.5;
}

.pressure-badge {
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  background: rgba(124, 106, 246, 0.14);
  color: var(--accent);
  font-size: 0.72rem;
}

.pressure-badge.busy {
  background: rgba(217, 83, 79, 0.12);
  color: var(--danger);
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
  background: #f0b24b;
}

.health-dot.error {
  background: var(--danger);
}

.health-dot.offline {
  background: #697093;
}

@media (max-width: 960px) {
  .plugin-sidebar {
    order: 2;
  }
}
</style>

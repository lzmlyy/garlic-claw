<template>
  <section class="detail-overview">
    <div class="detail-header">
      <div class="detail-copy">
        <span class="detail-kicker">{{ runtimeKindLabel(plugin) }}</span>
        <h2>{{ plugin.displayName ?? plugin.name }}</h2>
        <p>{{ plugin.description ?? '当前插件没有额外描述。' }}</p>
        <div class="detail-identity">
          <code>{{ plugin.name }}</code>
        </div>
        <div class="detail-status-row">
          <span class="detail-badge runtime">{{ runtimeKindLabel(plugin) }}</span>
          <span class="detail-badge" :class="connectionBadgeClass(plugin)">
            {{ plugin.connected ? '在线连接' : '离线连接' }}
          </span>
          <span class="detail-badge" :class="healthBadgeClass(health)">
            {{ healthText(health) }}
          </span>
          <span class="detail-badge" :class="isRuntimeBusy(health) ? 'warning' : 'neutral'">
            {{ runtimePressureBadgeLabel(health) }}
          </span>
        </div>
      </div>
      <div class="detail-actions">
        <button
          type="button"
          class="ghost-button"
          :disabled="detailLoading"
          @click="$emit('refresh-details')"
        >
          {{ detailLoading ? '同步中...' : '刷新详情' }}
        </button>
        <button
          v-for="action in actions"
          :key="action.name"
          type="button"
          class="ghost-button"
          :disabled="runningAction !== null"
          @click="$emit('run-action', action.name)"
        >
          {{ runningAction === action.name ? action.pendingLabel : action.label }}
        </button>
        <button
          type="button"
          class="ghost-button danger-button"
          :disabled="deleting || !canDelete"
          @click="$emit('delete-selected')"
        >
          {{ deleting ? '删除中...' : '删除记录' }}
        </button>
      </div>
    </div>

    <div class="summary-grid">
      <article class="summary-card">
        <span class="summary-label">连接状态</span>
        <strong>{{ plugin.connected ? '在线' : '离线' }}</strong>
        <p>最后活跃：{{ formatTime(plugin.lastSeenAt) }}</p>
        <span class="summary-foot">{{ runtimeKindLabel(plugin) }}</span>
      </article>
      <article class="summary-card">
        <span class="summary-label">健康状态</span>
        <strong>{{ healthText(health) }}</strong>
        <p>最后成功：{{ formatTime(health?.lastSuccessAt ?? null) }}</p>
        <p>最后检查：{{ formatTime(health?.lastCheckedAt ?? null) }}</p>
        <p>并发占用：{{ formatRuntimePressure(health) }}</p>
      </article>
      <article class="summary-card">
        <span class="summary-label">失败统计</span>
        <strong>{{ health?.failureCount ?? 0 }}</strong>
        <p>连续失败：{{ health?.consecutiveFailures ?? 0 }}</p>
        <span class="summary-foot">最近错误已同步到侧栏摘要</span>
      </article>
      <article class="summary-card">
        <span class="summary-label">能力概览</span>
        <strong>{{ plugin.manifest.tools.length }} 个能力</strong>
        <p>
          {{ plugin.manifest.hooks?.length ?? 0 }} 个 Hook，
          {{ cronCount }} 个 Cron，
          {{ plugin.manifest.routes?.length ?? 0 }} 个 Route，
          {{ plugin.manifest.permissions.length }} 个权限
        </p>
        <span class="summary-foot">当前详情只展示统一协议下的宿主扩展面</span>
      </article>
    </div>

    <div class="tag-panel">
      <article class="tag-group">
        <div class="tag-group-head">
          <span class="tag-label">权限</span>
          <span class="tag-count">{{ plugin.manifest.permissions.length }}</span>
        </div>
        <div class="token-list">
          <span v-for="permission in plugin.manifest.permissions" :key="permission" class="token">
            {{ permission }}
          </span>
          <span v-if="plugin.manifest.permissions.length === 0" class="token muted-token">无</span>
        </div>
      </article>
      <article class="tag-group">
        <div class="tag-group-head">
          <span class="tag-label">Hook</span>
          <span class="tag-count">{{ plugin.manifest.hooks?.length ?? 0 }}</span>
        </div>
        <div class="token-list">
          <span v-for="hook in plugin.manifest.hooks ?? []" :key="hook.name" class="token">
            {{ hook.name }}
          </span>
          <span v-if="!(plugin.manifest.hooks?.length)" class="token muted-token">无</span>
        </div>
      </article>
      <article class="tag-group">
        <div class="tag-group-head">
          <span class="tag-label">扩展面</span>
          <span class="tag-count">{{ highlights.length }}</span>
        </div>
        <div class="token-list">
          <span v-for="highlight in highlights" :key="highlight" class="token accent-token">
            {{ highlight }}
          </span>
          <span v-if="highlights.length === 0" class="token muted-token">基础工具插件</span>
        </div>
      </article>
      <article class="tag-group">
        <div class="tag-group-head">
          <span class="tag-label">工具</span>
          <span class="tag-count">{{ plugin.manifest.tools.length }}</span>
        </div>
        <div class="token-list">
          <span v-for="tool in plugin.manifest.tools" :key="tool.name" class="token">
            {{ tool.name }}
          </span>
          <span v-if="plugin.manifest.tools.length === 0" class="token muted-token">无</span>
        </div>
      </article>
    </div>

    <div v-if="health?.lastError" class="error-card">
      <strong>最近错误</strong>
      <p>{{ health.lastError }}</p>
      <p>最后错误时间：{{ formatTime(health.lastErrorAt ?? null) }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PluginActionName, PluginHealthSnapshot, PluginInfo } from '@garlic-claw/shared'

defineProps<{
  plugin: PluginInfo
  health: PluginHealthSnapshot | null
  actions: Array<{
    name: PluginActionName
    label: string
    pendingLabel: string
  }>
  runningAction: PluginActionName | null
  detailLoading: boolean
  deleting: boolean
  canDelete: boolean
  cronCount: number
  highlights: string[]
}>()

defineEmits<{
  (event: 'refresh-details'): void
  (event: 'run-action', action: PluginActionName): void
  (event: 'delete-selected'): void
}>()

/**
 * 把 ISO 时间转成人类可读文案。
 * @param value 时间字符串
 * @returns 展示文案
 */
function formatTime(value: string | null): string {
  if (!value) {
    return '暂无'
  }

  return new Date(value).toLocaleString()
}

/**
 * 把健康快照转成展示文案。
 * @param health 健康快照
 * @returns 展示文本
 */
function healthText(health: PluginHealthSnapshot | null | undefined): string {
  switch (health?.status) {
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
 * 把运行时并发压力格式化为易读文本。
 * @param health 插件健康快照
 * @returns `active / max` 或占位文本
 */
function formatRuntimePressure(health: PluginHealthSnapshot | null | undefined): string {
  const pressure = health?.runtimePressure
  if (!pressure) {
    return '--'
  }

  return `${pressure.activeExecutions} / ${pressure.maxConcurrentExecutions}`
}

/**
 * 统一生成详情区的并发状态徽标文案。
 * @param health 插件健康快照
 * @returns 展示文本
 */
function runtimePressureBadgeLabel(health: PluginHealthSnapshot | null | undefined): string {
  const pressure = formatRuntimePressure(health)
  return pressure === '--' ? '无并发快照' : `并发 ${pressure}`
}

/**
 * 根据运行形态生成更适合页面展示的文案。
 * @param plugin 当前插件
 * @returns 运行形态标签
 */
function runtimeKindLabel(plugin: PluginInfo): string {
  return (plugin.runtimeKind ?? 'remote') === 'builtin' ? '内建插件' : '远程插件'
}

/**
 * 生成详情区连接徽标样式。
 * @param plugin 当前插件
 * @returns CSS 类名
 */
function connectionBadgeClass(plugin: PluginInfo): string {
  return plugin.connected ? 'success' : 'muted'
}

/**
 * 生成详情区健康徽标样式。
 * @param health 健康快照
 * @returns CSS 类名
 */
function healthBadgeClass(health: PluginHealthSnapshot | null | undefined): string {
  switch (health?.status) {
    case 'healthy':
      return 'success'
    case 'degraded':
      return 'warning'
    case 'error':
      return 'error'
    case 'offline':
      return 'muted'
    default:
      return 'neutral'
  }
}

/**
 * 判断当前插件是否处于满并发繁忙态。
 * @param health 插件健康快照
 * @returns 是否繁忙
 */
function isRuntimeBusy(health: PluginHealthSnapshot | null | undefined): boolean {
  const pressure = health?.runtimePressure
  return !!pressure && pressure.activeExecutions >= pressure.maxConcurrentExecutions
}
</script>

<style scoped src="./plugin-detail-overview.css"></style>

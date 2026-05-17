<template>
  <section class="detail-overview">
    <div class="detail-header">
      <div class="detail-copy">
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
        <ElButton
          class="ghost-button"
          :disabled="detailLoading"
          @click="$emit('refresh-details')"
        >
          {{ detailLoading ? '同步中...' : '刷新详情' }}
        </ElButton>
        <ElButton
          v-for="action in actions"
          :key="action.name"
          class="ghost-button"
          :disabled="runningAction !== null"
          @click="$emit('run-action', action.name)"
        >
          {{ runningAction === action.name ? action.pendingLabel : action.label }}
        </ElButton>
        <ElButton
          class="ghost-button danger-button"
          :disabled="deleting || !canDelete"
          @click="$emit('delete-selected')"
        >
          {{ deleting ? '删除中...' : '删除记录' }}
        </ElButton>
      </div>
    </div>

    <div class="summary-bar">
      <div class="summary-item">
        <div class="summary-item-head">
          <span class="summary-label">连接状态</span>
          <strong>{{ plugin.connected ? '在线' : '离线' }}</strong>
        </div>
        <p>最后活跃：{{ formatTime(plugin.lastSeenAt) }}</p>
        <span class="summary-foot">{{ runtimeKindLabel(plugin) }}</span>
      </div>
      <div class="summary-item">
        <div class="summary-item-head">
          <span class="summary-label">健康</span>
          <strong>{{ healthText(health) }}</strong>
        </div>
        <p v-if="health?.lastSuccessAt">最后成功：{{ formatTime(health.lastSuccessAt) }}</p>
        <p v-if="health?.lastCheckedAt">最后检查：{{ formatTime(health.lastCheckedAt) }}</p>
        <p>并发：{{ formatRuntimePressure(health) }}</p>
      </div>
      <div class="summary-item">
        <div class="summary-item-head">
          <span class="summary-label">失败统计</span>
          <strong>{{ health?.failureCount ?? 0 }}</strong>
        </div>
        <p>连续失败：{{ health?.consecutiveFailures ?? 0 }}</p>
      </div>
      <div class="summary-item">
        <div class="summary-item-head">
          <span class="summary-label">能力概览</span>
          <strong>{{ plugin.manifest.tools.length }} 个工具</strong>
        </div>
        <p>{{ plugin.manifest.hooks?.length ?? 0 }} 个钩子 / {{ cronCount }} 个定时任务 / {{ plugin.manifest.routes?.length ?? 0 }} 条路由 / {{ plugin.manifest.permissions.length }} 项权限</p>
      </div>
    </div>

    <div class="tag-panel">
      <div class="tag-group">
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
      </div>
      <div class="tag-group">
        <div class="tag-group-head">
          <span class="tag-label">钩子</span>
          <span class="tag-count">{{ plugin.manifest.hooks?.length ?? 0 }}</span>
        </div>
        <div class="token-list">
          <span v-for="hook in plugin.manifest.hooks ?? []" :key="hook.name" class="token">
            {{ hook.name }}
          </span>
          <span v-if="!(plugin.manifest.hooks?.length)" class="token muted-token">无</span>
        </div>
      </div>
      <div class="tag-group">
        <div class="tag-group-head">
          <span class="tag-label">扩展面</span>
          <span class="tag-count">{{ highlights.length }}</span>
        </div>
        <div class="token-list">
          <span v-for="highlight in highlights" :key="highlight" class="token">
            {{ highlight }}
          </span>
          <span v-if="highlights.length === 0" class="token muted-token">基础工具插件</span>
        </div>
      </div>
      <div class="tag-group">
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
      </div>
    </div>

    <div v-if="health?.lastError" class="error-card">
      <strong>最近错误</strong>
      <p>{{ health.lastError }}</p>
      <p>最后错误时间：{{ formatTime(health.lastErrorAt ?? null) }}</p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ElButton } from 'element-plus'
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
function formatTime(value: string | null | undefined): string {
  if (!value) {
    return '无'
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
  return (plugin.runtimeKind ?? 'remote') === 'local' ? '本地插件' : '远程插件'
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

<style scoped>
.detail-overview {
  display: grid;
  gap: 16px;
}

.detail-header,
.summary-bar,
.error-card {
  border: 1px solid var(--border);
  background: var(--surface-card-gradient);
}

.detail-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 18px;
  padding: 1.2rem 1.25rem;
  border-radius: 22px;
}

.detail-copy {
  display: grid;
  gap: 10px;
}

.tag-label {
  font-size: 0.76rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.detail-header h2 {
  font-size: clamp(1.45rem, 2vw, 1.8rem);
  font-family: 'Aptos Display', 'Segoe UI Variable Display', 'Trebuchet MS', 'Segoe UI', sans-serif;
}

.detail-header p {
  color: var(--text-muted);
  max-width: 58ch;
}

.detail-identity code {
  display: inline-flex;
  align-items: center;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: var(--surface-panel-muted);
  color: var(--text);
  font-size: 0.78rem;
  font-family: 'JetBrains Mono', monospace;
  overflow-wrap: anywhere;
}

.detail-status-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.76rem;
  font-weight: 600;
}

.detail-badge.runtime,
.detail-badge.neutral {
  background: var(--surface-panel-soft);
  color: var(--text);
  border-color: rgba(133, 163, 199, 0.16);
}

.detail-badge.success {
  background: rgba(89, 207, 155, 0.12);
  color: #c5f9dd;
  border-color: rgba(89, 207, 155, 0.22);
}

.detail-badge.warning {
  background: rgba(240, 198, 118, 0.12);
  color: #f6d893;
  border-color: rgba(240, 198, 118, 0.22);
}

.detail-badge.error {
  background: rgba(243, 108, 108, 0.12);
  color: #ffd6d6;
  border-color: rgba(243, 108, 108, 0.24);
}

.detail-badge.muted {
  background: rgba(107, 121, 148, 0.16);
  color: #c6cedc;
  border-color: rgba(107, 121, 148, 0.22);
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  align-content: start;
  justify-content: flex-end;
  gap: 10px;
  max-width: 360px;
}

.ghost-button {
  background: var(--surface-panel-hover-soft);
  border: 1px solid var(--border);
  color: var(--text);
  backdrop-filter: blur(var(--gc-blur-standard));
  -webkit-backdrop-filter: blur(var(--gc-blur-standard));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
}

.ghost-button:hover:not(:disabled) {
  background: var(--surface-panel-muted-strong);
  border-color: rgba(133, 163, 199, 0.24);
}

.danger-button {
  color: var(--danger);
}

.summary-bar {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0;
  padding: 0.5rem 0;
  border-radius: 18px;
}

.summary-item {
  display: grid;
  gap: 5px;
  padding: 0.6rem 1rem;
  border-right: 1px solid rgba(133, 163, 199, 0.1);
}

.summary-item:last-child {
  border-right: none;
}

.summary-item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}

.summary-item strong {
  font-size: 1.15rem;
}

.summary-item p,
.summary-label {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.summary-foot {
  color: var(--text);
  font-size: 0.74rem;
}

.tag-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-card-gradient);
}

.tag-group {
  display: grid;
  gap: 6px;
  padding: 0.75rem;
  align-content: start;
  border-right: 1px solid rgba(133, 163, 199, 0.08);
  border-bottom: 1px solid rgba(133, 163, 199, 0.08);
}

.tag-group:nth-child(2n) {
  border-right: none;
}

.tag-group:nth-last-child(-n+2) {
  border-bottom: none;
}

.tag-group-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.tag-label,
.tag-count {
  color: var(--text-muted);
}

.tag-count {
  font-size: 0.8rem;
}

.token-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.token {
  display: inline-flex;
  align-items: center;
  padding: 0.22rem 0.5rem;
  border-radius: 6px;
  border: 1px solid rgba(133, 163, 199, 0.14);
  background: var(--surface-panel-muted-strong);
  font-size: 0.8rem;
}

.muted-token {
  color: var(--text-muted);
}

.accent-token {
  background: rgba(89, 207, 155, 0.12);
  color: #cbffd7;
  border: 1px solid rgba(89, 207, 155, 0.24);
}

.error-card {
  display: grid;
  gap: 8px;
  padding: 1rem;
  background:
    linear-gradient(180deg, rgba(61, 21, 24, 0.72), rgba(27, 11, 13, 0.92)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent);
  border: 1px solid rgba(224, 85, 85, 0.24);
  border-radius: 18px;
  color: #ffd5d5;
}

@media (max-width: 1280px) {
  .summary-bar {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-item {
    border-right: none;
  }

  .summary-item:nth-child(odd) {
    border-right: 1px solid rgba(133, 163, 199, 0.1);
  }

  .summary-item:nth-child(-n+2) {
    border-bottom: 1px solid rgba(133, 163, 199, 0.1);
  }
}

@media (max-width: 1100px) {
  .detail-header {
    grid-template-columns: 1fr;
  }

  .detail-actions {
    justify-content: flex-start;
    max-width: none;
  }
}

@media (max-width: 720px) {
  .summary-bar,
  .tag-panel {
    grid-template-columns: 1fr;
  }

  .summary-item {
    border-right: none;
    border-bottom: 1px solid rgba(133, 163, 199, 0.1);
  }

  .summary-item:last-child {
    border-bottom: none;
  }

  .tag-group {
    border-right: none;
  }

  .tag-group:nth-last-child(-n+2) {
    border-bottom: 1px solid rgba(133, 163, 199, 0.08);
  }

  .tag-group:last-child {
    border-bottom: none;
  }

  .detail-badge {
    font-size: 0.74rem;
  }
}
</style>

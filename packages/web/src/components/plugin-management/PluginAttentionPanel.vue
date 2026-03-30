<template>
  <section v-if="attentionPlugins.length > 0" class="attention-panel">
    <div class="attention-header">
      <div>
        <span class="attention-kicker">Recovery Queue</span>
        <h2>重点告警插件</h2>
        <p>借鉴 AstrBot 的失败插件恢复入口，把异常、离线或满并发插件直接抬到顶部处理。</p>
      </div>
      <span class="attention-count">{{ attentionPlugins.length }} 个</span>
    </div>

    <div class="attention-grid">
      <article
        v-for="plugin in attentionPlugins"
        :key="plugin.name"
        class="attention-card"
      >
        <div class="attention-card-top">
          <div class="attention-card-copy">
            <strong>{{ plugin.displayName ?? plugin.name }}</strong>
            <code>{{ plugin.name }}</code>
          </div>
          <span class="attention-badge" :class="issueTone(plugin)">
            {{ issueLabel(plugin) }}
          </span>
        </div>

        <p class="attention-summary">
          {{ pluginIssueSummary(plugin) ?? '当前插件存在需要人工关注的问题。' }}
        </p>

        <div class="attention-meta">
          <span>{{ runtimeKindLabel(plugin) }}</span>
          <span>{{ plugin.connected ? '在线连接' : '离线连接' }}</span>
          <span>{{ healthLabel(plugin) }}</span>
        </div>

        <div class="attention-actions">
          <button
            type="button"
            class="ghost-button"
            :data-test="`plugin-attention-open-${plugin.name}`"
            @click="$emit('select-plugin', plugin.name)"
          >
            打开详情
          </button>
          <button
            v-if="primaryAction(plugin)"
            type="button"
            class="primary-button"
            :disabled="runningAction !== null"
            :data-test="`plugin-attention-action-${plugin.name}`"
            @click="emitRunAction(plugin)"
          >
            {{ runningAction === primaryAction(plugin) ? pendingActionLabel(primaryAction(plugin)!) : actionLabel(primaryAction(plugin)!) }}
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PluginActionName, PluginInfo } from '@garlic-claw/shared'
import {
  hasPluginIssue,
  isPluginBusy,
  pickPrimaryPluginAction,
  pluginAttentionWeight,
  pluginIssueSummary,
} from '../../composables/plugin-management.helpers'

const props = defineProps<{
  plugins: PluginInfo[]
  runningAction: PluginActionName | null
}>()

const emit = defineEmits<{
  (event: 'select-plugin', pluginName: string): void
  (event: 'run-action', payload: {
    pluginName: string
    action: PluginActionName
  }): void
}>()

const attentionPlugins = computed(() =>
  [...props.plugins]
    .filter((plugin) => hasPluginIssue(plugin))
    .sort((left, right) => {
      const weightDiff = pluginAttentionWeight(left) - pluginAttentionWeight(right)
      if (weightDiff !== 0) {
        return weightDiff
      }

      return (left.displayName ?? left.name).localeCompare(right.displayName ?? right.name)
    }),
)

function primaryAction(plugin: PluginInfo): PluginActionName | null {
  return pickPrimaryPluginAction(plugin)
}

function emitRunAction(plugin: PluginInfo) {
  const action = primaryAction(plugin)
  if (!action) {
    return
  }

  emit('run-action', {
    pluginName: plugin.name,
    action,
  })
}

function runtimeKindLabel(plugin: PluginInfo): string {
  return (plugin.runtimeKind ?? 'remote') === 'builtin' ? '内建插件' : '远程插件'
}

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

function issueLabel(plugin: PluginInfo): string {
  if (isPluginBusy(plugin)) {
    return '满并发'
  }
  if (!plugin.connected || plugin.health?.status === 'offline') {
    return '离线'
  }
  if (plugin.health?.status === 'error') {
    return '异常'
  }
  if (plugin.health?.status === 'degraded') {
    return '降级'
  }

  return '关注'
}

function issueTone(plugin: PluginInfo): string {
  if (isPluginBusy(plugin) || plugin.health?.status === 'error') {
    return 'error'
  }
  if (!plugin.connected || plugin.health?.status === 'offline') {
    return 'warning'
  }
  if (plugin.health?.status === 'degraded') {
    return 'neutral'
  }

  return 'neutral'
}

function actionLabel(action: PluginActionName): string {
  switch (action) {
    case 'reload':
      return '重载插件'
    case 'reconnect':
      return '请求重连'
    case 'health-check':
      return '健康检查'
  }
}

function pendingActionLabel(action: PluginActionName): string {
  switch (action) {
    case 'reload':
      return '重载中...'
    case 'reconnect':
      return '重连中...'
    case 'health-check':
      return '检查中...'
  }
}
</script>

<style scoped>
.attention-panel {
  display: grid;
  gap: 14px;
  padding: 1rem 1.05rem;
  border-radius: 22px;
  border: 1px solid rgba(240, 198, 118, 0.22);
  background:
    linear-gradient(135deg, rgba(71, 34, 18, 0.78), rgba(24, 16, 28, 0.86)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.03), transparent);
  box-shadow: 0 20px 44px rgba(1, 6, 15, 0.22);
}

.attention-header,
.attention-card-top,
.attention-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.attention-header h2,
.attention-header p,
.attention-summary {
  margin: 0;
}

.attention-kicker,
.attention-card code {
  font-size: 0.76rem;
}

.attention-kicker {
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #f0c676;
}

.attention-header p,
.attention-summary,
.attention-meta {
  color: var(--text-muted);
}

.attention-count,
.attention-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 0.8rem;
}

.attention-count {
  background: rgba(240, 198, 118, 0.14);
  color: #f5d38c;
}

.attention-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.attention-card {
  display: grid;
  gap: 12px;
  min-width: 0;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid rgba(240, 198, 118, 0.16);
  background: rgba(11, 16, 27, 0.62);
}

.attention-card-copy {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.attention-card-copy strong,
.attention-summary {
  overflow-wrap: anywhere;
}

.attention-badge.error {
  background: rgba(243, 108, 108, 0.14);
  color: #ffb1b1;
}

.attention-badge.warning {
  background: rgba(240, 198, 118, 0.14);
  color: #f5d38c;
}

.attention-badge.neutral {
  background: rgba(103, 199, 207, 0.12);
  color: #d8f6f3;
}

.attention-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 0.8rem;
}

.attention-meta span {
  padding: 0.14rem 0.5rem;
  border-radius: 999px;
  border: 1px solid rgba(133, 163, 199, 0.14);
  background: rgba(9, 17, 29, 0.38);
}

.attention-actions {
  align-items: center;
}

.ghost-button,
.primary-button {
  min-height: 36px;
  padding: 0 14px;
  border-radius: 999px;
}

.ghost-button {
  background: rgba(9, 17, 29, 0.42);
  border: 1px solid var(--border);
  color: var(--text);
}

.primary-button {
  background: linear-gradient(135deg, #f0b24b, #df7a4b);
  color: #111827;
  font-weight: 600;
}

@media (max-width: 1080px) {
  .attention-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .attention-header,
  .attention-card-top,
  .attention-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .attention-actions > * {
    width: 100%;
  }
}
</style>

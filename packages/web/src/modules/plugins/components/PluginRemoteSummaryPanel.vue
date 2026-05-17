<template>
  <section
    v-if="remote"
    class="remote-panel"
    data-test="plugin-remote-summary-panel"
  >
    <div class="remote-panel-header">
      <div>
        <h3>远程接入</h3>
      </div>
      <span class="remote-badge" :class="riskTone" data-test="plugin-remote-risk-badge">
        {{ riskLabel }}
      </span>
    </div>

    <div class="remote-grid">
      <div class="remote-item">
        <span class="remote-label">远程环境</span>
        <strong>{{ environmentLabel }}</strong>
      </div>
      <div class="remote-item">
        <span class="remote-label">鉴权模式</span>
        <strong>{{ authModeLabel }}</strong>
      </div>
      <div class="remote-item">
        <span class="remote-label">能力类型</span>
        <strong>{{ capabilityProfileLabel }}</strong>
      </div>
      <div class="remote-item">
        <span class="remote-label">缓存状态</span>
        <strong>{{ metadataCacheLabel }}</strong>
      </div>
      <div class="remote-item remote-span">
        <span class="remote-label">接入地址</span>
        <code>{{ remote.access.serverUrl || '未配置' }}</code>
      </div>
      <div class="remote-item">
        <span class="remote-label">接入 Key</span>
        <strong>{{ remote.access.accessKey ? '已配置' : '未配置' }}</strong>
      </div>
      <div class="remote-item remote-span">
        <span class="remote-label">最后同步</span>
        <strong>{{ remote.metadataCache.lastSyncedAt || '尚未同步' }}</strong>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PluginInfo } from '@garlic-claw/shared'

const props = defineProps<{
  plugin: PluginInfo
}>()

const remote = computed(() => props.plugin.remote)

const environmentLabel = computed(() => {
  return remote.value?.descriptor.remoteEnvironment === 'iot'
    ? 'IoT 远程插件'
    : 'API 远程插件'
})

const authModeLabel = computed(() => {
  switch (remote.value?.descriptor.auth.mode) {
    case 'none':
      return '无需鉴权'
    case 'optional':
      return '可选 Key'
    case 'required':
      return '必须 Key'
    default:
      return '未知'
  }
})

const capabilityProfileLabel = computed(() => {
  switch (remote.value?.descriptor.capabilityProfile) {
    case 'query':
      return '查询型'
    case 'actuate':
      return '控制型'
    case 'hybrid':
      return '混合型'
    default:
      return '未知'
  }
})

const metadataCacheLabel = computed(() => {
  return remote.value?.metadataCache.status === 'cached'
    ? '已有缓存'
    : '尚未缓存'
})

const riskTone = computed(() => {
  if (!remote.value) {
    return 'neutral'
  }
  if (
    remote.value.descriptor.remoteEnvironment === 'iot'
    || remote.value.descriptor.capabilityProfile !== 'query'
  ) {
    return 'warning'
  }
  return 'neutral'
})

const riskLabel = computed(() => {
  if (!remote.value) {
    return '远程'
  }
  if (
    remote.value.descriptor.remoteEnvironment === 'iot'
    || remote.value.descriptor.capabilityProfile !== 'query'
  ) {
    return '高风险'
  }
  return '查询型'
})
</script>

<style scoped>
.remote-panel {
  display: grid;
  gap: 14px;
  padding: 1rem;
  border-radius: 18px;
  border: 1px solid rgba(103, 199, 207, 0.14);
  background: rgba(8, 15, 26, 0.82);
}

.remote-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.remote-panel-header h3 {
  margin: 2px 0 0;
}

.remote-label {
  font-size: 0.78rem;
  color: var(--text-muted);
}

.remote-badge {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  font-size: 0.8rem;
}

.remote-badge.warning {
  background: rgba(240, 198, 118, 0.14);
  color: #f5d38c;
}

.remote-badge.neutral {
  background: rgba(103, 199, 207, 0.12);
  color: #d8f6f3;
}

.remote-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.remote-item {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 14px;
  background: var(--gc-atmosphere-1);
}

.remote-item code {
  overflow-wrap: anywhere;
}

.remote-span {
  grid-column: span 2;
}

@media (max-width: 720px) {
  .remote-grid {
    grid-template-columns: 1fr;
  }

  .remote-span {
    grid-column: span 1;
  }
}
</style>

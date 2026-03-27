<template>
  <div class="devices-view">
    <div class="devices-header">
      <h1>设备管理</h1>
      <button class="btn-refresh" @click="loadPlugins">刷新</button>
    </div>

    <div v-if="loading" class="devices-loading">加载中...</div>

    <div v-else-if="plugins.length === 0" class="devices-empty">
      <p>暂无设备连接</p>
      <p class="hint">启动 plugin-pc 等插件后，设备将显示在这里</p>
    </div>

    <div v-else class="devices-grid">
      <div
        v-for="plugin in plugins"
        :key="plugin.name"
        class="device-card"
        :class="{ online: plugin.connected }"
      >
        <div class="device-header">
          <span class="device-icon">{{ deviceIcon(plugin.deviceType) }}</span>
          <div class="device-info">
            <h3>{{ plugin.name }}</h3>
            <span class="device-type">{{ plugin.deviceType.toUpperCase() }}</span>
          </div>
          <span class="status-dot" :class="plugin.connected ? 'online' : 'offline'" />
        </div>
        <div class="device-status">
          {{ plugin.connected ? '在线' : '离线' }}
          <span v-if="plugin.lastSeenAt" class="last-seen">
            · 最后活跃 {{ formatTime(plugin.lastSeenAt) }}
          </span>
        </div>
        <div v-if="plugin.capabilities.length" class="capabilities">
          <h4>能力 ({{ plugin.capabilities.length }})</h4>
          <div v-for="cap in plugin.capabilities" :key="cap.name" class="capability-item">
            <span class="cap-name">{{ cap.name }}</span>
            <span class="cap-desc">{{ cap.description }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { PluginInfo } from '@garlic-claw/shared'
import { listPlugins } from '../api'

const plugins = ref<PluginInfo[]>([])
const loading = ref(true)

function deviceIcon(type: string) {
  switch (type) {
    case 'pc': return '💻'
    case 'mobile': return '📱'
    case 'iot': return '🔌'
    case 'api': return '🌐'
    default: return '📦'
  }
}

function formatTime(iso: string) {
  const d = new Date(iso)
  const now = Date.now()
  const diff = now - d.getTime()
  if (diff < 60000) return '刚刚'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
  return d.toLocaleDateString()
}

async function loadPlugins() {
  loading.value = true
  try {
    plugins.value = await listPlugins()
  } catch (e) {
    console.error('无法加载插件/设备:', e)
  } finally {
    loading.value = false
  }
}

onMounted(loadPlugins)
</script>

<style scoped>
.devices-view {
  padding: 1.5rem 2rem;
  overflow-y: auto;
  height: 100%;
}
.devices-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}
.devices-header h1 {
  font-size: 1.4rem;
}
.btn-refresh {
  font-size: 0.85rem;
  padding: 0.4em 1em;
}
.devices-loading, .devices-empty {
  text-align: center;
  padding: 3rem 0;
  color: var(--text-muted);
}
.devices-empty .hint {
  font-size: 0.85rem;
  margin-top: 0.5rem;
}
.devices-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: 1rem;
}
.device-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 1.2rem;
  border: 1px solid var(--border);
  transition: border-color 0.2s;
}
.device-card.online {
  border-color: var(--success);
}
.device-header {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  margin-bottom: 0.6rem;
}
.device-icon {
  font-size: 1.8rem;
}
.device-info {
  flex: 1;
}
.device-info h3 {
  font-size: 1rem;
  margin-bottom: 0;
}
.device-type {
  font-size: 0.75rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.status-dot.online {
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
}
.status-dot.offline {
  background: var(--text-muted);
}
.device-status {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.8rem;
}
.last-seen {
  font-size: 0.8rem;
}
.capabilities h4 {
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.4rem;
}
.capability-item {
  display: flex;
  flex-direction: column;
  padding: 0.4em 0.6em;
  background: var(--bg-input);
  border-radius: var(--radius);
  margin-bottom: 0.3rem;
}
.cap-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--accent);
  font-family: 'Cascadia Code', 'Fira Code', monospace;
}
.cap-desc {
  font-size: 0.8rem;
  color: var(--text-muted);
}
</style>

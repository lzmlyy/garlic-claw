<template>
  <aside class="sidebar-card">
    <div class="sidebar-header">
      <div>
        <h2>供应商</h2>
        <p>管理可用供应商、默认模型和连接状态。</p>
      </div>
      <div class="sidebar-actions">
        <button type="button" class="ghost-button" @click="$emit('refresh')">刷新</button>
        <button type="button" class="primary-button" @click="$emit('create')">新增</button>
      </div>
    </div>

    <p v-if="error" class="status-text error">{{ error }}</p>
    <p v-else-if="loading" class="status-text">加载中...</p>
    <p v-else-if="providers.length === 0" class="status-text">还没有可用 provider。</p>

    <div v-else class="provider-list">
      <button
        v-for="provider in providers"
        :key="provider.id"
        type="button"
        class="provider-item"
        :class="{ active: provider.id === selectedProviderId }"
        @click="$emit('select', provider.id)"
      >
        <div class="provider-title">
          <strong>{{ provider.name }}</strong>
          <span class="provider-mode">{{ provider.mode }}</span>
        </div>
        <div class="provider-meta">
          <span>{{ provider.id }}</span>
          <span>{{ provider.modelCount }} 模型</span>
        </div>
        <div class="provider-meta">
          <span>{{ provider.driver }}</span>
          <span :class="provider.available ? 'ready' : 'missing'">
            {{ provider.available ? '可用' : '缺少凭据' }}
          </span>
        </div>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import type { AiProviderSummary } from '@garlic-claw/shared'

defineProps<{
  providers: AiProviderSummary[]
  selectedProviderId: string | null
  loading: boolean
  error: string | null
}>()

defineEmits<{
  (event: 'select', providerId: string): void
  (event: 'create'): void
  (event: 'refresh'): void
}>()
</script>

<style scoped>
.sidebar-card {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--bg-card);
  min-width: 0;
}

.sidebar-header,
.sidebar-actions,
.provider-title,
.provider-meta {
  display: flex;
  gap: 10px;
}

.sidebar-header {
  justify-content: space-between;
  align-items: start;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.sidebar-header h2 {
  margin: 0 0 6px;
}

.sidebar-header p,
.status-text {
  margin: 0;
  color: var(--text-muted);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.sidebar-actions {
  flex-wrap: wrap;
  justify-content: end;
}

.provider-list {
  display: grid;
  gap: 10px;
}

.provider-item {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-input);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  min-width: 0;
}

.provider-item.active {
  border-color: var(--accent);
  background: rgba(124, 106, 246, 0.08);
}

.provider-title {
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
  min-width: 0;
  flex-wrap: wrap;
}

.provider-meta {
  justify-content: space-between;
  color: var(--text-muted);
  font-size: 13px;
  min-width: 0;
  flex-wrap: wrap;
}

.provider-title strong,
.provider-meta span {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.provider-mode,
.ready,
.missing {
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
}

.provider-mode {
  background: rgba(124, 106, 246, 0.14);
  color: var(--accent);
}

.ready {
  background: rgba(68, 204, 136, 0.14);
  color: var(--success);
}

.missing {
  background: rgba(224, 85, 85, 0.14);
  color: var(--danger);
}

.primary-button,
.ghost-button {
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
}

.primary-button {
  border: none;
  background: var(--accent);
  color: #fff;
}

.ghost-button {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
}

.error {
  color: var(--danger);
}

@media (max-width: 720px) {
  .sidebar-card {
    padding: 16px;
  }

  .sidebar-actions {
    width: 100%;
    justify-content: stretch;
  }

  .sidebar-actions > * {
    flex: 1 1 120px;
  }
}
</style>

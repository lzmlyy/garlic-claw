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

    <template v-else>
      <div class="sidebar-tools">
        <input
          v-model="searchKeyword"
          data-test="provider-sidebar-search"
          type="text"
          placeholder="搜索名称、ID、驱动或状态"
        >
        <div class="sidebar-results">
          <span>匹配 {{ filteredProviders.length }} / {{ providers.length }}</span>
          <span v-if="filteredProviders.length > 0">
            第 {{ currentPage }} / {{ pageCount }} 页
            <span class="divider">·</span>
            显示 {{ rangeStart }}-{{ rangeEnd }} 项
          </span>
        </div>
      </div>

      <div v-if="filteredProviders.length === 0" class="status-text">
        当前筛选下没有匹配的 provider。
      </div>
      <div v-else class="provider-list">
        <button
          v-for="provider in pagedProviders"
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

      <div v-if="filteredProviders.length > 0" class="pager-actions">
        <button
          type="button"
          class="ghost-button"
          data-test="provider-sidebar-prev-page"
          :disabled="!canGoPrev"
          @click="goPrevPage"
        >
          上一页
        </button>
        <button
          type="button"
          class="ghost-button"
          data-test="provider-sidebar-next-page"
          :disabled="!canGoNext"
          @click="goNextPage"
        >
          下一页
        </button>
      </div>
    </template>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AiProviderSummary } from '@garlic-claw/shared'
import { usePagination } from '../../composables/use-pagination'

const props = defineProps<{
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

const searchKeyword = ref('')
const filteredProviders = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return props.providers
  }

  return props.providers.filter((provider) =>
    [
      provider.name,
      provider.id,
      provider.driver,
      provider.mode,
      provider.available ? '可用' : '缺少凭据',
    ]
      .join(' ')
      .toLowerCase()
      .includes(keyword),
  )
})
const {
  currentPage,
  pageCount,
  pagedItems: pagedProviders,
  rangeStart,
  rangeEnd,
  canGoPrev,
  canGoNext,
  resetPage,
  goPrevPage,
  goNextPage,
} = usePagination(filteredProviders, 6)

watch(searchKeyword, () => {
  resetPage()
})
</script>

<style scoped>
.sidebar-card {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(14, 24, 38, 0.85);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 12px 28px rgba(1, 6, 15, 0.2), 0 0 15px rgba(103, 199, 207, 0.08);
  min-width: 0;
}

.sidebar-header,
.sidebar-actions,
.provider-title,
.provider-meta,
.sidebar-results,
.pager-actions {
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

.sidebar-tools {
  display: grid;
  gap: 10px;
  margin-bottom: 12px;
}

.sidebar-tools input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(11, 21, 35, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text);
}

.sidebar-tools input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.24);
}

.sidebar-results {
  justify-content: space-between;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 13px;
}

.divider {
  margin: 0 6px;
}

.provider-list {
  display: grid;
  gap: 10px;
  max-height: min(420px, 52vh);
  overflow-y: auto;
  padding-right: 4px;
}

.provider-item {
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: rgba(11, 21, 35, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text);
  text-align: left;
  cursor: pointer;
  min-width: 0;
  transition: all 0.15s ease;
}

.provider-item:hover {
  background: rgba(11, 21, 35, 0.85);
  border-color: var(--border-hover);
}

.provider-item.active {
  border-color: var(--accent);
  background: rgba(103, 199, 207, 0.14);
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

.pager-actions {
  justify-content: end;
  margin-top: 12px;
  flex-wrap: wrap;
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

  .pager-actions {
    justify-content: stretch;
  }

  .pager-actions > * {
    flex: 1 1 120px;
  }
}
</style>

<template>
  <section class="panel-card">
    <div v-if="provider" class="panel-header">
      <div>
        <h2>{{ provider.name }}</h2>
        <p>{{ provider.id }} · {{ getProviderModeLabel(provider, catalog) }} · {{ getProviderDriverLabel(provider, catalog) }}</p>
      </div>
      <div class="header-actions">
        <button type="button" class="ghost-button" :disabled="discoveringModels" @click="$emit('discover-models')">
          {{ discoveringModels ? '拉取中...' : '拉取模型' }}
        </button>
        <button type="button" class="ghost-button" :disabled="testingConnection" @click="$emit('test-connection')">
          {{ testingConnection ? '测试中...' : '测试连接' }}
        </button>
        <button type="button" class="ghost-button" @click="$emit('edit-provider')">编辑</button>
        <button type="button" class="danger-button" @click="$emit('delete-provider')">删除</button>
      </div>
    </div>

    <p v-if="!provider" class="empty-state">从左侧选择 provider 后查看模型配置。</p>

    <template v-else>
      <p v-if="connectionResult" class="status-text" :class="connectionResult.kind">
        {{ connectionResult.text }}
      </p>

      <div class="add-row">
        <input v-model="newModelId" placeholder="新增模型 ID" />
        <input v-model="newModelName" placeholder="可选名称" />
        <button type="button" class="primary-button" :disabled="!newModelId.trim()" @click="addModel">
          添加模型
        </button>
      </div>

      <div v-if="models.length > 0" class="toolbar-row">
        <input
          v-model="searchKeyword"
          data-test="provider-models-search"
          placeholder="搜索模型 ID 或名称"
        />
        <div class="toolbar-summary">
          <span>
            匹配 {{ filteredModels.length }} / {{ models.length }}
            <span v-if="filteredModels.length > 0">
              · 第 {{ currentPage }} / {{ pageCount }} 页 · 显示 {{ rangeStart }}-{{ rangeEnd }} 项
            </span>
          </span>
        </div>
      </div>

      <div v-if="models.length === 0" class="empty-state">当前 provider 还没有模型。</div>
      <div v-else-if="filteredModels.length === 0" class="empty-state">当前筛选下没有匹配模型。</div>

      <div v-else class="model-list">
        <article v-for="model in pagedModels" :key="model.id" class="model-item">
          <div class="model-summary">
            <div>
              <strong>{{ model.name }}</strong>
              <p>{{ model.id }}</p>
            </div>
            <div class="summary-actions">
              <span v-if="provider.defaultModel === model.id" class="default-badge">默认</span>
              <button
                v-else
                type="button"
                class="ghost-button"
                @click="$emit('set-default-model', model.id)"
              >
                设为默认
              </button>
              <button type="button" class="danger-button" @click="$emit('delete-model', model.id)">
                删除
              </button>
            </div>
          </div>

          <AiModelCapabilityToggles
            :capabilities="model.capabilities"
            @update="emitCapabilities(model, $event)"
          />

          <div class="context-length-row">
            <label class="context-length-field">
              <span>上下文长度</span>
              <input
                :value="contextLengthDraftByModelId[model.id] ?? String(model.contextLength)"
                :data-test="`context-length-input-${model.id}`"
                min="1"
                step="1"
                type="number"
                @input="handleContextLengthInput(model.id, $event)"
              />
            </label>
            <button
              type="button"
              class="ghost-button"
              :data-test="`context-length-save-${model.id}`"
              :disabled="!canSaveContextLength(model)"
              @click="saveContextLength(model)"
            >
              保存上下文
            </button>
          </div>
          <p class="context-length-hint">默认值 131072，仅在模型未显式配置时自动补齐。</p>
        </article>
      </div>

      <div v-if="filteredModels.length > 0" class="pager-actions">
        <button
          type="button"
          class="ghost-button"
          data-test="provider-models-prev-page"
          :disabled="!canGoPrev"
          @click="goPrevPage"
        >
          上一页
        </button>
        <button
          type="button"
          class="ghost-button"
          data-test="provider-models-next-page"
          :disabled="!canGoNext"
          @click="goNextPage"
        >
          下一页
        </button>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  AiModelConfig,
  AiProviderConfig,
  AiProviderCatalogItem,
} from '@garlic-claw/shared'
import AiModelCapabilityToggles from './AiModelCapabilityToggles.vue'
import { usePagination } from '@/composables/use-pagination'
import { getProviderDriverLabel, getProviderModeLabel } from './provider-catalog'

const props = defineProps<{
  provider: AiProviderConfig | null
  catalog: AiProviderCatalogItem[]
  models: AiModelConfig[]
  discoveringModels: boolean
  testingConnection: boolean
  connectionResult: {
    kind: 'success' | 'error'
    text: string
  } | null
}>()

const emit = defineEmits<{
  (event: 'edit-provider'): void
  (event: 'delete-provider'): void
  (event: 'discover-models'): void
  (event: 'test-connection'): void
  (event: 'add-model', payload: { modelId: string; name?: string }): void
  (event: 'delete-model', modelId: string): void
  (event: 'set-default-model', modelId: string): void
  (event: 'update-capabilities', payload: { modelId: string; capabilities: AiModelConfig['capabilities'] }): void
  (event: 'update-context-length', payload: { modelId: string; contextLength: number }): void
}>()

const newModelId = ref('')
const newModelName = ref('')
const searchKeyword = ref('')
const contextLengthDraftByModelId = ref<Record<string, string>>({})

const filteredModels = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  if (!keyword) {
    return props.models
  }

  return props.models.filter((model) =>
    model.id.toLowerCase().includes(keyword) ||
    model.name.toLowerCase().includes(keyword),
  )
})
const {
  currentPage,
  pageCount,
  pagedItems: pagedModels,
  rangeStart,
  rangeEnd,
  canGoPrev,
  canGoNext,
  resetPage,
  goPrevPage,
  goNextPage,
} = usePagination(filteredModels, 3)

watch(searchKeyword, () => {
  resetPage()
})

watch(
  () => props.provider?.id,
  () => {
    searchKeyword.value = ''
    resetPage()
  },
)

watch(
  () => props.models,
  (models) => {
    contextLengthDraftByModelId.value = Object.fromEntries(
      models.map((model) => [model.id, String(model.contextLength)]),
    )
  },
  { immediate: true },
)

function addModel() {
  emit('add-model', {
    modelId: newModelId.value.trim(),
    name: newModelName.value.trim() || undefined,
  })
  newModelId.value = ''
  newModelName.value = ''
}

function emitCapabilities(
  model: AiModelConfig,
  capabilities: AiModelConfig['capabilities'],
) {
  emit('update-capabilities', {
    modelId: model.id,
    capabilities,
  })
}

function updateContextLengthDraft(modelId: string, value: string) {
  contextLengthDraftByModelId.value = {
    ...contextLengthDraftByModelId.value,
    [modelId]: value,
  }
}

function handleContextLengthInput(modelId: string, event: Event) {
  updateContextLengthDraft(modelId, (event.target as HTMLInputElement).value)
}

function canSaveContextLength(model: AiModelConfig) {
  const draft = Number(contextLengthDraftByModelId.value[model.id] ?? model.contextLength)
  return Number.isInteger(draft) && draft > 0 && draft !== model.contextLength
}

function saveContextLength(model: AiModelConfig) {
  const contextLength = Number(contextLengthDraftByModelId.value[model.id] ?? model.contextLength)
  if (!Number.isInteger(contextLength) || contextLength <= 0) {
    return
  }
  emit('update-context-length', {
    modelId: model.id,
    contextLength,
  })
}
</script>

<style scoped>
.panel-card {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(14, 24, 38, 0.85);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 12px 28px rgba(1, 6, 15, 0.2), 0 0 15px rgba(103, 199, 207, 0.08);
  min-width: 0;
}

.panel-header,
.header-actions,
.model-summary,
.summary-actions,
.add-row,
.pager-actions {
  display: flex;
  gap: 12px;
}

.panel-header,
.model-summary {
  justify-content: space-between;
  align-items: start;
  flex-wrap: wrap;
}

.panel-header h2,
.panel-header p,
.model-summary p {
  margin: 0;
}

.panel-header p,
.model-summary p,
.empty-state,
.status-text {
  color: var(--text-muted);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.panel-header > div,
.model-summary > div:first-child {
  min-width: 0;
  flex: 1 1 240px;
}

.header-actions,
.summary-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.add-row {
  margin: 18px 0;
  flex-wrap: wrap;
}

.toolbar-row {
  display: grid;
  gap: 10px;
  margin: 0 0 18px;
}

.context-length-row {
  display: flex;
  gap: 12px;
  align-items: end;
  margin-top: 14px;
  flex-wrap: wrap;
}

.context-length-field {
  display: grid;
  gap: 8px;
  flex: 1 1 220px;
}

.context-length-field span,
.context-length-hint {
  color: var(--text-muted);
  font-size: 13px;
}

.context-length-field input {
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

.context-length-field input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.24);
}

.context-length-hint {
  margin: 10px 0 0;
}

.toolbar-row input {
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

.toolbar-row input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.24);
}

.toolbar-summary {
  color: var(--text-muted);
  font-size: 13px;
}

.add-row input {
  flex: 1;
  min-width: 180px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(11, 21, 35, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text);
}

.add-row input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.24);
}

.model-list {
  display: grid;
  gap: 12px;
  max-height: min(900px, 68vh);
  overflow-y: auto;
  padding-right: 4px;
}

.status-text {
  margin: 0 0 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--bg-input);
}

.status-text.success {
  color: var(--success);
}

.status-text.error {
  color: var(--danger);
}

.model-item {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: rgba(11, 21, 35, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  min-width: 0;
}

.model-item:hover {
  background: rgba(11, 21, 35, 0.85);
  border-color: var(--border-hover);
}

.default-badge,
.primary-button,
.ghost-button,
.danger-button {
  padding: 8px 12px;
  border-radius: 10px;
}

.ghost-button,
.danger-button,
.primary-button {
  max-width: 100%;
}

.default-badge {
  background: rgba(68, 204, 136, 0.14);
  color: var(--success);
}

.primary-button {
  border: none;
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}

.ghost-button {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.danger-button {
  border: 1px solid rgba(224, 85, 85, 0.32);
  background: rgba(224, 85, 85, 0.14);
  color: var(--danger);
  cursor: pointer;
}

.pager-actions {
  justify-content: end;
  margin-top: 16px;
  flex-wrap: wrap;
}

@media (max-width: 720px) {
  .panel-card {
    padding: 16px;
  }

  .panel-header,
  .model-summary {
    flex-direction: column;
  }

  .header-actions,
  .summary-actions {
    width: 100%;
    justify-content: stretch;
  }

  .header-actions > *,
  .summary-actions > * {
    flex: 1 1 140px;
  }

  .pager-actions {
    justify-content: stretch;
  }

  .pager-actions > * {
    flex: 1 1 120px;
  }
}
</style>

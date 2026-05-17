<template>
  <section class="panel-card">
    <div v-if="provider" class="panel-header">
      <div>
        <h2>{{ provider.name }}</h2>
        <p>{{ provider.id }} · {{ getProviderKindLabel(provider, catalog) }} · {{ getProviderDriverLabel(provider, catalog) }}</p>
      </div>
      <div class="header-actions">
        <ElButton class="ghost-button" :disabled="discoveringModels" @click="$emit('discover-models')">
          {{ discoveringModels ? '发现中...' : '发现模型' }}
        </ElButton>
        <ElButton class="ghost-button" :disabled="testingConnection" @click="$emit('test-connection')">
          {{ testingConnection ? '测试中...' : '测试连接' }}
        </ElButton>
        <ElButton class="ghost-button" @click="$emit('edit-provider')">编辑</ElButton>
        <ElButton class="danger-button" @click="$emit('delete-provider')">删除</ElButton>
      </div>
    </div>

    <p v-if="!provider" class="empty-state">请从左侧选择服务商。</p>

    <template v-else>
      <p v-if="currentDefaultLabel" class="status-text default-summary">
        当前默认：{{ currentDefaultLabel }}
      </p>

      <p v-if="connectionResult" class="status-text" :class="connectionResult.kind">
        {{ connectionResult.text }}
      </p>

      <div class="add-row">
        <ElInput v-model="newModelId" placeholder="新增模型 ID" />
        <ElInput v-model="newModelName" placeholder="可选名称" />
        <ElButton type="primary" class="primary-button" :disabled="!newModelId.trim()" @click="addModel">
          添加模型
        </ElButton>
      </div>

      <div v-if="models.length > 0" class="toolbar-row">
        <ElInput
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
              <span v-if="isCurrentDefaultModel(model.id)" class="default-badge">当前默认</span>
              <ElButton
                v-else
                class="ghost-button"
                @click="$emit('set-default-model', model.id)"
              >
                设为当前默认
              </ElButton>
              <ElButton class="danger-button" @click="$emit('delete-model', model.id)">
                删除
              </ElButton>
            </div>
          </div>

          <AiModelCapabilityToggles
            :capabilities="model.capabilities"
            @update="emitCapabilities(model, $event)"
          />

          <div class="context-length-row">
            <label class="context-length-field">
              <span>上下文长度</span>
              <ElInput
                :model-value="contextLengthDraftByModelId[model.id] ?? String(model.contextLength)"
                :data-test="`context-length-input-${model.id}`"
                type="number"
                @input="handleContextLengthInput(model.id, $event)"
              />
            </label>
            <ElButton
              class="ghost-button"
              :data-test="`context-length-save-${model.id}`"
              :disabled="!canSaveContextLength(model)"
              @click="saveContextLength(model)"
            >
              保存上下文
            </ElButton>
          </div>
          <p class="context-length-hint">默认值 131072，仅在模型未显式配置时自动补齐。</p>
        </article>
      </div>

      <div v-if="filteredModels.length > 0" class="pager-actions">
        <ElButton
          class="ghost-button"
          data-test="provider-models-prev-page"
          :disabled="!canGoPrev"
          @click="goPrevPage"
        >
          上一页
        </ElButton>
        <ElButton
          class="ghost-button"
          data-test="provider-models-next-page"
          :disabled="!canGoNext"
          @click="goNextPage"
        >
          下一页
        </ElButton>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElInput } from 'element-plus'
import type {
  AiDefaultProviderSelection,
  AiModelConfig,
  AiProviderConfig,
  AiProviderCatalogItem,
} from '@garlic-claw/shared'
import AiModelCapabilityToggles from './AiModelCapabilityToggles.vue'
import { usePagination } from '@/shared/composables/use-pagination'
import { getProviderDriverLabel, getProviderKindLabel } from './provider-catalog'

const props = defineProps<{
  provider: AiProviderConfig | null
  defaultSelection: AiDefaultProviderSelection
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

const currentDefaultLabel = computed(() => {
  if (!props.defaultSelection.providerId || !props.defaultSelection.modelId) {
    return ''
  }
  return `${props.defaultSelection.providerId} / ${props.defaultSelection.modelId}`
})

const newModelId = ref('')
const newModelName = ref('')
const searchKeyword = ref('')
const contextLengthDraftByModelId = ref<Record<string, string>>({})
const contextLengthBaseByModelId = ref<Record<string, string>>({})

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

function isCurrentDefaultModel(modelId: string) {
  return props.provider?.id === props.defaultSelection.providerId
    && props.defaultSelection.modelId === modelId
}
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
    const nextDrafts: Record<string, string> = {}
    const nextBases: Record<string, string> = {}
    for (const model of models) {
      const nextBase = String(model.contextLength)
      const previousBase = contextLengthBaseByModelId.value[model.id]
      const previousDraft = contextLengthDraftByModelId.value[model.id]
      nextBases[model.id] = nextBase
      if (previousDraft === undefined) {
        nextDrafts[model.id] = nextBase
        continue
      }
      nextDrafts[model.id] = previousBase !== nextBase ? nextBase : previousDraft
    }
    contextLengthBaseByModelId.value = nextBases
    contextLengthDraftByModelId.value = nextDrafts
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

function handleContextLengthInput(modelId: string, value: string | number) {
  updateContextLengthDraft(modelId, String(value))
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
  background: var(--surface-panel);
  backdrop-filter: blur(var(--gc-blur-deep));
  -webkit-backdrop-filter: blur(var(--gc-blur-deep));
  box-shadow: var(--gc-shadow-lg), var(--gc-shadow-glow);
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

.context-length-field :deep(.el-input) {
  width: 100%;
}

.context-length-hint {
  margin: 10px 0 0;
}

.toolbar-row :deep(.el-input) {
  width: 100%;
}

.toolbar-summary {
  color: var(--text-muted);
  font-size: 13px;
}

.add-row :deep(.el-input) {
  flex: 1;
  min-width: 180px;
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

.default-summary {
  color: var(--accent);
}

.model-item {
  padding: 16px;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--surface-panel-soft);
  backdrop-filter: blur(var(--gc-blur-standard));
  -webkit-backdrop-filter: blur(var(--gc-blur-standard));
  min-width: 0;
}

.model-item:hover {
  background: var(--surface-panel-hover);
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
  background: var(--gc-accent);
  color: var(--gc-accent-foreground);
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
  background: color-mix(in srgb, var(--danger) 14%, transparent);
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

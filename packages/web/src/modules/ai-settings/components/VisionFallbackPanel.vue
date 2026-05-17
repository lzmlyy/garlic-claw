<template>
  <section class="panel-card">
    <div class="panel-header">
      <div>
        <h2>视觉回退</h2>
        <p>文本模型收到图片输入时，自动使用下方配置的视觉模型转述图片内容。</p>
      </div>
      <div class="toggle-row">
        <span>启用</span>
        <ElSwitch v-model="form.enabled" />
      </div>
    </div>

    <div class="panel-body">
      <div class="field-grid">
        <label class="field">
          <span>Provider</span>
          <ElSelect
            v-model="form.providerId"
            :disabled="!form.enabled"
            @change="handleProviderChange"
          >
            <ElOption label="请选择" value="" />
            <ElOption
              v-for="provider in providers"
              :key="provider.id"
              :label="provider.name"
              :value="provider.id"
            />
          </ElSelect>
        </label>

        <label class="field">
          <span>模型</span>
          <div class="model-picker" :class="{ disabled: !form.enabled }">
            <ElInput
              v-model="modelQuery"
              data-test="vision-model-search"
              :disabled="!form.enabled || totalProviderModels === 0"
              placeholder="搜索模型 ID 或名称"
            />

            <div class="model-picker-summary">
              <span>
                匹配 {{ filteredModels.length }} / {{ totalProviderModels }}
                <span v-if="filteredModels.length > 0">
                  · 第 {{ currentPage }} / {{ pageCount }} 页 · 显示 {{ rangeStart }}-{{ rangeEnd }} 项
                </span>
              </span>
              <ElButton
                text
                :disabled="!form.enabled || !form.modelId"
                @click="clearModelSelection"
              >
                清空选择
              </ElButton>
            </div>

            <div v-if="filteredModels.length === 0" class="model-picker-empty">
              无匹配模型。
            </div>
            <div v-else class="model-option-list">
              <ElButton
                v-for="model in pagedModels"
                :key="model.modelId"
                class="model-option"
                native-type="button"
                :class="{ selected: form.modelId === model.modelId }"
                @click="selectModel(model.modelId)"
              >
                <strong>{{ model.label.split(' / ').at(-1) ?? model.modelId }}</strong>
                <span>{{ model.modelId }}</span>
              </ElButton>
            </div>

            <div v-if="filteredModels.length > 0" class="model-picker-actions">
              <ElButton
                data-test="vision-model-prev-page"
                :disabled="!canGoPrev"
                @click="goPrevPage"
              >
                上一页
              </ElButton>
              <ElButton
                data-test="vision-model-next-page"
                :disabled="!canGoNext"
                @click="goNextPage"
              >
                下一页
              </ElButton>
            </div>
          </div>
        </label>
      </div>

      <label class="field">
        <span>提示词</span>
        <ElInput
          v-model="form.prompt"
          type="textarea"
          :disabled="!form.enabled"
          :placeholder="defaultPromptPlaceholder"
          :rows="4"
        />
      </label>

      <label class="field">
        <span>最大描述长度</span>
        <ElInputNumber
          v-model="form.maxDescriptionLength"
          :disabled="!form.enabled"
          :min="0"
          :max="4000"
          controls-position="right"
        />
        <small class="field-note">填 `0` 表示不限制长度；留空则使用后端默认值。</small>
      </label>

      <div class="actions">
        <ElButton type="primary" :disabled="saving" @click="submit">保存</ElButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElButton, ElInput, ElInputNumber, ElOption, ElSelect, ElSwitch } from 'element-plus'
import type { VisionFallbackConfig } from '@garlic-claw/shared'
import { usePagination } from '@/shared/composables/use-pagination'

interface VisionModelOption {
  providerId: string
  providerName: string
  modelId: string
  label: string
}

const props = defineProps<{
  config: VisionFallbackConfig
  options: VisionModelOption[]
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'save', payload: VisionFallbackConfig): void
}>()

const defaultPromptPlaceholder =
  '请简洁但完整地描述这张图片中的主体、场景、文字和重要细节，给另一个文本模型继续理解上下文。'

const form = reactive({
  enabled: false,
  providerId: '',
  modelId: '',
  prompt: '',
  maxDescriptionLength: undefined as number | undefined,
})
const modelQuery = ref('')

const providers = computed(() => {
  const map = new Map<string, string>()
  for (const option of props.options) {
    map.set(option.providerId, option.providerName)
  }

  if (form.providerId && !map.has(form.providerId)) {
    map.set(form.providerId, form.providerId)
  }

  return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
})

const filteredModels = computed(() => {
  const options = props.options.filter((option) => option.providerId === form.providerId)

  if (
    form.providerId &&
    form.modelId &&
    !options.some((option) => option.modelId === form.modelId)
  ) {
    options.unshift({
      providerId: form.providerId,
      providerName:
        providers.value.find((provider) => provider.id === form.providerId)?.name ??
        form.providerId,
      modelId: form.modelId,
      label: form.modelId,
    })
  }

  const normalizedQuery = modelQuery.value.trim().toLowerCase()
  if (!normalizedQuery) {
    return options
  }

  return options.filter((option) =>
    option.modelId.toLowerCase().includes(normalizedQuery) ||
    option.label.toLowerCase().includes(normalizedQuery),
  )
})
const totalProviderModels = computed(() =>
  props.options.filter((option) => option.providerId === form.providerId).length,
)
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
} = usePagination(filteredModels, 6)

watch(
  () => props.config,
  (config) => {
    form.enabled = config.enabled
    form.providerId = config.providerId ?? ''
    form.modelId = config.modelId ?? ''
    form.prompt = config.prompt ?? ''
    form.maxDescriptionLength = config.maxDescriptionLength
    modelQuery.value = ''
  },
  { immediate: true, deep: true },
)

watch([() => form.providerId, modelQuery], () => {
  resetPage()
})

/**
 * 用户显式切换 provider 时，若模型不再属于该 provider，则清空模型选择。
 */
function handleProviderChange() {
  if (!form.modelId) {
    return
  }

  const currentProviderModels = props.options.filter(
    (option) => option.providerId === form.providerId,
  )

  if (
    currentProviderModels.length > 0 &&
    !currentProviderModels.some((model) => model.modelId === form.modelId)
  ) {
    form.modelId = ''
  }

  modelQuery.value = ''
  resetPage()
}

function selectModel(modelId: string) {
  form.modelId = modelId
}

function clearModelSelection() {
  form.modelId = ''
}

function submit() {
  emit('save', {
    enabled: form.enabled,
    providerId: form.enabled ? form.providerId || undefined : undefined,
    modelId: form.enabled ? form.modelId || undefined : undefined,
    prompt: form.prompt.trim() || undefined,
    maxDescriptionLength: form.enabled
      ? form.maxDescriptionLength
      : undefined,
  })
}
</script>

<style scoped>
.panel-card {
  padding: 0;
  min-width: 0;
}

.panel-header,
.actions {
  display: flex;
  gap: 12px;
}

.panel-header {
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.panel-header > div {
  min-width: 0;
  flex: 1 1 260px;
}

.panel-header > .toggle-row {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex: 0 0 auto;
  margin-left: auto;
  white-space: nowrap;
}

.panel-header h2,
.panel-header p {
  margin: 0;
}

.panel-header p {
  margin-top: 6px;
  color: var(--text-muted);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.panel-body,
.field {
  display: grid;
  gap: 12px;
  min-width: 0;
}

.panel-body {
  min-width: 0;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  min-width: 0;
}

.field-grid > * {
  min-width: 0;
}

.field span {
  font-size: 13px;
  color: var(--text-muted);
}

.field :deep(.el-input),
.field :deep(.el-select),
.field :deep(.el-textarea),
.field :deep(.el-input-number) {
  width: 100%;
  min-width: 0;
}

.field :deep(.el-input__wrapper),
.field :deep(.el-select__wrapper),
.field :deep(.el-textarea__inner),
.field :deep(.el-input-number),
.field :deep(.el-input-number .el-input__wrapper) {
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
}

.model-picker {
  display: grid;
  gap: 10px;
}

.model-picker.disabled {
  opacity: 0.72;
}

.model-picker-summary,
.model-picker-actions {
  display: flex;
  gap: 10px;
}

.model-picker-summary {
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  color: var(--text-muted);
  font-size: 13px;
}

.model-picker-empty {
  padding: 12px;
  border: 1px dashed var(--border);
  border-radius: 12px;
  color: var(--text-muted);
  background: color-mix(in srgb, var(--surface-overlay) 70%, transparent);
}

.model-option-list {
  display: grid;
  gap: 10px;
  max-height: min(320px, 36vh);
  overflow-y: auto;
  padding-right: 4px;
}

.model-option {
  display: grid;
  gap: 4px;
  text-align: left;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-panel-soft);
  backdrop-filter: blur(var(--gc-blur-standard));
  -webkit-backdrop-filter: blur(var(--gc-blur-standard));
  box-shadow: none;
  margin: 0;
  color: var(--text);
  transition: all 0.15s ease;
}

.model-option:hover {
  background: var(--surface-panel-hover);
  border-color: var(--border-hover);
}

.model-option.selected {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}

.model-option strong,
.model-option span {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.model-option span {
  color: var(--text-muted);
  font-size: 13px;
}

.clear-link,
.ghost-button {
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
  cursor: pointer;
}

.clear-link {
  padding: 4px 10px;
  font-size: 12px;
}

.field-note {
  color: var(--text-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.actions {
  justify-content: end;
}

.primary-button {
  padding: 8px 12px;
  border: none;
  border-radius: 10px;
  background: var(--gc-accent);
  color: var(--gc-accent-foreground);
  cursor: pointer;
}

@media (max-width: 720px) {
  .panel-header {
    align-items: stretch;
  }

  .toggle-row {
    justify-content: space-between;
    width: 100%;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }

  .actions {
    justify-content: stretch;
  }

  .primary-button {
    width: 100%;
  }

  .model-picker-actions {
    justify-content: stretch;
  }

  .model-picker-actions > * {
    flex: 1 1 120px;
  }
}
</style>

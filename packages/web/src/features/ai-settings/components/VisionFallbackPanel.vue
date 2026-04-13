<template>
  <section class="panel-card">
    <div class="panel-header">
      <div>
        <h2>Vision Fallback</h2>
        <p>文本模型收到图片时，使用这里配置的视觉模型转述。</p>
      </div>
      <label class="toggle-row">
        <input v-model="form.enabled" type="checkbox" />
        启用
      </label>
    </div>

    <div class="panel-body">
      <div class="field-grid">
        <label class="field">
          <span>Provider</span>
          <select
            v-model="form.providerId"
            :disabled="!form.enabled"
            @change="handleProviderChange"
          >
            <option value="">请选择</option>
            <option v-for="provider in providers" :key="provider.id" :value="provider.id">
              {{ provider.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>模型</span>
          <div class="model-picker" :class="{ disabled: !form.enabled }">
            <input
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
              <button
                type="button"
                class="clear-link"
                :disabled="!form.enabled || !form.modelId"
                @click="clearModelSelection"
              >
                清空选择
              </button>
            </div>

            <div v-if="filteredModels.length === 0" class="model-picker-empty">
              当前 provider 下没有匹配模型。
            </div>
            <div v-else class="model-option-list">
              <button
                v-for="model in pagedModels"
                :key="model.modelId"
                type="button"
                class="model-option"
                :class="{ selected: form.modelId === model.modelId }"
                @click="selectModel(model.modelId)"
              >
                <strong>{{ model.label.split(' / ').at(-1) ?? model.modelId }}</strong>
                <span>{{ model.modelId }}</span>
              </button>
            </div>

            <div v-if="filteredModels.length > 0" class="model-picker-actions">
              <button
                type="button"
                class="ghost-button"
                data-test="vision-model-prev-page"
                :disabled="!canGoPrev"
                @click="goPrevPage"
              >
                上一页
              </button>
              <button
                type="button"
                class="ghost-button"
                data-test="vision-model-next-page"
                :disabled="!canGoNext"
                @click="goNextPage"
              >
                下一页
              </button>
            </div>
          </div>
        </label>
      </div>

      <label class="field">
        <span>提示词</span>
        <textarea
          v-model="form.prompt"
          :disabled="!form.enabled"
          :placeholder="defaultPromptPlaceholder"
          rows="4"
        ></textarea>
      </label>

      <label class="field">
        <span>最大描述长度</span>
        <input
          v-model="form.maxDescriptionLength"
          :disabled="!form.enabled"
          type="number"
          min="0"
          max="4000"
          placeholder="0 表示不限制"
        />
        <small class="field-note">填 `0` 表示不限制长度；留空则使用后端默认值。</small>
      </label>

      <div class="actions">
        <button type="button" class="primary-button" :disabled="saving" @click="submit">保存</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { VisionFallbackConfig } from '@garlic-claw/shared'
import { usePagination } from '@/composables/use-pagination'

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
  '请简洁但完整地描述这张图片中的主体、场景、文字和重要细节，供另一个文本模型继续理解上下文。'

const form = reactive({
  enabled: false,
  providerId: '',
  modelId: '',
  prompt: '',
  maxDescriptionLength: '',
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
    form.maxDescriptionLength =
      config.maxDescriptionLength !== undefined
        ? String(config.maxDescriptionLength)
        : ''
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
      ? parseMaxDescriptionLength(form.maxDescriptionLength)
      : undefined,
  })
}

function parseMaxDescriptionLength(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) {
    return undefined
  }

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : undefined
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
.toggle-row,
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
}

.panel-body {
  min-width: 0;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.field span {
  font-size: 13px;
  color: var(--text-muted);
}

.field select,
.field textarea,
.field input {
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

.field select:focus,
.field textarea:focus,
.field input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.24);
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
  background: rgba(0, 0, 0, 0.15);
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
  background: rgba(11, 21, 35, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text);
  cursor: pointer;
  transition: all 0.15s ease;
}

.model-option:hover {
  background: rgba(11, 21, 35, 0.85);
  border-color: var(--border-hover);
}

.model-option.selected {
  border-color: var(--accent);
  background: rgba(103, 199, 207, 0.14);
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
  background: var(--accent);
  color: #fff;
  cursor: pointer;
}

@media (max-width: 720px) {
  .panel-card {
    padding: 16px;
  }

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

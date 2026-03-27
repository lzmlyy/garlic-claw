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
          <select v-model="form.modelId" :disabled="!form.enabled || filteredModels.length === 0">
            <option value="">请选择</option>
            <option v-for="model in filteredModels" :key="model.modelId" :value="model.modelId">
              {{ model.label }}
            </option>
          </select>
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
import { computed, reactive, watch } from 'vue'
import type { VisionFallbackConfig } from '@garlic-claw/shared'

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

  return options
})

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
  },
  { immediate: true, deep: true },
)

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
  border-radius: 20px;
  background: var(--bg-card);
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
  background: var(--bg-input);
  color: var(--text);
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
}
</style>

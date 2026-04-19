<template>
  <section class="plugin-llm-panel">
    <div class="panel-header">
      <div>
        <span class="panel-kicker">LLM Routing</span>
        <h3>插件模型策略</h3>
        <p>默认继承主对话当前使用的 provider / model；如果没有对话上下文，则回退到系统默认模型。</p>
      </div>
    </div>

    <div class="panel-body">
      <label class="field">
        <span>策略</span>
        <select v-model="mode">
          <option value="inherit">继承主聊天配置</option>
          <option value="override">为当前插件单独指定</option>
        </select>
      </label>

      <div class="field-grid">
        <label class="field">
          <span>Provider</span>
          <select
            v-model="selectedProviderId"
            :disabled="mode !== 'override'"
            data-test="plugin-llm-provider"
          >
            <option value="">请选择 provider</option>
            <option
              v-for="provider in providers"
              :key="provider.id"
              :value="provider.id"
            >
              {{ provider.name }}
            </option>
          </select>
        </label>

        <label class="field">
          <span>Model</span>
          <select
            v-model="selectedModelId"
            :disabled="mode !== 'override' || availableModels.length === 0"
            data-test="plugin-llm-model"
          >
            <option value="">请选择 model</option>
            <option
              v-for="option in availableModels"
              :key="`${option.providerId}:${option.modelId}`"
              :value="option.modelId"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
      </div>

      <p class="panel-note">
        请求显式传入 `providerId / modelId` 时，仍然优先于这里的设置。
      </p>

      <div class="panel-actions">
        <button
          type="button"
          class="primary-button"
          :disabled="saving || !canSave"
          data-test="plugin-llm-save"
          @click="submit"
        >
          保存
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  AiProviderSummary,
  PluginLlmPreference,
} from '@garlic-claw/shared'
import type { PluginLlmRouteOption } from '@/features/plugins/api/plugins'

const props = defineProps<{
  preference: PluginLlmPreference | null
  providers: AiProviderSummary[]
  options: PluginLlmRouteOption[]
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'save', payload: PluginLlmPreference): void
}>()

const mode = ref<PluginLlmPreference['mode']>('inherit')
const selectedProviderId = ref('')
const selectedModelId = ref('')

const availableModels = computed(() =>
  props.options.filter((option) => option.providerId === selectedProviderId.value),
)
const canSave = computed(() =>
  mode.value === 'inherit'
    || (Boolean(selectedProviderId.value) && Boolean(selectedModelId.value)),
)

watch(
  () => props.preference,
  (preference) => {
    mode.value = preference?.mode ?? 'inherit'
    selectedProviderId.value = preference?.providerId ?? ''
    selectedModelId.value = preference?.modelId ?? ''
  },
  { immediate: true, deep: true },
)

watch(mode, (nextMode) => {
  if (nextMode === 'inherit') {
    selectedProviderId.value = ''
    selectedModelId.value = ''
  }
})

watch(selectedProviderId, (providerId, previousProviderId) => {
  if (!providerId) {
    selectedModelId.value = ''
    return
  }
  if (providerId === previousProviderId) {
    return
  }
  if (!availableModels.value.some((option) => option.modelId === selectedModelId.value)) {
    selectedModelId.value = ''
  }
})

function submit() {
  if (!canSave.value) {
    return
  }

  emit('save', mode.value === 'inherit'
    ? {
        mode: 'inherit',
        modelId: null,
        providerId: null,
      }
    : {
        mode: 'override',
        modelId: selectedModelId.value,
        providerId: selectedProviderId.value,
      })
}
</script>

<style scoped>
.plugin-llm-panel {
  display: grid;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: rgba(11, 21, 35, 0.72);
}

.panel-header,
.panel-body,
.field {
  display: grid;
  gap: 10px;
}

.panel-header h3,
.panel-header p {
  margin: 0;
}

.panel-header p,
.panel-kicker,
.field span,
.panel-note {
  color: var(--text-muted);
}

.panel-kicker {
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.field-grid,
.panel-actions {
  display: flex;
  gap: 12px;
}

.field-grid > * {
  flex: 1 1 0;
}

.field select {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(7, 16, 27, 0.9);
  color: var(--text);
}

.panel-actions {
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .field-grid {
    flex-direction: column;
  }

  .panel-actions {
    justify-content: stretch;
  }

  .panel-actions button {
    width: 100%;
  }
}
</style>

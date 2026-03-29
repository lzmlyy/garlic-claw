<template>
  <div v-if="visible" class="dialog-overlay" data-test="provider-dialog-overlay">
    <div class="dialog-card">
      <div class="dialog-header">
        <div>
          <h2>{{ title }}</h2>
          <p>按模式填写供应商信息、默认模型和连接凭据。</p>
        </div>
        <button
          type="button"
          class="close-button"
          data-test="provider-dialog-close"
          @click="$emit('close')"
        >
          ×
        </button>
      </div>

      <div class="dialog-body">
        <label class="field">
          <span>模式</span>
          <select v-model="form.mode" @change="applyDriverDefaults">
            <option value="official">官方</option>
            <option value="compatible">兼容</option>
          </select>
        </label>

        <label class="field">
          <span>驱动</span>
          <select v-model="form.driver" @change="applyDriverDefaults">
            <option v-for="option in driverOptions" :key="option.id" :value="option.id">
              {{ option.name }}
            </option>
          </select>
        </label>

        <div class="field-grid">
          <label class="field">
            <span>Provider ID</span>
            <input v-model="form.id" placeholder="openai 或 my-company" />
          </label>
          <label class="field">
            <span>名称</span>
            <input v-model="form.name" placeholder="显示名称" />
          </label>
        </div>

        <div class="field-grid">
          <label class="field">
            <span>Base URL</span>
            <input v-model="form.baseUrl" placeholder="https://..." />
          </label>
          <label class="field">
            <span>默认模型</span>
            <input v-model="form.defaultModel" placeholder="gpt-4o-mini" />
          </label>
        </div>

        <label class="field">
          <span>API Key</span>
          <input v-model="form.apiKey" placeholder="sk-..." />
        </label>

        <label class="field">
          <span>模型列表</span>
          <textarea
            v-model="form.modelsText"
            placeholder="每行一个模型 ID，或用逗号分隔"
            rows="4"
          ></textarea>
        </label>
      </div>

      <div class="dialog-footer">
        <button
          type="button"
          class="ghost-button"
          data-test="provider-dialog-cancel"
          @click="$emit('close')"
        >
          取消
        </button>
        <button type="button" class="primary-button" :disabled="!canSave" @click="submit">
          保存
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { AiProviderConfig, OfficialProviderCatalogItem } from '@garlic-claw/shared'
import {
  applyProviderDriverDefaults,
  buildProviderConfigPayload,
  compatibleDrivers,
  createProviderFormState,
  syncProviderFormState,
} from './provider-editor-form'

const props = defineProps<{
  visible: boolean
  title: string
  catalog: OfficialProviderCatalogItem[]
  initialConfig: AiProviderConfig | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', payload: AiProviderConfig): void
}>()

const form = reactive(createProviderFormState())

const driverOptions = computed(() =>
  form.mode === 'official'
    ? props.catalog.map((item) => ({ id: item.id, name: item.name }))
    : compatibleDrivers,
)

const canSave = computed(() =>
  Boolean(form.id.trim() && form.name.trim() && form.driver.trim()),
)

watch(
  () => [props.visible, props.initialConfig, props.catalog] as const,
  () => {
    if (!props.visible) {
      return
    }
    syncProviderFormState(form, props.initialConfig, props.catalog)
  },
  { immediate: true },
)

function applyDriverDefaults() {
  applyProviderDriverDefaults(form, props.catalog, props.initialConfig)
}

function submit() {
  emit('save', buildProviderConfigPayload(form))
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.55);
  z-index: 40;
}

.dialog-card {
  width: min(760px, calc(100vw - 32px));
  max-height: min(760px, calc(100vh - 32px));
  display: grid;
  grid-template-rows: auto 1fr auto;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: var(--bg-card);
  min-width: 0;
}

.dialog-header,
.dialog-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 20px;
  flex-wrap: wrap;
}

.dialog-header {
  align-items: start;
  border-bottom: 1px solid var(--border);
}

.dialog-header > div {
  min-width: 0;
  flex: 1 1 260px;
}

.dialog-header h2,
.dialog-header p {
  margin: 0;
}

.dialog-header p {
  margin-top: 6px;
  color: var(--text-muted);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.dialog-body {
  display: grid;
  gap: 16px;
  padding: 20px;
  min-height: 0;
  overflow-y: auto;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  font-size: 13px;
  color: var(--text-muted);
}

.field input,
.field select,
.field textarea {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-input);
  color: var(--text);
}

.dialog-footer {
  justify-content: end;
  border-top: 1px solid var(--border);
}

.close-button,
.primary-button,
.ghost-button {
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
}

.close-button,
.ghost-button {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
}

.primary-button {
  border: none;
  background: var(--accent);
  color: #fff;
}

@media (max-width: 720px) {
  .dialog-header,
  .dialog-footer,
  .dialog-body {
    padding: 16px;
  }

  .field-grid {
    grid-template-columns: 1fr;
  }

  .dialog-footer {
    justify-content: stretch;
  }

  .dialog-footer > * {
    flex: 1 1 140px;
  }
}
</style>

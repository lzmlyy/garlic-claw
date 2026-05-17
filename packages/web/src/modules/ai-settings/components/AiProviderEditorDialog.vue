<template>
  <ElDialog
    :model-value="visible"
    width="760px"
    top="8vh"
    :teleported="true"
    :show-close="false"
    :close-on-click-modal="false"
    destroy-on-close
    class="provider-editor-dialog"
    @close="$emit('close')"
  >
    <template #header>
      <div class="dialog-header">
        <div>
          <h2>{{ title }}</h2>
          <p>填写服务商接入信息、模型与凭据。</p>
        </div>
        <ElButton
          text
          class="close-button"
          data-test="provider-dialog-close"
          @click="$emit('close')"
        >
          ×
        </ElButton>
      </div>
    </template>

    <div data-test="provider-dialog-overlay" class="dialog-body">
      <label class="field">
        <span>驱动</span>
        <ElSelect v-model="form.driver" @change="applyDriverDefaults">
          <ElOption
            v-for="option in driverOptions"
            :key="option.id"
            :label="option.label"
            :value="option.id"
          />
        </ElSelect>
        <small class="field-hint">{{ driverHint }}</small>
      </label>

      <div class="field-grid">
        <label class="field">
          <span>Provider ID</span>
          <ElInput v-model="form.id" placeholder="openai 或 my-company" />
        </label>
        <label class="field">
          <span>名称</span>
          <ElInput v-model="form.name" placeholder="显示名称" />
        </label>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>Base URL</span>
          <ElInput v-model="form.baseUrl" placeholder="https://..." />
        </label>
      </div>

      <label class="field">
        <span>API Key</span>
        <ElInput v-model="form.apiKey" placeholder="sk-..." show-password />
      </label>

      <label class="field">
        <span>模型列表</span>
        <ElInput
          v-model="form.modelsText"
          type="textarea"
          placeholder="每行一个模型 ID，或用逗号分隔"
          :rows="4"
        />
      </label>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <ElButton
          data-test="provider-dialog-cancel"
          @click="$emit('close')"
        >
          取消
        </ElButton>
        <ElButton type="primary" :disabled="!canSave" @click="submit">
          保存
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { ElButton, ElDialog, ElInput, ElOption, ElSelect } from 'element-plus'
import type { AiProviderCatalogItem, AiProviderConfig } from '@garlic-claw/shared'
import {
  applyProviderDriverDefaults,
  buildProviderConfigPayload,
  createProviderFormState,
  getProviderDriverHint,
  protocolDriverOptions,
  syncProviderFormState,
} from './provider-editor-form'

const props = defineProps<{
  visible: boolean
  title: string
  catalog: AiProviderCatalogItem[]
  initialConfig: AiProviderConfig | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'save', payload: AiProviderConfig): void
}>()

const form = reactive(createProviderFormState())

const driverOptions = computed(() => protocolDriverOptions)

const driverHint = computed(() =>
  getProviderDriverHint(form.driver, form.id, props.catalog),
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
:deep(.provider-editor-dialog .el-dialog) {
  max-width: calc(100vw - 32px);
  border-radius: 20px;
}

:deep(.provider-editor-dialog .el-dialog__header) {
  margin-right: 0;
  padding: 20px 20px 0;
}

:deep(.provider-editor-dialog .el-dialog__body) {
  padding: 0;
}

:deep(.provider-editor-dialog .el-dialog__footer) {
  padding: 0 20px 20px;
}

.dialog-header,
.dialog-footer {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.dialog-header {
  align-items: start;
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

.field-hint {
  font-size: 12px;
  color: var(--text-muted);
}

.dialog-footer {
  justify-content: end;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

.close-button {
  align-self: start;
  padding: 4px;
  font-size: 20px;
  line-height: 1;
}

@media (max-width: 720px) {
  :deep(.provider-editor-dialog .el-dialog__header) {
    padding: 16px 16px 0;
  }

  :deep(.provider-editor-dialog .el-dialog__body) {
    padding: 0;
  }

  :deep(.provider-editor-dialog .el-dialog__footer) {
    padding: 0 16px 16px;
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

<template>
  <section class="panel-card">
    <div v-if="provider" class="panel-header">
      <div>
        <h2>{{ provider.name }}</h2>
        <p>{{ provider.id }} · {{ provider.mode }} · {{ provider.driver }}</p>
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

      <div v-if="models.length === 0" class="empty-state">当前 provider 还没有模型。</div>

      <div v-else class="model-list">
        <article v-for="model in models" :key="model.id" class="model-item">
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
        </article>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { AiModelConfig, AiProviderConfig } from '@garlic-claw/shared'
import AiModelCapabilityToggles from './AiModelCapabilityToggles.vue'

defineProps<{
  provider: AiProviderConfig | null
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
}>()

const newModelId = ref('')
const newModelName = ref('')

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
.header-actions,
.model-summary,
.summary-actions,
.add-row {
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

.add-row input {
  flex: 1;
  min-width: 180px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-input);
  color: var(--text);
}

.model-list {
  display: grid;
  gap: 12px;
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
  background: var(--bg-input);
  min-width: 0;
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
}
</style>

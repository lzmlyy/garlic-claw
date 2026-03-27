<template>
  <div v-if="visible" class="dialog-overlay" @click.self="$emit('close')">
    <div class="dialog-card">
      <div class="dialog-header">
        <div>
          <h2>拉取模型</h2>
          <p>{{ title }}</p>
        </div>
        <button type="button" class="close-button" @click="$emit('close')">×</button>
      </div>

      <div class="dialog-body">
        <label class="field">
          <span>搜索模型</span>
          <input v-model="query" placeholder="输入模型 ID 或名称筛选" />
        </label>

        <p class="summary-text">
          共 {{ filteredModels.length }} 个候选模型，已选择 {{ selectedModelIds.length }} 个。
        </p>

        <div v-if="filteredModels.length === 0" class="empty-state">
          没有匹配的模型。
        </div>

        <div v-else class="model-list">
          <label
            v-for="model in filteredModels"
            :key="model.id"
            class="model-row"
          >
            <input
              :checked="selectedModelIds.includes(model.id)"
              type="checkbox"
              @change="toggleModel(model.id)"
            />
            <div class="model-copy">
              <strong>{{ model.name }}</strong>
              <span>{{ model.id }}</span>
            </div>
          </label>
        </div>
      </div>

      <div class="dialog-footer">
        <button type="button" class="ghost-button" @click="$emit('close')">取消</button>
        <button
          type="button"
          class="primary-button"
          :disabled="selectedModelIds.length === 0 || loading"
          @click="submit"
        >
          添加所选模型
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { DiscoveredAiModel } from '@garlic-claw/shared'

const props = defineProps<{
  visible: boolean
  loading: boolean
  title: string
  models: DiscoveredAiModel[]
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'add', modelIds: string[]): void
}>()

const query = ref('')
const selectedModelIds = ref<string[]>([])

const filteredModels = computed(() => {
  const normalizedQuery = query.value.trim().toLowerCase()
  if (!normalizedQuery) {
    return props.models
  }

  return props.models.filter((model) =>
    model.id.toLowerCase().includes(normalizedQuery) ||
    model.name.toLowerCase().includes(normalizedQuery),
  )
})

watch(
  () => props.visible,
  (visible) => {
    if (!visible) {
      return
    }

    query.value = ''
    selectedModelIds.value = []
  },
)

function toggleModel(modelId: string) {
  if (selectedModelIds.value.includes(modelId)) {
    selectedModelIds.value = selectedModelIds.value.filter((id) => id !== modelId)
    return
  }

  selectedModelIds.value = [...selectedModelIds.value, modelId]
}

function submit() {
  emit('add', selectedModelIds.value)
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
  z-index: 50;
}

.dialog-card {
  width: min(760px, 100%);
  max-height: min(680px, calc(100vh - 32px));
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

.dialog-header p,
.summary-text,
.empty-state {
  color: var(--text-muted);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.dialog-header p {
  margin-top: 6px;
}

.dialog-body {
  display: grid;
  gap: 14px;
  padding: 20px;
  min-height: 0;
}

.field {
  display: grid;
  gap: 8px;
}

.field span {
  font-size: 13px;
  color: var(--text-muted);
}

.field input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-input);
  color: var(--text);
}

.summary-text {
  margin: 0;
}

.model-list {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 10px;
  padding-right: 4px;
}

.model-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: start;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--bg-input);
}

.model-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.model-copy strong,
.model-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-copy span {
  font-size: 13px;
  color: var(--text-muted);
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
  .dialog-footer {
    padding: 16px;
  }

  .dialog-body {
    padding: 16px;
  }

  .dialog-footer {
    justify-content: stretch;
  }

  .dialog-footer > * {
    flex: 1 1 140px;
  }
}
</style>

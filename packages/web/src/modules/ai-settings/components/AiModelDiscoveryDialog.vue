<template>
  <ElDialog
    :model-value="visible"
    width="760px"
    top="8vh"
    :teleported="true"
    destroy-on-close
    class="model-discovery-dialog"
    @close="$emit('close')"
  >
    <template #header>
      <div class="dialog-header">
        <div>
          <h2>发现模型</h2>
          <p>{{ title }}</p>
        </div>
        <ElButton text class="close-button" @click="$emit('close')">×</ElButton>
      </div>
    </template>

    <div class="dialog-body">
      <label class="field">
        <span>搜索模型</span>
        <ElInput
          v-model="query"
          data-test="model-discovery-search"
          placeholder="输入模型 ID 或名称筛选"
        />
      </label>

      <p class="summary-text">
        共 {{ filteredModels.length }} 个候选模型，已选择 {{ selectedModelIds.length }} 个。
      </p>

      <div v-if="filteredModels.length > 0" class="pager-row">
        <span class="pager-copy">
          第 {{ currentPage }} / {{ pageCount }} 页
          <span class="pager-divider">·</span>
          显示 {{ rangeStart }}-{{ rangeEnd }} 项
        </span>
        <div class="pager-actions">
          <ElButton
            data-test="model-discovery-prev-page"
            :disabled="!canGoPrev"
            @click="goPrevPage"
          >
            上一页
          </ElButton>
          <ElButton
            data-test="model-discovery-next-page"
            :disabled="!canGoNext"
            @click="goNextPage"
          >
            下一页
          </ElButton>
        </div>
      </div>

      <div v-if="filteredModels.length === 0" class="empty-state">
        没有匹配的模型。
      </div>

      <div v-else class="model-list">
        <label
          v-for="model in pagedModels"
          :key="model.id"
          class="model-row"
        >
          <ElCheckbox
            :model-value="selectedModelIds.includes(model.id)"
            @change="toggleModel(model.id)"
          />
          <div class="model-copy">
            <strong>{{ model.name }}</strong>
            <span>{{ model.id }}</span>
          </div>
        </label>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <ElButton @click="$emit('close')">取消</ElButton>
        <ElButton
          type="primary"
          :disabled="selectedModelIds.length === 0 || loading"
          @click="submit"
        >
          添加所选模型
        </ElButton>
      </div>
    </template>
  </ElDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElCheckbox, ElDialog, ElInput } from 'element-plus'
import type { DiscoveredAiModel } from '@garlic-claw/shared'
import { usePagination } from '@/shared/composables/use-pagination'

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
  () => props.visible,
  (visible) => {
    if (!visible) {
      return
    }

    query.value = ''
    selectedModelIds.value = []
    resetPage()
  },
)

watch(query, () => {
  resetPage()
})

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
:deep(.model-discovery-dialog .el-dialog) {
  max-width: calc(100vw - 32px);
  border-radius: 20px;
}

:deep(.model-discovery-dialog .el-dialog__header) {
  margin-right: 0;
  padding: 20px 20px 0;
}

:deep(.model-discovery-dialog .el-dialog__body) {
  padding: 0;
}

:deep(.model-discovery-dialog .el-dialog__footer) {
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

.summary-text {
  margin: 0;
}

.pager-row,
.pager-actions {
  display: flex;
  gap: 10px;
}

.pager-row {
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.pager-copy {
  color: var(--text-muted);
  font-size: 13px;
}

.pager-divider {
  margin: 0 6px;
}

.model-list {
  min-height: 0;
  overflow-y: auto;
  display: grid;
  gap: 10px;
  padding-right: 4px;
  max-height: min(360px, 42vh);
}

.model-row {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 12px;
  align-items: center;
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
  :deep(.model-discovery-dialog .el-dialog__header) {
    padding: 16px 16px 0;
  }

  :deep(.model-discovery-dialog .el-dialog__body) {
    padding: 0;
  }

  :deep(.model-discovery-dialog .el-dialog__footer) {
    padding: 0 16px 16px;
  }

  .dialog-footer {
    justify-content: stretch;
  }

  .dialog-footer > * {
    flex: 1 1 140px;
  }

  .pager-actions {
    width: 100%;
  }

  .pager-actions > * {
    flex: 1 1 120px;
  }
}
</style>

<template>
  <section class="panel-section">
    <div class="section-header">
      <div>
        <h3>持久化 KV</h3>
        <p>查看、筛选和维护插件私有持久化数据。</p>
      </div>
      <div class="section-actions">
        <input
          v-model="prefix"
          data-test="storage-prefix-input"
          type="text"
          placeholder="按前缀筛选，例如 cursor."
        >
        <button
          type="button"
          class="ghost-button"
          :disabled="loading"
          @click="requestRefresh"
        >
          {{ loading ? '刷新中...' : '刷新 KV' }}
        </button>
      </div>
    </div>

    <p v-if="formError" class="section-error">{{ formError }}</p>

    <div class="storage-editor">
      <input
        v-model="draftKey"
        data-test="storage-key-input"
        type="text"
        placeholder="storage key"
      >
      <textarea
        v-model="draftValue"
        data-test="storage-value-input"
        rows="4"
        placeholder="输入 JSON 或纯文本"
      />
      <button
        type="button"
        class="ghost-button"
        data-test="storage-save-button"
        :disabled="saving"
        @click="submit"
      >
        {{ saving ? '保存中...' : '保存 KV' }}
      </button>
    </div>

    <div v-if="loading" class="section-empty">加载中...</div>
    <div v-else-if="entries.length === 0 && hasActivePrefixFilter" class="section-empty">
      当前前缀筛选下没有持久化 KV 条目。
    </div>
    <div v-else-if="entries.length === 0" class="section-empty">
      当前还没有持久化 KV 条目。
    </div>
    <div v-else class="storage-list">
      <article v-for="entry in entries" :key="entry.key" class="storage-item">
        <div class="storage-top">
          <strong>{{ entry.key }}</strong>
          <button
            type="button"
            class="ghost-button danger-button"
            data-test="storage-delete-button"
            :disabled="deletingKey === entry.key"
            @click="$emit('delete', entry.key)"
          >
            {{ deletingKey === entry.key ? '删除中...' : '删除' }}
          </button>
        </div>
        <pre class="storage-value">{{ formatValue(entry.value) }}</pre>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { JsonValue, PluginStorageEntry } from '@garlic-claw/shared'

const props = defineProps<{
  entries: PluginStorageEntry[]
  loading: boolean
  saving: boolean
  deletingKey: string | null
  prefix: string
}>()

const emit = defineEmits<{
  (event: 'refresh', prefix: string): void
  (event: 'save', entry: PluginStorageEntry): void
  (event: 'delete', key: string): void
}>()

const prefix = ref('')
const draftKey = ref('')
const draftValue = ref('')
const formError = ref<string | null>(null)
const hasActivePrefixFilter = computed(() => props.prefix.trim().length > 0)

watch(
  () => props.prefix,
  (nextPrefix) => {
    prefix.value = nextPrefix
  },
  { immediate: true },
)

/**
 * 按当前前缀请求父级刷新 KV 列表。
 */
function requestRefresh() {
  emit('refresh', prefix.value.trim())
}

/**
 * 解析当前草稿并提交新的 KV 条目。
 */
function submit() {
  const key = draftKey.value.trim()
  if (!key) {
    formError.value = 'key 不能为空'
    return
  }

  try {
    emit('save', {
      key,
      value: parseStorageValue(draftValue.value),
    })
    draftKey.value = ''
    draftValue.value = ''
    formError.value = null
  } catch (error) {
    formError.value = error instanceof Error ? error.message : 'KV 值格式无效'
  }
}

/**
 * 将任意 JSON 值转成便于阅读的文本。
 * @param value 原始 JSON 值
 * @returns 统一展示文本
 */
function formatValue(value: JsonValue): string {
  return typeof value === 'string'
    ? value
    : JSON.stringify(value, null, 2)
}

/**
 * 把输入框文本解析回 JSON 值。
 * @param raw 原始输入文本
 * @returns 可持久化的 JSON 值
 */
function parseStorageValue(raw: string): JsonValue {
  const trimmed = raw.trim()
  if (!trimmed) {
    throw new Error('value 不能为空')
  }

  try {
    return JSON.parse(trimmed) as JsonValue
  } catch {
    return raw
  }
}
</script>

<style scoped>
.panel-section {
  display: grid;
  gap: 14px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.section-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.section-header h3 {
  font-size: 1rem;
}

.section-header p,
.section-empty {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.section-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.storage-editor {
  display: grid;
  gap: 10px;
}

.ghost-button {
  background: transparent;
  border: 1px solid var(--border);
}

.danger-button {
  color: var(--danger);
}

.section-error {
  color: var(--danger);
  font-size: 0.85rem;
}

.storage-list {
  display: grid;
  gap: 10px;
  max-height: 420px;
  overflow-y: auto;
}

.storage-item {
  display: grid;
  gap: 10px;
  padding: 0.9rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.storage-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.storage-value {
  padding: 0.8rem;
  background: var(--bg-input);
  border-radius: 8px;
  color: var(--text-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 720px) {
  .section-header {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>

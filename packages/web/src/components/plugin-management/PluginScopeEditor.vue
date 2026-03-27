<template>
  <section class="panel-section">
    <div class="section-header">
      <div>
        <h3>作用域治理</h3>
        <p>按会话启停插件，而不是全局暴露所有能力。</p>
      </div>
      <button
        type="button"
        class="ghost-button"
        :disabled="saving || !scope"
        @click="submit"
      >
        {{ saving ? '保存中...' : '保存作用域' }}
      </button>
    </div>

    <p v-if="!scope" class="section-empty">当前还没有可编辑的作用域数据。</p>

    <template v-else>
      <label class="checkbox-row">
        <input v-model="defaultEnabled" type="checkbox">
        <span>默认启用当前插件</span>
      </label>

      <div class="scope-list">
        <div class="scope-list-header">
          <strong>会话覆盖</strong>
          <button type="button" class="ghost-button" @click="addConversationRow">新增会话</button>
        </div>

        <div v-if="rows.length === 0" class="section-empty">
          当前没有会话级覆盖，默认规则将直接生效。
        </div>

        <div v-else class="scope-rows">
          <div v-for="(row, index) in rows" :key="index" class="scope-row">
            <input
              v-model="row.conversationId"
              placeholder="conversation id"
            >
            <select v-model="row.enabled">
              <option :value="true">启用</option>
              <option :value="false">禁用</option>
            </select>
            <button type="button" class="ghost-button danger-button" @click="removeConversationRow(index)">
              删除
            </button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import type { PluginScopeSettings } from '@garlic-claw/shared'

interface ScopeRow {
  conversationId: string
  enabled: boolean
}

const props = defineProps<{
  scope: PluginScopeSettings | null
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'save', value: PluginScopeSettings): void
}>()

const defaultEnabled = ref(true)
const rows = ref<ScopeRow[]>([])

watch(
  () => props.scope,
  (scope) => {
    defaultEnabled.value = scope?.defaultEnabled ?? true
    rows.value = Object.entries(scope?.conversations ?? {}).map(
      ([conversationId, enabled]) => ({
        conversationId,
        enabled,
      }),
    )
  },
  { immediate: true },
)

/**
 * 新增一个空的会话覆盖行。
 */
function addConversationRow() {
  rows.value.push({
    conversationId: '',
    enabled: true,
  })
}

/**
 * 删除指定下标的会话覆盖行。
 * @param index 行下标
 */
function removeConversationRow(index: number) {
  rows.value.splice(index, 1)
}

/**
 * 把当前草稿提交为标准作用域对象。
 */
function submit() {
  const conversations: PluginScopeSettings['conversations'] = {}
  for (const row of rows.value) {
    const conversationId = row.conversationId.trim()
    if (!conversationId) {
      continue
    }
    conversations[conversationId] = row.enabled
  }

  emit('save', {
    defaultEnabled: defaultEnabled.value,
    conversations,
  })
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

.ghost-button {
  background: transparent;
  border: 1px solid var(--border);
}

.danger-button {
  color: var(--danger);
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.checkbox-row input {
  width: auto;
}

.scope-list {
  display: grid;
  gap: 10px;
}

.scope-list-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.scope-rows {
  display: grid;
  gap: 10px;
}

.scope-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 120px 88px;
  gap: 10px;
}

.scope-row select {
  width: 100%;
  background: var(--bg-input);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.6em 0.8em;
}

@media (max-width: 720px) {
  .scope-row {
    grid-template-columns: 1fr;
  }
}
</style>

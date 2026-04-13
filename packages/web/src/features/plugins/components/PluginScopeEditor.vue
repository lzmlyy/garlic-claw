<template>
  <section class="panel-section">
    <div class="section-header">
      <div>
        <h3>会话作用域治理</h3>
        <p>全局启用 / 停用已收进统一工具治理页的 Plugin source 开关，这里只编辑会话级覆盖。</p>
      </div>
      <button
        type="button"
        class="ghost-button save-button"
        data-test="scope-save-button"
        title="保存作用域"
        :disabled="saving || !scope"
        @click="submit"
      >
        <Icon :icon="disketteBold" class="save-icon" aria-hidden="true" />
      </button>
    </div>

    <p v-if="formError" class="section-error">{{ formError }}</p>
    <p v-if="!scope" class="section-empty">当前还没有可编辑的作用域数据。</p>

    <template v-else>
      <article class="scope-default-card">
        <strong>当前默认状态</strong>
        <p>
          {{
            scope.defaultEnabled
              ? '默认启用，未单独覆盖的会话会直接生效。'
              : '默认禁用，只会在被单独放行的会话里生效。'
          }}
        </p>
        <p>需要切换默认状态时，请到统一工具治理页修改这个 Plugin source。</p>
        <p v-if="!canDisable" class="section-error">
          {{ disableReason }}
        </p>
      </article>

      <div class="scope-list">
        <div class="scope-list-header">
          <strong>会话覆盖</strong>
          <button
            type="button"
            class="ghost-button add-button"
            data-test="scope-add-row-button"
            title="新增会话"
            @click="addConversationRow"
          >
            <Icon :icon="addCircleBold" class="add-icon" aria-hidden="true" />
          </button>
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
              <option v-if="canDisable" :value="false">禁用</option>
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
import { Icon } from '@iconify/vue'
import disketteBold from '@iconify-icons/solar/diskette-bold'
import addCircleBold from '@iconify-icons/solar/add-circle-bold'
import { computed, ref, watch } from 'vue'
import type { PluginInfo, PluginScopeSettings } from '@garlic-claw/shared'

interface ScopeRow {
  conversationId: string
  enabled: boolean
}

const props = defineProps<{
  scope: PluginScopeSettings | null
  saving: boolean
  plugin?: PluginInfo | null
}>()

const emit = defineEmits<{
  (event: 'save', value: PluginScopeSettings['conversations']): void
}>()

const rows = ref<ScopeRow[]>([])
const formError = ref<string | null>(null)
const canDisable = computed(() => props.plugin?.governance?.canDisable !== false)
const disableReason = computed(() =>
  props.plugin?.governance?.disableReason?.trim()
  || '当前插件属于受保护的系统内建插件，不能禁用。',
)

watch(
  () => props.scope,
  (scope) => {
    formError.value = null
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
  formError.value = null
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
  formError.value = null
  rows.value.splice(index, 1)
}

/**
 * 把当前草稿提交为标准作用域对象。
 */
function submit() {
  try {
    if (!canDisable.value && rows.value.some((row) => row.enabled === false)) {
      throw new Error(disableReason.value)
    }

    emit('save', buildScopeConversations(rows.value))
    formError.value = null
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '作用域配置无效'
  }
}

/**
 * 将当前行草稿收敛为标准作用域覆盖对象。
 * @param scopeRows 会话覆盖草稿
 * @returns 标准 conversations 映射
 */
function buildScopeConversations(
  scopeRows: ScopeRow[],
): PluginScopeSettings['conversations'] {
  const conversations: PluginScopeSettings['conversations'] = {}
  const seen = new Set<string>()

  for (const row of scopeRows) {
    const conversationId = row.conversationId.trim()
    if (!conversationId) {
      throw new Error('conversation id 不能为空')
    }
    if (seen.has(conversationId)) {
      throw new Error('conversation id 不能重复')
    }

    seen.add(conversationId)
    conversations[conversationId] = row.enabled
  }

  return conversations
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

.section-error {
  color: var(--danger);
  font-size: 0.85rem;
}

.scope-default-card {
  display: grid;
  gap: 6px;
  padding: 0.9rem 1rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-card) 88%, var(--accent) 12%);
}

.ghost-button {
  background: transparent;
  border: 1px solid var(--border);
}

.save-button,
.add-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  min-width: 36px;
  min-height: 36px;
  padding: 0;
  border-radius: 10px;
  flex-shrink: 0;
  color: var(--text);
}

.save-icon,
.add-icon {
  width: 18px;
  height: 18px;
  color: var(--text);
}

.danger-button {
  color: var(--danger);
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

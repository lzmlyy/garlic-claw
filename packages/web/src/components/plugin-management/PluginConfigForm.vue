<template>
  <section class="panel-section">
    <div class="section-header">
      <div>
        <h3>插件配置</h3>
        <p>按照插件声明的 schema 统一保存配置。</p>
      </div>
      <button
        type="button"
        class="ghost-button"
        :disabled="saving || !hasSchema"
        @click="submit"
      >
        {{ saving ? '保存中...' : '保存配置' }}
      </button>
    </div>

    <p v-if="formError" class="section-error">{{ formError }}</p>
    <p v-if="!hasSchema" class="section-empty">当前插件没有声明配置 schema。</p>

    <div v-else class="config-form">
      <label
        v-for="field in fields"
        :key="field.key"
        class="config-field"
      >
        <span class="field-label">
          {{ field.key }}
          <small v-if="field.required">必填</small>
        </span>
        <span v-if="field.description" class="field-description">{{ field.description }}</span>

        <textarea
          v-if="field.type === 'object' || field.type === 'array'"
          v-model="draft[field.key]"
          rows="6"
        />
        <input
          v-else-if="field.type === 'number'"
          v-model="draft[field.key]"
          type="number"
        />
        <label v-else-if="field.type === 'boolean'" class="checkbox-field">
          <input
            v-model="booleanDraft[field.key]"
            type="checkbox"
          >
          <span>{{ booleanDraft[field.key] ? '已启用' : '已关闭' }}</span>
        </label>
        <input
          v-else
          v-model="draft[field.key]"
          :type="field.secret ? 'password' : 'text'"
        />
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  JsonValue,
  PluginConfigFieldSchema,
  PluginConfigSnapshot,
} from '@garlic-claw/shared'

const props = defineProps<{
  snapshot: PluginConfigSnapshot | null
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'save', values: PluginConfigSnapshot['values']): void
}>()

const draft = ref<Record<string, string>>({})
const booleanDraft = ref<Record<string, boolean>>({})
const formError = ref<string | null>(null)

const fields = computed(() => props.snapshot?.schema?.fields ?? [])
const hasSchema = computed(() => fields.value.length > 0)

watch(
  () => props.snapshot,
  (snapshot) => {
    formError.value = null
    const nextDraft: Record<string, string> = {}
    const nextBooleanDraft: Record<string, boolean> = {}

    for (const field of snapshot?.schema?.fields ?? []) {
      const value = snapshot?.values[field.key] ?? field.defaultValue
      if (field.type === 'boolean') {
        nextBooleanDraft[field.key] = Boolean(value)
        continue
      }

      nextDraft[field.key] = stringifyFieldValue(field, value)
    }

    draft.value = nextDraft
    booleanDraft.value = nextBooleanDraft
  },
  { immediate: true },
)

/**
 * 提交当前配置草稿。
 */
function submit() {
  try {
    emit('save', buildConfigPayload(fields.value, draft.value, booleanDraft.value))
    formError.value = null
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '配置格式无效'
  }
}

/**
 * 把字段当前值转成适合输入框编辑的文本。
 * @param field schema 字段
 * @param value 当前值
 * @returns 输入框文本
 */
function stringifyFieldValue(
  field: PluginConfigFieldSchema,
  value: JsonValue | undefined,
): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (field.type === 'object' || field.type === 'array') {
    return JSON.stringify(value, null, 2)
  }

  return String(value)
}

/**
 * 把表单草稿转回配置载荷。
 * @param schemaFields schema 字段列表
 * @param stringDraft 字符串型草稿
 * @param boolDraft 布尔型草稿
 * @returns 可直接提交的配置对象
 */
function buildConfigPayload(
  schemaFields: PluginConfigFieldSchema[],
  stringDraft: Record<string, string>,
  boolDraft: Record<string, boolean>,
): PluginConfigSnapshot['values'] {
  const result: PluginConfigSnapshot['values'] = {}

  for (const field of schemaFields) {
    if (field.type === 'boolean') {
      result[field.key] = boolDraft[field.key] ?? false
      continue
    }

    const raw = (stringDraft[field.key] ?? '').trim()
    if (!raw) {
      if (field.required) {
        throw new Error(`${field.key} 为必填项`)
      }
      continue
    }

    switch (field.type) {
      case 'number': {
        const parsed = Number(raw)
        if (Number.isNaN(parsed)) {
          throw new Error(`${field.key} 必须是数字`)
        }
        result[field.key] = parsed
        break
      }
      case 'array': {
        const parsed = parseStructuredField(field.key, raw, 'array')
        if (!Array.isArray(parsed)) {
          throw new Error(`${field.key} 必须是 JSON 数组`)
        }
        result[field.key] = parsed
        break
      }
      case 'object': {
        const parsed = parseStructuredField(field.key, raw, 'object')
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error(`${field.key} 必须是 JSON 对象`)
        }
        result[field.key] = parsed
        break
      }
      default:
        result[field.key] = raw
        break
    }
  }

  return result
}

/**
 * 解析配置表单中的结构化 JSON 字段。
 * @param key 字段名
 * @param raw 原始输入文本
 * @param expected 期望结构
 * @returns 解析后的 JSON 值
 */
function parseStructuredField(
  key: string,
  raw: string,
  expected: 'array' | 'object',
): JsonValue {
  try {
    return JSON.parse(raw) as JsonValue
  } catch {
    throw new Error(`${key} 必须是有效 JSON ${expected === 'array' ? '数组' : '对象'}`)
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

.section-header p {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.ghost-button {
  background: transparent;
  border: 1px solid var(--border);
}

.section-error {
  color: var(--danger);
  font-size: 0.85rem;
}

.section-empty {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.config-form {
  display: grid;
  gap: 12px;
}

.config-field {
  display: grid;
  gap: 6px;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.field-label small {
  color: var(--text-muted);
  font-weight: 400;
}

.field-description {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.checkbox-field {
  display: flex;
  align-items: center;
  gap: 10px;
}

.checkbox-field input {
  width: auto;
}
</style>

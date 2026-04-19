<template>
  <div v-if="isVisible" :class="wrapperClass">
    <template v-if="nodeSchema.type === 'object'">
      <section v-if="!isRoot" class="config-section-card">
        <header v-if="sectionTitle || nodeSchema.hint" class="section-heading">
          <div>
            <h4 v-if="sectionTitle">{{ sectionTitle }}</h4>
            <p v-if="nodeSchema.hint" class="section-hint">
              <strong v-if="nodeSchema.obviousHint">注意：</strong>
              {{ nodeSchema.hint }}
            </p>
          </div>
        </header>

        <div class="section-content">
          <PluginConfigNodeRenderer
            v-for="[childKey, childSchema] in primaryEntries"
            :key="childKey"
            :node-key="childKey"
            :node-schema="childSchema"
            :model-value="readChildValue(childKey)"
            :root-values="rootValues"
            :special-options="specialOptions"
            @update:model-value="writeChildValue(childKey, $event)"
          />

          <div v-if="collapsedEntries.length > 0" class="collapsed-group">
            <button
              type="button"
              class="collapsed-toggle"
              @click="showCollapsed = !showCollapsed"
            >
              {{ showCollapsed ? '收起高级配置' : '展开高级配置' }}
            </button>

            <div v-if="showCollapsed" class="collapsed-items">
              <PluginConfigNodeRenderer
                v-for="[childKey, childSchema] in collapsedEntries"
                :key="childKey"
                :node-key="childKey"
                :node-schema="childSchema"
                :model-value="readChildValue(childKey)"
                :root-values="rootValues"
                :special-options="specialOptions"
                @update:model-value="writeChildValue(childKey, $event)"
              />
            </div>
          </div>
        </div>
      </section>

      <div v-else class="root-object">
        <PluginConfigNodeRenderer
          v-for="[childKey, childSchema] in primaryEntries"
          :key="childKey"
          :node-key="childKey"
          :node-schema="childSchema"
          :model-value="readChildValue(childKey)"
          :root-values="rootValues"
          :special-options="specialOptions"
          @update:model-value="writeChildValue(childKey, $event)"
        />

        <div v-if="collapsedEntries.length > 0" class="collapsed-group">
          <button
            type="button"
            class="collapsed-toggle"
            @click="showCollapsed = !showCollapsed"
          >
            {{ showCollapsed ? '收起高级配置' : '展开高级配置' }}
          </button>

          <div v-if="showCollapsed" class="collapsed-items">
            <PluginConfigNodeRenderer
              v-for="[childKey, childSchema] in collapsedEntries"
              :key="childKey"
              :node-key="childKey"
              :node-schema="childSchema"
              :model-value="readChildValue(childKey)"
              :root-values="rootValues"
              :special-options="specialOptions"
              @update:model-value="writeChildValue(childKey, $event)"
            />
          </div>
        </div>
      </div>
    </template>

    <label v-else class="config-field">
      <span class="field-label">
        {{ fieldLabel }}
        <small v-if="nodeSchema.specialType" class="field-tag">{{ nodeSchema.specialType }}</small>
      </span>
      <span v-if="nodeSchema.hint" class="field-description">
        <strong v-if="nodeSchema.obviousHint">注意：</strong>
        {{ nodeSchema.hint }}
      </span>

      <textarea
        v-if="isTextareaField"
        :value="textValue"
        :rows="nodeSchema.editorMode ? 10 : 4"
        class="config-textarea"
        @input="writeTextValue(($event.target as HTMLTextAreaElement).value)"
      />

      <input
        v-else-if="nodeSchema.type === 'int' || nodeSchema.type === 'float'"
        :value="numberValue"
        type="number"
        class="config-input"
        @input="writeNumberValue(($event.target as HTMLInputElement).value)"
      >

      <label v-else-if="nodeSchema.type === 'bool'" class="checkbox-field">
        <input
          :checked="booleanValue"
          type="checkbox"
          @change="emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
        >
        <span>{{ booleanValue ? '已启用' : '已关闭' }}</span>
      </label>

      <select
        v-else-if="selectOptions.length > 0"
        :value="stringValue"
        class="config-input"
        @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
      >
        <option value="">{{ emptySelectLabel }}</option>
        <option
          v-for="option in selectOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>

      <select
        v-else-if="multiSelectOptions.length > 0"
        :value="selectedListValues"
        class="config-input config-multi-select"
        multiple
        @change="writeMultiSelectValue($event.target as HTMLSelectElement)"
      >
        <option
          v-for="option in multiSelectOptions"
          :key="option.value"
          :value="option.value"
        >
          {{ option.label }}
        </option>
      </select>

      <div v-else-if="checkboxOptions.length > 0" class="checkbox-group">
        <label
          v-for="option in checkboxOptions"
          :key="option.value"
          class="checkbox-option"
        >
          <input
            :checked="selectedListValues.includes(option.value)"
            type="checkbox"
            @change="toggleCheckboxValue(option.value, ($event.target as HTMLInputElement).checked)"
          >
          <span>{{ option.label }}</span>
        </label>
      </div>

      <input
        v-else
        :value="stringValue"
        :type="nodeSchema.secret ? 'password' : 'text'"
        class="config-input"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      >

      <button
        v-if="nodeSchema.editorMode"
        type="button"
        class="editor-button"
        @click="openEditor"
      >
        全屏编辑
      </button>

      <p v-if="fieldError" class="field-error">{{ fieldError }}</p>

      <div v-if="editorOpen" class="editor-dialog">
        <div class="editor-card">
          <header class="editor-header">
            <strong>{{ fieldLabel }}</strong>
            <div class="editor-actions">
              <button type="button" class="editor-action" @click="saveEditor">保存</button>
              <button type="button" class="editor-action" @click="editorOpen = false">关闭</button>
            </div>
          </header>
          <textarea
            v-model="editorDraft"
            rows="20"
            class="editor-textarea"
          />
          <p v-if="editorError" class="field-error">{{ editorError }}</p>
        </div>
      </div>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  AiProviderSummary,
  JsonObject,
  JsonValue,
  PluginConfigNodeSchema,
  PluginConfigOptionSchema,
  PluginPersonaSummary,
} from '@garlic-claw/shared'

defineOptions({
  name: 'PluginConfigNodeRenderer',
})

const props = defineProps<{
  isRoot?: boolean
  modelValue: JsonValue | undefined
  nodeKey: string
  nodeSchema: PluginConfigNodeSchema
  rootValues: JsonObject
  specialOptions: {
    personas: PluginPersonaSummary[]
    providers: AiProviderSummary[]
  }
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: JsonValue | undefined): void
}>()

const showCollapsed = ref(false)
const fieldError = ref<string | null>(null)
const editorOpen = ref(false)
const editorDraft = ref('')
const editorError = ref<string | null>(null)

const isVisible = computed(() => {
  if (props.nodeSchema.invisible) {
    return false
  }
  const condition = props.nodeSchema.condition
  if (!condition) {
    return true
  }

  return Object.entries(condition).every(([path, expectedValue]) =>
    readValueAtPath(props.rootValues, path) === expectedValue,
  )
})

const sectionTitle = computed(() => props.nodeSchema.description ?? props.nodeKey)
const fieldLabel = computed(() => props.nodeSchema.description ?? props.nodeKey)
const wrapperClass = computed(() =>
  props.isRoot ? 'config-root-wrapper' : 'config-node-wrapper',
)
const primaryEntries = computed(() => visibleEntries.value.filter(([, schema]) => !schema.collapsed))
const collapsedEntries = computed(() => visibleEntries.value.filter(([, schema]) => schema.collapsed))
const visibleEntries = computed(() => {
  if (props.nodeSchema.type !== 'object') {
    return [] as Array<[string, PluginConfigNodeSchema]>
  }
  return Object.entries(props.nodeSchema.items).filter(([, schema]) =>
    isNodeVisible(schema, props.rootValues),
  )
})
const stringValue = computed(() =>
  typeof props.modelValue === 'string' ? props.modelValue : '',
)
const numberValue = computed(() =>
  typeof props.modelValue === 'number' ? String(props.modelValue) : '',
)
const booleanValue = computed(() => Boolean(props.modelValue))
const selectedListValues = computed(() =>
  Array.isArray(props.modelValue)
    ? props.modelValue.filter((value): value is string => typeof value === 'string')
    : [],
)
const textValue = computed(() => {
  if (props.nodeSchema.type === 'list') {
    return Array.isArray(props.modelValue)
      ? JSON.stringify(props.modelValue, null, 2)
      : '[]'
  }
  return typeof props.modelValue === 'string'
    ? props.modelValue
    : typeof props.nodeSchema.defaultValue === 'string'
      ? props.nodeSchema.defaultValue
      : ''
})
const isTextareaField = computed(() =>
  props.nodeSchema.type === 'text'
  || (props.nodeSchema.type === 'list'
    && checkboxOptions.value.length === 0
    && multiSelectOptions.value.length === 0),
)
const availableOptions = computed(() => {
  if (props.nodeSchema.specialType === 'selectProvider') {
    return props.specialOptions.providers.map((provider) => ({
      label: provider.name,
      value: provider.id,
    }))
  }
  if (props.nodeSchema.specialType === 'selectPersona') {
    return props.specialOptions.personas.map((persona) => ({
      label: persona.name,
      value: persona.id,
    }))
  }
  if (props.nodeSchema.specialType === 'selectProviders') {
    return props.specialOptions.providers.map((provider) => ({
      label: provider.name,
      value: provider.id,
    }))
  }
  if (props.nodeSchema.specialType === 'personaPool') {
    return props.specialOptions.personas.map((persona) => ({
      label: persona.name,
      value: persona.id,
    }))
  }
  return props.nodeSchema.options ?? []
})
const selectOptions = computed(() => {
  if (props.nodeSchema.type === 'list') {
    return [] as Array<{ label: string; value: string }>
  }
  return availableOptions.value.map((option) => toOptionView(option))
})
const emptySelectLabel = computed(() => {
  if (props.nodeSchema.specialType === 'selectProvider') {
    return '继承主模型（默认）'
  }
  return '未设置'
})
const checkboxOptions = computed(() => {
  if (props.nodeSchema.type !== 'list') {
    return [] as Array<{ label: string; value: string }>
  }
  if (props.nodeSchema.renderType !== 'checkbox') {
    return [] as Array<{ label: string; value: string }>
  }
  return availableOptions.value.map((option) => toOptionView(option))
})
const multiSelectOptions = computed(() => {
  if (props.nodeSchema.type !== 'list') {
    return [] as Array<{ label: string; value: string }>
  }
  if (props.nodeSchema.renderType === 'checkbox') {
    return [] as Array<{ label: string; value: string }>
  }
  return availableOptions.value.map((option) => toOptionView(option))
})

watch(
  () => props.modelValue,
  (nextValue) => {
    if (!editorOpen.value) {
      editorDraft.value = formatEditorValue(nextValue, props.nodeSchema)
      editorError.value = null
    }
  },
  { immediate: true },
)

function readChildValue(childKey: string): JsonValue | undefined {
  return isRecord(props.modelValue) ? props.modelValue[childKey] : undefined
}

function writeChildValue(childKey: string, nextValue: JsonValue | undefined) {
  const nextRecord = isRecord(props.modelValue)
    ? { ...props.modelValue }
    : {}
  if (typeof nextValue === 'undefined') {
    delete nextRecord[childKey]
  } else {
    nextRecord[childKey] = nextValue
  }
  emit('update:modelValue', nextRecord)
}

function writeTextValue(nextValue: string) {
  fieldError.value = null
  if (props.nodeSchema.type === 'list') {
    try {
      const parsed = JSON.parse(nextValue) as JsonValue
      if (!Array.isArray(parsed)) {
        throw new Error('当前字段要求 JSON 数组')
      }
      emit('update:modelValue', parsed)
    } catch (error) {
      fieldError.value = normalizeListParseError(error)
    }
    return
  }
  emit('update:modelValue', nextValue)
}

function writeNumberValue(nextValue: string) {
  fieldError.value = null
  if (!nextValue.trim()) {
    emit('update:modelValue', undefined)
    return
  }

  const parsed = Number(nextValue)
  if (Number.isNaN(parsed)) {
    fieldError.value = '请输入合法数字'
    return
  }
  emit('update:modelValue', parsed)
}

function toggleCheckboxValue(value: string, checked: boolean) {
  const currentValues = new Set(selectedListValues.value)
  if (checked) {
    currentValues.add(value)
  } else {
    currentValues.delete(value)
  }
  emit('update:modelValue', [...currentValues])
}

function writeMultiSelectValue(target: HTMLSelectElement) {
  emit(
    'update:modelValue',
    Array.from(target.selectedOptions, (option) => option.value),
  )
}

function openEditor() {
  editorDraft.value = formatEditorValue(props.modelValue, props.nodeSchema)
  editorError.value = null
  editorOpen.value = true
}

function saveEditor() {
  try {
    if (props.nodeSchema.type === 'list') {
      const parsed = JSON.parse(editorDraft.value) as JsonValue
      if (!Array.isArray(parsed)) {
        throw new Error('当前字段要求 JSON 数组')
      }
      emit('update:modelValue', parsed)
    } else {
      emit('update:modelValue', editorDraft.value)
    }
    editorError.value = null
    editorOpen.value = false
  } catch (error) {
    editorError.value = props.nodeSchema.type === 'list'
      ? normalizeListParseError(error)
      : error instanceof Error
        ? error.message
        : '编辑器内容格式无效'
  }
}

function formatEditorValue(
  value: JsonValue | undefined,
  schema: PluginConfigNodeSchema,
): string {
  if (schema.type === 'list') {
    return Array.isArray(value) ? JSON.stringify(value, null, 2) : '[]'
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof schema.defaultValue === 'string') {
    return schema.defaultValue
  }
  return ''
}

function normalizeListParseError(error: unknown): string {
  if (error instanceof Error && error.message === '当前字段要求 JSON 数组') {
    return error.message
  }
  return 'JSON 数组格式无效'
}

function toOptionView(option: PluginConfigOptionSchema): { label: string; value: string } {
  return {
    label: option.label ?? option.value,
    value: option.value,
  }
}

function readValueAtPath(source: JsonObject, path: string): JsonValue | undefined {
  let current: JsonValue | undefined = source
  for (const key of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      return undefined
    }
    current = (current as JsonObject)[key]
  }
  return current
}

function isNodeVisible(
  schema: PluginConfigNodeSchema,
  rootValues: JsonObject,
): boolean {
  if (schema.invisible) {
    return false
  }
  if (!schema.condition) {
    return true
  }
  return Object.entries(schema.condition).every(([path, expectedValue]) =>
    readValueAtPath(rootValues, path) === expectedValue,
  )
}

function isRecord(value: JsonValue | undefined): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
</script>

<style scoped>
.config-root-wrapper,
.config-node-wrapper {
  display: grid;
  gap: 12px;
}

.root-object,
.section-content,
.collapsed-items {
  display: grid;
  gap: 12px;
}

.config-section-card {
  display: grid;
  gap: 12px;
  padding: 1rem;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.section-heading {
  display: grid;
  gap: 6px;
}

.section-heading h4 {
  font-size: 0.95rem;
}

.section-hint {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.config-field {
  display: grid;
  gap: 6px;
  padding: 0.9rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.field-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.field-tag {
  color: var(--text-muted);
  font-size: 0.75rem;
  font-weight: 400;
}

.field-description {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.config-input,
.config-textarea,
.editor-textarea,
select {
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg-input);
  color: var(--text);
  padding: 0.75rem 0.85rem;
}

.config-multi-select {
  min-height: 7.5rem;
}

.checkbox-field,
.checkbox-group {
  display: grid;
  gap: 10px;
}

.checkbox-option {
  display: flex;
  align-items: center;
  gap: 10px;
}

.editor-button,
.collapsed-toggle,
.editor-action {
  width: fit-content;
  padding: 0.45rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text);
}

.collapsed-group {
  display: grid;
  gap: 10px;
}

.editor-dialog {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.45);
  z-index: 1000;
}

.editor-card {
  width: min(960px, 100%);
  display: grid;
  gap: 12px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 16px;
}

.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-actions {
  display: flex;
  gap: 8px;
}

.field-error {
  color: var(--danger);
  font-size: 0.82rem;
}

@media (max-width: 720px) {
  .editor-dialog {
    padding: 1rem;
  }

  .editor-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>

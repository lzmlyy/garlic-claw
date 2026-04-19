<template>
  <section class="panel-section">
    <div class="section-header">
      <div>
        <h3>插件配置</h3>
        <p>宿主按插件声明的配置元数据统一渲染，不再依赖扁平字段表单。</p>
      </div>
      <button
        type="button"
        class="ghost-button save-button"
        title="保存配置"
        :disabled="saving || !hasSchema"
        @click="submit"
      >
        <Icon :icon="disketteBold" class="save-icon" aria-hidden="true" />
      </button>
    </div>

    <p v-if="formError" class="section-error">{{ formError }}</p>
    <p v-else-if="sourceError" class="section-error">{{ sourceError }}</p>
    <p v-if="!hasSchema" class="section-empty">当前插件没有声明配置元数据。</p>

    <div v-else-if="rootSchema" class="config-layout">
      <PluginConfigNodeRenderer
        is-root
        node-key="root"
        :node-schema="rootSchema"
        :model-value="draft"
        :root-values="draft"
        :special-options="specialOptions"
        @update:model-value="applyDraft"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import disketteBold from '@iconify-icons/solar/diskette-bold'
import { computed, reactive, ref, watch } from 'vue'
import type {
  AiProviderSummary,
  JsonObject,
  JsonValue,
  PluginConfigNodeSchema,
  PluginConfigSchema,
  PluginConfigSnapshot,
  PluginPersonaSummary,
} from '@garlic-claw/shared'
import { listAiProviders } from '@/features/ai-settings/api/ai'
import { listPersonas } from '@/features/personas/api/personas'
import PluginConfigNodeRenderer from '@/features/plugins/components/PluginConfigNodeRenderer.vue'

const props = defineProps<{
  snapshot: PluginConfigSnapshot | null
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'save', values: PluginConfigSnapshot['values']): void
}>()

const draft = ref<JsonObject>({})
const formError = ref<string | null>(null)
const sourceError = ref<string | null>(null)
const specialOptions = reactive<{
  personas: PluginPersonaSummary[]
  providers: AiProviderSummary[]
}>({
  personas: [],
  providers: [],
})

const rootSchema = computed<PluginConfigSchema | undefined>(() => props.snapshot?.schema ?? undefined)
const hasSchema = computed(() => !!rootSchema.value)

watch(
  () => props.snapshot,
  (snapshot) => {
    formError.value = null
    draft.value = resolveDraftValues(snapshot)
  },
  { immediate: true },
)

watch(
  rootSchema,
  async (nextSchema) => {
    sourceError.value = null
    if (!nextSchema) {
      specialOptions.providers = []
      specialOptions.personas = []
      return
    }

    try {
      const [providers, personas] = await Promise.all([
        schemaNeedsProviderOptions(nextSchema) ? listAiProviders() : Promise.resolve([]),
        schemaNeedsPersonaOptions(nextSchema) ? listPersonas() : Promise.resolve([]),
      ])
      specialOptions.providers = providers
      specialOptions.personas = personas
    } catch (error) {
      specialOptions.providers = []
      specialOptions.personas = []
      sourceError.value = error instanceof Error ? error.message : '加载配置选择器数据失败'
    }
  },
  { immediate: true },
)

function applyDraft(nextValue: JsonValue | undefined) {
  draft.value = isJsonObject(nextValue) ? copyJsonObject(nextValue) : {}
}

function submit() {
  try {
    emit('save', rootSchema.value ? copyJsonObject(resolveConfigObjectValue(rootSchema.value, draft.value)) : {})
    formError.value = null
  } catch (error) {
    formError.value = error instanceof Error ? error.message : '配置格式无效'
  }
}

function resolveDraftValues(snapshot: PluginConfigSnapshot | null): JsonObject {
  if (!snapshot?.schema) {
    return copyJsonObject(snapshot?.values)
  }
  return copyJsonObject(resolveConfigObjectValue(snapshot.schema, snapshot.values))
}

function copyJsonObject(value: JsonObject | undefined): JsonObject {
  return JSON.parse(JSON.stringify(value ?? {})) as JsonObject
}

function resolveConfigObjectValue(
  schema: PluginConfigSchema,
  currentValue: JsonObject | undefined,
): JsonObject {
  return (resolveConfigNodeValue(schema, currentValue) ?? {}) as JsonObject
}

function resolveConfigNodeValue(
  schema: PluginConfigNodeSchema,
  currentValue: JsonValue | undefined,
): JsonValue | undefined {
  if (schema.type === 'object') {
    const source = isJsonObject(currentValue) ? currentValue : {}
    const result: JsonObject = {}

    for (const [key, childSchema] of Object.entries(schema.items)) {
      const childValue = resolveConfigNodeValue(childSchema, source[key])
      if (typeof childValue !== 'undefined') {
        result[key] = childValue
      }
    }

    return result
  }

  if (schema.type === 'list') {
    const sourceList = Array.isArray(currentValue)
      ? currentValue
      : Array.isArray(schema.defaultValue)
        ? schema.defaultValue
        : null
    if (!sourceList) {
      return typeof schema.defaultValue !== 'undefined'
        ? schema.defaultValue
        : undefined
    }
    const itemSchema = schema.items
    if (!itemSchema) {
      return sourceList
    }
    return sourceList.map((item) => resolveConfigNodeValue(itemSchema, item) ?? null)
  }

  if (typeof currentValue !== 'undefined') {
    return currentValue
  }

  return typeof schema.defaultValue !== 'undefined'
    ? schema.defaultValue
    : undefined
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function schemaNeedsProviderOptions(configSchema: PluginConfigSchema): boolean {
  return schemaUsesSpecialType(configSchema, ['selectProvider', 'selectProviders'])
}

function schemaNeedsPersonaOptions(configSchema: PluginConfigSchema): boolean {
  return schemaUsesSpecialType(configSchema, ['selectPersona', 'personaPool'])
}

function schemaUsesSpecialType(
  node: PluginConfigNodeSchema,
  targetTypes: string[],
): boolean {
  if (node.specialType && targetTypes.includes(node.specialType)) {
    return true
  }
  if (node.type === 'object') {
    return Object.values(node.items).some((child) => schemaUsesSpecialType(child, targetTypes))
  }
  if (node.type === 'list' && node.items) {
    return schemaUsesSpecialType(node.items, targetTypes)
  }
  return false
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

.save-button {
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

.save-icon {
  width: 18px;
  height: 18px;
  color: var(--text);
}

.section-error {
  color: var(--danger);
  font-size: 0.85rem;
}

.section-empty {
  color: var(--text-muted);
  font-size: 0.9rem;
}

.config-layout {
  display: grid;
  gap: 14px;
}
</style>

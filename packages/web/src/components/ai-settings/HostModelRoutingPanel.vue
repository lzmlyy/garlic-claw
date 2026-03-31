<template>
  <section class="panel-card">
    <div class="panel-header">
      <div>
        <h2>Host Model Routing</h2>
        <p>配置聊天回退链、压缩模型，以及宿主内部 utility role 使用的专用模型。</p>
      </div>
    </div>

    <div class="panel-body">
      <div class="field">
        <span>Fallback Chat Models</span>
        <div class="inline-row">
          <select v-model="pendingFallbackSelection" data-test="fallback-model-select">
            <option value="">请选择要加入回退链的模型</option>
            <option
              v-for="option in options"
              :key="encodeTarget(option)"
              :value="encodeTarget(option)"
            >
              {{ option.label }}
            </option>
          </select>
          <button
            type="button"
            class="ghost-button"
            data-test="fallback-model-add"
            :disabled="!pendingFallbackSelection"
            @click="addFallbackModel"
          >
            加入回退链
          </button>
        </div>

        <div v-if="fallbackModels.length === 0" class="empty-state">
          当前没有配置聊天回退模型。
        </div>
        <ul v-else class="fallback-list">
          <li
            v-for="(target, index) in fallbackModels"
            :key="`${target.providerId}:${target.modelId}`"
            class="fallback-item"
          >
            <div>
              <strong>#{{ index + 1 }}</strong>
              <span>{{ resolveLabel(target) }}</span>
            </div>
            <div class="fallback-actions">
              <button
                type="button"
                class="ghost-button"
                :disabled="index === 0"
                @click="moveFallback(index, -1)"
              >
                上移
              </button>
              <button
                type="button"
                class="ghost-button"
                :disabled="index === fallbackModels.length - 1"
                @click="moveFallback(index, 1)"
              >
                下移
              </button>
              <button
                type="button"
                class="ghost-button danger"
                @click="removeFallback(index)"
              >
                删除
              </button>
            </div>
          </li>
        </ul>
      </div>

      <div class="field-grid">
        <label class="field">
          <span>Compression Model</span>
          <select v-model="compressionSelection" data-test="compression-model-select">
            <option value="">未指定</option>
            <option
              v-for="option in options"
              :key="`compression-${encodeTarget(option)}`"
              :value="encodeTarget(option)"
            >
              {{ option.label }}
            </option>
          </select>
        </label>

        <div class="field">
          <span>Utility Roles</span>
          <label
            v-for="role in utilityRoleDefinitions"
            :key="role.key"
            class="field utility-role-field"
          >
            <small>{{ role.label }}</small>
            <select
              v-model="utilityRoleSelections[role.key]"
              :data-test="`utility-role-${role.key}`"
            >
              <option value="">未指定</option>
              <option
                v-for="option in options"
                :key="`${role.key}-${encodeTarget(option)}`"
                :value="encodeTarget(option)"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div class="actions">
        <button
          type="button"
          class="primary-button"
          data-test="host-routing-save"
          :disabled="saving"
          @click="submit"
        >
          保存
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type {
  AiHostModelRoutingConfig,
  AiModelRouteTarget,
  AiUtilityModelRole,
} from '@garlic-claw/shared'

interface HostModelRoutingOption extends AiModelRouteTarget {
  label: string
}

const props = defineProps<{
  config: AiHostModelRoutingConfig
  options: HostModelRoutingOption[]
  saving: boolean
}>()

const emit = defineEmits<{
  (event: 'save', payload: AiHostModelRoutingConfig): void
}>()

const utilityRoleDefinitions: Array<{ key: AiUtilityModelRole; label: string }> = [
  { key: 'conversationTitle', label: '会话标题生成' },
  { key: 'pluginGenerateText', label: '插件默认文本生成' },
]

const fallbackModels = ref<AiModelRouteTarget[]>([])
const pendingFallbackSelection = ref('')
const compressionSelection = ref('')
const utilityRoleSelections = reactive<Record<AiUtilityModelRole, string>>({
  conversationTitle: '',
  pluginGenerateText: '',
})

const optionLabelMap = computed(() =>
  new Map(props.options.map((option) => [encodeTarget(option), option.label])),
)

watch(
  () => props.config,
  (config) => {
    fallbackModels.value = config.fallbackChatModels.map((target) => ({ ...target }))
    compressionSelection.value = config.compressionModel
      ? encodeTarget(config.compressionModel)
      : ''
    utilityRoleSelections.conversationTitle = config.utilityModelRoles.conversationTitle
      ? encodeTarget(config.utilityModelRoles.conversationTitle)
      : ''
    utilityRoleSelections.pluginGenerateText = config.utilityModelRoles.pluginGenerateText
      ? encodeTarget(config.utilityModelRoles.pluginGenerateText)
      : ''
    pendingFallbackSelection.value = ''
  },
  { immediate: true, deep: true },
)

function addFallbackModel() {
  const target = decodeTarget(pendingFallbackSelection.value)
  if (!target) {
    return
  }

  if (
    fallbackModels.value.some(
      (item) =>
        item.providerId === target.providerId && item.modelId === target.modelId,
    )
  ) {
    pendingFallbackSelection.value = ''
    return
  }

  fallbackModels.value.push(target)
  pendingFallbackSelection.value = ''
}

function moveFallback(index: number, offset: -1 | 1) {
  const nextIndex = index + offset
  if (nextIndex < 0 || nextIndex >= fallbackModels.value.length) {
    return
  }

  const next = [...fallbackModels.value]
  const [target] = next.splice(index, 1)
  next.splice(nextIndex, 0, target)
  fallbackModels.value = next
}

function removeFallback(index: number) {
  fallbackModels.value = fallbackModels.value.filter((_, itemIndex) => itemIndex !== index)
}

function submit() {
  emit('save', {
    fallbackChatModels: fallbackModels.value.map((target) => ({ ...target })),
    ...(decodeTarget(compressionSelection.value)
      ? { compressionModel: decodeTarget(compressionSelection.value) }
      : {}),
    utilityModelRoles: buildUtilityRoles(),
  })
}

function buildUtilityRoles() {
  return Object.fromEntries(
    utilityRoleDefinitions
      .map((role) => {
        const target = decodeTarget(utilityRoleSelections[role.key])
        return target ? [role.key, target] : null
      })
      .filter((entry): entry is [AiUtilityModelRole, AiModelRouteTarget] => Boolean(entry)),
  ) as AiHostModelRoutingConfig['utilityModelRoles']
}

function resolveLabel(target: AiModelRouteTarget) {
  return optionLabelMap.value.get(encodeTarget(target)) ?? `${target.providerId} / ${target.modelId}`
}

function encodeTarget(target: AiModelRouteTarget) {
  return `${target.providerId}::${target.modelId}`
}

function decodeTarget(value: string): AiModelRouteTarget | undefined {
  const [providerId, modelId] = value.split('::')
  if (!providerId || !modelId) {
    return undefined
  }

  return { providerId, modelId }
}
</script>

<style scoped>
.panel-card {
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: rgba(14, 24, 38, 0.85);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: 0 12px 28px rgba(1, 6, 15, 0.2), 0 0 15px rgba(103, 199, 207, 0.08);
  min-width: 0;
}

.panel-header,
.panel-body,
.field,
.fallback-list {
  display: grid;
  gap: 12px;
}

.panel-header {
  margin-bottom: 18px;
}

.panel-header h2,
.panel-header p {
  margin: 0;
}

.panel-header p {
  color: var(--text-muted);
  margin-top: 6px;
}

.field-grid,
.inline-row,
.actions,
.fallback-item,
.fallback-actions {
  display: flex;
  gap: 12px;
}

.field span,
.field small {
  color: var(--text-muted);
}

.field-grid {
  align-items: start;
}

.field-grid > * {
  flex: 1 1 0;
}

.inline-row {
  flex-wrap: wrap;
}

.field select {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(11, 21, 35, 0.9);
  color: var(--text);
}

.empty-state,
.fallback-item {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(11, 21, 35, 0.72);
}

.fallback-item {
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.fallback-item strong {
  margin-right: 8px;
}

.fallback-actions {
  flex-wrap: wrap;
}

.utility-role-field {
  gap: 8px;
}

.ghost-button,
.primary-button {
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
}

.ghost-button {
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text);
}

.ghost-button.danger {
  color: var(--danger);
}

.primary-button {
  border: none;
  background: var(--accent);
  color: #fff;
}

.actions {
  justify-content: end;
}

@media (max-width: 720px) {
  .panel-card {
    padding: 16px;
  }

  .field-grid {
    flex-direction: column;
  }

  .actions {
    justify-content: stretch;
  }

  .primary-button {
    width: 100%;
  }
}
</style>

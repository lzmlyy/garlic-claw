<template>
  <section class="panel-card">
    <div class="panel-header">
      <div>
        <h2>模型回退链</h2>
        <p>主对话模型调用失败时，按此处顺序依次尝试备用模型。</p>
      </div>
    </div>

    <div class="panel-body">
      <div class="field">
        <span>Fallback Chat Models</span>
        <div class="inline-row">
          <ElSelect
            v-model="pendingFallbackSelection"
            data-test="fallback-model-select"
            placeholder="请选择要加入回退链的模型"
          >
            <ElOption
              v-for="option in options"
              :key="encodeTarget(option)"
              :label="option.label"
              :value="encodeTarget(option)"
            />
          </ElSelect>
          <ElButton
            data-test="fallback-model-add"
            :disabled="!pendingFallbackSelection"
            @click="addFallbackModel"
          >
            加入回退链
          </ElButton>
        </div>

        <div v-if="fallbackModels.length === 0" class="empty-state">
          没有配置回退模型。
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
              <ElButton
                :disabled="index === 0"
                @click="moveFallback(index, -1)"
              >
                上移
              </ElButton>
              <ElButton
                :disabled="index === fallbackModels.length - 1"
                @click="moveFallback(index, 1)"
              >
                下移
              </ElButton>
              <ElButton
                type="danger"
                @click="removeFallback(index)"
              >
                删除
              </ElButton>
            </div>
          </li>
        </ul>
      </div>

      <div class="field">
        <span>聊天自动重试</span>
        <small>对齐 `opencode` 主会话自动重试语义：同一模型请求失败后退避重试，而不是立刻失败或只走 fallback。</small>

        <div class="config-grid">
          <label class="config-item">
            <span>是否启用</span>
            <select
              :value="String(chatAutoRetry.enabled)"
              data-test="auto-retry-enabled"
              @change="updateAutoRetryEnabled"
            >
              <option value="true">启用</option>
              <option value="false">关闭</option>
            </select>
          </label>

          <label class="config-item">
            <span>最大重试次数</span>
            <input
              :value="String(chatAutoRetry.maxRetries)"
              data-test="auto-retry-max-retries"
              min="0"
              type="number"
              @input="updateAutoRetryInt('maxRetries', $event)"
            />
          </label>

          <label class="config-item">
            <span>首次延迟（毫秒）</span>
            <input
              :value="String(chatAutoRetry.initialDelayMs)"
              data-test="auto-retry-initial-delay"
              min="0"
              type="number"
              @input="updateAutoRetryInt('initialDelayMs', $event)"
            />
          </label>

          <label class="config-item">
            <span>最大延迟（毫秒）</span>
            <input
              :value="String(chatAutoRetry.maxDelayMs)"
              data-test="auto-retry-max-delay"
              min="0"
              type="number"
              @input="updateAutoRetryInt('maxDelayMs', $event)"
            />
          </label>

          <label class="config-item">
            <span>退避倍数</span>
            <input
              :value="String(chatAutoRetry.backoffFactor)"
              data-test="auto-retry-backoff-factor"
              min="1"
              step="0.1"
              type="number"
              @input="updateAutoRetryFactor"
            />
          </label>
        </div>
      </div>

      <div class="actions">
        <ElButton
          type="primary"
          data-test="host-routing-save"
          :disabled="saving"
          @click="submit"
        >
          保存
        </ElButton>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElButton, ElOption, ElSelect } from 'element-plus'
import type {
  AiChatAutoRetryConfig,
  AiHostModelRoutingConfig,
  AiModelRouteTarget,
} from '@garlic-claw/shared'
const DEFAULT_AI_CHAT_AUTO_RETRY_CONFIG: AiChatAutoRetryConfig = {
  enabled: true,
  maxRetries: 2,
  initialDelayMs: 2000,
  maxDelayMs: 30000,
  backoffFactor: 2,
}

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

const fallbackModels = ref<AiModelRouteTarget[]>([])
const chatAutoRetry = ref<AiChatAutoRetryConfig>({ ...DEFAULT_AI_CHAT_AUTO_RETRY_CONFIG })
const pendingFallbackSelection = ref('')

const optionLabelMap = computed(() =>
  new Map(props.options.map((option) => [encodeTarget(option), option.label])),
)

watch(
  () => props.config,
  (config) => {
    fallbackModels.value = config.fallbackChatModels.map((target) => ({ ...target }))
    chatAutoRetry.value = resolveChatAutoRetryConfig(config.chatAutoRetry)
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
    chatAutoRetry: { ...chatAutoRetry.value },
    ...(props.config.compressionModel ? { compressionModel: { ...props.config.compressionModel } } : {}),
    fallbackChatModels: fallbackModels.value.map((target) => ({ ...target })),
    utilityModelRoles: cloneUtilityModelRoles(props.config.utilityModelRoles),
  })
}

function updateAutoRetryEnabled(event: Event) {
  chatAutoRetry.value = {
    ...chatAutoRetry.value,
    enabled: (event.target as HTMLSelectElement).value === 'true',
  }
}

function updateAutoRetryInt(
  key: 'maxRetries' | 'initialDelayMs' | 'maxDelayMs',
  event: Event,
) {
  const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10)
  chatAutoRetry.value = {
    ...chatAutoRetry.value,
    [key]: Number.isFinite(parsed) && parsed >= 0
      ? parsed
      : DEFAULT_AI_CHAT_AUTO_RETRY_CONFIG[key],
  }
}

function updateAutoRetryFactor(event: Event) {
  const parsed = Number.parseFloat((event.target as HTMLInputElement).value)
  chatAutoRetry.value = {
    ...chatAutoRetry.value,
    backoffFactor: Number.isFinite(parsed) && parsed >= 1
      ? parsed
      : DEFAULT_AI_CHAT_AUTO_RETRY_CONFIG.backoffFactor,
  }
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

function resolveChatAutoRetryConfig(config?: AiChatAutoRetryConfig): AiChatAutoRetryConfig {
  return {
    ...DEFAULT_AI_CHAT_AUTO_RETRY_CONFIG,
    ...(config ?? {}),
  }
}

function cloneUtilityModelRoles(
  roles: AiHostModelRoutingConfig['utilityModelRoles'],
): AiHostModelRoutingConfig['utilityModelRoles'] {
  return Object.fromEntries(
    Object.entries(roles).map(([role, target]) => [role, target ? { ...target } : target]),
  ) as AiHostModelRoutingConfig['utilityModelRoles']
}
</script>

<style scoped>
.panel-card {
  padding: 0;
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

.config-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}

.config-item {
  display: grid;
  gap: 8px;
}

.config-item select,
.config-item input {
  width: 100%;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-panel-soft);
  color: var(--text);
}

.inline-row {
  flex-wrap: wrap;
}

.field :deep(.el-select) {
  width: 100%;
  min-width: 0;
}

.empty-state,
.fallback-item {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-panel-soft);
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
  .actions {
    justify-content: stretch;
  }

  .primary-button {
    width: 100%;
  }
}
</style>

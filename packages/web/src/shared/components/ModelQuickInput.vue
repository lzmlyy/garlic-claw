<template>
  <div ref="containerRef" class="model-quick-input">
    <ElInput
      ref="inputRef"
      v-model="inputValue"
      :disabled="disabled"
      :placeholder="placeholder"
      class="quick-input"
      @blur="handleBlur"
      @focus="handleFocus"
      @input="handleInput"
      @keydown="handleKeydown"
    />
    <div v-if="showSuggestions && filteredSuggestions.length > 0" class="suggestions">
      <ElButton
        v-for="(item, index) in filteredSuggestions"
        :key="`${item.providerId}/${item.modelId}`"
        class="suggestion-item"
        native-type="button"
        :class="{ selected: index === selectedIndex }"
        @mousedown.prevent="selectSuggestion(item)"
        @mouseenter="selectedIndex = index"
      >
        <span class="provider-badge">{{ item.providerId }}</span>
        <span class="model-name">{{ item.modelName || item.modelId }}</span>
        <span v-if="item.capabilities.reasoning" class="capability-tag">推理</span>
        <span v-if="item.capabilities.toolCall" class="capability-tag">工具</span>
        <span v-if="item.capabilities.input.image" class="capability-tag">图片</span>
      </ElButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElButton, ElInput } from 'element-plus'
import type { AiModelCapabilities } from '@garlic-claw/shared'
import {
  listAiModels,
  listAiProviders,
} from '@/modules/ai-settings/api/ai'
import { subscribeInternalConfigChanged } from '@/modules/ai-settings/internal-config-change'

/**
 * 自动补全建议项。
 */
interface SuggestionItem {
  providerId: string
  modelId: string
  modelName?: string
  capabilities: AiModelCapabilities
}

const props = withDefaults(defineProps<{
  provider?: string | null
  model?: string | null
  disabled?: boolean
  placeholder?: string
}>(), {
  disabled: false,
  placeholder: '输入 provider/model',
})

const emit = defineEmits<{
  (event: 'change', value: { providerId: string; modelId: string }): void
}>()

const inputValue = ref('')
const searchQuery = ref('')
const showSuggestions = ref(false)
const selectedIndex = ref(0)
const containerRef = ref<HTMLElement | null>(null)
const inputRef = ref<InstanceType<typeof ElInput> | null>(null)
const allSuggestions = ref<SuggestionItem[]>([])
let removeInternalConfigChangedListener = () => {}
let loadRequestId = 0

const filteredSuggestions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const suggestions = query
    ? allSuggestions.value.filter((item) => {
      const fullName = `${item.providerId}/${item.modelId}`.toLowerCase()
      return fullName.includes(query) || item.modelName?.toLowerCase().includes(query)
    })
    : allSuggestions.value

  return suggestions.slice(0, 20)
})

watch(
  () => [props.provider, props.model],
  ([provider, model]) => {
    inputValue.value = provider && model ? `${provider}/${model}` : ''
    searchQuery.value = ''
  },
  { immediate: true },
)

async function loadAllModels() {
  const requestId = ++loadRequestId
  try {
    const providers = await listAiProviders()
    const availableProviders = providers.filter((provider) => provider.available)
    const suggestionGroups = await Promise.all(
      availableProviders.map(async (provider) => {
        try {
          const models = await listAiModels(provider.id)
          return models.map((model) => ({
            providerId: provider.id,
            modelId: model.id,
            modelName: model.name,
            capabilities: model.capabilities,
          }))
        } catch {
          return []
        }
      }),
    )

    if (requestId !== loadRequestId) {
      return
    }
    allSuggestions.value = suggestionGroups.flat()
  } catch {
    if (requestId !== loadRequestId) {
      return
    }
    allSuggestions.value = []
  }
}

function handleInput() {
  searchQuery.value = inputValue.value
  selectedIndex.value = 0
  showSuggestions.value = true
}

/**
 * 展开模型列表时重置筛选词，但保留当前已选值的展示。
 * 输入:
 * - 无
 * 输出:
 * - 下拉建议列表切回完整候选集
 * 预期行为:
 * - 再次点击输入框时不会只剩当前已选模型
 */
function handleFocus() {
  searchQuery.value = ''
  selectedIndex.value = 0
  showSuggestions.value = true
}

function handleKeydown(event: Event | KeyboardEvent) {
  if (!(event instanceof KeyboardEvent)) {
    return
  }

  if (!showSuggestions.value || filteredSuggestions.value.length === 0) {
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    selectedIndex.value = Math.min(selectedIndex.value + 1, filteredSuggestions.value.length - 1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    const item = filteredSuggestions.value[selectedIndex.value]
    if (item) {
      selectSuggestion(item)
    }
    return
  }

  if (event.key === 'Escape') {
    showSuggestions.value = false
  }
}

function selectSuggestion(item: SuggestionItem) {
  inputValue.value = `${item.providerId}/${item.modelId}`
  searchQuery.value = ''
  showSuggestions.value = false
  emit('change', { providerId: item.providerId, modelId: item.modelId })
}

function handleBlur() {
  window.setTimeout(() => {
    showSuggestions.value = false
    searchQuery.value = ''
  }, 120)

  const value = inputValue.value.trim()
  if (!value.includes('/')) {
    return
  }

  const [providerId, ...modelParts] = value.split('/')
  const modelId = modelParts.join('/')
  if (providerId && modelId) {
    emit('change', { providerId, modelId })
  }
}

function handleClickOutside(event: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(event.target as Node)) {
    showSuggestions.value = false
  }
}

onMounted(() => {
  void loadAllModels()
  removeInternalConfigChangedListener = subscribeInternalConfigChanged(({ scope }) => {
    if (scope !== 'provider-models') {
      return
    }
    void loadAllModels()
  })
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  removeInternalConfigChangedListener()
  document.removeEventListener('click', handleClickOutside)
})

defineExpose({
  focus: () => inputRef.value?.focus(),
})
</script>

<style scoped>
.model-quick-input {
  position: relative;
  width: 100%;
}

:deep(.quick-input .el-input__wrapper) {
  background: var(--gc-surface-base);
}

.suggestions {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  max-height: 320px;
  overflow-y: auto;
  border: 1px solid var(--gc-border);
  border-radius: var(--gc-radius);
  background: var(--gc-surface-floating);
  backdrop-filter: blur(var(--gc-blur));
  -webkit-backdrop-filter: blur(var(--gc-blur));
  box-shadow: var(--gc-shadow);
  z-index: 20;
}

.suggestion-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: none;
  background: transparent;
  box-shadow: none;
  margin: 0;
  color: var(--gc-text);
  text-align: left;
}

.suggestion-item:hover,
.suggestion-item.selected {
  background: var(--gc-surface-elevated);
}

.provider-badge {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-brand-soft);
  color: var(--accent);
  font-size: 12px;
}

.model-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.capability-tag {
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-success-soft);
  color: var(--success);
  font-size: 11px;
}
</style>

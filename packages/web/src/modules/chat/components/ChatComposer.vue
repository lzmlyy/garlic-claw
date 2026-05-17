<template>
  <div class="input-area">
    <div v-if="uploadNotices.length > 0" class="upload-notices">
      <div
        v-for="notice in uploadNotices"
        :key="notice.id"
        class="upload-notice"
        :class="notice.type"
      >
        {{ notice.text }}
      </div>
    </div>

    <div v-if="pendingImages.length > 0" class="pending-images">
      <div v-for="(image, index) in pendingImages" :key="image.id" class="pending-image">
        <img :src="image.image" :alt="image.name" />
        <ElButton class="remove-image" native-type="button" circle @click="$emit('remove-image', index)">
          ×
        </ElButton>
      </div>
    </div>

    <div v-if="queuedSendCount > 0" class="queued-sends">
      <div class="queued-sends-header">
        <span class="queued-sends-title">待发送队列</span>
        <span class="queued-sends-count">{{ queuedSendCount }}</span>
      </div>
      <div class="queued-sends-list">
        <span
          v-for="entry in queuedSendPreviewEntries"
          :key="entry.id"
          class="queued-send-chip"
        >
          {{ entry.preview }}
        </span>
      </div>
      <p class="queued-sends-hint">按 Alt+↑ 取回最后一条到输入框</p>
    </div>

    <div class="composer">
      <div class="composer-input-wrap">
        <textarea
          ref="textareaRef"
          class="composer-input"
          :value="modelValue"
          placeholder="输入消息，支持附带图片；输入 / 查看命令提示"
          rows="1"
          @blur="handleBlur"
          @focus="handleFocus"
          @input="handleInput"
          @keydown="handleKeydown"
        ></textarea>
        <div v-if="showCommandSuggestions" class="command-suggestions">
          <ElButton
            v-for="(suggestion, index) in commandSuggestions"
            :key="`${suggestion.commandId}:${suggestion.trigger}`"
            class="command-suggestion-item"
            native-type="button"
            :class="{ selected: index === selectedCommandSuggestionIndex }"
            @mousedown.prevent="selectCommandSuggestion(suggestion.trigger)"
            @mouseenter="selectedCommandSuggestionIndex = index"
          >
            <span class="command-trigger">{{ suggestion.trigger }}</span>
            <span class="command-plugin">{{ suggestion.pluginDisplayName || suggestion.pluginId }}</span>
            <span v-if="suggestion.description" class="command-description">{{ suggestion.description }}</span>
            <span
              class="command-status"
              :class="{ offline: !suggestion.connected }"
            >
              {{ suggestion.connected ? '可用' : '离线' }}
            </span>
          </ElButton>
        </div>
      </div>
      <label class="composer-button upload-button" title="上传图片">
        <input accept="image/*" multiple type="file" @change="$emit('file-change', $event)" />
        <Icon :icon="galleryAddBold" class="button-icon" aria-hidden="true" />
      </label>
      <ElButton
        class="composer-button send-button"
        native-type="button"
        title="发送"
        :disabled="!canSend"
        @click="$emit('send')"
      >
        <Icon :icon="plainBold" class="button-icon" aria-hidden="true" />
      </ElButton>
      <ElButton
        class="composer-button stop-button"
        native-type="button"
        title="停止"
        :disabled="!canStop"
        @click="$emit('stop')"
      >
        <Icon :icon="stopBold" class="button-icon" aria-hidden="true" />
      </ElButton>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, toRefs, watch } from 'vue'
import { ElButton } from 'element-plus'
import { Icon } from '@iconify/vue'
import galleryAddBold from '@iconify-icons/solar/gallery-add-bold'
import plainBold from '@iconify-icons/solar/plain-bold'
import stopBold from '@iconify-icons/solar/stop-bold'
import type { PendingImage, UploadNotice } from '@/modules/chat/composables/use-chat-view'
import type { ChatCommandSuggestion } from '@/modules/chat/composables/use-chat-command-catalog'
import type { QueuedChatSendPreviewEntry } from '@/modules/chat/modules/chat-store.module'

const props = defineProps<{
  modelValue: string
  pendingImages: PendingImage[]
  uploadNotices: UploadNotice[]
  commandSuggestions: ChatCommandSuggestion[]
  queuedSendCount: number
  queuedSendPreviewEntries: QueuedChatSendPreviewEntry[]
  canSend: boolean
  canStop: boolean
  streaming: boolean
}>()
const {
  modelValue,
  pendingImages,
  uploadNotices,
  commandSuggestions,
  queuedSendCount,
  queuedSendPreviewEntries,
  canSend,
  canStop,
} = toRefs(props)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'file-change', value: Event): void
  (event: 'remove-image', index: number): void
  (event: 'apply-command-suggestion', value: string): void
  (event: 'pop-queued-send'): void
  (event: 'send'): void
  (event: 'stop'): void
}>()

const textareaRef = ref<HTMLTextAreaElement | null>(null)
const suggestionPanelExpanded = ref(false)
const selectedCommandSuggestionIndex = ref(0)
const showCommandSuggestions = computed(() =>
  suggestionPanelExpanded.value &&
  commandSuggestions.value.length > 0 &&
  modelValue.value.trim().startsWith('/'),
)

watch(
  commandSuggestions,
  () => {
    selectedCommandSuggestionIndex.value = 0
    if (commandSuggestions.value.length === 0) {
      suggestionPanelExpanded.value = false
    }
  },
  {
    deep: true,
  },
)

watch(
  modelValue,
  (value) => {
    if (!value.trim().startsWith('/')) {
      suggestionPanelExpanded.value = false
      selectedCommandSuggestionIndex.value = 0
      return
    }
    if (commandSuggestions.value.length > 0) {
      suggestionPanelExpanded.value = true
    }
  },
)

/**
 * 同步输入框内容到父组件状态。
 * @param event 输入事件
 */
function handleInput(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  emit('update:modelValue', value)
  suggestionPanelExpanded.value = value.trim().startsWith('/')
}

function handleFocus() {
  if (commandSuggestions.value.length > 0 && modelValue.value.trim().startsWith('/')) {
    suggestionPanelExpanded.value = true
  }
}

function handleBlur() {
  window.setTimeout(() => {
    suggestionPanelExpanded.value = false
  }, 120)
}

function handleKeydown(event: KeyboardEvent) {
  if (
    event.key === 'ArrowUp' &&
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    event.preventDefault()
    emit('pop-queued-send')
    return
  }

  if (showCommandSuggestions.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      selectedCommandSuggestionIndex.value = Math.min(
        selectedCommandSuggestionIndex.value + 1,
        commandSuggestions.value.length - 1,
      )
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      selectedCommandSuggestionIndex.value = Math.max(selectedCommandSuggestionIndex.value - 1, 0)
      return
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      if (!event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
        event.preventDefault()
        const suggestion = commandSuggestions.value[selectedCommandSuggestionIndex.value]
        if (suggestion) {
          selectCommandSuggestion(suggestion.trigger)
        }
        return
      }
    }

    if (event.key === 'Escape') {
      suggestionPanelExpanded.value = false
      return
    }
  }

  if (
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey
  ) {
    event.preventDefault()
    emit('send')
  }
}

function selectCommandSuggestion(trigger: string) {
  emit('apply-command-suggestion', trigger)
  suggestionPanelExpanded.value = false
  textareaRef.value?.focus()
}
</script>

<style scoped>
.input-area {
  padding: 0;
  background: transparent;
}

.upload-notices {
  display: grid;
  gap: 8px;
  margin-bottom: 12px;
}

.upload-notice {
  padding: 10px 12px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.upload-notice.info {
  background: var(--surface-success-soft);
  color: var(--success);
}

.upload-notice.error {
  background: var(--surface-danger-soft);
  color: var(--danger);
}

.pending-images {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.queued-sends {
  margin-bottom: 14px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-panel-soft);
}

.queued-sends-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.queued-sends-title {
  font-size: 13px;
  color: var(--text-muted);
}

.queued-sends-count {
  min-width: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

.queued-sends-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.queued-send-chip {
  max-width: 100%;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--surface-subtle-strong);
  color: var(--text);
  font-size: 12px;
  line-height: 1.4;
}

.queued-sends-hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.pending-image {
  position: relative;
}

.pending-image img {
  width: 88px;
  height: 88px;
  object-fit: cover;
  border-radius: 12px;
  border: 1px solid var(--border);
}

.remove-image {
  position: absolute;
  top: -6px;
  right: -6px;
  width: 24px;
  height: 24px;
  min-height: 24px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--danger);
  box-shadow: none;
  color: var(--gc-primary-foreground);
}

.composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 58px 58px 58px;
  gap: 10px;
  align-items: stretch;
}

.composer-input-wrap {
  position: relative;
}

.composer-input {
  width: 100%;
  min-height: 58px;
  max-height: 180px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: var(--surface-panel-soft-strong);
  backdrop-filter: blur(var(--gc-blur-standard));
  -webkit-backdrop-filter: blur(var(--gc-blur-standard));
  color: var(--text);
  resize: none;
  overflow-y: auto;
}

.composer-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--focus-ring);
}

.composer-button {
  min-height: 58px;
  padding: 0;
  border-radius: 18px;
  border: 1px solid var(--border);
  box-shadow: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    transform 0.16s ease,
    background 0.16s ease,
    border-color 0.16s ease;
}

.button-icon {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
}

.upload-button {
  background: var(--surface-subtle);
  color: var(--text);
}

.upload-button input {
  display: none;
}

.composer-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.send-button {
  background: linear-gradient(135deg, var(--gc-accent), var(--gc-accent));
  color: var(--gc-primary-foreground);
  border-color: transparent;
}

.stop-button {
  background: var(--surface-danger-soft);
  border-color: color-mix(in oklch, var(--danger) 30%, transparent);
  color: var(--danger);
}

.command-suggestions {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 10px);
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--surface-panel-strong);
  backdrop-filter: blur(var(--gc-blur-deep));
  -webkit-backdrop-filter: blur(var(--gc-blur-deep));
  box-shadow: var(--gc-shadow-lg), var(--gc-shadow-glow);
  z-index: 20;
}

.command-suggestion-item {
  display: grid;
  grid-template-columns: minmax(0, auto) minmax(0, 1fr) auto;
  gap: 6px 10px;
  align-items: center;
  justify-content: stretch;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 12px;
  background: transparent;
  box-shadow: none;
  color: var(--text);
  text-align: left;
}

.command-suggestion-item:hover,
.command-suggestion-item.selected {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.command-trigger {
  font-family: 'Cascadia Code', 'JetBrains Mono', monospace;
  font-size: 13px;
  color: var(--accent);
}

.command-plugin {
  min-width: 0;
  font-size: 13px;
  color: var(--text);
}

.command-description {
  grid-column: 1 / span 2;
  min-width: 0;
  font-size: 12px;
  color: var(--text-muted);
}

.command-status {
  justify-self: end;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-success-soft);
  color: var(--success);
  font-size: 11px;
}

.command-status.offline {
  background: color-mix(in srgb, var(--danger) 14%, transparent);
  color: var(--danger);
}

@media (max-width: 768px) {
  .composer {
    grid-template-columns: minmax(0, 1fr) 54px 54px;
    gap: 8px;
  }

  .composer-button,
  .composer-input {
    min-height: 54px;
    border-radius: 16px;
  }

  .command-suggestion-item {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .command-trigger {
    grid-column: 1 / span 2;
  }

  .command-plugin,
  .command-description {
    grid-column: 1 / span 2;
  }
}
</style>

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
        <button type="button" class="remove-image" @click="$emit('remove-image', index)">
          ×
        </button>
      </div>
    </div>

    <div class="composer">
      <textarea
        class="composer-input"
        :value="modelValue"
        :disabled="streaming"
        placeholder="输入消息，支持附带图片"
        rows="1"
        @input="handleInput"
        @keydown.enter.exact.prevent="$emit('send')"
      ></textarea>
      <label class="composer-button upload-button">
        <input accept="image/*" multiple type="file" @change="$emit('file-change', $event)" />
        图片
      </label>
      <button
        type="button"
        class="composer-button retry-button"
        :disabled="!canTriggerRetry"
        @click="$emit('retry')"
      >
        {{ retryLabel }}
      </button>
      <button
        v-if="streaming"
        type="button"
        class="composer-button stop-button"
        @click="$emit('stop')"
      >
        停止
      </button>
      <button
        v-else
        class="composer-button send-button"
        :disabled="!canSend"
        @click="$emit('send')"
      >
        发送
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { PendingImage, UploadNotice } from '../../composables/use-chat-view'

defineProps<{
  modelValue: string
  pendingImages: PendingImage[]
  uploadNotices: UploadNotice[]
  canSend: boolean
  canTriggerRetry: boolean
  retryLabel: string
  streaming: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'file-change', value: Event): void
  (event: 'remove-image', index: number): void
  (event: 'retry'): void
  (event: 'send'): void
  (event: 'stop'): void
}>()

/**
 * 同步输入框内容到父组件状态。
 * @param event 输入事件
 */
function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
}
</script>

<style scoped>
.input-area {
  padding: 16px;
  border: 1px solid rgba(124, 106, 246, 0.18);
  border-radius: 20px;
  background: var(--bg-card);
  box-shadow: 0 18px 34px rgba(0, 0, 0, 0.18);
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
  background: rgba(68, 204, 136, 0.12);
  color: var(--success);
}

.upload-notice.error {
  background: rgba(226, 74, 74, 0.12);
  color: var(--danger);
}

.pending-images {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 14px;
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
  border: none;
  border-radius: 999px;
  background: var(--danger);
  color: #fff;
  cursor: pointer;
}

.composer {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 86px 86px 86px;
  gap: 10px;
  align-items: stretch;
}

.composer-input {
  width: 100%;
  min-height: 58px;
  max-height: 180px;
  padding: 16px 18px;
  border: 1px solid rgba(124, 106, 246, 0.2);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(16, 17, 31, 0.88), rgba(42, 43, 69, 0.92));
  color: var(--text);
  resize: none;
  overflow-y: auto;
}

.composer-button {
  min-height: 58px;
  padding: 0 14px;
  border-radius: 18px;
  border: 1px solid var(--border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  letter-spacing: 0.04em;
  transition:
    transform 0.16s ease,
    background 0.16s ease,
    border-color 0.16s ease;
}

.upload-button {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
}

.upload-button input {
  display: none;
}

.composer-button:hover:not(:disabled) {
  transform: translateY(-1px);
}

.send-button {
  background: linear-gradient(135deg, var(--accent), var(--accent-hover));
  color: #fff;
  border-color: transparent;
}

.retry-button {
  background: rgba(68, 204, 136, 0.14);
  border-color: rgba(68, 204, 136, 0.3);
  color: var(--success);
}

.stop-button {
  background: rgba(226, 74, 74, 0.16);
  border-color: rgba(226, 74, 74, 0.3);
  color: #ffb0b0;
}

@media (max-width: 768px) {
  .composer {
    grid-template-columns: minmax(0, 1fr) 72px 72px 72px;
    gap: 8px;
  }

  .composer-button,
  .composer-input {
    min-height: 54px;
    border-radius: 16px;
  }
}
</style>

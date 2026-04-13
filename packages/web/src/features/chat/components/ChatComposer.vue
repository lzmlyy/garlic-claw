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
      <label class="composer-button upload-button" title="上传图片">
        <input accept="image/*" multiple type="file" @change="$emit('file-change', $event)" />
        <Icon :icon="galleryAddBold" class="button-icon" aria-hidden="true" />
      </label>
      <button
        v-if="streaming"
        type="button"
        class="composer-button stop-button"
        title="停止"
        @click="$emit('stop')"
      >
        <Icon :icon="stopBold" class="button-icon" aria-hidden="true" />
      </button>
      <button
        v-else
        class="composer-button send-button"
        title="发送"
        :disabled="!canSend"
        @click="$emit('send')"
      >
        <Icon :icon="plainBold" class="button-icon" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Icon } from '@iconify/vue'
import galleryAddBold from '@iconify-icons/solar/gallery-add-bold'
import plainBold from '@iconify-icons/solar/plain-bold'
import stopBold from '@iconify-icons/solar/stop-bold'
import type { PendingImage, UploadNotice } from '@/features/chat/composables/use-chat-view'

defineProps<{
  modelValue: string
  pendingImages: PendingImage[]
  uploadNotices: UploadNotice[]
  canSend: boolean
  streaming: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
  (event: 'file-change', value: Event): void
  (event: 'remove-image', index: number): void
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
  grid-template-columns: minmax(0, 1fr) 58px 58px;
  gap: 10px;
  align-items: stretch;
}

.composer-input {
  width: 100%;
  min-height: 58px;
  max-height: 180px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 18px;
  background: rgba(11, 21, 35, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text);
  resize: none;
  overflow-y: auto;
}

.composer-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px rgba(103, 199, 207, 0.24);
}

.composer-button {
  min-height: 58px;
  padding: 0;
  border-radius: 18px;
  border: 1px solid var(--border);
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

.stop-button {
  background: rgba(226, 74, 74, 0.16);
  border-color: rgba(226, 74, 74, 0.3);
  color: #ffb0b0;
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
}
</style>

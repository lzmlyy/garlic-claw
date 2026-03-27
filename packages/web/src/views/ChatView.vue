<template>
  <div class="chat-view">
    <template v-if="chat.currentConversationId">
      <div class="chat-toolbar">
        <ModelQuickInput
          :model="chat.selectedModel"
          :provider="chat.selectedProvider"
          placeholder="选择 provider/model"
          @change="handleModelChange"
        />
        <div v-if="selectedCapabilities" class="capability-row">
          <span v-if="selectedCapabilities.reasoning" class="capability-chip">推理</span>
          <span v-if="selectedCapabilities.toolCall" class="capability-chip">工具</span>
          <span v-if="selectedCapabilities.input.image" class="capability-chip">支持图片</span>
        </div>
      </div>

      <ChatMessageList
        :loading="chat.loading"
        :messages="chat.messages"
        @delete-message="deleteMessage"
        @update-message="updateMessage"
      />

      <ChatComposer
        v-model="inputText"
        :can-send="canSend"
        :can-trigger-retry="canTriggerRetryAction"
        :pending-images="pendingImages"
        :retry-label="retryActionLabel"
        :streaming="chat.streaming"
        :upload-notices="uploadNotices"
        @file-change="handleFileChange"
        @remove-image="removeImage"
        @retry="triggerRetryAction"
        @send="send"
        @stop="chat.stopStreaming()"
      />
    </template>

    <div v-else class="no-conversation">
      <p>👈 选择一个对话或创建新对话</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import ChatComposer from '../components/chat/ChatComposer.vue'
import ChatMessageList from '../components/chat/ChatMessageList.vue'
import ModelQuickInput from '../components/ModelQuickInput.vue'
import { useChatView } from '../composables/use-chat-view'
import { useChatStore } from '../stores/chat'

const chat = useChatStore()
const {
  inputText,
  pendingImages,
  selectedCapabilities,
  uploadNotices,
  canSend,
  canTriggerRetryAction,
  handleModelChange,
  send,
  handleFileChange,
  removeImage,
  updateMessage,
  deleteMessage,
  retryActionLabel,
  triggerRetryAction,
} = useChatView(chat)
</script>

<style scoped>
.chat-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
}

.chat-toolbar {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-card);
}

.capability-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.capability-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(68, 204, 136, 0.14);
  color: var(--success);
  font-size: 12px;
}

.no-conversation {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-muted);
}
</style>

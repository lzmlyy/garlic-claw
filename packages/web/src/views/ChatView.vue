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
        <div class="service-row">
          <span class="service-label">会话服务</span>
          <span
            class="service-chip"
            :class="{ disabled: conversationHostServices?.sessionEnabled === false }"
          >
            {{ conversationHostServices?.sessionEnabled === false ? '宿主已停用' : '宿主已启用' }}
          </span>
          <button
            class="service-toggle"
            type="button"
            @click="setConversationSessionEnabled(conversationHostServices?.sessionEnabled === false)"
          >
            {{ conversationHostServices?.sessionEnabled === false ? '开启会话宿主' : '停用会话宿主' }}
          </button>
          <button
            class="service-toggle"
            type="button"
            :disabled="conversationHostServices?.sessionEnabled === false"
            @click="setConversationLlmEnabled(conversationHostServices?.llmEnabled === false)"
          >
            {{ conversationHostServices?.llmEnabled === false ? '开启 LLM 回复' : '关闭 LLM 回复' }}
          </button>
          <span v-if="conversationSendDisabledReason" class="service-warning">
            {{ conversationSendDisabledReason }}
          </span>
        </div>
        <div class="skill-row">
          <span class="service-label">当前 Skills</span>
          <div
            v-if="conversationSkillState?.activeSkills?.length"
            class="skill-chip-list"
          >
            <span
              v-for="skill in conversationSkillState.activeSkills"
              :key="skill.id"
              class="skill-chip"
            >
              {{ skill.name }}
              <button
                type="button"
                class="skill-chip-remove"
                @click="removeConversationSkill(skill.id)"
              >
                ×
              </button>
            </span>
          </div>
          <span v-else class="service-warning">当前会话未激活 skill</span>
          <RouterLink class="service-link" :to="{ name: 'skills' }">
            管理 Skills
          </RouterLink>
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
  conversationHostServices,
  conversationSkillState,
  conversationSendDisabledReason,
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
  setConversationLlmEnabled,
  setConversationSessionEnabled,
  removeConversationSkill,
} = useChatView(chat)
</script>

<style scoped>
.chat-view {
  height: 100%;
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
  padding: 16px;
}

.chat-toolbar {
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--header-gradient);
  box-shadow: var(--shadow-sm), 0 0 15px rgba(103, 199, 207, 0.1);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
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
  background: rgba(89, 207, 155, 0.14);
  color: var(--success);
  font-size: 12px;
  font-weight: 500;
}

.service-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.service-label {
  font-size: 12px;
  color: var(--text-muted);
}

.service-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(76, 189, 255, 0.12);
  color: var(--accent);
  font-size: 12px;
  font-weight: 600;
}

.service-chip.disabled {
  background: rgba(255, 107, 107, 0.12);
  color: var(--danger);
}

.service-toggle {
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(10, 19, 24, 0.45);
  color: var(--text);
  border-radius: 999px;
  padding: 6px 12px;
  cursor: pointer;
}

.service-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.service-warning {
  color: var(--warning);
  font-size: 12px;
}

.skill-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
}

.skill-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skill-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(89, 207, 155, 0.14);
  color: var(--success);
  font-size: 12px;
  font-weight: 600;
}

.skill-chip-remove {
  border: none;
  background: transparent;
  color: currentColor;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.service-link {
  color: var(--accent);
  text-decoration: none;
  font-size: 12px;
}

.no-conversation {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-muted);
}
</style>

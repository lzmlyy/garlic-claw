<template>
  <div class="chat-view">
    <template v-if="chat.currentConversationId">
      <div class="chat-toolbar" :class="{ collapsed: !toolbarExpanded }">
        <div class="toolbar-header">
          <div class="toolbar-input-wrap">
            <ModelQuickInput
              :model="chat.selectedModel"
              :provider="chat.selectedProvider"
              placeholder="选择 provider/model"
              @change="handleModelChange"
            />
          </div>
          <button
            type="button"
            class="toolbar-toggle"
            :title="toolbarExpanded ? '收起' : '展开'"
            @click="toolbarExpanded = !toolbarExpanded"
          >
            <Icon
              class="toolbar-toggle-icon"
              :icon="toolbarExpanded ? altArrowUpBold : altArrowDownBold"
              aria-hidden="true"
            />
          </button>
        </div>
        <template v-if="toolbarExpanded">
          <div v-if="selectedCapabilities" class="capability-row">
            <span v-if="selectedCapabilities.reasoning" class="capability-chip">推理</span>
            <span v-if="selectedCapabilities.toolCall" class="capability-chip">工具</span>
            <span v-if="selectedCapabilities.input.image" class="capability-chip">支持图片</span>
          </div>
          <div class="service-row">
            <span class="service-label">会话服务</span>
            <button
              class="service-toggle"
              type="button"
              @click="setConversationSessionEnabled(conversationHostServices?.sessionEnabled === false)"
            >
              {{ conversationHostServices?.sessionEnabled === false ? '已停用会话宿主' : '已开启会话宿主' }}
            </button>
            <button
              class="service-toggle"
              type="button"
              :disabled="conversationHostServices?.sessionEnabled === false"
              @click="setConversationLlmEnabled(conversationHostServices?.llmEnabled === false)"
            >
              {{ conversationHostServices?.llmEnabled === false ? '已关闭 LLM 回复' : '已开启 LLM 回复' }}
            </button>
          </div>
          <div class="skill-row">
            <template v-if="conversationSkillState?.activeSkills?.length">
              <span class="service-label">当前 技能</span>
              <div class="skill-chip-list">
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
            </template>
            <span v-else class="service-warning">当前会话未激活技能</span>
            <RouterLink class="service-link" :to="{ name: 'skills' }">
              管理 技能
            </RouterLink>
          </div>
        </template>
      </div>

      <ChatMessageList
        :assistant-persona="currentConversationPersona ? { avatar: currentConversationPersona.avatar, name: currentConversationPersona.name } : null"
        :loading="chat.loading"
        :messages="chat.messages"
        @delete-message="deleteMessage"
        @retry-message="retryMessage"
        @update-message="updateMessage"
      />

      <ChatComposer
        v-model="inputText"
        :can-send="canSend"
        :pending-images="pendingImages"
        :streaming="chat.streaming"
        :upload-notices="uploadNotices"
        @file-change="handleFileChange"
        @remove-image="removeImage"
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
import { computed, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import altArrowUpBold from '@iconify-icons/solar/alt-arrow-up-bold'
import altArrowDownBold from '@iconify-icons/solar/alt-arrow-down-bold'
import type { PluginPersonaCurrentInfo } from '@garlic-claw/shared'
import ModelQuickInput from '@/components/ModelQuickInput.vue'
import { useChatView } from '@/features/chat/composables/use-chat-view'
import ChatComposer from '@/features/chat/components/ChatComposer.vue'
import ChatMessageList from '@/features/chat/components/ChatMessageList.vue'
import { loadCurrentPersona } from '@/features/personas/composables/persona-settings.data'
import { useChatStore } from '@/features/chat/store/chat'

const chat = useChatStore()
const toolbarExpanded = ref(true)
const currentConversationPersona = ref<PluginPersonaCurrentInfo | null>(null)
const currentConversationId = computed(() => chat.currentConversationId ?? null)
let currentPersonaRequestId = 0
const {
  inputText,
  pendingImages,
  selectedCapabilities,
  conversationHostServices,
  conversationSkillState,
  uploadNotices,
  canSend,
  handleModelChange,
  send,
  handleFileChange,
  removeImage,
  updateMessage,
  deleteMessage,
  retryMessage,
  setConversationLlmEnabled,
  setConversationSessionEnabled,
  removeConversationSkill,
} = useChatView(chat)

watch(
  currentConversationId,
  (conversationId) => {
    if (!conversationId) {
      currentConversationPersona.value = null
      return
    }
    const requestId = ++currentPersonaRequestId
    void readCurrentConversationPersona(conversationId, requestId)
  },
  {
    immediate: true,
  },
)

async function readCurrentConversationPersona(conversationId: string, requestId: number) {
  try {
    const persona = await loadCurrentPersona(conversationId)
    if (currentPersonaRequestId !== requestId || currentConversationId.value !== conversationId) {
      return
    }
    currentConversationPersona.value = persona
  } catch {
    if (currentPersonaRequestId !== requestId || currentConversationId.value !== conversationId) {
      return
    }
    currentConversationPersona.value = null
  }
}
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

.toolbar-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-input-wrap {
  flex: 1;
  min-width: 0;
}

.toolbar-toggle {
  flex: 0 0 auto;
  width: 32px;
  align-self: stretch;
  border: 1px solid rgba(103, 199, 207, 0.2);
  border-radius: 8px;
  background: rgba(10, 19, 24, 0.38);
  color: var(--accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition:
    opacity 0.15s ease,
    background-color 0.15s ease,
    border-color 0.15s ease,
    color 0.15s ease;
}

.toolbar-toggle:hover {
  opacity: 0.8;
}

.toolbar-toggle-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: currentColor;
}

.chat-toolbar.collapsed .toolbar-toggle {
  background: rgba(10, 19, 24, 0.62);
  border-color: rgba(103, 199, 207, 0.28);
  color: var(--accent-hover);
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

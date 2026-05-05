<template>
  <div class="chat-view">
    <template v-if="chat.currentConversationId">
      <div v-if="subagentTabs.length" class="chat-tabs">
        <ElButton class="chat-tab" :class="{ active: activeTab === 'main' }" native-type="button" @click="switchToMainConversation">对话</ElButton>
        <ElButton v-for="s in subagentTabs" :key="s.id" class="chat-tab" :class="{ active: activeTab === s.id }" native-type="button" @click="switchToSubagent(s.id)">
          {{ s.title || '子代理' }}
        </ElButton>
      </div>

      <div class="chat-stage">
        <div class="chat-toolbar">
          <div class="toolbar-header">
            <div class="toolbar-model-summary">
              <div class="toolbar-model-main">
                <span class="toolbar-model-label">当前模型</span>
                <strong class="toolbar-model-value">
                  {{ chat.selectedProvider && chat.selectedModel ? `${chat.selectedProvider}/${chat.selectedModel}` : '未在 AI 设置中配置默认模型' }}
                </strong>
                <div
                  v-if="contextUsageSummary"
                  class="toolbar-context-usage"
                >
                  <span class="toolbar-context-usage-percent">
                    {{ contextUsageSummary.percent }}%
                  </span>
                  <span class="toolbar-context-usage-tokens">
                    {{ contextUsageSummary.tokenLabel }} / {{ contextUsageSummary.contextLength }}
                  </span>
                  <span
                    class="toolbar-context-progress"
                    :title="`当前上下文占用 ${contextUsageSummary.percent}%`"
                  >
                    <span
                      class="toolbar-context-progress-fill"
                      :style="{ width: `${contextUsageSummary.percent}%` }"
                    ></span>
                  </span>
                </div>
                <div v-if="selectedCapabilities" class="toolbar-capability-row">
                  <span v-if="selectedCapabilities.reasoning" class="capability-chip">推理</span>
                  <span v-if="selectedCapabilities.toolCall" class="capability-chip">工具</span>
                  <span v-if="selectedCapabilities.input.image" class="capability-chip">支持图片</span>
                </div>
              </div>
              <RouterLink class="toolbar-settings-link" to="/ai">
                前往 AI 设置
              </RouterLink>
            </div>
          </div>
        </div>

        <section v-if="chat.todoItems.length > 0" class="chat-todo-panel">
          <div class="chat-todo-header">
            <h3>当前待办</h3>
            <span class="chat-todo-count">{{ chat.todoItems.length }}</span>
          </div>
          <div class="chat-todo-list">
            <div
              v-for="(item, index) in chat.todoItems"
              :key="`${index}-${item.content}`"
              class="chat-todo-item"
              :class="[`status-${item.status}`, `priority-${item.priority}`]"
            >
              <span class="chat-todo-state">{{ readTodoStatusLabel(item.status) }}</span>
              <span class="chat-todo-content">{{ item.content }}</span>
              <span class="chat-todo-priority">{{ readTodoPriorityLabel(item.priority) }}</span>
            </div>
          </div>
        </section>

        <ChatRuntimePermissionPanel
          :requests="pendingRuntimePermissions"
          @reply="replyRuntimePermission"
        />

        <ChatMessageList
          :assistant-persona="currentConversationPersona ? { avatar: currentConversationPersona.avatar, name: currentConversationPersona.name } : null"
          :context-window-preview="contextWindowPreview"
          :loading="chat.loading"
          :messages="displayedMessages"
          @delete-message="deleteMessage"
          @retry-message="retryMessage"
          @update-message="updateMessage"
        />


        <ChatComposer
          v-model="inputText"
          :can-send="canSend"
          :can-stop="chat.canStopStreaming"
          :command-suggestions="commandSuggestions"
          :pending-images="pendingImages"
          :queued-send-count="queuedSendCount"
          :queued-send-preview-entries="queuedSendPreviewEntries"
          :streaming="chat.streaming"
          :upload-notices="uploadNotices"
          @apply-command-suggestion="applyCommandSuggestion"
          @file-change="handleFileChange"
          @pop-queued-send="popQueuedSendTailToInput"
          @remove-image="removeImage"
          @send="send"
          @stop="chat.stopStreaming()"
        />
      </div>
    </template>

    <div v-else class="no-conversation">
      <p>⬅ 选择一个对话或创建新对话</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElButton } from 'element-plus'
import ChatComposer from '@/modules/chat/components/ChatComposer.vue'
import ChatMessageList from '@/modules/chat/components/ChatMessageList.vue'
import ChatRuntimePermissionPanel from '@/modules/chat/components/ChatRuntimePermissionPanel.vue'
import { useChatView } from '@/modules/chat/composables/use-chat-view'
import { useChatStore } from '@/modules/chat/store/chat'
import { loadCurrentPersona } from '@/modules/personas/composables/persona-settings.data'
import { isValidConversationRouteId } from '@/shared/utils/uuid'
import type { PluginPersonaCurrentInfo } from '@garlic-claw/shared'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

const chat = useChatStore()
const activeTab = ref('main')
const subagentTabs = ref<Array<{ id: string; title: string }>>([])
const workspaceConversationId = ref<string | null>(null)
const currentConversationPersona = ref<PluginPersonaCurrentInfo | null>(null)
const currentConversationId = computed(() => chat.currentConversationId ?? null)
const SUBAGENT_TAB_POLL_INTERVAL_MS = 2000

let subagentTabPollTimer: ReturnType<typeof setInterval> | null = null
let subagentTabRequestId = 0

onMounted(() => {
  subagentTabPollTimer = setInterval(() => {
    const conversationId = workspaceConversationId.value
    if (!conversationId) {
      return
    }
    void refreshSubagentTabs(conversationId)
  }, SUBAGENT_TAB_POLL_INTERVAL_MS)
})

onBeforeUnmount(() => {
  if (!subagentTabPollTimer) {
    return
  }
  clearInterval(subagentTabPollTimer)
  subagentTabPollTimer = null
})

watch(currentConversationId, async (id) => {
  if (!id) {
    activeTab.value = 'main'
    workspaceConversationId.value = null
    subagentTabs.value = []
    return
  }
  if (id === workspaceConversationId.value) {
    activeTab.value = 'main'
    return
  }
  if (subagentTabs.value.some((tab) => tab.id === id)) {
    activeTab.value = id
    return
  }
  activeTab.value = 'main'
  workspaceConversationId.value = id
  subagentTabs.value = []
  await refreshSubagentTabs(id)
}, {
  immediate: true,
})

function switchToMainConversation() {
  const conversationId = workspaceConversationId.value
  activeTab.value = 'main'
  if (!conversationId) {
    return
  }
  void chat.selectConversation(conversationId)
}

function switchToSubagent(conversationId: string) {
  activeTab.value = conversationId
  void chat.selectConversation(conversationId)
}

async function refreshSubagentTabs(conversationId: string) {
  const requestId = ++subagentTabRequestId
  try {
    const token = localStorage.getItem('accessToken')
    const resp = await fetch(`/api/chat/conversations/${conversationId}/subagents`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!resp.ok || workspaceConversationId.value !== conversationId || requestId !== subagentTabRequestId) {
      return
    }
    const nextTabs = await resp.json()
    if (workspaceConversationId.value !== conversationId || requestId !== subagentTabRequestId) {
      return
    }
    subagentTabs.value = nextTabs
  } catch {
    if (workspaceConversationId.value === conversationId && requestId === subagentTabRequestId) {
      subagentTabs.value = []
    }
  }
}

let currentPersonaRequestId = 0
const {
  inputText,
  pendingImages,
  commandSuggestions,
  displayedMessages,
  contextWindowPreview,
  pendingRuntimePermissions,
  queuedSendCount,
  queuedSendPreviewEntries,
  selectedCapabilities,
  uploadNotices,
  canSend,
  send,
  handleFileChange,
  removeImage,
  updateMessage,
  deleteMessage,
  retryMessage,
  replyRuntimePermission,
  popQueuedSendTailToInput,
  applyCommandSuggestion,
} = useChatView(chat)

const subagentTabRefreshSignature = computed(() =>
  displayedMessages.value
    .map((message) => `${message.id}:${message.status}:${message.toolCalls?.length ?? 0}:${message.toolResults?.length ?? 0}`)
    .join('|'),
)

watch(subagentTabRefreshSignature, () => {
  const conversationId = workspaceConversationId.value
  if (!conversationId || activeTab.value !== 'main') {
    return
  }
  void refreshSubagentTabs(conversationId)
})

const contextUsageSummary = computed(() => {
  const preview = contextWindowPreview.value
  if (!preview || preview.contextLength <= 0) {
    return null
  }
  const percent = Math.min(
    100,
    Math.max(0, Math.round((preview.estimatedTokens / preview.contextLength) * 100)),
  )
  return {
    contextLength: preview.contextLength,
    estimatedTokens: preview.estimatedTokens,
    percent,
    tokenLabel: `${preview.source === 'estimated' ? '*' : ''}${preview.estimatedTokens}`,
  }
})

watch(
  currentConversationId,
  (conversationId) => {
    if (!conversationId || !isValidConversationRouteId(conversationId)) {
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

function readTodoStatusLabel(status: "pending" | "in_progress" | "completed" | "cancelled") {
  switch (status) {
    case "in_progress":
      return "进行中"
    case "completed":
      return "已完成"
    case "cancelled":
      return "已取消"
    default:
      return "待处理"
  }
}

function readTodoPriorityLabel(priority: "high" | "medium" | "low") {
  switch (priority) {
    case "high":
      return "高"
    case "low":
      return "低"
    default:
      return "中"
  }
}
</script>

<style scoped>
.chat-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0;
}

.chat-stage {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 16px 16px;
}

.chat-tabs {
  display: flex;
  gap: 0;
  overflow-x: auto;
  flex-shrink: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-bottom: none;
  background: var(--surface-panel-soft-strong);
}

.chat-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0 12px;
  border: none;
  border-right: 1px solid var(--border);
  border-radius: 0;
  background: var(--surface-subtle);
  box-shadow: none;
  color: var(--text-muted);
  font-size: 12px;
  white-space: nowrap;
  font-family: inherit;
  transition: background-color .12s ease, color .12s ease;
}

.chat-tab:last-child {
  border-right: none;
}

.chat-tab:hover {
  background: var(--surface-panel-hover-soft);
  color: var(--text);
}

.chat-tab.active {
  background: var(--surface-panel-strong);
  color: var(--text);
  box-shadow: inset 0 2px 0 0 var(--accent);
}

.chat-toolbar {
  padding: 12px 16px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--header-gradient);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  flex-shrink: 0;
}

.toolbar-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-model-summary {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.toolbar-model-main {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.toolbar-model-label {
  font-size: 12px;
  color: var(--text-muted);
  flex: 0 0 auto;
}

.toolbar-model-value {
  display: inline-flex;
  min-width: 0;
  font-size: 14px;
  color: var(--text);
  word-break: break-all;
  flex: 0 1 auto;
}

.toolbar-context-usage {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(10, 19, 24, 0.42);
  border: 1px solid rgba(103, 199, 207, 0.18);
}

.toolbar-context-usage-percent {
  font-size: 12px;
  font-weight: 700;
  color: #e7fbff;
}

.toolbar-context-usage-tokens {
  font-size: 12px;
  color: var(--text-muted);
}

.toolbar-context-progress {
  position: relative;
  width: 92px;
  height: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.toolbar-context-progress-fill {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #63d2c6 0%, #7cd5ff 54%, #ffd38a 100%);
  box-shadow: 0 0 16px rgba(124, 213, 255, 0.25);
}

.toolbar-settings-link {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  border: 1px solid rgba(103, 199, 207, 0.24);
  border-radius: 10px;
  background: rgba(10, 19, 24, 0.38);
  color: var(--accent);
  text-decoration: none;
  font-size: 13px;
}

.toolbar-settings-link:hover {
  opacity: 0.85;
}

.toolbar-capability-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.capability-chip {
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--surface-success-soft);
  color: var(--success);
  font-size: 12px;
  font-weight: 500;
}

.chat-todo-panel {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-panel-muted-strong);
  padding: 14px 16px;
  display: grid;
  gap: 10px;
  flex-shrink: 0;
  max-height: 200px;
  overflow-y: auto;
}

.chat-todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.chat-todo-header h3 {
  margin: 0;
  font-size: 14px;
}

.chat-todo-count {
  min-width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-info-soft);
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
}

.chat-todo-list {
  display: grid;
  gap: 8px;
}

.chat-todo-item {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: var(--surface-subtle);
}

.chat-todo-item.status-completed,
.chat-todo-item.status-cancelled {
  opacity: 0.7;
}

.chat-todo-state {
  font-size: 12px;
  color: var(--text-muted);
}

.chat-todo-content {
  min-width: 0;
}

.chat-todo-priority {
  font-size: 12px;
  font-weight: 700;
}

.chat-todo-item.priority-high .chat-todo-priority {
  color: var(--danger);
}

.chat-todo-item.priority-medium .chat-todo-priority {
  color: var(--accent);
}

.chat-todo-item.priority-low .chat-todo-priority {
  color: var(--success);
}

.chat-stage > :deep(.messages) { flex: 1; min-height: 0; overflow-y: auto; }

.no-conversation {
  display: grid;
  place-items: center;
  height: 100%;
  color: var(--text-muted);
}
</style>

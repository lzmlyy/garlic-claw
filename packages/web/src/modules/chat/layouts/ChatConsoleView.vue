<template>
  <div class="chat-console-view">
    <aside class="chat-rail">
      <header class="rail-header">
        <div class="brand-block">
          <h1>聊天工作台</h1>
        </div>
        <ElButton class="new-chat-button" native-type="button" @click="newChat">
          新对话
        </ElButton>
      </header>

      <div class="conversation-list">
        <ElButton
          v-for="conversation in visibleConversations"
          :key="conversation.id"
          class="conversation-item"
          native-type="button"
          :data-id="conversation.id"
          :class="{ active: conversation.id === chat.currentConversationId }"
          @click="chat.selectConversation(conversation.id)"
        >
          <span class="conversation-title">{{ conversation.title }}</span>
          <span
            class="conversation-delete"
            role="button"
            tabindex="-1"
            @click.stop="chat.deleteConversation(conversation.id)"
          >
            ×
          </span>
        </ElButton>
      </div>

      <footer class="rail-footer" />
    </aside>

    <main class="chat-content">
      <ChatView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ElButton } from 'element-plus'
import { useChatStore } from '@/modules/chat/store/chat'
import ChatView from '@/modules/chat/views/ChatView.vue'
import { computed, onMounted } from 'vue'

const chat = useChatStore()
const visibleConversations = computed(() =>
  chat.conversations.filter((conversation) => !(conversation as { parentId?: string }).parentId),
)

onMounted(() => {
  void initializeConversationRail()
})

async function initializeConversationRail() {
  await chat.loadConversations()
  if (chat.currentConversationId) {
    return
  }
  const firstConversation = visibleConversations.value[0]
  if (!firstConversation) {
    return
  }
  await chat.selectConversation(firstConversation.id)
}

async function newChat() {
  const conversation = await chat.createConversation()
  await chat.selectConversation(conversation.id)
}
</script>

<style scoped>
.chat-console-view {
  display: flex;
  min-height: 100%;
  height: 100%;
}

.chat-rail {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--gc-border);
  background: var(--gc-surface-elevated);
  backdrop-filter: blur(var(--gc-blur));
  -webkit-backdrop-filter: blur(var(--gc-blur));
}

.rail-header {
  padding: 1.1rem;
  display: grid;
  gap: 1rem;
  border-bottom: 1px solid var(--gc-border);
}

.brand-block {
  display: grid;
  gap: 0.35rem;
}

.brand-block h1 {
  margin: 0;
  font-size: 1.3rem;
}

.new-chat-button {
  width: 100%;
}

.conversation-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem 0.75rem 0;
  display: grid;
  gap: 0.45rem;
  align-content: start;
}

.conversation-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: var(--radius-sm);
  background: var(--surface-subtle);
  box-shadow: none;
  color: var(--text);
  padding: 0.7rem 0.85rem;
}

.conversation-item.active {
  border-color: var(--gc-glass-border);
  background: var(--gc-interactive-active-bg);
}

.conversation-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.conversation-delete {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.5rem;
  min-height: 1.5rem;
  color: var(--text-muted);
  line-height: 1;
  font-size: 1.05rem;
}

.rail-footer {
  min-height: 16px;
}

.chat-content {
  flex: 1;
  min-width: 0;
  min-height: 100%;
  background: var(--gc-surface-elevated);
  backdrop-filter: blur(var(--gc-blur));
  -webkit-backdrop-filter: blur(var(--gc-blur));
  border-left: 1px solid var(--gc-border);
  overflow: visible;
}

@media (max-width: 900px) {
  .chat-console-view {
    flex-direction: column;
  }

  .chat-rail {
    width: 100%;
    min-width: 0;
    max-height: 42vh;
  }

  .chat-content {
    min-height: 0;
  }
}
</style>

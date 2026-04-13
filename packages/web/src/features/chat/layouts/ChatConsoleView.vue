<template>
  <div class="chat-console-view">
    <aside class="chat-rail">
      <header class="rail-header">
        <div class="brand-block">
          <span class="brand-kicker">Chat Workbench</span>
          <h1>Garlic Claw</h1>
        </div>
        <button type="button" class="new-chat-button" @click="newChat">
          新对话
        </button>
      </header>

      <div class="conversation-list">
        <button
          v-for="conversation in chat.conversations"
          :key="conversation.id"
          type="button"
          class="conversation-item"
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
        </button>
      </div>

      <footer class="rail-footer" />
    </aside>

    <main class="chat-content">
      <ChatView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import ChatView from '@/features/chat/views/ChatView.vue'
import { useChatStore } from '@/features/chat/store/chat'

const chat = useChatStore()

onMounted(() => {
  void chat.loadConversations()
})

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
  border-right: 1px solid var(--border);
  background:
    linear-gradient(180deg, rgba(9, 15, 24, 0.98), rgba(9, 15, 24, 0.9)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent);
  backdrop-filter: blur(var(--glass-blur));
}

.rail-header {
  padding: 1.1rem;
  display: grid;
  gap: 1rem;
  border-bottom: 1px solid var(--border);
}

.brand-block {
  display: grid;
  gap: 0.35rem;
}

.brand-kicker {
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
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
  padding: 0.75rem;
  display: grid;
  gap: 0.45rem;
}

.conversation-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.6rem;
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.02);
  color: var(--text);
  padding: 0.7rem 0.85rem;
}

.conversation-item.active {
  border-color: rgba(103, 199, 207, 0.36);
  background: rgba(103, 199, 207, 0.16);
}

.conversation-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.conversation-delete {
  color: var(--text-muted);
  line-height: 1;
}

.rail-footer {
  min-height: 16px;
  border-top: 1px solid var(--border);
}

.chat-content {
  flex: 1;
  min-width: 0;
  min-height: 100%;
  overflow: hidden;
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

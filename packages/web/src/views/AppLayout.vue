<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>🦞 Garlic Claw</h2>
        <div class="sidebar-nav">
          <router-link to="/" class="nav-link" :class="{ active: $route.name === 'chat' }">💬 对话</router-link>
          <router-link to="/devices" class="nav-link" :class="{ active: $route.name === 'devices' }">📡 设备</router-link>
          <router-link to="/automations" class="nav-link" :class="{ active: $route.name === 'automations' }">⚡ 自动化</router-link>
          <router-link to="/ai" class="nav-link" :class="{ active: $route.name === 'ai-settings' }">🧠 AI 设置</router-link>
        </div>
        <button class="btn-new" @click="newChat">+ 新对话</button>
      </div>
      <div class="conversation-list">
        <div
          v-for="conv in chat.conversations"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: conv.id === chat.currentConversationId }"
          @click="chat.selectConversation(conv.id)"
        >
          <span class="conv-title">{{ conv.title }}</span>
          <button class="btn-delete" @click.stop="chat.deleteConversation(conv.id)" title="删除">×</button>
        </div>
      </div>
      <div class="sidebar-footer">
        <span class="username">{{ auth.user?.username }}</span>
        <button class="btn-logout" @click="handleLogout">退出</button>
      </div>
    </aside>
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useChatStore } from '../stores/chat'

const router = useRouter()
const auth = useAuthStore()
const chat = useChatStore()

onMounted(() => {
  chat.loadConversations()
})

async function newChat() {
  const conv = await chat.createConversation()
  chat.selectConversation(conv.id)
}

function handleLogout() {
  auth.logout()
  router.push('/login')
}
</script>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  min-width: 0;
}

.sidebar {
  width: 260px;
  min-width: 260px;
  background: var(--bg-sidebar);
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
}

.sidebar-header {
  padding: 1rem;
  border-bottom: 1px solid var(--border);
}

.sidebar-header h2 {
  font-size: 1.1rem;
  margin-bottom: 0.6rem;
}

.sidebar-nav {
  display: flex;
  gap: 0.4rem;
  margin-bottom: 0.6rem;
  flex-wrap: wrap;
}

.nav-link {
  flex: 1 1 100px;
  text-align: center;
  padding: 0.4em;
  border-radius: var(--radius);
  font-size: 0.85rem;
  color: var(--text-muted);
  transition: background 0.15s, color 0.15s;
  text-decoration: none;
}

.nav-link:hover {
  background: var(--bg-card);
  color: var(--text);
}

.nav-link.active {
  background: var(--accent);
  color: #fff;
}

.btn-new {
  width: 100%;
  font-size: 0.85rem;
  padding: 0.5em;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.4rem;
}

.conversation-item {
  display: flex;
  align-items: center;
  padding: 0.6em 0.8em;
  border-radius: var(--radius);
  cursor: pointer;
  margin-bottom: 2px;
  transition: background 0.15s;
}

.conversation-item:hover {
  background: var(--bg-card);
}

.conversation-item.active {
  background: var(--accent);
  color: #fff;
}

.conv-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
}

.btn-delete {
  background: transparent;
  color: var(--text-muted);
  font-size: 1.1rem;
  padding: 0 0.3em;
  opacity: 0;
  transition: opacity 0.15s;
}

.conversation-item:hover .btn-delete {
  opacity: 1;
}

.btn-delete:hover {
  color: var(--danger) !important;
  background: transparent !important;
}

.sidebar-footer {
  padding: 0.8rem 1rem;
  border-top: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.85rem;
}

.username {
  color: var(--text-muted);
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.btn-logout {
  background: transparent;
  color: var(--danger);
  font-size: 0.8rem;
  padding: 0.3em 0.6em;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

@media (max-width: 768px) {
  .sidebar {
    width: 200px;
    min-width: 200px;
  }

  .sidebar-footer {
    flex-wrap: wrap;
  }
}
</style>

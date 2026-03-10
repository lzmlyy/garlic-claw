<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <h2>🦞 Garlic Claw</h2>
        <div class="sidebar-nav">
          <router-link to="/" class="nav-link" :class="{ active: $route.name === 'chat' }">💬 对话</router-link>
          <router-link to="/devices" class="nav-link" :class="{ active: $route.name === 'devices' }">📡 设备</router-link>
          <router-link to="/automations" class="nav-link" :class="{ active: $route.name === 'automations' }">⚡ 自动化</router-link>
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

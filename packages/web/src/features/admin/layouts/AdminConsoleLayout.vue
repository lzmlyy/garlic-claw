<template>
  <div class="admin-shell">
    <aside class="admin-nav">
      <header class="nav-header">
        <div>
          <span class="nav-kicker">Admin Console</span>
          <h1>管理后台</h1>
          <RouterLink class="chat-entry" :to="{ name: 'chat' }">
            返回对话
          </RouterLink>
        </div>
      </header>

      <nav class="nav-links">
        <RouterLink
          v-for="item in navItems"
          :key="item.name"
          class="nav-link"
          :class="{ active: route.name === item.name }"
          :to="{ name: item.name }"
        >
          <span class="nav-icon">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </RouterLink>
      </nav>

      <footer class="nav-footer">
        <div class="user-meta">
          <span class="user-label">当前用户</span>
          <strong>{{ auth.user?.username ?? 'unknown' }}</strong>
          <small class="user-role">{{ roleLabel }}</small>
        </div>
        <button type="button" class="logout-button" @click="handleLogout">
          退出
        </button>
      </footer>
    </aside>

    <main class="admin-content">
      <RouterView />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const navItems: Array<{
  name:
    | 'plugins'
    | 'persona-settings'
    | 'tools'
    | 'skills'
    | 'commands'
    | 'subagent-tasks'
    | 'api-keys'
    | 'automations'
    | 'ai-settings'
  label: string
  icon: string
}> = [
  { name: 'plugins', label: '插件', icon: '🧩' },
  { name: 'persona-settings', label: 'Persona', icon: '🎭' },
  { name: 'tools', label: '工具', icon: '🛠️' },
  { name: 'skills', label: 'Skills', icon: '✨' },
  { name: 'commands', label: '命令', icon: '⌨️' },
  { name: 'subagent-tasks', label: '后台代理', icon: '🤖' },
  { name: 'api-keys', label: 'API Keys', icon: '🔑' },
  { name: 'automations', label: '自动化', icon: '⚡' },
  { name: 'ai-settings', label: 'AI 设置', icon: '🧠' },
]

const roleLabel = computed(() => {
  if (auth.user?.role === 'super_admin') {
    return '超级管理员'
  }
  if (auth.user?.role === 'admin') {
    return '管理员'
  }

  return '普通用户'
})

function handleLogout() {
  auth.logout()
  void router.push({ name: 'login' })
}
</script>

<style scoped>
.admin-shell {
  display: flex;
  min-height: 100vh;
}

.admin-nav {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border);
  background:
    linear-gradient(180deg, rgba(12, 21, 33, 0.98), rgba(8, 14, 24, 0.95)),
    linear-gradient(180deg, rgba(255, 255, 255, 0.02), transparent);
  backdrop-filter: blur(var(--glass-blur));
}

.nav-header,
.nav-footer {
  padding: 1.1rem;
  border-bottom: 1px solid var(--border);
}

.nav-footer {
  margin-top: auto;
  border-top: 1px solid var(--border);
  border-bottom: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.nav-kicker {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.nav-header h1 {
  margin: 0;
  font-size: 1.25rem;
}

.chat-entry {
  display: inline-flex;
  margin-top: 0.45rem;
  color: var(--accent);
}

.nav-links {
  display: grid;
  gap: 0.55rem;
  padding: 0.85rem;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.75rem 0.9rem;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    border-color var(--transition-fast);
  border: 1px solid transparent;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text);
}

.nav-link.active {
  border-color: rgba(103, 199, 207, 0.32);
  background: rgba(103, 199, 207, 0.14);
  color: var(--text);
}

.nav-icon {
  width: 1.4rem;
  text-align: center;
}

.user-meta {
  display: grid;
  gap: 0.15rem;
}

.user-label {
  font-size: 0.72rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.user-role {
  color: var(--text-muted);
}

.logout-button {
  background: transparent;
  color: var(--danger);
}

.admin-content {
  flex: 1;
  min-width: 0;
  min-height: 100vh;
  overflow: auto;
}

@media (max-width: 960px) {
  .admin-shell {
    flex-direction: column;
  }

  .admin-nav {
    width: 100%;
    min-width: 0;
  }

  .nav-links {
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  }

  .admin-content {
    min-height: 0;
  }
}
</style>

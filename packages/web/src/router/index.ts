import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { guest: true },
    },
    {
      path: '/',
      name: 'admin-shell',
      component: () => import('@/features/admin/layouts/AdminConsoleLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'chat',
          component: () => import('@/features/chat/layouts/ChatConsoleView.vue'),
        },
        {
          path: 'devices',
          redirect: { name: 'plugins' },
        },
        {
          path: 'plugins',
          name: 'plugins',
          component: () => import('@/features/plugins/views/PluginsView.vue'),
        },
        {
          path: 'personas',
          name: 'persona-settings',
          component: () => import('@/features/personas/views/PersonaSettingsView.vue'),
        },
        {
          path: 'tools',
          name: 'tools',
          component: () => import('@/features/tools/views/ToolsView.vue'),
        },
        {
          path: 'skills',
          name: 'skills',
          component: () => import('@/features/skills/views/SkillsView.vue'),
        },
        {
          path: 'commands',
          name: 'commands',
          component: () => import('@/features/commands/views/CommandsView.vue'),
        },
        {
          path: 'subagents',
          name: 'subagent-tasks',
          component: () => import('@/features/subagents/views/SubagentTasksView.vue'),
        },
        {
          path: 'automations',
          name: 'automations',
          component: () => import('@/features/automations/views/AutomationsView.vue'),
        },
        {
          path: 'ai',
          name: 'ai-settings',
          component: () => import('@/features/ai-settings/views/ProviderSettings.vue'),
        },
      ],
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.ensureInitialized()

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login' }
  }
  if (to.meta.guest && auth.isLoggedIn) {
    return { name: 'chat' }
  }
})

export default router

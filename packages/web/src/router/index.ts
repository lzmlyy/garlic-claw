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
      path: '/register',
      name: 'register',
      component: () => import('../views/RegisterView.vue'),
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
          meta: { requiresAdmin: true },
          redirect: { name: 'plugins' },
        },
        {
          path: 'plugins',
          name: 'plugins',
          meta: { requiresAdmin: true },
          component: () => import('@/features/plugins/views/PluginsView.vue'),
        },
        {
          path: 'personas',
          name: 'persona-settings',
          meta: { requiresAdmin: true },
          component: () => import('@/features/personas/views/PersonaSettingsView.vue'),
        },
        {
          path: 'tools',
          name: 'tools',
          meta: { requiresAdmin: true },
          component: () => import('@/features/tools/views/ToolsView.vue'),
        },
        {
          path: 'skills',
          name: 'skills',
          meta: { requiresAdmin: true },
          component: () => import('@/features/skills/views/SkillsView.vue'),
        },
        {
          path: 'commands',
          name: 'commands',
          meta: { requiresAdmin: true },
          component: () => import('@/features/commands/views/CommandsView.vue'),
        },
        {
          path: 'subagents',
          name: 'subagent-tasks',
          meta: { requiresAdmin: true },
          component: () => import('@/features/subagents/views/SubagentTasksView.vue'),
        },
        {
          path: 'api-keys',
          name: 'api-keys',
          meta: { requiresAdmin: true },
          component: () => import('@/features/api-keys/views/ApiKeysView.vue'),
        },
        {
          path: 'automations',
          name: 'automations',
          meta: { requiresAdmin: true },
          component: () => import('@/features/automations/views/AutomationsView.vue'),
        },
        {
          path: 'ai',
          name: 'ai-settings',
          meta: { requiresAdmin: true },
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
  if (to.meta.requiresAdmin && !auth.isAdmin) {
    return { name: 'chat' }
  }
})

export default router

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'

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
      component: () => import('../views/AppLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          name: 'chat',
          component: () => import('../views/ChatView.vue'),
        },
        {
          path: 'devices',
          redirect: { name: 'plugins' },
        },
        {
          path: 'plugins',
          name: 'plugins',
          component: () => import('../views/PluginsView.vue'),
        },
        {
          path: 'personas',
          name: 'persona-settings',
          component: () => import('../views/PersonaSettingsView.vue'),
        },
        {
          path: 'tools',
          name: 'tools',
          component: () => import('../views/ToolsView.vue'),
        },
        {
          path: 'skills',
          name: 'skills',
          component: () => import('../views/SkillsView.vue'),
        },
        {
          path: 'commands',
          name: 'commands',
          component: () => import('../views/CommandsView.vue'),
        },
        {
          path: 'subagents',
          name: 'subagent-tasks',
          component: () => import('../views/SubagentTasksView.vue'),
        },
        {
          path: 'api-keys',
          name: 'api-keys',
          component: () => import('../views/ApiKeysView.vue'),
        },
        {
          path: 'automations',
          name: 'automations',
          component: () => import('../views/AutomationsView.vue'),
        },
        {
          path: 'ai',
          name: 'ai-settings',
          component: () => import('../views/ProviderSettings.vue'),
        },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()
  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    return { name: 'login' }
  }
  if (to.meta.guest && auth.isLoggedIn) {
    return { name: 'chat' }
  }
})

export default router

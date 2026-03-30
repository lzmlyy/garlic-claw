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
          path: 'tools',
          name: 'tools',
          component: () => import('../views/ToolsView.vue'),
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

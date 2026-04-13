import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  devLogin as devLoginRequest,
  getMe,
  login as loginRequest,
  register as registerRequest,
} from '@/features/auth/api/auth'

type AuthRole = 'super_admin' | 'admin' | 'user' | 'ai' | 'device' | string
type AuthUser = { id: string; username: string; email: string; role: AuthRole }

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(localStorage.getItem('accessToken') || '')
  const user = ref<AuthUser | null>(null)
  const initialized = ref(false)
  let initializationPromise: Promise<void> | null = null

  const isLoggedIn = computed(() => !!accessToken.value)
  const isAdmin = computed(
    () => user.value?.role === 'admin' || user.value?.role === 'super_admin',
  )
  const isSuperAdmin = computed(() => user.value?.role === 'super_admin')

  async function login(username: string, password: string) {
    const data = await loginRequest(username, password)
    setTokens(data.accessToken, data.refreshToken)
    await fetchUser()
  }

  async function register(username: string, email: string, password: string) {
    const data = await registerRequest(username, email, password)
    setTokens(data.accessToken, data.refreshToken)
    await fetchUser()
  }

  async function devLogin(username: string, role: 'super_admin' | 'admin' | 'user') {
    const data = await devLoginRequest(username, role)
    setTokens(data.accessToken, data.refreshToken)
    await fetchUser()
  }

  async function fetchUser() {
    try {
      user.value = await getMe()
      initialized.value = true
    } catch {
      logout()
    }
  }

  async function ensureInitialized() {
    if (initialized.value) {
      return
    }

    if (initializationPromise) {
      return initializationPromise
    }

    initializationPromise = (async () => {
      try {
        if (accessToken.value) {
          await fetchUser()
        } else {
          initialized.value = true
        }
      } finally {
        initializationPromise = null
      }
    })()

    return initializationPromise
  }

  function logout() {
    accessToken.value = ''
    user.value = null
    initialized.value = true
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
  }

  function setTokens(nextAccessToken: string, nextRefreshToken: string) {
    accessToken.value = nextAccessToken
    localStorage.setItem('accessToken', nextAccessToken)
    localStorage.setItem('refreshToken', nextRefreshToken)
  }

  return {
    accessToken,
    user,
    initialized,
    isLoggedIn,
    isAdmin,
    isSuperAdmin,
    login,
    register,
    devLogin,
    fetchUser,
    ensureInitialized,
    logout,
  }
})

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { login as loginRequest } from '@/features/auth/api/auth'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(localStorage.getItem('accessToken') || '')
  const initialized = ref(false)

  const isLoggedIn = computed(() => !!accessToken.value)

  async function login(secret: string) {
    const data = await loginRequest(secret)
    setAccessToken(data.accessToken)
    initialized.value = true
  }

  async function ensureInitialized() {
    initialized.value = true
  }

  function logout() {
    accessToken.value = ''
    initialized.value = true
    localStorage.removeItem('accessToken')
  }

  function setAccessToken(nextAccessToken: string) {
    accessToken.value = nextAccessToken
    localStorage.setItem('accessToken', nextAccessToken)
  }

  return {
    accessToken,
    initialized,
    isLoggedIn,
    login,
    ensureInitialized,
    logout,
  }
})

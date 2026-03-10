import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import * as api from '../api'

export const useAuthStore = defineStore('auth', () => {
  const accessToken = ref(localStorage.getItem('accessToken') || '')
  const user = ref<{ id: string; username: string; email: string; role: string } | null>(null)

  const isLoggedIn = computed(() => !!accessToken.value)

  async function login(username: string, password: string) {
    const data = await api.login(username, password)
    accessToken.value = data.accessToken
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    await fetchUser()
  }

  async function register(username: string, email: string, password: string) {
    const data = await api.register(username, email, password)
    accessToken.value = data.accessToken
    localStorage.setItem('accessToken', data.accessToken)
    localStorage.setItem('refreshToken', data.refreshToken)
    await fetchUser()
  }

  async function fetchUser() {
    try {
      user.value = await api.getMe()
    } catch {
      logout()
    }
  }

  function logout() {
    accessToken.value = ''
    user.value = null
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
  }

  // 如果令牌存在，自动获取用户信息
  if (accessToken.value) {
    fetchUser()
  }

  return { accessToken, user, isLoggedIn, login, register, fetchUser, logout }
})

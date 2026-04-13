<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>🦞🧄 Garlic Claw</h1>
      <h2>登录</h2>
      <form @submit.prevent="handleLogin">
        <div class="field">
          <label>用户名</label>
          <input v-model="username" type="text" required autocomplete="username" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="password" type="password" required autocomplete="current-password" />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="submitting">
          {{ submitting ? '登录中...' : '登录' }}
        </button>
      </form>
      <div v-if="isDev" class="dev-login-panel">
        <p class="dev-login-title">开发模式一键登录</p>
        <div class="dev-login-actions">
          <button
            type="button"
            class="secondary-button"
            :disabled="submitting"
            @click="handleDevLogin('super_admin')"
          >
            超级管理员
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="submitting"
            @click="handleDevLogin('admin')"
          >
            管理员
          </button>
          <button
            type="button"
            class="secondary-button"
            :disabled="submitting"
            @click="handleDevLogin('user')"
          >
            普通用户
          </button>
        </div>
      </div>
      <p class="link">
        没有账号？<router-link to="/register">注册</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)
const isDev = import.meta.env.DEV

async function handleLogin() {
  error.value = ''
  submitting.value = true
  try {
    await auth.login(username.value, password.value)
    router.push('/')
  } catch (e) {
    error.value = (e as Error).message || '登录失败'
  } finally {
    submitting.value = false
  }
}

async function handleDevLogin(role: 'super_admin' | 'admin' | 'user') {
  error.value = ''
  submitting.value = true

  try {
    const username = role === 'super_admin'
      ? 'dev-super-admin'
      : role === 'admin'
        ? 'dev-admin'
        : 'dev-user'
    await auth.devLogin(username, role)
    router.push('/')
  } catch (e) {
    error.value = (e as Error).message || '一键登录失败'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.dev-login-panel {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.dev-login-title {
  margin: 0 0 0.75rem;
  font-size: 0.9rem;
  color: var(--text-muted);
}

.dev-login-actions {
  display: grid;
  gap: 0.6rem;
}

.secondary-button {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text);
}
</style>

<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>🦞🧄 Garlic Claw</h1>
      <h2>注册</h2>
      <form @submit.prevent="handleRegister">
        <div class="field">
          <label>用户名</label>
          <input v-model="username" type="text" required autocomplete="username" />
        </div>
        <div class="field">
          <label>邮箱</label>
          <input v-model="email" type="email" required autocomplete="email" />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="password" type="password" required minlength="8" autocomplete="new-password" />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" :disabled="submitting">
          {{ submitting ? '注册中...' : '注册' }}
        </button>
      </form>
      <p class="link">
        已有账号？<router-link to="/login">登录</router-link>
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
const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

async function handleRegister() {
  error.value = ''
  submitting.value = true
  try {
    const cleanUsername = username.value.trim()
    const cleanEmail = email.value.trim()
    await auth.register(cleanUsername, cleanEmail, password.value)
    router.push('/')
  } catch (e) {
    error.value = (e as Error).message || '注册失败'
  } finally {
    submitting.value = false
  }
}
</script>

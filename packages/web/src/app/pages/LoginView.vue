<template>
  <div class="auth-page">
    <div class="auth-card">
      <h1>🦞🧄 Garlic Claw</h1>
      <h2>登录</h2>
      <form @submit.prevent="handleLogin">
        <div class="field">
          <label>访问密钥</label>
          <ElInput
            v-model="secret"
            type="password"
            show-password
            autocomplete="current-password"
            required
          />
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <ElButton native-type="submit" type="primary" :loading="submitting">
          {{ submitting ? '登录中...' : '登录' }}
        </ElButton>
        <ElButton
          v-if="isDev"
          class="dev-login"
          native-type="button"
          :disabled="submitting"
          @click="handleDevLogin"
        >
          {{ submitting ? '登录中...' : '开发者一键登录' }}
        </ElButton>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/shared/stores/auth'
import { ElButton, ElInput } from 'element-plus'
import { ref } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const auth = useAuthStore()

const secret = ref('')
const error = ref('')
const submitting = ref(false)

const isDev = import.meta.env.DEV && !!import.meta.env.VITE_DEV_LOGIN_SECRET

const devSecret = import.meta.env.VITE_DEV_LOGIN_SECRET as string | undefined

async function doLogin(input: string) {
  error.value = ''
  submitting.value = true
  try {
    await auth.login(input)
    router.push('/')
  } catch (e) {
    error.value = (e as Error).message || '登录失败'
  } finally {
    submitting.value = false
  }
}

async function handleLogin() {
  await doLogin(secret.value)
}

async function handleDevLogin() {
  if (devSecret) {
    await doLogin(devSecret)
  }
}
</script>

<style scoped>
/* 将仅授权演示保留在本地，这样它就不会泄漏到控制台视图中。 */
.auth-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 1.5rem;
  background: var(--gc-surface-base);
}

.auth-card {
  width: min(380px, 100%);
  padding: 2.5rem;
  border: 1px solid var(--gc-border);
  border-radius: var(--gc-radius);
  background: var(--gc-surface-elevated);
  backdrop-filter: blur(var(--gc-blur));
  box-shadow: var(--gc-shadow);
}

.auth-card h1 {
  margin: 0 0 0.2rem;
  font-size: 1.6rem;
  text-align: center;
}

.auth-card h2 {
  margin: 0 0 1.5rem;
  font-size: 1.1rem;
  font-weight: 400;
  color: var(--text-muted);
  text-align: center;
}

.auth-card form {
  display: grid;
  gap: 0.85rem;
}

.field {
  display: grid;
  gap: 0.3rem;
}

.field label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.error {
  margin: 0;
  font-size: 0.85rem;
  color: var(--danger);
}

.auth-card :deep(.el-button) {
  width: 100%;
  margin-left: 0;
  padding: 1.25em 0.7em;
  font-size: 1rem;
}

.auth-card :deep(.el-button--primary) {
  margin-top: 0.15rem;
}

.auth-card :deep(.dev-login) {
  margin-top: 0.1rem;
}

@media (max-width: 480px) {
  .auth-page {
    padding: 1rem;
  }

  .auth-card {
    padding: 2rem 1.25rem;
  }
}
</style>

import { createPinia } from 'pinia'
import { createApp } from 'vue'

import { addRequestErrorListener } from '@/api/http'
import { useUiStore } from '@/stores/ui'

import App from './App.vue'
import router from './router'
import './style.css'

const pinia = createPinia()
const uiStore = useUiStore(pinia)

addRequestErrorListener(({ error, method, url }) => {
  uiStore.notify(error.message || '请求失败，请稍后重试', 'error')

  if (!import.meta.env.DEV) {
    return
  }

  console.error('[app] api request error', {
    method,
    url,
    status: error.status ?? null,
    code: error.code ?? null,
    message: error.message,
  })
})

const app = createApp(App)
app.use(pinia)
app.use(router)
app.mount('#app')

import { createPinia } from 'pinia'
import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import '@/shared/styles/element-plus'

import { addRequestErrorListener } from '@/shared/api/http'
import { useThemeStore } from '@/shared/stores/theme'
import { useUiStore } from '@/shared/stores/ui'
import { hydrateTheme } from '@/shared/theme/hydration'

import App from './App.vue'
import router from './app/router'
import '@/shared/styles/app.css'

// ── Pre-mount theme hydration: restore tokens before first paint ──
hydrateTheme()

const pinia = createPinia()
const uiStore = useUiStore(pinia)
const themeStore = useThemeStore(pinia)

if (typeof window !== 'undefined') {
  const silenceRequestErrors = () => {
    ;(window as Window & {
      __GARLIC_CLAW_SUPPRESS_REQUEST_ERRORS__?: boolean
    }).__GARLIC_CLAW_SUPPRESS_REQUEST_ERRORS__ = true
  }
  window.addEventListener('pagehide', silenceRequestErrors, { capture: true })
  window.addEventListener('beforeunload', silenceRequestErrors, { capture: true })
}

addRequestErrorListener(({ error, method, url }) => {
  if (shouldSilenceRequestErrorLogs()) {
    return
  }

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

function shouldSilenceRequestErrorLogs() {
  if (typeof window === 'undefined') {
    return false
  }

  return (window as Window & {
    __GARLIC_CLAW_SUPPRESS_REQUEST_ERRORS__?: boolean
  }).__GARLIC_CLAW_SUPPRESS_REQUEST_ERRORS__ === true
}

themeStore.initTheme()

const app = createApp(App)
app.use(pinia)
app.use(ElementPlus)
app.use(router)
app.mount('#app')

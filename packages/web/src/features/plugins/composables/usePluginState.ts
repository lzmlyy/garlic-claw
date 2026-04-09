import { ref, watch } from 'vue'
import { useAsyncState } from '@/composables/use-async-state'
import { BusinessError } from '@/utils/error'

/**
 * 插件管理页共享状态。
 * 只负责管理 loading / error / notice。
 */
export function usePluginState() {
  const detailLoading = ref(false)
  const requestState = useAsyncState(false)
  const notice = ref<string | null>(null)

  watch(requestState.error, (message) => {
    if (!message) {
      requestState.appError.value = null
      return
    }

    requestState.appError.value = new BusinessError(message)
  })

  return {
    detailLoading,
    error: requestState.error,
    appError: requestState.appError,
    notice,
  }
}

export type PluginStateContext = ReturnType<typeof usePluginState>

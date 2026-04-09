import { ref, type Ref } from 'vue'
import { AppError, getErrorMessage, toAppError } from '@/utils/error'

export interface AsyncState {
  loading: Ref<boolean>
  error: Ref<string | null>
  appError: Ref<AppError | null>
  clearError: () => void
  setError: (error: unknown, fallback: string) => AppError
}

/**
 * 统一异步 loading/error 状态结构。
 */
export function useAsyncState(initialLoading = false): AsyncState {
  const loading = ref(initialLoading)
  const error = ref<string | null>(null)
  const appError = ref<AppError | null>(null)

  function clearError() {
    error.value = null
    appError.value = null
  }

  function setError(cause: unknown, fallback: string): AppError {
    const normalized = toAppError(cause, fallback)
    appError.value = normalized
    error.value = getErrorMessage(normalized, fallback)
    return normalized
  }

  return {
    loading,
    error,
    appError,
    clearError,
    setError,
  }
}

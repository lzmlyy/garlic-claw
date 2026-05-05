import type { Ref } from 'vue'

/**
 * 聊天恢复轮询的运行时依赖。
 */
export interface ChatRecoveryPollingParams {
  recoveryTimer: Ref<number | null>
  streamController: Ref<AbortController | null>
  currentConversationId: Ref<string | null>
  isStreaming: () => boolean
  shouldPollWhenIdle?: () => boolean
  loadConversationDetail: (conversationId: string) => Promise<void>
}

/**
 * 启动断线恢复轮询。
 * @param params 轮询运行时依赖
 */
export function startChatRecoveryPolling(params: ChatRecoveryPollingParams) {
  const shouldPollWhenIdle = params.shouldPollWhenIdle?.() ?? false
  if (
    params.recoveryTimer.value !== null ||
    params.streamController.value ||
    !params.currentConversationId.value ||
    (!params.isStreaming() && !shouldPollWhenIdle)
  ) {
    return
  }

  params.recoveryTimer.value = window.setInterval(async () => {
    if (!params.currentConversationId.value || params.streamController.value) {
      stopChatRecoveryPolling(params.recoveryTimer)
      return
    }

    try {
      await params.loadConversationDetail(params.currentConversationId.value)
      if (!params.isStreaming() && !(params.shouldPollWhenIdle?.() ?? false)) {
        stopChatRecoveryPolling(params.recoveryTimer)
      }
    } catch {
      // 轮询恢复失败时继续保留定时器，等待下一次重试。
    }
  }, 1000)
}

/**
 * 停止断线恢复轮询。
 * @param recoveryTimer 当前轮询定时器
 */
export function stopChatRecoveryPolling(recoveryTimer: Ref<number | null>) {
  if (recoveryTimer.value !== null) {
    window.clearInterval(recoveryTimer.value)
    recoveryTimer.value = null
  }
}

import { computed, ref, watch } from 'vue'
import type {
  AiModelCapabilities,
  ConversationSkillState,
  ChatMessageMetadata,
  ChatMessagePart,
  ConversationHostServices,
  UpdateConversationHostServicesPayload,
} from '@garlic-claw/shared'
import * as api from '../api'
import type { useChatStore } from '../stores/chat'
import {
  formatBytes,
  MAX_CHAT_IMAGE_DATA_URL_BYTES,
  MAX_CHAT_TOTAL_IMAGE_DATA_URL_BYTES,
  MIN_CHAT_IMAGE_DATA_URL_BYTES,
  prepareChatImageUpload,
  measureDataUrlBytes,
} from '../utils/chat-image-upload'

/**
 * 待发送图片。
 */
export interface PendingImage {
  id: string
  name: string
  image: string
  mimeType?: string
}

/**
 * 图片上传提示。
 */
export interface UploadNotice {
  id: string
  type: 'info' | 'error'
  text: string
}

/**
 * 聊天页的页面状态与交互逻辑。
 * 输入:
 * - chat store
 * 输出:
 * - 模型选择、图片上传、消息发送所需的响应式状态和方法
 * 预期行为:
 * - 页面组件只负责布局
 * - 上传预算、模型能力读取与发送逻辑统一收口
 */
export function useChatView(chat: ReturnType<typeof useChatStore>) {
  const inputText = ref('')
  const pendingImages = ref<PendingImage[]>([])
  const selectedCapabilities = ref<AiModelCapabilities | null>(null)
  const conversationHostServices = ref<ConversationHostServices | null>(null)
  const conversationSkillState = ref<ConversationSkillState | null>(null)
  const uploadProcessingNotices = ref<UploadNotice[]>([])
  const visionFallbackEnabled = ref(false)
  let capabilityRequestId = 0
  let conversationHostServicesRequestId = 0
  let conversationSkillRequestId = 0
  const imageFallbackNotice = computed<UploadNotice[]>(() => {
    if (
      pendingImages.value.length === 0 ||
      !selectedCapabilities.value ||
      selectedCapabilities.value.input.image
    ) {
      return []
    }

    return [
      {
        id: 'image-fallback-notice',
        type: 'info',
        text: '当前模型不支持图片输入，发送时后端会按配置尝试 Vision Fallback；如果未启用视觉转述，则会退化为文本占位后继续发送。',
      },
    ]
  })
  const uploadNotices = computed<UploadNotice[]>(() => [
    ...imageFallbackNotice.value,
    ...uploadProcessingNotices.value,
  ])
  const lastMessageRole = computed(() => {
    const lastMessage = chat.messages[chat.messages.length - 1]
    return lastMessage?.role ?? null
  })
  const conversationSendDisabledReason = computed(() => {
    if (!chat.currentConversationId) {
      return null
    }

    if (conversationHostServices.value?.sessionEnabled === false) {
      return '当前会话宿主服务已停用'
    }

    if (conversationHostServices.value?.llmEnabled === false) {
      return '当前会话已关闭 LLM 自动回复'
    }

    return null
  })
  const canSend = computed(() =>
    Boolean(inputText.value.trim() || pendingImages.value.length > 0) &&
    !chat.streaming &&
    !conversationSendDisabledReason.value,
  )
  const retryActionLabel = computed(() =>
    chat.retryableMessageId ? '重试' : lastMessageRole.value === 'user' ? '发送' : '重试',
  )
  const canTriggerRetryAction = computed(() => {
    if (chat.streaming || conversationSendDisabledReason.value) {
      return false
    }

    if (chat.retryableMessageId) {
      return true
    }

    return canSend.value
  })
  const shouldPreviewVisionFallback = computed(() =>
    visionFallbackEnabled.value &&
    pendingImages.value.length > 0 &&
    Boolean(selectedCapabilities.value) &&
    !selectedCapabilities.value?.input.image,
  )

  watch(
    () => [chat.selectedProvider, chat.selectedModel],
    async ([provider, model]) => {
      await refreshSelectedCapabilities(provider, model)
    },
    { immediate: true },
  )
  watch(
    () => chat.currentConversationId,
    async (conversationId) => {
      await refreshConversationHostServices(conversationId)
      await refreshConversationSkillState(conversationId)
    },
    { immediate: true },
  )
  void refreshVisionFallbackAvailability()

  /**
   * 切换当前聊天所用模型。
   * @param selection provider/model 组合
   */
  function handleModelChange(selection: {
    providerId: string
    modelId: string
  }) {
    chat.setModelSelection({
      provider: selection.providerId,
      model: selection.modelId,
    })
  }

  /**
   * 把当前文本和待发送图片一起发给聊天 store。
   */
  async function send() {
    if (conversationSendDisabledReason.value) {
      return
    }

    const text = inputText.value.trim()
    if (!selectedCapabilities.value && chat.selectedProvider && chat.selectedModel) {
      await refreshSelectedCapabilities(chat.selectedProvider, chat.selectedModel)
    }
    const mayNeedVisionFallback =
      pendingImages.value.length > 0 &&
      Boolean(selectedCapabilities.value) &&
      !selectedCapabilities.value?.input.image

    if (mayNeedVisionFallback && !visionFallbackEnabled.value) {
      await refreshVisionFallbackAvailability()
    }
    const optimisticAssistantMetadata = shouldPreviewVisionFallback.value
      ? {
        visionFallback: {
          state: 'transcribing',
          entries: [],
        },
      } satisfies ChatMessageMetadata
      : undefined
    const parts: ChatMessagePart[] = [
      ...pendingImages.value.map((image) => ({
        type: 'image' as const,
        image: image.image,
        mimeType: image.mimeType,
      })),
      ...(text ? [{ type: 'text' as const, text }] : []),
    ]

    if (parts.length === 0) {
      return
    }

    inputText.value = ''
    pendingImages.value = []
    uploadProcessingNotices.value = []
    await chat.sendMessage({
      content: text || undefined,
      parts,
      provider: chat.selectedProvider,
      model: chat.selectedModel,
      ...(optimisticAssistantMetadata
        ? { optimisticAssistantMetadata }
        : {}),
    })
  }

  /**
   * 在前端压缩图片并加入待发送队列。
   * @param event 文件选择事件
   */
  async function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement
    const files = Array.from(target.files ?? [])
    uploadProcessingNotices.value = []

    if (files.length === 0) {
      target.value = ''
      return
    }

    const nextImages: PendingImage[] = []
    const notices: UploadNotice[] = []
    let remainingBudget = Math.max(
      0,
      MAX_CHAT_TOTAL_IMAGE_DATA_URL_BYTES -
        getPendingImageBudgetBytes(pendingImages.value),
    )

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      const remainingSlots = files.length - index
      const targetBytes = Math.min(
        MAX_CHAT_IMAGE_DATA_URL_BYTES,
        Math.floor(remainingBudget / remainingSlots),
      )

      if (targetBytes < MIN_CHAT_IMAGE_DATA_URL_BYTES) {
        notices.push({
          id: `${file.name}-${index}`,
          type: 'error',
          text: '图片总大小已接近聊天上传上限，请先删除部分图片后再继续上传。',
        })
        break
      }

      try {
        const prepared = await prepareChatImageUpload(file, targetBytes)
        nextImages.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          image: prepared.image,
          mimeType: prepared.mimeType,
        })
        remainingBudget -= prepared.compressedBytes

        if (prepared.compressed) {
          notices.push({
            id: `${file.name}-${index}-compressed`,
            type: 'info',
            text: `${file.name} 已压缩：${formatBytes(prepared.originalBytes)} -> ${formatBytes(prepared.compressedBytes)}`,
          })
        }
      } catch (error) {
        notices.push({
          id: `${file.name}-${index}-error`,
          type: 'error',
          text: `${file.name} 上传前压缩失败：${error instanceof Error ? error.message : '未知错误'}`,
        })
      }
    }

    pendingImages.value.push(...nextImages)
    uploadProcessingNotices.value = notices
    target.value = ''
  }

  /**
   * 删除待发送队列中的一张图片。
   * @param index 图片索引
   */
  function removeImage(index: number) {
    pendingImages.value.splice(index, 1)
  }

  /**
   * 更新一条现有消息。
   * @param payload 修改后的消息内容
   */
  async function updateMessage(payload: {
    messageId: string
    content?: string
    parts?: ChatMessagePart[]
  }) {
    await chat.updateMessage(payload.messageId, payload)
  }

  /**
   * 删除一条现有消息。
   * @param messageId 要删除的消息 ID
   */
  async function deleteMessage(messageId: string) {
    await chat.deleteMessage(messageId)
  }

  /**
   * 原地重试最后一条 assistant 回复。
   * @param messageId assistant 消息 ID
   */
  async function retryMessage(messageId: string) {
    if (conversationSendDisabledReason.value) {
      return
    }

    await chat.retryMessage(messageId)
  }

  /**
   * 根据当前会话状态执行“重试”按钮的真实动作。
   * 输入:
   * - 无，直接读取当前会话末尾消息与草稿状态
   * 输出:
   * - 存在可重试 assistant 时原地重试
   * - 否则退化为发送当前草稿
   * 预期行为:
   * - 按钮位置固定，不再因为有无可重试消息频繁跳布局
   */
  async function triggerRetryAction() {
    if (chat.streaming || conversationSendDisabledReason.value) {
      return
    }

    if (chat.retryableMessageId) {
      await retryMessage(chat.retryableMessageId)
      return
    }

    await send()
  }

  /**
   * 读取并同步当前选择模型的能力，忽略已过期的旧请求。
   * @param providerId 当前 provider
   * @param modelId 当前模型
   */
  async function refreshSelectedCapabilities(
    providerId: string | null,
    modelId: string | null,
  ) {
    const requestId = ++capabilityRequestId
    if (!providerId || !modelId) {
      selectedCapabilities.value = null
      return
    }

    const capabilities = await loadModelCapabilities(providerId, modelId)
    if (
      requestId !== capabilityRequestId ||
      chat.selectedProvider !== providerId ||
      chat.selectedModel !== modelId
    ) {
      return
    }

    selectedCapabilities.value = capabilities
  }

  /**
   * 读取当前是否启用了 Vision Fallback。
   */
  async function refreshVisionFallbackAvailability() {
    try {
      const config = await api.getVisionFallbackConfig()
      visionFallbackEnabled.value = Boolean(
        config.enabled &&
        config.providerId &&
        config.modelId,
      )
    } catch {
      visionFallbackEnabled.value = false
    }
  }

  /**
   * 读取当前会话的宿主服务开关。
   * @param conversationId 当前会话 ID
   */
  async function refreshConversationHostServices(
    conversationId: string | null = chat.currentConversationId,
  ) {
    const requestId = ++conversationHostServicesRequestId
    if (!conversationId) {
      conversationHostServices.value = null
      return
    }

    try {
      const services = await api.getConversationHostServices(conversationId)
      if (
        requestId !== conversationHostServicesRequestId ||
        chat.currentConversationId !== conversationId
      ) {
        return
      }

      conversationHostServices.value = services
    } catch {
      if (
        requestId !== conversationHostServicesRequestId ||
        chat.currentConversationId !== conversationId
      ) {
        return
      }

      conversationHostServices.value = {
        sessionEnabled: true,
        llmEnabled: true,
        ttsEnabled: true,
      }
    }
  }

  /**
   * 更新当前会话的 LLM 自动回复开关。
   * @param enabled 是否启用
   */
  async function setConversationLlmEnabled(enabled: boolean) {
    await updateConversationHostServices({
      llmEnabled: enabled,
    })
  }

  /**
   * 更新当前会话的宿主总开关。
   * @param enabled 是否启用
   */
  async function setConversationSessionEnabled(enabled: boolean) {
    await updateConversationHostServices({
      sessionEnabled: enabled,
    })
  }

  /**
   * 更新当前会话的宿主服务开关，并在必要时停止当前流。
   * @param patch 局部更新
   */
  async function updateConversationHostServices(
    patch: UpdateConversationHostServicesPayload,
  ) {
    const conversationId = chat.currentConversationId
    if (!conversationId) {
      return
    }

    conversationHostServices.value = await api.updateConversationHostServices(
      conversationId,
      patch,
    )

    if (
      chat.streaming &&
      (conversationHostServices.value.sessionEnabled === false ||
        conversationHostServices.value.llmEnabled === false)
    ) {
      await chat.stopStreaming()
    }
  }

  async function refreshConversationSkillState(
    conversationId: string | null = chat.currentConversationId,
  ) {
    const requestId = ++conversationSkillRequestId
    if (!conversationId) {
      conversationSkillState.value = null
      return
    }

    try {
      const state = await api.getConversationSkills(conversationId)
      if (
        requestId !== conversationSkillRequestId ||
        chat.currentConversationId !== conversationId
      ) {
        return
      }

      conversationSkillState.value = state
    } catch {
      if (
        requestId !== conversationSkillRequestId ||
        chat.currentConversationId !== conversationId
      ) {
        return
      }

      conversationSkillState.value = {
        activeSkillIds: [],
        activeSkills: [],
      }
    }
  }

  async function updateConversationSkills(activeSkillIds: string[]) {
    const conversationId = chat.currentConversationId
    if (!conversationId) {
      return
    }

    conversationSkillState.value = await api.updateConversationSkills(conversationId, {
      activeSkillIds,
    })
  }

  async function removeConversationSkill(skillId: string) {
    const activeSkillIds = conversationSkillState.value?.activeSkillIds ?? []
    await updateConversationSkills(activeSkillIds.filter((activeId) => activeId !== skillId))
  }

  return {
    inputText,
    pendingImages,
    selectedCapabilities,
    conversationHostServices,
    conversationSkillState,
    conversationSendDisabledReason,
    uploadNotices,
    canSend,
    canTriggerRetryAction,
    retryActionLabel,
    retryableMessageId: chat.retryableMessageId,
    handleModelChange,
    send,
    handleFileChange,
    removeImage,
    updateMessage,
    deleteMessage,
    retryMessage,
    triggerRetryAction,
    setConversationLlmEnabled,
    setConversationSessionEnabled,
    removeConversationSkill,
  }
}

/**
 * 读取模型能力。
 * @param providerId provider ID
 * @param modelId 模型 ID
 * @returns 模型能力；找不到时返回 null
 */
async function loadModelCapabilities(
  providerId: string,
  modelId: string,
): Promise<AiModelCapabilities | null> {
  const models = await api.listAiModels(providerId)
  const model = models.find((item) => item.id === modelId)
  return model?.capabilities ?? null
}

/**
 * 统计当前待发送图片已经占用的 data URL 字节数。
 * @returns 当前图片预算占用
 */
function getPendingImageBudgetBytes(images: PendingImage[] = []): number {
  return images.reduce(
    (total, image) => total + measureDataUrlBytes(image.image),
    0,
  )
}

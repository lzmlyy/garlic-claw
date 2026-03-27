import { computed, ref, watch } from 'vue'
import type { AiModelCapabilities, ChatMessagePart } from '@garlic-claw/shared'
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
  const uploadNotices = ref<UploadNotice[]>([])
  const lastMessageRole = computed(() => {
    const lastMessage = chat.messages[chat.messages.length - 1]
    return lastMessage?.role ?? null
  })
  const canSend = computed(() =>
    Boolean(inputText.value.trim() || pendingImages.value.length > 0) && !chat.streaming,
  )
  const retryActionLabel = computed(() =>
    chat.retryableMessageId ? '重试' : lastMessageRole.value === 'user' ? '发送' : '重试',
  )
  const canTriggerRetryAction = computed(() => {
    if (chat.streaming) {
      return false
    }

    if (chat.retryableMessageId) {
      return true
    }

    return canSend.value
  })

  watch(
    () => [chat.selectedProvider, chat.selectedModel],
    async ([provider, model]) => {
      if (!provider || !model) {
        selectedCapabilities.value = null
        return
      }

      selectedCapabilities.value = await loadModelCapabilities(provider, model)
    },
    { immediate: true },
  )

  /**
   * 切换当前聊天所用模型。
   * @param selection provider/model 组合
   */
  async function handleModelChange(selection: {
    providerId: string
    modelId: string
  }) {
    chat.setModelSelection({
      provider: selection.providerId,
      model: selection.modelId,
    })
    selectedCapabilities.value = await loadModelCapabilities(
      selection.providerId,
      selection.modelId,
    )
  }

  /**
   * 把当前文本和待发送图片一起发给聊天 store。
   */
  async function send() {
    const text = inputText.value.trim()
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
    uploadNotices.value = []
    await chat.sendMessage({
      content: text || undefined,
      parts,
      provider: chat.selectedProvider,
      model: chat.selectedModel,
    })
  }

  /**
   * 在前端压缩图片并加入待发送队列。
   * @param event 文件选择事件
   */
  async function handleFileChange(event: Event) {
    const target = event.target as HTMLInputElement
    const files = Array.from(target.files ?? [])
    uploadNotices.value = []

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
    uploadNotices.value = notices
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
    if (chat.streaming) {
      return
    }

    if (chat.retryableMessageId) {
      await retryMessage(chat.retryableMessageId)
      return
    }

    await send()
  }

  return {
    inputText,
    pendingImages,
    selectedCapabilities,
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

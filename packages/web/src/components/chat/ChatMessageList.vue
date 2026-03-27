<template>
  <div ref="messagesEl" class="messages">
    <div v-if="loading" class="loading">加载中...</div>
    <div
      v-for="(message, index) in messages"
      :key="message.id ?? index"
      class="message"
      :class="message.role"
    >
      <div class="message-role">{{ getRoleLabel(message) }}</div>
      <div class="message-body">
        <div class="message-meta">
          <span class="message-status" :class="message.status">
            {{ statusLabelMap[message.status] }}
          </span>
          <span v-if="message.provider && message.model" class="message-model">
            {{ message.provider }}/{{ message.model }}
          </span>
        </div>

        <div v-if="editingMessageId === message.id" class="message-editor">
          <textarea
            v-model="editingText"
            rows="4"
            placeholder="修改当前消息内容"
          ></textarea>
          <div v-if="hasEditableImages(message)" class="editor-note">
            当前消息里的图片会保留，本次只修改文本内容。
          </div>
          <div class="editor-actions">
            <button
              type="button"
              class="action-button save-button"
              @click="saveEdit(message)"
            >
              保存
            </button>
            <button type="button" class="action-button cancel-button" @click="cancelEdit">
              取消
            </button>
          </div>
        </div>

        <template v-else>
          <div v-if="message.parts?.length" class="message-parts">
            <template v-for="(part, partIndex) in message.parts" :key="partIndex">
              <div
                v-if="part.type === 'text'"
                class="message-content"
                v-html="renderMarkdown(part.text)"
              ></div>
              <img
                v-else
                :src="part.image"
                alt="用户上传的图片"
                class="message-image"
              />
            </template>
          </div>
          <div v-else class="message-content" v-html="renderMarkdown(message.content)"></div>

          <div v-if="message.error" class="message-error">
            错误: {{ message.error }}
          </div>

          <div v-if="message.toolCalls?.length" class="tool-calls">
            <div
              v-for="(toolCall, toolIndex) in message.toolCalls"
              :key="toolIndex"
              class="tool-call"
            >
              工具调用 <strong>{{ toolCall.toolName }}</strong>
              <code>{{ toolCall.input }}</code>
            </div>
          </div>

          <div v-if="message.toolResults?.length" class="tool-results">
            <div
              v-for="(toolResult, toolIndex) in message.toolResults"
              :key="toolIndex"
              class="tool-result"
            >
              工具结果 <strong>{{ toolResult.toolName }}</strong>
              <code>{{ toolResult.output }}</code>
            </div>
          </div>

          <div v-if="message.id" class="message-actions">
            <button
              type="button"
              class="action-button edit-button"
              @click="startEdit(message)"
            >
              修改
            </button>
            <button
              type="button"
              class="action-button delete-button"
              @click="$emit('delete-message', message.id)"
            >
              删除
            </button>
          </div>
        </template>

        <span v-if="message.status === 'pending' || message.status === 'streaming'" class="cursor">
          ▌
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked'
import { nextTick, ref, watch } from 'vue'
import type { ChatMessagePart } from '@garlic-claw/shared'
import type { ChatMessage } from '../../stores/chat'

const props = defineProps<{
  loading: boolean
  messages: ChatMessage[]
}>()

const emit = defineEmits<{
  (event: 'update-message', value: { messageId: string; content?: string; parts?: ChatMessagePart[] }): void
  (event: 'delete-message', messageId: string): void
}>()

const statusLabelMap = {
  pending: '等待中',
  streaming: '生成中',
  completed: '已完成',
  stopped: '已停止',
  error: '失败',
} as const

const messagesEl = ref<HTMLElement | null>(null)
const editingMessageId = ref<string | null>(null)
const editingText = ref('')

watch(
  () => props.messages,
  async () => {
    await nextTick()
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  },
  { deep: true },
)

/**
 * 把 Markdown 文本渲染为 HTML。
 * @param text 原始 Markdown 文本
 * @returns 可直接注入消息区域的 HTML
 */
function renderMarkdown(text: string): string {
  if (!text) {
    return ''
  }

  return marked.parse(text, { async: false }) as string
}

/**
 * 返回消息角色标签。
 * @param message 当前消息
 * @returns 聊天项顶部显示的角色标识
 */
function getRoleLabel(message: ChatMessage): string {
  return message.role === 'user' ? '[USER]' : '[AI]'
}

/**
 * 进入消息编辑态。
 * @param message 要编辑的消息
 */
function startEdit(message: ChatMessage) {
  if (!message.id) {
    return
  }

  editingMessageId.value = message.id
  editingText.value = extractEditableText(message)
}

/**
 * 取消当前编辑态。
 */
function cancelEdit() {
  editingMessageId.value = null
  editingText.value = ''
}

/**
 * 保存当前编辑结果。
 * @param message 当前编辑的消息
 */
function saveEdit(message: ChatMessage) {
  if (!message.id) {
    return
  }

  const trimmedText = editingText.value.trim()
  const payload = hasEditableImages(message)
    ? {
        messageId: message.id,
        content: trimmedText,
        parts: buildUpdatedParts(message, trimmedText),
      }
    : {
        messageId: message.id,
        content: trimmedText,
      }

  emit('update-message', payload)
  cancelEdit()
}

/**
 * 提取消息里当前可编辑的文本内容。
 * @param message 当前消息
 * @returns 文本编辑框的初始值
 */
function extractEditableText(message: ChatMessage): string {
  if (!message.parts?.length) {
    return message.content
  }

  return message.parts
    .filter((part): part is Extract<ChatMessagePart, { type: 'text' }> => part.type === 'text')
    .map((part) => part.text)
    .join('\n')
}

/**
 * 判断当前消息是否包含需要保留的图片 part。
 * @param message 当前消息
 * @returns 是否包含图片
 */
function hasEditableImages(message: ChatMessage): boolean {
  return Boolean(message.parts?.some((part) => part.type === 'image'))
}

/**
 * 基于旧消息构造修改后的完整 parts。
 * @param message 原始消息
 * @param nextText 新文本
 * @returns 带原图保留的新 parts
 */
function buildUpdatedParts(message: ChatMessage, nextText: string): ChatMessagePart[] {
  const imageParts = message.parts?.filter(
    (part): part is Extract<ChatMessagePart, { type: 'image' }> => part.type === 'image',
  ) ?? []

  return nextText
    ? [
        ...imageParts,
        {
          type: 'text',
          text: nextText,
        },
      ]
    : imageParts
}
</script>

<style scoped src="./ChatMessageList.css"></style>

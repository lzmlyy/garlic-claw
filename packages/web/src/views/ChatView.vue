<template>
  <div class="chat-view">
    <template v-if="chat.currentConversationId">
      <div class="messages" ref="messagesEl">
        <div v-if="chat.loading" class="loading">加载中...</div>
        <div
          v-for="(msg, i) in chat.messages"
          :key="i"
          class="message"
          :class="msg.role"
        >
          <div class="message-role">{{ msg.role === 'user' ? '你' : 'AI' }}</div>
          <div class="message-body">
            <!-- 工具调用 -->
            <div v-if="msg.toolCalls?.length" class="tool-calls">
              <div v-for="(tc, j) in msg.toolCalls" :key="j" class="tool-call">
                🔧 <strong>{{ tc.toolName }}</strong>
                <code>{{ JSON.stringify(tc.input) }}</code>
              </div>
            </div>
            <!-- 工具结果 -->
            <div v-if="msg.toolResults?.length" class="tool-results">
              <div v-for="(tr, j) in msg.toolResults" :key="j" class="tool-result">
                ✅ <strong>{{ tr.toolName }}</strong>
                <code>{{ JSON.stringify(tr.output) }}</code>
              </div>
            </div>
            <!-- 消息内容 -->
            <div class="message-content" v-html="renderMarkdown(msg.content)"></div>
            <span v-if="msg.streaming" class="cursor">▌</span>
          </div>
        </div>
      </div>
      <div class="input-area">
        <textarea
          v-model="inputText"
          @keydown.enter.exact.prevent="send"
          placeholder="输入消息... (Enter 发送)"
          :disabled="chat.streaming || chat.loading"
          rows="1"
        ></textarea>
        <button v-if="chat.streaming" @click="chat.stopStreaming()" class="btn-stop">
          停止
        </button>
        <button v-else @click="send" :disabled="!inputText.trim() || chat.loading" class="btn-send">
          <el-icon v-if="chat.loading" class="is-loading"><Loading /></el-icon>
          <span v-else>发送</span>
        </button>
      </div>
    </template>
    <div v-else class="no-conversation">
      <p>👈 选择一个对话或创建新对话</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked'
import { nextTick, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useChatStore } from '../stores/chat'

const chat = useChatStore()
const inputText = ref('')
const messagesEl = ref<HTMLElement | null>(null)

function renderMarkdown(text: string): string {
  if (!text) return ''
  return marked.parse(text, { async: false }) as string
}

async function send() {
  const text = inputText.value.trim()
  if (!text) return
  inputText.value = ''
  try {
    await chat.sendMessage(text)
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : '发送消息失败'
    ElMessage.error(errorMsg)
  }
}

// 消息变化时自动滚动
watch(
  () => chat.messages[chat.messages.length - 1]?.content,
  () => {
    nextTick(() => {
      if (messagesEl.value) {
        messagesEl.value.scrollTop = messagesEl.value.scrollHeight
      }
    })
  },
)
</script>

<template>
  <section class="panel-section session-panel">
    <header class="session-header">
      <div>
        <h3>会话等待态</h3>
        <p>当前插件正在接管的多轮会话，会优先拦截后续用户输入。</p>
      </div>
      <span class="session-count">当前插件有 {{ sessions.length }} 个活动会话等待态</span>
    </header>

    <div v-if="sessions.length === 0" class="session-empty">
      当前插件没有活动中的会话等待态。
    </div>

    <ul v-else class="session-list">
      <li v-for="session in sessions" :key="session.conversationId" class="session-item">
        <div class="session-topline">
          <div class="session-copy">
            <strong>{{ session.conversationId }}</strong>
            <div class="session-tags">
              <span class="session-pill">{{ session.captureHistory ? '记录命中历史' : '不记录历史' }}</span>
              <span class="session-pill">{{ formatRemaining(session) }}</span>
            </div>
          </div>
          <button
            type="button"
            class="danger-button session-action"
            data-test="session-finish-button"
            :disabled="finishingConversationId === session.conversationId"
            @click="$emit('finish', session.conversationId)"
          >
            {{ finishingConversationId === session.conversationId ? '结束中...' : '结束等待态' }}
          </button>
        </div>

        <div class="session-meta">
          <span>开始时间：{{ formatTime(session.startedAt) }}</span>
          <span>过期时间：{{ formatTime(session.expiresAt) }}</span>
          <span>最近命中：{{ formatTime(session.lastMatchedAt) }}</span>
          <span>历史消息：{{ session.historyMessages.length }} 条</span>
        </div>

        <div v-if="session.historyMessages.length > 0" class="session-history">
          <strong>最近历史</strong>
          <ul>
            <li
              v-for="(message, index) in session.historyMessages"
              :key="`${session.conversationId}-${index}`"
            >
              <span class="history-role">{{ message.role }}</span>
              <span>{{ message.content || message.parts[0]?.type || '空内容' }}</span>
            </li>
          </ul>
        </div>

        <div v-if="typeof session.metadata !== 'undefined'" class="session-metadata">
          <strong>Metadata</strong>
          <pre>{{ formatMetadata(session.metadata) }}</pre>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { JsonValue, PluginConversationSessionInfo } from '@garlic-claw/shared'

defineProps<{
  sessions: PluginConversationSessionInfo[]
  finishingConversationId: string | null
}>()

defineEmits<{
  (event: 'finish', conversationId: string): void
}>()

/**
 * 格式化时间文本。
 * @param value ISO 时间或 null
 * @returns 页面展示用文本
 */
function formatTime(value: string | null): string {
  if (!value) {
    return '暂无'
  }

  return new Date(value).toLocaleString()
}

/**
 * 生成人类可读的剩余超时文本。
 * @param session 会话等待态
 * @returns 剩余时间描述
 */
function formatRemaining(session: PluginConversationSessionInfo): string {
  if (session.timeoutMs <= 0) {
    return '已到期'
  }
  if (session.timeoutMs < 60_000) {
    return `剩余 ${Math.ceil(session.timeoutMs / 1000)} 秒`
  }

  return `剩余 ${Math.ceil(session.timeoutMs / 60_000)} 分钟`
}

/**
 * 把 metadata 序列化成稳定 JSON 文本。
 * @param metadata 结构化 metadata
 * @returns 格式化后的 JSON 字符串
 */
function formatMetadata(metadata: JsonValue): string {
  return JSON.stringify(metadata, null, 2)
}
</script>

<style scoped>
.session-panel {
  display: grid;
  gap: 14px;
  padding: 1rem;
}

.session-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.session-header p,
.session-count,
.session-empty,
.session-meta,
.session-history,
.session-metadata {
  color: var(--text-muted);
  font-size: 0.88rem;
}

.session-count {
  white-space: nowrap;
}

.session-list {
  display: grid;
  gap: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.session-item {
  display: grid;
  gap: 10px;
  padding: 0.95rem;
  border-radius: 12px;
  border: 1px solid rgba(133, 163, 199, 0.14);
  background: rgba(12, 22, 36, 0.78);
}

.session-topline {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.session-copy {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.session-copy strong {
  overflow-wrap: anywhere;
}

.session-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.session-pill,
.session-action {
  display: inline-flex;
  align-items: center;
  padding: 0.22rem 0.6rem;
  border-radius: 999px;
  font-size: 0.78rem;
}

.session-pill {
  border: 1px solid rgba(133, 163, 199, 0.14);
  background: rgba(18, 32, 51, 0.82);
  color: #c7d6eb;
}

.session-action {
  border: 1px solid rgba(224, 85, 85, 0.24);
  background: rgba(224, 85, 85, 0.08);
}

.session-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.session-history,
.session-metadata {
  display: grid;
  gap: 8px;
}

.session-history ul {
  display: grid;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.session-history li {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.history-role {
  color: #93dfe0;
  text-transform: uppercase;
  font-size: 0.76rem;
}

.session-metadata pre {
  margin: 0;
  padding: 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(133, 163, 199, 0.12);
  background: rgba(8, 13, 22, 0.52);
  color: #d8e4f6;
  font-size: 0.8rem;
  overflow-x: auto;
}

@media (max-width: 720px) {
  .session-header,
  .session-topline {
    display: grid;
    grid-template-columns: 1fr;
  }

  .session-count {
    white-space: normal;
  }
}
</style>

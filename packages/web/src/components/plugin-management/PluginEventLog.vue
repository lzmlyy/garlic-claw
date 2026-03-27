<template>
  <section class="panel-section">
    <div class="section-header">
      <div>
        <h3>事件日志</h3>
        <p>查看插件最近的失败、治理动作与健康检查记录。</p>
      </div>
    </div>

    <div v-if="loading" class="section-empty">加载中...</div>
    <div v-else-if="events.length === 0" class="section-empty">
      当前还没有事件日志。
    </div>
    <div v-else class="event-list">
      <article v-for="event in events" :key="event.id" class="event-item">
        <div class="event-top">
          <span class="event-level" :class="event.level">{{ event.level }}</span>
          <strong>{{ event.type }}</strong>
          <time>{{ event.createdAt }}</time>
        </div>
        <p>{{ event.message }}</p>
        <pre v-if="event.metadata" class="event-metadata">{{ JSON.stringify(event.metadata, null, 2) }}</pre>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { PluginEventRecord } from '@garlic-claw/shared'

defineProps<{
  events: PluginEventRecord[]
  loading: boolean
}>()
</script>

<style scoped>
.panel-section {
  display: grid;
  gap: 14px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.section-header h3 {
  font-size: 1rem;
}

.section-header p,
.section-empty {
  color: var(--text-muted);
  font-size: 0.82rem;
}

.event-list {
  display: grid;
  gap: 10px;
  max-height: 420px;
  overflow-y: auto;
}

.event-item {
  display: grid;
  gap: 8px;
  padding: 0.9rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.event-top {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.event-top time {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 0.8rem;
}

.event-level {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 52px;
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  text-transform: uppercase;
  background: var(--bg-input);
  color: var(--text-muted);
}

.event-level.info {
  color: var(--accent-hover);
}

.event-level.warn {
  color: #f0b24b;
}

.event-level.error {
  color: var(--danger);
}

.event-metadata {
  padding: 0.8rem;
  background: var(--bg-input);
  border-radius: 8px;
  color: var(--text-muted);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
</style>

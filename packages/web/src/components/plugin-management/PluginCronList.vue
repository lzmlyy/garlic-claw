<template>
  <section class="cron-card">
    <header class="cron-header">
      <div>
        <h3>Cron Jobs</h3>
        <p>插件通过统一协议声明或动态注册的定时任务。</p>
      </div>
      <span class="cron-count">{{ jobs.length }} 个</span>
    </header>

    <div v-if="jobs.length === 0" class="cron-empty">
      当前插件没有 cron job。
    </div>

    <ul v-else class="cron-list">
      <li v-for="job in jobs" :key="job.id" class="cron-item">
        <div class="cron-topline">
          <strong>{{ job.name }}</strong>
          <div class="cron-meta">
            <span class="cron-source">{{ job.source }}</span>
            <span class="cron-pill">{{ job.cron }}</span>
            <button
              v-if="job.source === 'host'"
              type="button"
              class="cron-action danger-button"
              data-test="cron-delete-button"
              :disabled="deletingJobId === job.id"
              @click="$emit('delete', job.id)"
            >
              {{ deletingJobId === job.id ? '删除中...' : '删除' }}
            </button>
          </div>
        </div>
        <p class="cron-description">{{ job.description ?? '未提供额外说明。' }}</p>
        <div class="cron-status">
          <span>最近执行：{{ formatTime(job.lastRunAt) }}</span>
          <span>状态：{{ cronStatusLabel(job) }}</span>
        </div>
        <p v-if="job.lastError" class="cron-error">{{ job.lastError }}</p>
        <p v-if="job.lastErrorAt" class="cron-error-time">
          最后错误时间：{{ formatTime(job.lastErrorAt) }}
        </p>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import type { PluginCronJobSummary } from '@garlic-claw/shared'

defineProps<{
  jobs: PluginCronJobSummary[]
  deletingJobId: string | null
}>()

defineEmits<{
  (event: 'delete', jobId: string): void
}>()

/**
 * 把时间字符串转成可读文本。
 * @param value ISO 时间字符串
 * @returns 展示文案
 */
function formatTime(value: string | null): string {
  if (!value) {
    return '暂无'
  }

  return new Date(value).toLocaleString()
}

/**
 * 生成 cron job 的更准确运行状态文案。
 * @param job cron job 摘要
 * @returns 状态文本
 */
function cronStatusLabel(job: PluginCronJobSummary): string {
  if (job.lastError) {
    return '失败'
  }
  if (job.lastRunAt) {
    return '正常'
  }

  return '未运行'
}
</script>

<style scoped>
.cron-card {
  display: grid;
  gap: 14px;
  padding: 1rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
}

.cron-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.cron-header p,
.cron-count,
.cron-empty,
.cron-description,
.cron-status {
  color: var(--text-muted);
  font-size: 0.88rem;
}

.cron-list {
  display: grid;
  gap: 12px;
  list-style: none;
  padding: 0;
  margin: 0;
}

.cron-item {
  display: grid;
  gap: 8px;
  padding: 0.9rem;
  border-radius: 10px;
  background: var(--bg-input);
}

.cron-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.cron-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.cron-source,
.cron-pill,
.cron-action {
  display: inline-flex;
  align-items: center;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  font-size: 0.76rem;
}

.cron-source {
  background: rgba(102, 197, 138, 0.16);
  color: #c9ffd7;
}

.cron-pill {
  background: rgba(124, 106, 246, 0.16);
  color: var(--accent-hover);
  font-family: 'JetBrains Mono', monospace;
}

.cron-action {
  border: 1px solid rgba(224, 85, 85, 0.24);
  background: rgba(224, 85, 85, 0.08);
  cursor: pointer;
}

.danger-button {
  color: var(--danger);
}

.cron-status {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.cron-error {
  color: #ffd5d5;
  font-size: 0.84rem;
}

.cron-error-time {
  color: var(--text-muted);
  font-size: 0.82rem;
}

@media (max-width: 720px) {
  .cron-topline {
    display: grid;
    grid-template-columns: 1fr;
  }

  .cron-meta {
    justify-content: flex-start;
  }
}
</style>

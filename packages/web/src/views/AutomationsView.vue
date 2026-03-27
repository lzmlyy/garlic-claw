<template>
  <div class="automations-view">
    <div class="automations-header">
      <h1>自动化</h1>
      <button @click="showCreate = !showCreate">
        {{ showCreate ? '取消' : '+ 新建自动化' }}
      </button>
    </div>

    <!-- 创建表单 -->
    <div v-if="showCreate" class="create-form">
      <div class="field">
        <label>名称</label>
        <input v-model="form.name" placeholder="例如：每5分钟检查系统信息" />
      </div>
      <div class="field">
        <label>触发方式</label>
        <select v-model="form.triggerType">
          <option value="cron">定时执行</option>
          <option value="manual">手动触发</option>
        </select>
      </div>
      <div v-if="form.triggerType === 'cron'" class="field">
        <label>执行间隔</label>
        <input v-model="form.cronInterval" placeholder="例如: 5m, 1h, 30s" />
        <span class="hint">支持格式: 30s / 5m / 1h</span>
      </div>
      <div class="field">
        <label>动作：设备命令</label>
        <input v-model="form.plugin" placeholder="插件名称 (如 pc-NOTEBOOK)" />
        <input v-model="form.capability" placeholder="能力名称 (如 get_pc_info)" style="margin-top: 0.4rem" />
      </div>
      <button :disabled="!canCreate" @click="handleCreate">创建</button>
    </div>

    <div v-if="loading" class="loading">加载中...</div>

    <div v-else-if="automations.length === 0 && !showCreate" class="empty">
      <p>暂无自动化规则</p>
      <p class="hint">可以通过上方按钮创建，或在对话中让 AI 帮你创建</p>
    </div>

    <div v-else class="automation-list">
      <div
        v-for="auto in automations"
        :key="auto.id"
        class="automation-card"
        :class="{ disabled: !auto.enabled }"
      >
        <div class="automation-header">
          <div class="automation-info">
            <h3>{{ auto.name }}</h3>
            <span class="trigger-badge">
              {{ auto.trigger.type === 'cron' ? `⏰ 每 ${auto.trigger.cron}` : '🔘 手动' }}
            </span>
          </div>
          <div class="automation-actions">
            <button
              class="btn-sm"
              :class="auto.enabled ? 'btn-warn' : 'btn-ok'"
              @click="handleToggle(auto.id)"
            >
              {{ auto.enabled ? '停用' : '启用' }}
            </button>
            <button class="btn-sm" @click="handleRun(auto.id)" :disabled="!auto.enabled">
              ▶ 运行
            </button>
            <button class="btn-sm btn-danger" @click="handleDelete(auto.id)">删除</button>
          </div>
        </div>
        <div class="automation-detail">
          <span class="actions-list">
            动作：
            <span v-for="(action, i) in auto.actions" :key="i" class="action-tag">
              {{ action.plugin }}→{{ action.capability }}
            </span>
          </span>
          <span v-if="auto.lastRunAt" class="last-run">
            上次运行: {{ formatTime(auto.lastRunAt) }}
          </span>
        </div>
        <!-- 最近日志 -->
        <div v-if="auto.logs?.length" class="logs">
          <div v-for="log in auto.logs.slice(0, 3)" :key="log.id" class="log-entry" :class="log.status">
            <span class="log-status">{{ log.status === 'success' ? '✓' : '✗' }}</span>
            <span class="log-time">{{ formatTime(log.createdAt) }}</span>
            <span v-if="log.result" class="log-result">{{ truncate(log.result, 60) }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAutomations } from '../composables/use-automations'

const {
  automations,
  loading,
  showCreate,
  form,
  canCreate,
  handleCreate,
  handleToggle,
  handleRun,
  handleDelete,
  formatTime,
  truncate,
} = useAutomations()
</script>

<style scoped>
.automations-view {
  padding: 1.5rem 2rem;
  overflow-y: auto;
  height: 100%;
}
.automations-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1.5rem;
}
.automations-header h1 {
  font-size: 1.4rem;
}
.loading, .empty {
  text-align: center;
  padding: 3rem 0;
  color: var(--text-muted);
}
.empty .hint {
  font-size: 0.85rem;
  margin-top: 0.5rem;
}

/* 创建表单 */
.create-form {
  background: var(--bg-card);
  padding: 1.2rem;
  border-radius: 12px;
  margin-bottom: 1.5rem;
  border: 1px solid var(--border);
}
.create-form .field {
  margin-bottom: 0.8rem;
}
.create-form label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.3rem;
}
.create-form select {
  background: var(--bg-input);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5em 0.8em;
  font-size: 0.9rem;
  width: 100%;
}
.create-form .hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
  display: block;
}

/* 自动化列表 */
.automation-list {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
}
.automation-card {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 1rem 1.2rem;
  border: 1px solid var(--border);
}
.automation-card.disabled {
  opacity: 0.6;
}
.automation-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.automation-info h3 {
  font-size: 1rem;
  margin-bottom: 0.2rem;
}
.trigger-badge {
  font-size: 0.8rem;
  color: var(--accent);
}
.automation-actions {
  display: flex;
  gap: 0.3rem;
}
.btn-sm {
  font-size: 0.75rem;
  padding: 0.3em 0.6em;
}
.btn-warn {
  background: #e0a030;
}
.btn-ok {
  background: var(--success);
}
.btn-danger {
  background: var(--danger);
}
.automation-detail {
  font-size: 0.85rem;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.action-tag {
  background: var(--bg-input);
  padding: 0.15em 0.5em;
  border-radius: 4px;
  font-family: 'Cascadia Code', 'Fira Code', monospace;
  font-size: 0.8rem;
  margin-left: 0.3rem;
}
.last-run {
  font-size: 0.8rem;
}

/* 最近日志 */
.logs {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--border);
}
.log-entry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  padding: 0.2em 0;
}
.log-entry.success .log-status {
  color: var(--success);
}
.log-entry.error .log-status {
  color: var(--danger);
}
.log-time {
  color: var(--text-muted);
}
.log-result {
  color: var(--text-muted);
  font-family: 'Cascadia Code', monospace;
  font-size: 0.75rem;
}
</style>

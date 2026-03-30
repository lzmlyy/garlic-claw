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
          <option value="event">事件触发</option>
        </select>
      </div>
      <div v-if="form.triggerType === 'cron'" class="field">
        <label>执行间隔</label>
        <input v-model="form.cronInterval" placeholder="例如: 5m, 1h, 30s" />
        <span class="hint">支持格式: 30s / 5m / 1h</span>
      </div>
      <div v-if="form.triggerType === 'event'" class="field">
        <label>事件名称</label>
        <input v-model="form.eventName" placeholder="例如: coffee.ready" />
        <span class="hint">当插件或宿主发出同名自动化事件时执行</span>
      </div>
      <div class="field">
        <label>动作类型</label>
        <select v-model="form.actionType">
          <option value="device_command">设备命令</option>
          <option value="ai_message">发送消息</option>
        </select>
      </div>
      <div v-if="form.actionType === 'device_command'" class="field">
        <label>动作：设备命令</label>
        <input v-model="form.plugin" placeholder="插件名称 (如 pc-NOTEBOOK)" />
        <input
          v-model="form.capability"
          placeholder="能力名称 (如 get_pc_info)"
          style="margin-top: 0.4rem"
        />
      </div>
      <div v-else class="field">
        <label>动作：发送消息</label>
        <textarea
          v-model="form.message"
          rows="3"
          placeholder="例如：咖啡已经煮好了，记得趁热喝。"
        />
        <select v-model="form.targetConversationId" style="margin-top: 0.4rem">
          <option disabled value="">请选择目标会话</option>
          <option
            v-for="conversation in conversations"
            :key="conversation.id"
            :value="conversation.id"
          >
            {{ conversation.title }}
          </option>
        </select>
        <span class="hint">
          自动化会把消息写回选中的会话。
          <template v-if="conversations.length === 0">当前没有可用会话，请先创建一个对话。</template>
        </span>
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
              {{
                auto.trigger.type === 'cron'
                  ? `⏰ 每 ${auto.trigger.cron}`
                  : auto.trigger.type === 'event'
                    ? `⚡ 事件 ${auto.trigger.event}`
                    : '🔘 手动'
              }}
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
              {{ describeAction(action, conversations) }}
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
  conversations,
  loading,
  showCreate,
  form,
  canCreate,
  handleCreate,
  handleToggle,
  handleRun,
  handleDelete,
  describeAction,
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
  background: rgba(14, 24, 38, 0.85);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  padding: 1.2rem;
  border-radius: var(--radius);
  margin-bottom: 1.5rem;
  border: 1px solid var(--border);
  box-shadow: 0 12px 28px rgba(1, 6, 15, 0.2), 0 0 15px rgba(103, 199, 207, 0.08);
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
  background: rgba(11, 21, 35, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.5em 0.8em;
  font-size: 0.9rem;
  width: 100%;
}
.create-form textarea {
  background: rgba(11, 21, 35, 0.9);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.65em 0.8em;
  font-size: 0.9rem;
  width: 100%;
  resize: vertical;
  min-height: 5.5rem;
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
  background: rgba(14, 24, 38, 0.85);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border-radius: var(--radius);
  padding: 1rem 1.2rem;
  border: 1px solid var(--border);
  box-shadow: 0 12px 28px rgba(1, 6, 15, 0.2), 0 0 15px rgba(103, 199, 207, 0.08);
  transition: all 0.15s ease;
}

.automation-card:hover {
  box-shadow: 0 12px 28px rgba(1, 6, 15, 0.2), 0 0 20px rgba(103, 199, 207, 0.12);
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

@media (max-width: 840px) {
  .automations-view {
    padding: 1rem;
  }

  .automations-header,
  .automation-header {
    flex-direction: column;
    align-items: stretch;
    gap: 0.75rem;
  }

  .automation-actions {
    flex-wrap: wrap;
  }
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
